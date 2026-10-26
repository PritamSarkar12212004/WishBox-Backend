import { z } from 'zod';

/** A product's slug, which is all a wishlist row stores. */
export const wishlistProductParamSchema = z.object({
  productId: z.string().trim().min(1, 'A product id is required').max(160),
});
