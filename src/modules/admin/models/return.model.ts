import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import {
  RETURN_REASONS,
  RETURN_STATUSES,
  type ReturnReason,
  type ReturnStatus,
} from '../admin.constants.js';

/**
 * One return request against a delivered order.
 *
 * `refunded` mirrors whether the refund has actually been released: approving a
 * return releases it, rejecting one takes it back. That keeps the returns queue
 * and the refunds screen reading from a single flag instead of each deriving it.
 */
export interface AdminReturn {
  id: string;
  orderId: string;
  customer: string;
  city: string;
  productName: string;
  image: string;
  reason: ReturnReason;
  requestedAt: number;
  status: ReturnStatus;
  refundAmount: number;
  refunded: boolean;
}

export type AdminReturnAttributes = Omit<AdminReturn, 'id'> & { returnId: string };
export type AdminReturnDocument = HydratedDocument<AdminReturnAttributes>;
export type AdminReturnModelType = Model<AdminReturnAttributes>;

const returnSchema = new Schema<AdminReturnAttributes>(
  {
    returnId: { type: String, required: true, unique: true, index: true, trim: true },
    orderId: { type: String, required: true, index: true },
    customer: { type: String, default: '' },
    city: { type: String, default: '' },
    productName: { type: String, default: '' },
    image: { type: String, default: '' },
    reason: { type: String, enum: RETURN_REASONS, required: true },
    requestedAt: { type: Number, required: true, index: true },
    status: { type: String, enum: RETURN_STATUSES, default: 'Requested', index: true },
    refundAmount: { type: Number, default: 0 },
    refunded: { type: Boolean, default: false, index: true },
  },
  { versionKey: false },
);

export const AdminReturnModel = model<AdminReturnAttributes>('AdminReturn', returnSchema);

export function toPublicReturn(doc: AdminReturnAttributes & { _id?: unknown }): AdminReturn {
  const { _id, returnId, ...rest } = doc;
  return { id: returnId, ...rest };
}
