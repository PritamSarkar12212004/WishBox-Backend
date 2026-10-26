import { createChildLogger } from '../../config/logger.js';
import { destroyImage } from '../../services/cloudinary/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { CategoryCatalogueFileModel } from './categories.file.model.js';
import { decodeCatalogueFile } from './categories.file.js';
import { slugify } from '../../shared/slug.js';
import { ProductModel } from '../products/products.model.js';
import { CategoryModel, toPublicCategory, type PublicCategory } from './categories.model.js';
import type {
  CategoryCatalogueInput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './categories.validation.js';

const log = createChildLogger('categories');

/**
 * The category book.
 *
 * Unlike addresses there is no per-shopper scoping: the shop's categories are
 * global, and writing them is an admin action (`/admin/categories` guards the
 * routes). What the service does own is the two invariants that keep the shop
 * coherent - a slug is unique, and a category cannot be deleted while products
 * still point at it.
 */

export async function listCategories(): Promise<PublicCategory[]> {
  const [categories, counts] = await Promise.all([
    CategoryModel.find().sort({ sortOrder: 1, label: 1 }),
    // One pass for every count, rather than a query per category.
    ProductModel.aggregate<{ _id: string; count: number }>([
      { $match: { hidden: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);

  const bySlug = new Map(counts.map((row) => [row._id, row.count]));
  return categories.map((category) => toPublicCategory(category, bySlug.get(category.slug) ?? 0));
}

export async function getCategory(slug: string): Promise<PublicCategory> {
  const category = await CategoryModel.findOne({ slug });
  if (!category) {
    throw new NotFoundError('That category was not found');
  }
  const productCount = await ProductModel.countDocuments({ category: slug, hidden: false });
  return toPublicCategory(category, productCount);
}

/** Guards the products module: a product may only file under a real category. */
export async function assertCategoryExists(slug: string): Promise<void> {
  const exists = await CategoryModel.exists({ slug });
  if (!exists) {
    throw new NotFoundError(`There is no category "${slug}"`);
  }
}

export async function createCategory(input: CreateCategoryInput): Promise<PublicCategory> {
  const slug = input.slug ?? slugify(input.label);
  if (!slug) {
    throw new ConflictError('That name cannot be turned into a slug - give the category a slug');
  }

  const existing = await CategoryModel.exists({ slug });
  if (existing) {
    throw new ConflictError(`The category "${slug}" already exists`);
  }

  const created = await CategoryModel.create({
    slug,
    label: input.label,
    sortOrder: input.sortOrder,
  });

  log.info({ slug, label: created.label }, 'Category created');
  return toPublicCategory(created, 0);
}

export async function updateCategory(
  slug: string,
  input: UpdateCategoryInput,
): Promise<PublicCategory> {
  const category = await CategoryModel.findOne({ slug });
  if (!category) {
    throw new NotFoundError('That category was not found');
  }

  if (input.label !== undefined) category.label = input.label;
  if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;

  await category.save();
  log.info({ slug }, 'Category updated');

  const productCount = await ProductModel.countDocuments({ category: slug, hidden: false });
  return toPublicCategory(category, productCount);
}

/**
 * Attaches (or replaces) the official catalogue for a category.
 *
 * A data URI is stored in Cloudinary as a `raw` asset, because a PDF's bytes
 * have to survive untouched and a category document is the wrong place for a
 * file, so the bytes go in `CategoryCatalogueFileModel` and the category keeps
 * only a link to this API's own download route. A pasted https link is kept as
 * it is - the file is already hosted somewhere the admin controls.
 *
 * Replacing one deletes what it replaced, but only after the record has been
 * saved: a cleanup failure must never take the new catalogue down with it.
 */
export async function setCatalogue(
  slug: string,
  input: CategoryCatalogueInput,
  actor?: string,
): Promise<PublicCategory> {
  const category = await CategoryModel.findOne({ slug });
  if (!category) {
    throw new NotFoundError('That category was not found');
  }

  const file = input.file.trim();
  const hostedElsewhere = /^https?:\/\//i.test(file);
  const replacedPublicId = category.catalogue?.publicId;

  let url: string;
  let fileName: string | undefined;

  if (hostedElsewhere) {
    url = file;
    // The file this API used to serve is no longer the catalogue.
    await CategoryCatalogueFileModel.deleteOne({ slug });
  } else {
    const decoded = decodeCatalogueFile(file, slug);
    await CategoryCatalogueFileModel.findOneAndUpdate(
      { slug },
      {
        $set: {
          slug,
          fileName: decoded.fileName,
          contentType: decoded.contentType,
          bytes: decoded.bytes,
          size: decoded.bytes.length,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    fileName = decoded.fileName;
    /* A path, not an absolute URL: the storefront resolves it against its own
     * API base, so the same record works on localhost and in production. */
    url = `/categories/${slug}/catalogue/file`;
  }

  category.catalogue = {
    title: input.title,
    description: input.description,
    url,
    ...(fileName ? { fileName } : {}),
    uploadedAt: new Date(),
    ...(actor ? { uploadedBy: actor } : {}),
  };
  await category.save();

  // Catalogs uploaded by the previous version lived in Cloudinary. Remove that
  // asset now that nothing points at it.
  if (replacedPublicId) {
    await destroyImage(replacedPublicId, 'raw').catch((error: unknown) => {
      log.warn(
        { publicId: replacedPublicId, reason: error instanceof Error ? error.message : 'unknown' },
        'Could not delete the replaced catalogue',
      );
    });
  }

  log.info({ slug, actor, url, fileName }, 'Category catalogue saved');
  return getCategory(slug);
}

/** Detaches the catalogue, and the file this API stored for it. */
export async function removeCatalogue(slug: string): Promise<PublicCategory> {
  const category = await CategoryModel.findOne({ slug });
  if (!category) {
    throw new NotFoundError('That category was not found');
  }

  const publicId = category.catalogue?.publicId;
  category.catalogue = undefined;
  await category.save();

  await CategoryCatalogueFileModel.deleteOne({ slug });

  if (publicId) {
    await destroyImage(publicId, 'raw').catch((error: unknown) => {
      log.warn(
        { publicId, reason: error instanceof Error ? error.message : 'unknown' },
        'Could not delete the removed catalogue',
      );
    });
  }

  log.info({ slug }, 'Category catalogue removed');
  return getCategory(slug);
}

/** The stored document, for the public download route. */
export async function getCatalogueFile(slug: string): Promise<{
  fileName: string;
  contentType: string;
  bytes: Buffer;
}> {
  const file = await CategoryCatalogueFileModel.findOne({ slug }).lean();
  if (!file) {
    throw new NotFoundError('That category has no uploaded catalogue');
  }

  return {
    fileName: file.fileName,
    contentType: file.contentType,
    bytes: Buffer.from(file.bytes),
  };
}

export async function deleteCategory(slug: string): Promise<void> {
  const products = await ProductModel.countDocuments({ category: slug });
  if (products > 0) {
    // Deleting it would leave products pointing at a category the shop cannot
    // render. Refuse, and say how many are in the way.
    throw new ConflictError(
      `${products} product${products === 1 ? ' is' : 's are'} still in "${slug}". Move them first.`,
    );
  }

  const removed = await CategoryModel.deleteOne({ slug });
  if (removed.deletedCount === 0) {
    throw new NotFoundError('That category was not found');
  }

  log.info({ slug }, 'Category removed');
}
