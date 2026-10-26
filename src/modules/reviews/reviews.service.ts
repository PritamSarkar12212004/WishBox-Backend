import { createChildLogger } from '../../config/logger.js';
import { NotFoundError } from '../../shared/errors.js';
import {
  AdminReviewModel,
  type AdminReviewAttributes,
} from '../admin/models/review.model.js';
import { ProductModel } from '../products/products.model.js';
import type { CreateReviewInput } from './reviews.validation.js';

const log = createChildLogger('reviews');

/**
 * Product reviews.
 *
 * **One collection.** Reviews live in `AdminReviewModel` - the rows the admin
 * panel's moderation queue reads - so a review a shopper writes is the same row
 * an admin publishes, replies to or deletes. There is no second copy to drift.
 *
 * **The product carries the result.** After every change the product's `rating`
 * and `reviewCount` are recomputed from the published reviews, which is what
 * the cards, filters and search results show. A rating can therefore never be a
 * number someone typed into a product form.
 *
 * New reviews are published immediately: the shopper sees their review on the
 * product page, and an admin can still unpublish it from the panel if needed.
 */

export interface ReviewSummary {
  /** Mean of the published stars, one decimal. `0` when nothing is published. */
  average: number;
  count: number;
  /** How many reviews gave each star value, 5 down to 1. */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface PublicProductReview {
  id: string;
  rating: number;
  title: string;
  comment: string;
  /** The shopper's display name - never their number or account id. */
  customer: string;
  createdAt: number;
  helpful: number;
  /** True for the review the signed-in shopper wrote, if any. */
  mine: boolean;
  reply?: { message: string; at: number; by: string };
}

export interface ProductReviewPage {
  productId: string;
  summary: ReviewSummary;
  reviews: PublicProductReview[];
}

/** The reviewer, as the auth middleware resolved them. */
export interface ReviewAuthor {
  id: string;
  name: string;
}

const STAR_VALUES = ['5', '4', '3', '2', '1'] as const;

function emptyDistribution(): ReviewSummary['distribution'] {
  return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
}

function summarise(ratings: number[]): ReviewSummary {
  const distribution = emptyDistribution();
  let total = 0;

  ratings.forEach((rating) => {
    total += rating;
    const key = String(Math.min(5, Math.max(1, Math.round(rating)))) as keyof ReviewSummary['distribution'];
    distribution[key] += 1;
  });

  const count = ratings.length;
  return {
    average: count === 0 ? 0 : Math.round((total / count) * 10) / 10,
    count,
    distribution,
  };
}

/** A collision-proof id in the same `#REV-` family the panel already shows. */
function newReviewId(): string {
  const stage = Date.now().toString(36).toUpperCase();
  const salt = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `#REV-${stage}${salt}`;
}

/** A public view, with the shopper's own review flagged rather than identified. */
function toPublicReview(
  review: AdminReviewAttributes & { _id?: unknown },
  viewerId?: string,
): PublicProductReview {
  return {
    id: review.reviewId,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    customer: review.customer,
    createdAt: review.createdAt,
    helpful: review.helpful,
    mine: Boolean(viewerId && review.userId && review.userId === viewerId),
    ...(review.reply ? { reply: review.reply } : {}),
  };
}

/** A shopper only sees reviews of products the shop still publishes. */
async function assertPublishedProduct(slug: string): Promise<{ name: string; image: string }> {
  const product = await ProductModel.findOne({ slug }).select('name image hidden').lean();
  if (!product || product.hidden) {
    throw new NotFoundError('That product was not found');
  }
  return { name: product.name, image: product.image };
}

/** Published reviews for one product, newest first, plus the summary. */
export async function listProductReviews(
  slug: string,
  viewerId?: string,
): Promise<ProductReviewPage> {
  await assertPublishedProduct(slug);

  const reviews = await AdminReviewModel.find({
    productId: slug,
    status: 'Published',
    userId: { $exists: true, $ne: '' },
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean<Array<AdminReviewAttributes & { _id?: unknown }>>();

  return {
    productId: slug,
    summary: summarise(reviews.map((review) => review.rating)),
    reviews: reviews.map((review) => toPublicReview(review, viewerId)),
  };
}

/**
 * Writes (or rewrites) the signed-in shopper's review of one product.
 *
 * One account, one review per product: a second submission edits the first
 * rather than stacking another row, so the average cannot be inflated by
 * posting the same stars repeatedly. An edit keeps the moderation status the
 * review already had - editing must not be a way around an unpublish.
 */
export async function submitReview(
  slug: string,
  input: CreateReviewInput,
  author: ReviewAuthor,
): Promise<PublicProductReview> {
  const product = await assertPublishedProduct(slug);

  const existing = await AdminReviewModel.findOne({ productId: slug, userId: author.id });
  const fields = {
    rating: input.rating,
    title: input.title,
    comment: input.comment,
    customer: author.name,
    image: product.image,
    productName: product.name,
  };

  let saved: AdminReviewAttributes & { _id?: unknown };

  if (existing) {
    existing.set(fields);
    await existing.save();
    saved = existing.toObject();
  } else {
    const created = await AdminReviewModel.create({
      reviewId: newReviewId(),
      productId: slug,
      ...fields,
      userId: author.id,
      createdAt: Date.now(),
      helpful: 0,
      // Live at once: the shopper sees what they wrote. An admin can unpublish.
      status: 'Published',
    });
    saved = created.toObject();
  }

  await recalculateProductRating(slug);

  log.info({ productId: slug, userId: author.id, rating: input.rating }, 'Review saved');
  return toPublicReview(saved, author.id);
}

/**
 * Recomputes a product's rating and review count from its published reviews.
 *
 * Called after every write - a shopper's review, an admin's publish/unpublish
 * or a delete - so the number on the card is always the number the reviews say.
 */
export async function recalculateProductRating(productId: string): Promise<ReviewSummary> {
  const rows = await AdminReviewModel.aggregate<{ _id: number; count: number }>([
    { $match: { productId, status: 'Published' } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);

  const distribution = emptyDistribution();
  let count = 0;
  let total = 0;

  rows.forEach((row) => {
    const stars = Math.min(5, Math.max(1, Math.round(row._id)));
    distribution[String(stars) as keyof ReviewSummary['distribution']] += row.count;
    count += row.count;
    total += stars * row.count;
  });

  const average = count === 0 ? 0 : Math.round((total / count) * 10) / 10;
  await ProductModel.updateOne({ slug: productId }, { $set: { rating: average, reviewCount: count } });

  return { average, count, distribution };
}

/** Kept for the tests and scripts: the star order a distribution is read in. */
export { STAR_VALUES };
