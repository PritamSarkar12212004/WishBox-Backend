import { createChildLogger } from '../../config/logger.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { slugify } from '../../shared/slug.js';
import { ProductModel } from '../products/products.model.js';
import { CategoryModel, toPublicCategory, type PublicCategory } from './categories.model.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validation.js';

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
