import { z } from 'zod';

/**
 * Upload rules.
 *
 * The body is JSON and the app parses 1 MB of it, so `file` is a *reference* to
 * an image rather than the bytes: a public `https` URL, which Cloudinary fetches
 * itself, or a data URI small enough to fit the body limit. Base64 inflates by
 * about a third, which is why the ceiling is stated on the encoded string.
 */

/** ~750 KB of real image inside a 1 MB JSON body. */
const MAX_ENCODED_BYTES = 1_000_000;

export const uploadImageSchema = z.strictObject({
  file: z
    .string()
    .trim()
    .min(1, 'Nothing to upload')
    .max(MAX_ENCODED_BYTES, 'That image is too large for a JSON request - upload it from the browser instead')
    .refine(
      (value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value),
      'Send a hosted https URL or an image data URI',
    ),
  /** Defaults to `CLOUDINARY_FOLDER`. */
  folder: z.string().trim().max(80).optional(),
  publicId: z.string().trim().max(160).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

export const deleteUploadQuerySchema = z.object({
  publicId: z
    .string()
    .trim()
    .min(1, 'Which image should be removed?')
    .max(200, 'That public id is too long'),
});

export type UploadImageInput = z.infer<typeof uploadImageSchema>;
export type DeleteUploadQueryInput = z.infer<typeof deleteUploadQuerySchema>;
