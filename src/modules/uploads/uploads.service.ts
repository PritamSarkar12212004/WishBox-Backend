import { createChildLogger } from '../../config/logger.js';
import {
  cloudinaryConfig,
  destroyImage,
  isConfigured,
  missingCredentials,
  storeImage,
} from '../../services/cloudinary/index.js';
import type { CloudinaryResourceType } from '../../services/cloudinary/index.js';
import type { UploadImageInput } from './uploads.validation.js';

const log = createChildLogger('uploads');

/**
 * Admin media endpoints.
 *
 * This module is a thin, guarded doorway to `services/cloudinary` - it adds no
 * storage logic of its own, because the signing, the timeout and the retry all
 * belong to that service. What it adds is the admin boundary: the API secret
 * signs requests here, server-side, so the browser never needs it.
 *
 * The shop's default path is still the *unsigned* upload from the admin editor
 * (a preset, no secret anywhere in the bundle). These endpoints are for the jobs
 * the browser cannot do: re-hosting a URL, a deterministic public id, and
 * deleting an asset that no record points at any more.
 */

/** What a product record should store: the https URL, plus its identity. */
export interface StoredImage {
  publicId: string;
  url: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  resourceType: string;
  createdAt?: string;
}

/**
 * Whether server-side uploads can work right now.
 *
 * The admin editor reads this to decide between "upload it here" and "upload it
 * from the browser / paste a URL", so it reports *which* key is missing instead
 * of a bare boolean.
 */
export function uploadStatus(): {
  configured: boolean;
  missing: string[];
  cloudName: string;
  folder: string;
} {
  return {
    configured: isConfigured(),
    missing: missingCredentials(),
    cloudName: cloudinaryConfig.cloudName,
    folder: cloudinaryConfig.folder,
  };
}

export async function storeUpload(input: UploadImageInput): Promise<StoredImage> {
  const asset = await storeImage({
    file: input.file,
    ...(input.folder ? { folder: input.folder } : {}),
    ...(input.publicId ? { publicId: input.publicId } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  });

  log.info({ publicId: asset.publicId, bytes: asset.bytes }, 'Image stored');

  return {
    publicId: asset.publicId,
    // `secure_url` is the one to keep: it never downgrades to http on a page.
    url: asset.secureUrl || asset.url,
    format: asset.format,
    bytes: asset.bytes,
    ...(asset.width === undefined ? {} : { width: asset.width }),
    ...(asset.height === undefined ? {} : { height: asset.height }),
    resourceType: asset.resourceType,
    ...(asset.createdAt ? { createdAt: asset.createdAt } : {}),
  };
}

export async function removeUpload(
  publicId: string,
  resourceType: CloudinaryResourceType = 'image',
): Promise<{ publicId: string; result: string }> {
  // `not found` is a success: the caller asked for it to be gone, and it is.
  const { result } = await destroyImage(publicId, resourceType === 'auto' ? 'image' : resourceType);
  log.info({ publicId, result }, 'Image delete requested');
  return { publicId, result };
}
