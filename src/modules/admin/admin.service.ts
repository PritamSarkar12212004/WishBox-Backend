import type { UpdateQuery } from 'mongoose';
import { createChildLogger } from '../../config/logger.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import {
  REFUND_RELEASING_RETURN_STATUSES,
  type AdminOrderStatus,
  type ReturnStatus,
} from './admin.constants.js';
import { AdminCouponModel, toPublicCoupon, type AdminCoupon } from './models/coupon.model.js';
import {
  AdminCustomerModel,
  toPublicCustomer,
  type AdminCustomer,
} from './models/customer.model.js';
import {
  AdminOrderModel,
  toPublicOrder,
  type AdminOrder,
  type AdminOrderAttributes,
} from './models/order.model.js';
import { AdminRestockModel, toPublicRestock, type AdminRestock } from './models/restock.model.js';
import {
  AdminReviewModel,
  toPublicReview,
  type AdminReviewAttributes,
  type AdminReviewView,
} from './models/review.model.js';
import {
  AdminReturnModel,
  toPublicReturn,
  type AdminReturn,
  type AdminReturnAttributes,
} from './models/return.model.js';
import {
  ADMIN_SETTINGS_ID,
  AdminSettingModel,
  DEFAULT_ADMIN_SETTINGS,
  toPublicSettings,
  type AdminSettings,
} from './models/setting.model.js';
import type {
  AdminOrderPatchInput,
  AdminReviewPatchInput,
  AdminSettingsPatchInput,
} from './admin.validation.js';

const log = createChildLogger('admin');

/** Stages at which a parcel exists, so a courier can be recorded against it. */
const SHIPPABLE_ORDER_STATUSES: AdminOrderStatus[] = ['Shipped', 'Out for Delivery', 'Delivered'];

/**
 * Everything the panel needs to render itself, in one round trip.
 *
 * The dashboards chart a whole year and derive every figure client-side, so
 * they need the full set rather than a page of it - paginating here would only
 * move the seam somewhere the analytics cannot see it. When the history grows
 * past what one response can carry, the fix is server-side metrics, not a
 * smaller payload.
 */
export interface AdminDataset {
  generatedAt: number;
  orders: AdminOrder[];
  customers: AdminCustomer[];
  returns: AdminReturn[];
  reviews: AdminReviewView[];
  coupons: AdminCoupon[];
  restocks: AdminRestock[];
}

export async function getDataset(): Promise<AdminDataset> {
  const [orders, customers, returns, reviews, coupons, restocks] = await Promise.all([
    AdminOrderModel.find().sort({ placedAt: -1 }).lean(),
    AdminCustomerModel.find().sort({ joinedAt: -1 }).lean(),
    AdminReturnModel.find().sort({ requestedAt: -1 }).lean(),
    AdminReviewModel.find().sort({ createdAt: -1 }).lean(),
    AdminCouponModel.find().sort({ code: 1 }).lean(),
    AdminRestockModel.find().sort({ at: -1 }).lean(),
  ]);

  return {
    generatedAt: Date.now(),
    orders: orders.map(toPublicOrder),
    customers: customers.map(toPublicCustomer),
    returns: returns.map(toPublicReturn),
    reviews: reviews.map(toPublicReview),
    coupons: coupons.map(toPublicCoupon),
    restocks: restocks.map(toPublicRestock),
  };
}

/**
 * Applies an admin's change to one order.
 *
 * Two things are deliberately not left to the caller:
 *
 *  - **Timestamps and attribution** are stamped here. `approvedBy` is the name
 *    of the signed-in admin, so the audit trail cannot be spoofed or backdated.
 *  - **Sequencing.** A refund is only valid on a cancelled order and a courier
 *    only exists once an order is on its way, so both are rejected with a 400
 *    rather than quietly stored in a state that makes no sense.
 */
export async function patchOrder(
  id: string,
  patch: AdminOrderPatchInput,
  actor: string,
): Promise<AdminOrder> {
  const order = await AdminOrderModel.findOne({ orderId: id }).lean();
  if (!order) {
    throw new NotFoundError(`Order ${id} was not found`);
  }

  const now = Date.now();
  const nextStatus: AdminOrderStatus = patch.status ?? order.status;
  const update: UpdateQuery<AdminOrderAttributes> = {};

  if (patch.status !== undefined) {
    update.status = patch.status;
  }

  if (patch.status === 'Cancelled') {
    if (!patch.cancellationReason) {
      throw new BadRequestError('Tell us why the order is being cancelled', {
        field: 'cancellationReason',
      });
    }
    update.cancelledAt = now;
    update.cancellationReason = patch.cancellationReason;
    update.refundStatus = patch.refundStatus ?? 'Pending';
  }

  if (patch.status === 'Approved') {
    update.approvedAt = now;
    update.approvedBy = actor;
  }

  if (patch.courier !== undefined || patch.trackingId !== undefined) {
    if (!SHIPPABLE_ORDER_STATUSES.includes(nextStatus)) {
      throw new BadRequestError('An order is only shipped once it has been approved', {
        field: 'courier',
      });
    }
    if (patch.courier !== undefined) update.courier = patch.courier;
    if (patch.trackingId !== undefined) update.trackingId = patch.trackingId;
  }

  if (patch.refundScreenshot !== undefined) {
    if (nextStatus !== 'Cancelled') {
      throw new BadRequestError('Only a cancelled order can carry a refund', {
        field: 'refundScreenshot',
      });
    }
    update.refundScreenshot = patch.refundScreenshot;
    update.refundedAt = now;
    update.refundStatus = patch.refundStatus ?? 'Completed';
  }

  const updated = await AdminOrderModel.findOneAndUpdate(
    { orderId: id },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    throw new NotFoundError(`Order ${id} was not found`);
  }

  log.info({ orderId: id, actor, fields: Object.keys(update) }, 'Admin updated an order');
  return toPublicOrder(updated);
}

/**
 * Moves a return through its queue. Approving one releases the refund and
 * rejecting one takes it back, so the refunds screen never has to guess.
 */
export async function patchReturn(id: string, status: ReturnStatus): Promise<AdminReturn> {
  const update: UpdateQuery<AdminReturnAttributes> = { status };

  if (REFUND_RELEASING_RETURN_STATUSES.includes(status)) {
    update.refunded = true;
  } else if (status === 'Rejected') {
    update.refunded = false;
  }

  const updated = await AdminReturnModel.findOneAndUpdate(
    { returnId: id },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    throw new NotFoundError(`Return ${id} was not found`);
  }

  log.info({ returnId: id, status }, 'Admin updated a return');
  return toPublicReturn(updated);
}

/** Publishes or unpublishes a review, and posts or removes the store's reply. */
export async function patchReview(
  id: string,
  patch: AdminReviewPatchInput,
  actor: string,
): Promise<AdminReviewView> {
  const $set: UpdateQuery<AdminReviewAttributes>['$set'] = {};
  const $unset: Record<string, 1> = {};

  if (patch.status !== undefined) {
    $set.status = patch.status;
  }

  if (patch.reply === null) {
    // Removing the key entirely, rather than storing null, keeps "has not been
    // answered" a single state the panel can test for.
    $unset.reply = 1;
  } else if (patch.reply !== undefined) {
    $set.reply = { message: patch.reply.message, at: Date.now(), by: actor };
  }

  const update: UpdateQuery<AdminReviewAttributes> = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  const updated = await AdminReviewModel.findOneAndUpdate({ reviewId: id }, update, {
    new: true,
    runValidators: true,
  }).lean();

  if (!updated) {
    throw new NotFoundError(`Review ${id} was not found`);
  }

  log.info({ reviewId: id, actor, fields: Object.keys(patch) }, 'Admin moderated a review');
  return toPublicReview(updated);
}

export async function deleteReview(id: string): Promise<void> {
  const removed = await AdminReviewModel.deleteOne({ reviewId: id });
  if (removed.deletedCount === 0) {
    throw new NotFoundError(`Review ${id} was not found`);
  }

  log.info({ reviewId: id }, 'Admin deleted a review');
}

/** Settings fall back to the shipped defaults until an admin saves them. */
export async function getSettings(): Promise<AdminSettings> {
  const stored = await AdminSettingModel.findOne({ settingId: ADMIN_SETTINGS_ID }).lean();
  return stored ? toPublicSettings(stored) : DEFAULT_ADMIN_SETTINGS;
}

/** Merges a partial settings change, creating the row on first save. */
export async function patchSettings(patch: AdminSettingsPatchInput): Promise<AdminSettings> {
  const updated = await AdminSettingModel.findOneAndUpdate(
    { settingId: ADMIN_SETTINGS_ID },
    { $set: patch },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  ).lean();

  log.info({ fields: Object.keys(patch) }, 'Admin updated settings');
  return toPublicSettings(updated);
}
