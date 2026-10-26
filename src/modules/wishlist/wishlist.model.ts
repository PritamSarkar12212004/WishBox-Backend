import { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * One product saved to one shopper's wishlist.
 *
 * The storefront keeps its own copy in localStorage so the heart responds
 * instantly, but a save only *counts* once it is written here: this collection
 * is what tells the admin panel how many shoppers want a product, and who they
 * are. Saving the same product twice is the same save, not a second one - the
 * unique (shopper, product) index says so.
 *
 * `productId` is the product's slug, the same public id the shop, the cart and
 * the admin editor use. Keeping the slug rather than an ObjectId means a row
 * stays readable if the product is later deleted.
 */
export interface WishlistEntryAttributes {
  userId: Types.ObjectId;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type WishlistEntryDocument = HydratedDocument<WishlistEntryAttributes>;
export type WishlistEntryModelType = Model<WishlistEntryAttributes>;

const wishlistEntrySchema = new Schema<WishlistEntryAttributes>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: String, required: true, trim: true, maxlength: 160 },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

wishlistEntrySchema.index({ userId: 1, productId: 1 }, { unique: true });

export const WishlistEntryModel = model<WishlistEntryAttributes>(
  'WishlistEntry',
  wishlistEntrySchema,
);
