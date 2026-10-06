/**
 * The vocabulary the admin panel is typed against.
 *
 * These lists are the contract between the API and the panel: the same pipeline
 * stages, payment rails and reason lists are used to validate a write and to
 * label the screen that sent it. Keep this file free of runtime dependencies.
 */

/** Fulfilment pipeline: accept the order, ship it, deliver it - or cancel it. */
export const ADMIN_ORDER_STATUSES = [
  'Approval',
  'Approved',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
] as const;
export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

/** Stages that still need somebody to act on them. */
export const OPEN_ORDER_STATUSES: AdminOrderStatus[] = [
  'Approval',
  'Approved',
  'Shipped',
  'Out for Delivery',
];

/** Stages where the parcel is physically moving. */
export const IN_TRANSIT_ORDER_STATUSES: AdminOrderStatus[] = ['Shipped', 'Out for Delivery'];

export const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'COD', 'Wallet'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['Paid', 'Pending', 'Failed', 'Refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** How far an admin-processed refund on a cancelled order has got. */
export const REFUND_STATUSES = ['Pending', 'Completed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Reasons an admin can pick from when cancelling an order. */
export const CANCELLATION_REASONS = [
  'Payment verification failed',
  'Customer requested cancellation',
  'Item out of stock',
  'Duplicate order',
  'Delivery address unserviceable',
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const RETURN_REASONS = [
  'Damaged in transit',
  'Wrong item shipped',
  'Quality not as expected',
  'Changed my mind',
  'Other',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_STATUSES = ['Requested', 'Processing', 'Approved', 'Rejected'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

/** Only `Approved` releases the refund back to the shopper. */
export const REFUND_RELEASING_RETURN_STATUSES: ReturnStatus[] = ['Approved'];

export const REVIEW_STATUSES = ['Published', 'Pending'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const COUPON_KINDS = ['percent', 'flat'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export const COUPON_STATUSES = ['Active', 'Scheduled', 'Expired'] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];
