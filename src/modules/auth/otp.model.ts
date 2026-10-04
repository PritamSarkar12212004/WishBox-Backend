import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PHONE_REGEX } from '../../consts/constants.js';

/**
 * A pending login challenge. One document per phone number: requesting a new
 * code replaces the previous one.
 *
 * `expiresAt` carries a TTL index, so MongoDB deletes stale challenges on its
 * own and the collection cannot grow without bound.
 */
const otpSchema = new Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      match: [PHONE_REGEX, 'Enter a valid 10-digit WhatsApp number starting with 6, 7, 8 or 9'],
    },
    /** bcrypt hash - the six-digit code itself is never stored. */
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: () => new Date() },
    consumedAt: { type: Date },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export type OtpAttributes = InferSchemaType<typeof otpSchema>;
export type OtpDocument = HydratedDocument<OtpAttributes>;

export const OtpModel = model<OtpAttributes>('OtpChallenge', otpSchema);
