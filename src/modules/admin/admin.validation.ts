import { z } from 'zod';
import {
  ADMIN_ORDER_STATUSES,
  CANCELLATION_REASONS,
  REFUND_STATUSES,
  RETURN_STATUSES,
  REVIEW_STATUSES,
} from './admin.constants.js';

/**
 * Ceiling for an inline image. The panel caps uploads at 300 KB, which becomes
 * roughly 410k characters once base64 encoded, so this leaves room for the
 * "data:image/png;base64," prefix without accepting an unbounded body.
 */
const INLINE_IMAGE_MAX = 600_000;

export const adminIdParamSchema = z.object({
  id: z.string().trim().min(1, 'An id is required').max(64),
});

/**
 * Everything an admin can change on a placed order.
 *
 * Note what is *not* here: the audit timestamps and who did it. Those are the
 * server's to stamp, so a client cannot backdate an approval.
 */
export const orderPatchSchema = z
  .strictObject({
    status: z.enum(ADMIN_ORDER_STATUSES).optional(),
    courier: z.string().trim().min(1).max(60).optional(),
    trackingId: z.string().trim().min(1).max(60).optional(),
    cancellationReason: z.enum(CANCELLATION_REASONS).optional(),
    refundStatus: z.enum(REFUND_STATUSES).optional(),
    /** Proof of the refund that was processed - a data URL or a hosted URL. */
    refundScreenshot: z.string().trim().min(1).max(INLINE_IMAGE_MAX).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change',
  });

export const returnPatchSchema = z.strictObject({
  status: z.enum(RETURN_STATUSES),
});

export const reviewPatchSchema = z
  .strictObject({
    status: z.enum(REVIEW_STATUSES).optional(),
    /** A reply to publish, or `null` to take an earlier one down. */
    reply: z
      .strictObject({ message: z.string().trim().min(1, 'Write something first').max(2_000) })
      .nullable()
      .optional(),
  })
  .refine((value) => value.status !== undefined || value.reply !== undefined, {
    message: 'Provide a status or a reply',
  });

export const settingsPatchSchema = z
  .strictObject({
    storeName: z.string().trim().min(1).max(80).optional(),
    supportEmail: z.string().trim().min(3).max(160).optional(),
    supportPhone: z.string().trim().min(3).max(30).optional(),
    lowStockThreshold: z.coerce.number().int().min(0).max(100_000).optional(),
    freeShippingThreshold: z.coerce.number().int().min(0).max(10_000_000).optional(),
    codEnabled: z.boolean().optional(),
    defaultCourier: z.string().trim().min(1).max(60).optional(),
    websiteTheme: z.string().trim().min(1).max(40).optional(),
    paymentQr: z.string().trim().max(INLINE_IMAGE_MAX).optional(),
    paymentQrUpdatedAt: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one setting to change',
  });

export type AdminOrderPatchInput = z.infer<typeof orderPatchSchema>;
export type AdminReturnPatchInput = z.infer<typeof returnPatchSchema>;
export type AdminReviewPatchInput = z.infer<typeof reviewPatchSchema>;
export type AdminSettingsPatchInput = z.infer<typeof settingsPatchSchema>;
export type AdminIdParamInput = z.infer<typeof adminIdParamSchema>;
