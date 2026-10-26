import { createChildLogger } from '../../config/logger.js';
import { randomUUID } from 'node:crypto';
import { destroyImage } from '../../services/cloudinary/index.js';
import { publicIdFromDeliveryUrl } from '../../services/cloudinary/urls.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { CategoryCatalogueFileModel } from './categories.file.model.js';
import { AdditionalCatalogueFileModel } from './categories.additional-file.model.js';
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
 * The file has already been uploaded to Cloudinary; MongoDB stores only the
 * delivery URL and catalogue metadata.
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

  const url = input.file.trim();
  const replacedPublicId = category.catalogue?.publicId ??
    (category.catalogue?.url ? publicIdFromDeliveryUrl(category.catalogue.url) : null);
  const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'catalogue.pdf');

  category.catalogue = {
    title: input.title,
    description: input.description,
    url,
    ...(fileName ? { fileName } : {}),
    uploadedAt: new Date(),
    ...(actor ? { uploadedBy: actor } : {}),
  };
  await category.save();
  await CategoryCatalogueFileModel.deleteOne({ slug });

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

/** Detaches the catalogue and removes its Cloudinary asset when it belongs to this cloud. */
export async function removeCatalogue(slug: string): Promise<PublicCategory> {
  const category = await CategoryModel.findOne({ slug });
  if (!category) {
    throw new NotFoundError('That category was not found');
  }

  const publicId = category.catalogue?.publicId ??
    (category.catalogue?.url ? publicIdFromDeliveryUrl(category.catalogue.url) : null);
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
  /* Deliberately not `.lean()`: a lean read hands back the raw BSON Binary,
   * and `Buffer.from(binary)` is empty - the download arrived with 0 bytes.
   * A hydrated document casts the field to a real Buffer. */
  const file = await CategoryCatalogueFileModel.findOne({ slug });
  if (!file) {
    throw new NotFoundError('That category has no uploaded catalogue');
  }

  return {
    fileName: file.fileName,
    contentType: file.contentType,
    bytes: Buffer.from(file.bytes),
  };
}

/** Adds an independently downloadable catalogue to a category. */
export async function addCatalogue(
  slug: string,
  input: CategoryCatalogueInput,
  actor?: string,
): Promise<PublicCategory> {
  const category = await CategoryModel.findOne({ slug });
  if (!category) throw new NotFoundError('That category was not found');

  const id = randomUUID();
  const url = input.file.trim();
  const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? `${slugify(input.title)}.pdf`);
  category.additionalCatalogues ??= [];
  category.additionalCatalogues.push({
    id,
    title: input.title,
    description: input.description,
    url,
    fileName,
    uploadedAt: new Date(),
    ...(actor ? { uploadedBy: actor } : {}),
  });
  await category.save();
  log.info({ slug, catalogueId: id, actor }, 'Additional category catalogue saved');
  return getCategory(slug);
}

/** Serves one independently uploaded category catalogue. */
export async function getAdditionalCatalogueFile(slug: string, catalogueId: string) {
  const file = await AdditionalCatalogueFileModel.findOne({ slug, catalogueId });
  if (!file) throw new NotFoundError('That category catalogue was not found');
  return {
    fileName: file.fileName,
    contentType: file.contentType,
    bytes: Buffer.from(file.bytes),
  };
}

/** Removes a single extra catalogue without affecting the others. */
export async function removeAdditionalCatalogue(
  slug: string,
  catalogueId: string,
): Promise<PublicCategory> {
  const category = await CategoryModel.findOne({ slug });
  if (!category) throw new NotFoundError('That category was not found');
  const catalogue = category.additionalCatalogues?.find((entry) => entry.id === catalogueId);
  const before = category.additionalCatalogues?.length ?? 0;
  category.additionalCatalogues = (category.additionalCatalogues ?? []).filter(
    (catalogue) => catalogue.id !== catalogueId,
  );
  if (category.additionalCatalogues.length === before) {
    throw new NotFoundError('That category catalogue was not found');
  }
  await category.save();
  await AdditionalCatalogueFileModel.deleteOne({ slug, catalogueId });
  const publicId = catalogue?.url ? publicIdFromDeliveryUrl(catalogue.url) : null;
  if (publicId) await destroyImage(publicId, 'raw').catch((error: unknown) => {
    log.warn({ slug, catalogueId, reason: error instanceof Error ? error.message : 'unknown' }, 'Could not delete removed catalogue from Cloudinary');
  });
  log.info({ slug, catalogueId }, 'Additional category catalogue removed');
  return getCategory(slug);
}

export async function deleteCategory(slug: string): Promise<void> {
  const category = await CategoryModel.findOne({ slug });
  if (!category) throw new NotFoundError('That category was not found');
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

  await Promise.all([
    CategoryCatalogueFileModel.deleteOne({ slug }),
    AdditionalCatalogueFileModel.deleteMany({ slug }),
  ]);
  const cloudinaryIds = [category.catalogue?.url, ...(category.additionalCatalogues ?? []).map((item) => item.url)]
    .filter((url): url is string => Boolean(url))
    .map((url) => publicIdFromDeliveryUrl(url))
    .filter((id): id is string => Boolean(id));
  if (category.catalogue?.publicId) cloudinaryIds.push(category.catalogue.publicId);
  for (const publicId of new Set(cloudinaryIds)) {
    await destroyImage(publicId, 'raw').catch((error: unknown) => {
      log.warn({ slug, reason: error instanceof Error ? error.message : 'unknown' }, 'Could not delete legacy category catalogue asset');
    });
  }

  log.info({ slug }, 'Category removed');
}
