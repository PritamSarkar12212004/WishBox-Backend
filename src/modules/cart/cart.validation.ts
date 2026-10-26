import { z } from 'zod';

/**
 * One add-to-cart event.
 *
 * `productId` is the product's slug. `qty` is how many units were added in that
 * one tap, so the panel can report units as well as taps; the per-order ceiling
 * is the same 999 the cart itself allows.
 */
export const cartAddSchema = z.strictObject({
  productId: z.string().trim().min(1, 'A product id is required').max(160),
  qty: z.coerce.number().int().min(1, 'Add at least one').max(999, 'That is more than one cart can hold'),
});

export type CartAddInput = z.infer<typeof cartAddSchema>;
