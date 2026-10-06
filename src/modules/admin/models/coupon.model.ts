import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import {
  COUPON_KINDS,
  COUPON_STATUSES,
  type CouponKind,
  type CouponStatus,
} from '../admin.constants.js';

/**
 * A discount code, with its usage rolled up from the order history.
 *
 * `used` and `discountGiven` are snapshots rather than live aggregates: the
 * panel reads the whole coupon list on every dashboard load, and recomputing
 * two year-wide sums per coupon would cost more than the numbers are worth.
 * They are refreshed by the seed. The code itself is the business key, so it is
 * stored as `code` and used as the natural id.
 */
export interface AdminCoupon {
  code: string;
  label: string;
  kind: CouponKind;
  value: number;
  /** Minimum cart value the code applies to. */
  minOrder: number;
  status: CouponStatus;
  expiresOn: string;
  used: number;
  discountGiven: number;
}

export type AdminCouponAttributes = AdminCoupon;
export type AdminCouponDocument = HydratedDocument<AdminCouponAttributes>;
export type AdminCouponModelType = Model<AdminCouponAttributes>;

const couponSchema = new Schema<AdminCouponAttributes>(
  {
    code: { type: String, required: true, unique: true, index: true, trim: true, uppercase: true },
    label: { type: String, default: '' },
    kind: { type: String, enum: COUPON_KINDS, required: true },
    value: { type: Number, required: true, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: COUPON_STATUSES, default: 'Active', index: true },
    expiresOn: { type: String, default: '' },
    used: { type: Number, default: 0 },
    discountGiven: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const AdminCouponModel = model<AdminCouponAttributes>('AdminCoupon', couponSchema);

export function toPublicCoupon(doc: AdminCouponAttributes & { _id?: unknown }): AdminCoupon {
  const { _id, ...rest } = doc;
  return rest;
}
