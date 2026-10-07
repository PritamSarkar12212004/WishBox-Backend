import type { QueryFilter } from 'mongoose';
import { createChildLogger } from '../../config/logger.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { slugify } from '../../shared/slug.js';
import { assertCategoryExists } from '../categories/categories.service.js';
import {
  productImageUrls,
  removeProductImages,
  replacedImageUrls,
} from './products.media.js';
import {
  ProductModel,
  toPublicProduct,
  type ProductAttributes,
  type ProductSpecs,
  type PublicProduct,
} from './products.model.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductSort,
  UpdateProductInput,
} from './products.validation.js';

const log = createChildLogger('products');

/**
 * The product catalogue.
 *
 * Two invariants belong to this layer rather than to the schema, because both
 * need a query to check: a product may only file under a category that exists,
 * and `mrp` may never fall below `price` once a partial edit has been applied.
 *
 * Publishing is expressed by the caller, not guessed at here: `listProducts`
 * filters on `hidden` from the query it is given, and the public controller pins
 * that to `published`. A product nothing may see is a 404, not a redacted row.
 */

/** Which `sort` key means which database order. */
const SORTS: Record<ProductSort, Record<string, 1 | -1>> = {
  // Best-rated first: the shop's default is "what shoppers liked most".
  featured: { rating: -1, reviewCount: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  'price-asc': { price: 1 },
  'price-desc': { price: -1 },
  name: { name: 1 },
};

export interface ProductPage {
  items: PublicProduct[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/** A search term is user text, so regex metacharacters are neutralised. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query: ListProductsQuery): QueryFilter<ProductAttributes> {
  const filter: QueryFilter<ProductAttributes> = {};

  if (query.visibility === 'published') filter.hidden = false;
  else if (query.visibility === 'hidden') filter.hidden = true;
  // 'all' (or unset, from an internal caller) means no visibility filter.

  if (query.category) filter.category = query.category;
  if (query.badge) filter.badge = query.badge;
  if (query.available !== undefined) filter.available = query.available;

  if (query.search) {
    const needle = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: needle }, { brand: needle }, { sku: needle }];
  }

  return filter;
}

export async function listProducts(query: ListProductsQuery): Promise<ProductPage> {
  const filter = buildFilter(query);
  const limit = query.limit;
  const page = query.page;
  const skip = (page - 1) * limit;

  const [documents, total] = await Promise.all([
    ProductModel.find(filter).sort(SORTS[query.sort]).skip(skip).limit(limit),
    ProductModel.countDocuments(filter),
  ]);

  return {
    items: documents.map(toPublicProduct),
    total,
    page,
    limit,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/**
 * One product by slug.
 *
 * `includeHidden` is the admin's view: a shopper asking for an unpublished
 * product gets the same 404 as one that never existed, so a hidden product's
 * URL cannot be used to discover it.
 */
export async function getProduct(slug: string, includeHidden = false): Promise<PublicProduct> {
  const product = await ProductModel.findOne({ slug });
  if (!product || (product.hidden && !includeHidden)) {
    throw new NotFoundError('That product was not found');
  }
  return toPublicProduct(product);
}

/** `{}` from an optional block means "no specification details", not "empty". */
function normaliseSpecs(specs: ProductSpecs | undefined | null): ProductSpecs | undefined {
  if (!specs || Object.keys(specs).length === 0) return undefined;
  return specs;
}

async function assertSlugIsFree(slug: string, exceptId?: string): Promise<void> {
  const existing = await ProductModel.findOne({ slug });
  if (existing && existing.id !== exceptId) {
    throw new ConflictError(`A product with the id "${slug}" already exists`);
  }
}

async function assertSkuIsFree(sku: string, exceptId?: string): Promise<void> {
  const existing = await ProductModel.findOne({ sku });
  if (existing && existing.id !== exceptId) {
    throw new ConflictError(`SKU ${sku} is already used by another product`);
  }
}

export async function createProduct(input: CreateProductInput): Promise<PublicProduct> {
  const slug = input.slug ?? slugify(input.name);
  if (!slug) {
    throw new ConflictError('That name cannot be turned into an id - give the product a slug');
  }

  await assertCategoryExists(input.category);
  await assertSlugIsFree(slug);
  await assertSkuIsFree(input.sku);

  const specs = normaliseSpecs(input.specs);

  const product = await ProductModel.create({
    slug,
    sku: input.sku,
    name: input.name,
    brand: input.brand,
    category: input.category,
    rating: input.rating,
    reviewCount: input.reviewCount,
    price: input.price,
    mrp: input.mrp,
    ...(input.badge ? { badge: input.badge } : {}),
    available: input.available,
    hidden: input.hidden,
    stock: input.stock,
    image: input.image,
    // One photo is enough to list a product; the hover shot falls back to it.
    hoverImage: input.hoverImage ?? input.image,
    ...(input.beforeImage ? { beforeImage: input.beforeImage } : {}),
    ...(input.afterImage ? { afterImage: input.afterImage } : {}),
    gallery: input.gallery,
    ...(input.videoUrl ? { videoUrl: input.videoUrl } : {}),
    description: input.description,
    highlights: input.highlights,
    ...(specs ? { specs } : {}),
    ...(input.offer ? { offer: input.offer } : {}),
  });

  log.info({ slug, category: product.category }, 'Product created');
  return toPublicProduct(product);
}

/**
 * A partial edit.
 *
 * The cross-field rule is checked *after* the edit is applied, so widening MRP
 * on its own and dropping the price on its own are both fine, while ending up
 * with a price above the list price is not - whichever order the two fields
 * arrived in.
 */
export async function updateProduct(
  slug: string,
  input: UpdateProductInput,
): Promise<PublicProduct> {
  const product = await ProductModel.findOne({ slug });
  if (!product) {
    throw new NotFoundError('That product was not found');
  }

  const previousImages = productImageUrls(product);

  if (input.category !== undefined) {
    await assertCategoryExists(input.category);
    product.category = input.category;
  }

  if (input.slug !== undefined && input.slug !== product.slug) {
    await assertSlugIsFree(input.slug, product.id);
    product.slug = input.slug;
  }

  if (input.sku !== undefined && input.sku !== product.sku) {
    await assertSkuIsFree(input.sku, product.id);
    product.sku = input.sku;
  }

  if (input.name !== undefined) product.name = input.name;
  if (input.brand !== undefined) product.brand = input.brand;
  if (input.rating !== undefined) product.rating = input.rating;
  if (input.reviewCount !== undefined) product.reviewCount = input.reviewCount;
  if (input.price !== undefined) product.price = input.price;
  if (input.mrp !== undefined) product.mrp = input.mrp;
  if (input.available !== undefined) product.available = input.available;
  if (input.hidden !== undefined) product.hidden = input.hidden;
  if (input.stock !== undefined) product.stock = input.stock;
  if (input.image !== undefined) product.image = input.image;
  if (input.hoverImage !== undefined) product.hoverImage = input.hoverImage;
  if (input.description !== undefined) product.description = input.description;
  if (input.highlights !== undefined) product.highlights = input.highlights;
  if (input.gallery !== undefined) product.gallery = input.gallery;

  // `null` clears; `undefined` (absent) leaves the field alone.
  if (input.badge !== undefined) product.badge = input.badge ?? undefined;
  if (input.beforeImage !== undefined) product.beforeImage = input.beforeImage ?? undefined;
  if (input.afterImage !== undefined) product.afterImage = input.afterImage ?? undefined;
  if (input.videoUrl !== undefined) product.videoUrl = input.videoUrl || undefined;
  if (input.specs !== undefined) product.specs = normaliseSpecs(input.specs);
  if (input.offer !== undefined) product.offer = input.offer ?? undefined;

  if (product.mrp < product.price) {
    throw new ValidationError('MRP cannot be lower than the selling price', {
      mrp: 'MRP cannot be lower than the selling price',
      price: product.price,
    });
  }

  await product.save();

  // Only now: the change is in the database, so an orphaned asset is the worst
  // that can happen if Cloudinary is unreachable.
  const orphans = replacedImageUrls(previousImages, productImageUrls(product));
  if (orphans.length > 0) await removeProductImages(orphans);

  log.info({ slug: product.slug }, 'Product updated');
  return toPublicProduct(product);
}

export async function deleteProduct(slug: string): Promise<void> {
  const product = await ProductModel.findOne({ slug });
  if (!product) {
    throw new NotFoundError('That product was not found');
  }

  await product.deleteOne();
  // The record is gone, so its photos should not be paying rent either.
  await removeProductImages(productImageUrls(product));

  log.info({ slug }, 'Product removed');
}
