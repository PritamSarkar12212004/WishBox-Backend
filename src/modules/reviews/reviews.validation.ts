import { z } from 'zod';
import { SLUG_REGEX } from '../../shared/slug.js';

/**
 * Review rules.
 *
 * The product is identified by its slug - the same id the storefront URLs and
 * the admin panel use - so a review can never point at a product that is not
 * addressable.
 */

export const reviewSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_REGEX, 'That product id is not valid'),
});

const title = z
  .string()
  .trim()
  .max(80, 'Keep the headline under 80 characters')
  .default('');

const comment = z
  .string()
  .trim()
  .min(4, 'Say a little more - at least a few words')
  .max(1_000, 'Keep the review under 1,000 characters');

export const createReviewSchema = z.strictObject({
  /** Whole stars, 1-5. Half stars are not a thing a shopper can tap. */
  rating: z.coerce
    .number()
    .int('Give a whole number of stars')
    .min(1, 'Choose at least one star')
    .max(5, 'The most is five stars'),
  title,
  comment,
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ReviewSlugParamInput = z.infer<typeof reviewSlugParamSchema>;
