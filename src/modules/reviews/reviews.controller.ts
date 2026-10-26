import type { Request } from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import { UnauthorizedError } from '../../shared/errors.js';
import * as reviewService from './reviews.service.js';
import type { CreateReviewInput } from './reviews.validation.js';

/** Express 5 types a route param as `string | string[]`; this narrows it once. */
function slugOf(req: Request): string {
  return String(req.params.slug);
}

/**
 * GET /products/:slug/reviews
 *
 * Public: anyone browsing the product can read its reviews. A signed-in
 * shopper's own review is flagged, so the form opens prefilled, without the
 * response ever carrying another shopper's identity.
 */
export const listReviews = asyncHandler(async (req, res) => {
  const page = await reviewService.listProductReviews(slugOf(req), req.user?.id);
  sendSuccess(res, page, { message: 'Reviews' });
});

/** POST /products/:slug/reviews - the signed-in shopper's review. */
export const createReview = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const review = await reviewService.submitReview(
    slugOf(req),
    req.body as CreateReviewInput,
    { id: String(req.user.id), name: req.user.name },
  );

  sendSuccess(res, review, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Thanks for the review',
  });
});
