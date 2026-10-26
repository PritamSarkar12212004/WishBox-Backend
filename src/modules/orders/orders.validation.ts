import { z } from 'zod';
import { PAYMENT_METHODS, RETURN_REASONS } from '../admin/admin.constants.js';
import { createAddressSchema } from '../addresses/addresses.validation.js';
import { SLUG_REGEX } from '../../shared/slug.js';
import { cloudinaryConfig } from '../../services/cloudinary/config.js';

/**
 * What a shopper is allowed to send when placing an order.
 *
 * Note what is *absent*: prices, totals, discounts and the order id. Those are
 * decided by the order service from the product records and the coupon table,
 * so a request can describe a basket but never what it costs.
 */

const orderItem = z.strictObject({
  /** The product slug - the storefront's product id. */
  productId: z
    .string()
    .trim()
    .max(80)
    .regex(SLUG_REGEX, 'That product id is not valid'),
  qty: z.coerce.number().int().min(1).max(500),
});

export const createOrderSchema = z
  .strictObject({
    items: z.array(orderItem).min(1, 'Your cart is empty').max(50),
    /** A saved address from the shopper's book… */
    addressId: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{24}$/, 'That address id is not valid')
      .optional(),
    /** …or a delivery address typed at checkout. */
    address: createAddressSchema.optional(),
    /** Offline rails only until a payment gateway is wired up. */
    payment: z.enum(PAYMENT_METHODS).default('COD'),
    /** Checked against the coupon table, including its minimum basket. */
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(24)
      .regex(/^[A-Z0-9-]+$/, 'Coupon codes use letters, numbers and hyphens')
      .optional(),
    /** Proof of an offline/UPI transfer: a hosted URL or an image data URI. */
    paymentScreenshot: z
      .string()
      .trim()
      .max(4096)
      .refine(
        (value) => value.startsWith(`https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/`),
        'Upload the payment screenshot to Cloudinary first',
      )
      .optional(),
  })
  .refine((value) => Boolean(value.addressId) !== Boolean(value.address), {
    message: 'Choose a saved address or enter a delivery address',
    path: ['address'],
  });

export const createReturnSchema = z.strictObject({
  reason: z.enum(RETURN_REASONS),
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
});

/**
 * The order id is a display number (`#WB-1042`), not an ObjectId, and reaches
 * the API URL-encoded - so it is checked as text rather than as a Mongo id.
 */
export const orderIdParamSchema = z.object({
  id: z.string().trim().min(4).max(40),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
