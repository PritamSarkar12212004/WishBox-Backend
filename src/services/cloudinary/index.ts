/**
 * Image storage (Cloudinary).
 *
 * Same shape as `services/whatsapp`: the folder owns its own configuration and
 * its own errors, and everything outside this folder talks to the functions
 * re-exported here rather than to the provider's HTTP details.
 *
 * Layout:
 *   config.ts            every Cloudinary setting, resolved from validated env
 *   cloudinary.errors.ts the two failures this service can throw
 *   signature.ts         request signing (the API secret never leaves the server)
 *   client.ts            the HTTP calls, with timeout and retry
 *   urls.ts              delivery URL -> public id, so a record can be cleaned up
 *   types.ts             request/response shapes
 *
 * Uploads stay **disabled** until `CLOUDINARY_API_SECRET` is set
 * (`cloudinaryConfig.isConfigured`), so a half-configured environment never
 * writes a broken URL - it throws a 503 naming the missing key instead.
 *
 * The admin storefront currently uploads product images *unsigned* from the
 * browser (no secret in the bundle). This service is for the server-side work
 * that cannot be done there: signed uploads, re-hosting an existing URL, and
 * deleting assets when their record goes away.
 */
import { isConfigured } from './config.js';
import { uploadImage } from './client.js';
import { CloudinaryNotConfiguredError } from './cloudinary.errors.js';
import type { CloudinaryUploadResult, UploadImageInput } from './types.js';

export {
  apiBaseUrl,
  cloudinaryConfig,
  deliveryUrl,
  isConfigured,
  missingCredentials,
  requireCredentials,
  resourceUrl,
} from './config.js';
export { destroyImage, uploadImage } from './client.js';
export { isStoredAsset, publicIdFromDeliveryUrl } from './urls.js';
export { buildUploadSignature, signedPayload, UNSIGNED_PARAMETERS } from './signature.js';
export { CloudinaryNotConfiguredError, CloudinaryUploadError } from './cloudinary.errors.js';
export type {
  CloudinaryApiResource,
  CloudinaryDestroyResult,
  CloudinaryResourceType,
  CloudinaryUploadResult,
  UploadImageInput,
} from './types.js';

/**
 * Store an image, or explain why it cannot be stored yet.
 *
 * Callers that treat storage as optional (a product photo that can fall back to
 * a pasted URL) should check `isConfigured()` first; a caller that *requires* the
 * upload can call `uploadImage` directly and let the 503 surface.
 */
export async function storeImage(input: UploadImageInput): Promise<CloudinaryUploadResult> {
  if (!isConfigured()) {
    throw new CloudinaryNotConfiguredError();
  }
  return uploadImage(input);
}
