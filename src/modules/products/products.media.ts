import { createChildLogger } from '../../config/logger.js';
import {
  destroyImage,
  isConfigured,
  publicIdFromDeliveryUrl,
} from '../../services/cloudinary/index.js';
import type { ProductAttributes } from './products.model.js';

const log = createChildLogger('products.media');

/**
 * Cleaning up the images a product no longer uses.
 *
 * Replacing a photo or deleting a product orphans the asset in Cloudinary, and
 * storage that is never reclaimed is how a media library turns into a bill. So
 * every write that drops an image hands the old URLs here.
 *
 * Two rules make this safe to call from the middle of a request:
 *
 *  1. It never throws. The product change has already been persisted by the time
 *     this runs, and losing an orphaned asset is not worth failing a save over.
 *  2. It only ever touches assets in this cloud, recognised by their delivery
 *     URL. A pasted Unsplash link or a data URI is simply not an asset we own.
 *
 * When `CLOUDINARY_API_SECRET` is absent the whole thing is a no-op, which is
 * what lets the shop run with unsigned browser uploads and no server secret.
 */

type ImageFields = Pick<
  ProductAttributes,
  'image' | 'hoverImage' | 'beforeImage' | 'afterImage' | 'gallery'
>;

/** Every image URL on a product, blanks removed. */
export function productImageUrls(product: Partial<ImageFields>): string[] {
  return [
    product.image,
    product.hoverImage,
    product.beforeImage,
    product.afterImage,
    ...(product.gallery ?? []),
  ].filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
}

/** The public ids among a set of URLs, deduplicated, order preserved. */
export function storedPublicIds(urls: string[]): string[] {
  const seen = new Set<string>();
  for (const url of urls) {
    const publicId = publicIdFromDeliveryUrl(url);
    if (publicId) seen.add(publicId);
  }
  return [...seen];
}

/** URLs that were on the product before a write but are not on it afterwards. */
export function replacedImageUrls(before: string[], after: string[]): string[] {
  const kept = new Set(after.map((url) => url.trim()));
  return before.filter((url) => !kept.has(url.trim()));
}

/**
 * Removes the given URLs from Cloudinary, best effort.
 * Returns the public ids that were actually removed, for logs and tests.
 */
export async function removeProductImages(urls: string[]): Promise<string[]> {
  const publicIds = storedPublicIds(urls);
  if (publicIds.length === 0) return [];

  if (!isConfigured()) {
    // Normal in this repo: images are uploaded unsigned from the browser, so
    // there is no secret here to authorise a delete with. Nothing is wrong.
    log.debug({ publicIds }, 'Cloudinary is not configured - leaving images in place');
    return [];
  }

  const removed: string[] = [];
  for (const publicId of publicIds) {
    try {
      await destroyImage(publicId);
      removed.push(publicId);
    } catch (error) {
      log.warn(
        { publicId, reason: error instanceof Error ? error.message : String(error) },
        'Could not remove an unused product image',
      );
    }
  }

  if (removed.length > 0) {
    log.info({ removed }, 'Removed images no longer used by a product');
  }
  return removed;
}
