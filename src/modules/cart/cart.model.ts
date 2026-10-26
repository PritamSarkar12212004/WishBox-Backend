import { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * How much one shopper wants one product.
 *
 * One row per shopper per product - not one per tap - so the admin panel can
 * report both numbers that matter: *how many people* put it in a cart (`adds`
 * counts the taps, but the row itself is the person) and *how many units* they
 * asked for (`units`). The storefront's cart lives in localStorage; this is the
 * server's copy of the interest, with the shopper attached.
 *
 * `productId` is the product's slug, the same id the wishlist, the cart and the
 * admin editor use, so a row stays readable if the product is later deleted.
 */
export interface CartInterestAttributes {
  userId: Types.ObjectId;
  productId: string;
  /** How many times this shopper added the product to a cart. */
  adds: number;
  /** Total units across those adds. */
  units: number;
  firstAt: Date;
  lastAt: Date;
}

export type CartInterestDocument = HydratedDocument<CartInterestAttributes>;
export type CartInterestModelType = Model<CartInterestAttributes>;

const cartInterestSchema = new Schema<CartInterestAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: String, required: true, trim: true, maxlength: 160, index: true },
    adds: { type: Number, default: 0, min: 0 },
    units: { type: Number, default: 0, min: 0 },
    firstAt: { type: Date, default: () => new Date() },
    lastAt: { type: Date, default: () => new Date(), index: true },
  },
  { versionKey: false },
);

// One shopper, one product: a second add increments the counters instead of
// adding a row, which is what keeps "people" and "taps" separate.
cartInterestSchema.index({ userId: 1, productId: 1 }, { unique: true });

export const CartInterestModel = model<CartInterestAttributes>(
  'CartInterest',
  cartInterestSchema,
);
