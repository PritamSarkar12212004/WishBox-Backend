import { Router } from 'express';
import { optionalAuth, requireAuth, validate } from '../../middleware/index.js';
import { createReview, listReviews } from './reviews.controller.js';
import { createReviewSchema, reviewSlugParamSchema } from './reviews.validation.js';

/**
 * Reviews hang off the product they are about.
 *
 * Reading is public - the product page shows what shoppers said - while writing
 * needs a verified account, so one person cannot fill the page. `optionalAuth`
 * on the read is what lets the page tell a signed-in shopper "this one is yours"
 * without making the reviews private.
 */
export const productReviewsRouter = Router();

productReviewsRouter.get(
  '/:slug/reviews',
  validate({ params: reviewSlugParamSchema }),
  optionalAuth,
  listReviews,
);

productReviewsRouter.post(
  '/:slug/reviews',
  requireAuth,
  validate({ params: reviewSlugParamSchema, body: createReviewSchema }),
  createReview,
);
