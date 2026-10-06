import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { REVIEW_STATUSES, type ReviewStatus } from '../admin.constants.js';

/** A public reply an admin posted under a review. */
export interface ReviewReply {
  message: string;
  at: number;
  /** Display name of the admin who sent it. */
  by: string;
}

/** A customer review, as the moderation queue shows it. */
export interface AdminReview {
  id: string;
  productId: string;
  productName: string;
  image: string;
  customer: string;
  rating: number;
  title: string;
  comment: string;
  createdAt: number;
  helpful: number;
  status: ReviewStatus;
}

/** The review plus the store's reply - exactly what the moderation screen renders. */
export type AdminReviewView = AdminReview & { reply?: ReviewReply };

export type AdminReviewAttributes = Omit<AdminReview, 'id'> & {
  reviewId: string;
  reply?: ReviewReply;
};
export type AdminReviewDocument = HydratedDocument<AdminReviewAttributes>;
export type AdminReviewModelType = Model<AdminReviewAttributes>;

const replySchema = new Schema<ReviewReply>(
  {
    message: { type: String, required: true, trim: true, maxlength: 2_000 },
    at: { type: Number, required: true },
    by: { type: String, default: '' },
  },
  { _id: false },
);

const reviewSchema = new Schema<AdminReviewAttributes>(
  {
    reviewId: { type: String, required: true, unique: true, index: true, trim: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, default: '' },
    image: { type: String, default: '' },
    customer: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '' },
    comment: { type: String, default: '' },
    createdAt: { type: Number, required: true, index: true },
    helpful: { type: Number, default: 0 },
    status: { type: String, enum: REVIEW_STATUSES, default: 'Pending', index: true },
    reply: { type: replySchema },
  },
  { versionKey: false },
);

export const AdminReviewModel = model<AdminReviewAttributes>('AdminReview', reviewSchema);

export function toPublicReview(
  doc: AdminReviewAttributes & { _id?: unknown },
): AdminReviewView {
  const { _id, reviewId, ...rest } = doc;
  return { id: reviewId, ...rest };
}
