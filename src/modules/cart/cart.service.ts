import { createChildLogger } from '../../config/logger.js';
import { NotFoundError } from '../../shared/errors.js';
import { ProductModel } from '../products/products.model.js';
import { UserModel, type UserDocument } from '../user/user.model.js';
import { CartInterestModel } from './cart.model.js';

const log = createChildLogger('cart');

/**
 * Add-to-cart interest.
 *
 * The cart itself belongs to the browser, so nothing here touches it. What is
 * recorded is the *demand*: which shopper put which product in a cart, how many
 * times, and how many units. One row per shopper per product, incremented -
 * which is what lets the admin panel answer both "how many people" and "how
 * many units" without double-counting a person who taps twice.
 */
export async function recordCartAdd(
  user: UserDocument,
  productId: string,
  qty: number,
): Promise<void> {
  const exists = await ProductModel.exists({ slug: productId });
  if (!exists) {
    throw new NotFoundError(`Product ${productId} was not found`);
  }

  const now = new Date();
  await CartInterestModel.updateOne(
    { userId: user._id, productId },
    {
      $setOnInsert: { userId: user._id, productId, firstAt: now },
      $set: { lastAt: now },
      $inc: { adds: 1, units: qty },
    },
    { upsert: true },
  );

  log.debug({ userId: user.id, productId, qty }, 'Cart add recorded');
}

/** One shopper's interest in one product, as the admin panel reads it. */
export interface AdminCartInterest {
  productId: string;
  name: string;
  image: string;
  price: number;
  available: boolean;
  hidden: boolean;
  customer: string;
  phone: string;
  /** Taps on "add to cart" by this shopper for this product. */
  adds: number;
  /** Units they asked for, across those taps. */
  units: number;
  firstAt: number;
  lastAt: number;
}

/**
 * Every row, joined with its product and shopper.
 *
 * The same shape as the wishlist report, so the panel can put both in one
 * table: a product or account that has since been deleted is still reported
 * (by its slug, or as a deleted account) rather than disappearing.
 */
export async function listAllCartInterest(): Promise<AdminCartInterest[]> {
  const entries = await CartInterestModel.find().sort({ lastAt: -1 }).lean();
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
      adds: entry.adds,
      units: entry.units,
      firstAt: entry.firstAt.getTime(),
      lastAt: entry.lastAt.getTime(),
    };
  });
}
