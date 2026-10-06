import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import {
  ADMIN_ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  RETURN_REASONS,
  type AdminOrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type RefundStatus,
  type ReturnReason,
} from '../admin.constants.js';

/**
 * One line item, copied onto the order rather than referenced.
 *
 * An order is a record of what the shopper actually paid. If it pointed at the
 * catalogue, editing a price today would silently rewrite last month's invoice.
 */
export interface AdminOrderItem {
  productId: string;
  name: string;
  brand: string;
  image: string;
  category: string;
  qty: number;
  price: number;
  mrp: number;
}

/**
 * An order as the admin panel sees it.
 *
 * Timeline fields are epoch milliseconds rather than Dates: every chart, date
 * range and CSV export in the panel works in milliseconds, so storing numbers
 * keeps the wire format identical to the UI type and removes a conversion
 * layer on both sides.
 */
export interface AdminOrder {
  id: string;
  customerId: string;
  customer: string;
  email: string;
  city: string;
  isGuest: boolean;
  /**
   * Always false here. The panel flips it on for the orders it merges in from
   * this browser's own storefront session, which never reach the server.
   */
  isLive: boolean;
  placedAt: number;
  placedOn: string;
  status: AdminOrderStatus;
  payment: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Net amount payable, shipping and discounts included. */
  amount: number;
  subtotal: number;
  shipping: number;
  discount: number;
  couponCode?: string;
  items: AdminOrderItem[];
  courier?: string;
  trackingId?: string;
  /** Past its expected delivery window and still not delivered. */
  delayed: boolean;
  refund: number;
  returnReason?: ReturnReason;
  /** Contact number the customer checked out with. */
  phone: string;
  /** Full delivery address, on one line. */
  address: string;
  /** Customer-uploaded proof of payment - only online payments have one. */
  paymentScreenshot?: string;
  /** Who cleared the payment, and when. */
  approvedAt?: number;
  approvedBy?: string;
  /** Cancellation audit trail, set once the order is cancelled. */
  cancelledAt?: number;
  cancellationReason?: string;
  /** Refund trail - the screenshot only exists once the refund is processed. */
  refundScreenshot?: string;
  refundedAt?: number;
  refundStatus?: RefundStatus;
}

/**
 * The stored document: every public field except the two the server owns.
 * `id` is persisted as `orderId` so Mongo's own `_id` stays out of the API, and
 * `isLive` is never stored because it describes a browser, not the business.
 */
export type AdminOrderAttributes = Omit<AdminOrder, 'id' | 'isLive'> & { orderId: string };
export type AdminOrderDocument = HydratedDocument<AdminOrderAttributes>;
export type AdminOrderModelType = Model<AdminOrderAttributes>;

const orderItemSchema = new Schema<AdminOrderItem>(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    brand: { type: String, default: '' },
    image: { type: String, default: '' },
    category: { type: String, default: '' },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema<AdminOrderAttributes>(
  {
    orderId: { type: String, required: true, unique: true, index: true, trim: true },
    customerId: { type: String, required: true, index: true },
    customer: { type: String, required: true },
    email: { type: String, default: '' },
    city: { type: String, default: '' },
    isGuest: { type: Boolean, default: false },
    placedAt: { type: Number, required: true, index: true },
    placedOn: { type: String, required: true },
    status: { type: String, enum: ADMIN_ORDER_STATUSES, default: 'Approval', index: true },
    payment: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'Pending', index: true },
    amount: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String },
    items: { type: [orderItemSchema], default: [] },
    courier: { type: String },
    trackingId: { type: String },
    delayed: { type: Boolean, default: false },
    refund: { type: Number, default: 0 },
    returnReason: { type: String, enum: RETURN_REASONS },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    paymentScreenshot: { type: String },
    approvedAt: { type: Number },
    approvedBy: { type: String },
    cancelledAt: { type: Number },
    cancellationReason: { type: String },
    refundScreenshot: { type: String },
    refundedAt: { type: Number },
    refundStatus: { type: String, enum: REFUND_STATUSES },
  },
  { versionKey: false },
);

export const AdminOrderModel = model<AdminOrderAttributes>('AdminOrder', orderSchema);

/**
 * Turns a stored document (lean or hydrated) into the wire shape.
 * The destructured `_id` is dropped rather than renamed, so Mongo's key never
 * leaks into a response.
 */
export function toPublicOrder(doc: AdminOrderAttributes & { _id?: unknown }): AdminOrder {
  const { _id, orderId, ...rest } = doc;
  return { id: orderId, isLive: false, ...rest };
}
