import { cloudinaryConfig } from './config.js';

/**
 * Reading a delivery URL back into a public id.
 *
 * A stored `secure_url` is all that a record normally keeps:
 *
 *   https://res.cloudinary.com/dftt4ow6q/image/upload/v1789112613/wishbox/photo.jpg
 *
 * To *delete* that asset the API needs its public id (`wishbox/photo`), so it is
 * recovered from the URL rather than stored a second time on every record - one
 * source of truth, and it works equally for images uploaded unsigned from the
 * browser and for URLs pasted into the admin editor.
 *
 * Returning `null` is a meaningful answer: it means "not an asset this
 * environment can delete", and callers treat it as nothing to clean up. It is
 * never guessed at, because deleting the wrong asset is worse than leaving one
 * behind - a URL with transformations but no version segment is ambiguous and is
 * refused.
 */

/** Resource types whose delivery URLs are recognised. */
const RESOURCE_TYPES = ['image', 'video', 'raw'] as const;

export function publicIdFromDeliveryUrl(
  url: string,
  cloudName: string = cloudinaryConfig.cloudName,
): string | null {
  if (!cloudName) return null;

  const trimmed = url?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // A data URI, a relative path or plain junk - nothing to delete either way.
    return null;
  }

  // Only our own cloud over https: another vendor's or another account's URL
  // must not be handed to `destroy`.
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  // ['<cloud>', '<resource_type>', 'upload', ...]
  if (segments.length < 4) return null;

  const [cloud, resourceType, action] = segments as [string, string, string];
  if (cloud !== cloudName) return null;
  if (!(RESOURCE_TYPES as readonly string[]).includes(resourceType)) return null;
  if (action !== 'upload') return null;

  const rest = segments.slice(3);
  // Everything before the version segment is a transformation; without one the
  // boundary is invisible, so this is where the guessing stops.
  const versionIndex = rest.findIndex((segment) => /^v\d+$/.test(segment));
  if (versionIndex === -1) return null;

  const afterVersion = rest.slice(versionIndex + 1);
  if (afterVersion.length === 0) return null;

  const file = afterVersion[afterVersion.length - 1]!;
  // Delivery URLs carry the format as an extension; `raw` files keep theirs
  // because it is part of the public id there.
  const name =
    resourceType === 'raw' ? file : file.replace(/\.[a-z0-9]{1,8}$/i, '');

  const publicId = [...afterVersion.slice(0, -1), name].join('/');
  return publicId || null;
}

/** True when this URL points at an asset in the configured cloud. */
export function isStoredAsset(url: string): boolean {
  return publicIdFromDeliveryUrl(url) !== null;
}
