import { createChildLogger } from '../../config/logger.js';
import { NotFoundError } from '../../shared/errors.js';
import { ProductModel } from '../products/products.model.js';
import { UserModel, type UserDocument } from '../user/user.model.js';
import { WishlistEntryModel } from './wishlist.model.js';

const log = createChildLogger('wishlist');

/** The product ids a shopper has saved, newest first. */
export async function listMyWishlist(user: UserDocument): Promise<string[]> {
  const entries = await WishlistEntryModel.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .lean();

  return entries.map((entry) => entry.productId);
}

/**
 * Records that a shopper saved a product.
 *
 * Idempotent on purpose: the storefront pushes its whole local wishlist when a
 * session starts, and a shopper can tap the same heart on two devices. The
 * upsert keeps one row per shopper per product, so the counts stay people, not
 * taps. A product that does not exist is refused rather than stored.
 */
export async function saveProduct(user: UserDocument, productId: string): Promise<void> {
  const exists = await ProductModel.exists({ slug: productId });
  if (!exists) {
    throw new NotFoundError(`Product ${productId} was not found`);
  }

  const now = new Date();
  await WishlistEntryModel.updateOne(
    { userId: user._id, productId },
    { $setOnInsert: { userId: user._id, productId, createdAt: now }, $set: { updatedAt: now } },
    { upsert: true },
  );
}

/** Disconnecting a saved product. Removing one that is not saved is a no-op. */
export async function removeProduct(user: UserDocument, productId: string): Promise<void> {
  await WishlistEntryModel.deleteOne({ userId: user._id, productId });
  log.debug({ userId: user.id, productId }, 'Wishlist entry removed');
}

/** One saved product, as the admin panel reads it: who saved what, and when. */
export interface AdminWishlistEntry {
  productId: string;
  name: string;
  image: string;
  price: number;
  available: boolean;
  hidden: boolean;
  customer: string;
  phone: string;
  savedAt: number;
}

/**
 * Every save, joined with the product and the shopper.
 *
 * The admin panel needs names, not ids, and one join here is cheaper than
 * teaching the panel the shopper collection. A product or account that has
 * since been deleted is still reported (by its slug, or as a deleted account)
 * so the numbers never silently shrink.
 */
export async function listAllSaves(): Promise<AdminWishlistEntry[]> {
  const entries = await WishlistEntryModel.find().sort({ createdAt: -1 }).lean();
  if (entries.length === 0) return [];

  const productIds = [...new Set(entries.map((entry) => entry.productId))];
  const userIds = [...new Set(entries.map((entry) => entry.userId))];

  const [products, users] = await Promise.all([
    ProductModel.find({ slug: { $in: productIds } }).lean(),
    UserModel.find({ _id: { $in: userIds } }).lean(),
  ]);

  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const userById = new Map(users.map((user) => [String(user._id), user]));

  return entries.map((entry) => {
    const product = productBySlug.get(entry.productId);
    const user = userById.get(String(entry.userId));

    return {
      productId: entry.productId,
      name: product?.name ?? entry.productId,
      image: product?.image ?? '',
      price: product?.price ?? 0,
      available: product?.available ?? false,
      hidden: product?.hidden ?? true,
      customer: user?.name ?? 'Deleted account',
      phone: user?.phone ?? '',
      savedAt: entry.createdAt.getTime(),
    };
  });
}
