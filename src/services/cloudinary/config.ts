import { env } from '../../config/env.js';
import { CloudinaryNotConfiguredError } from './cloudinary.errors.js';

/**
 * Every Cloudinary setting in one place, resolved once from validated env.
 *
 * Defaults live in the env schema (`src/config/env.ts`) so there is a single
 * source of configuration truth, and the credentials are declared there too -
 * this file only gives them names and shape.
 *
 * Nothing here is secret-by-default: the cloud name and API key identify the
 * product environment, and the API **secret** is what signs a request. Uploads
 * stay off until all three are present (`cloudinaryConfig.isConfigured`), so a
 * half-configured environment fails loudly instead of writing broken URLs.
 */

/**
 * An optional env var that was left blank in `.env` arrives as `""`, which
 * would defeat `??` fallbacks further down. Normalise it to `undefined`.
 */
const optional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const cloudinaryConfig = Object.freeze({
  /** Product environment, e.g. `dftt4ow6q`. Part of every delivery URL. */
  cloudName: env.CLOUDINARY_CLOUD_NAME,

  apiKey: optional(env.CLOUDINARY_API_KEY),
  /** Signs a request. Server-side only - it must never reach a browser. */
  apiSecret: optional(env.CLOUDINARY_API_SECRET),

  /** The label the key carries in the console; informational, kept for logs. */
  keyName: optional(env.CLOUDINARY_KEY_NAME),

  /** Default destination folder for every upload. */
  folder: optional(env.CLOUDINARY_FOLDER) ?? 'wishbox',

  /** Signed uploads can carry a real file, so the cap is generous. */
  maxUploadBytes: 10 * 1024 * 1024,

  /**
   * The provider is reachable and fast, but a signed upload is user-visible -
   * a single blip should not lose a photo. Only *unreachable* calls retry;
   * a refusal is never retried because its answer would not change.
   */
  timeoutMs: 30_000,
  maxAttempts: 2,
  retryDelayMs: 500,

  /** True when every credential a signed request needs is present. */
  isConfigured: env.cloudinary.enabled,
});

/** True when this environment can actually sign and perform uploads. */
export function isConfigured(): boolean {
  return cloudinaryConfig.isConfigured;
}

/** True when `key` is present, so callers can describe what is missing. */
export function missingCredentials(): string[] {
  const missing: string[] = [];
  if (!cloudinaryConfig.cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!cloudinaryConfig.apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!cloudinaryConfig.apiSecret) missing.push('CLOUDINARY_API_SECRET');
  return missing;
}

/** The API root for the configured product environment. */
export function apiBaseUrl(): string {
  return `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}`;
}

/** The endpoint for one upload/destroy of a given resource type. */
export function resourceUrl(
  action: 'upload' | 'destroy',
  resourceType: 'image' | 'video' | 'raw' | 'auto' = 'image',
): string {
  return `${apiBaseUrl()}/${resourceType}/${action}`;
}

/** The public URL of a stored asset, for callers that only have a public id. */
export function deliveryUrl(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
): string {
  return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/${resourceType}/upload/${publicId}`;
}

/**
 * A signed request needs the key and the secret together.
 *
 * Like the messaging gateway's `requireToken`, the secret is never defaulted in
 * source - env validation keeps uploads disabled until it is set, and this
 * throws the one error whose message tells an operator exactly what to add.
 */
export function requireCredentials(): { apiKey: string; apiSecret: string } {
  const { apiKey, apiSecret } = cloudinaryConfig;
  if (!apiKey || !apiSecret) {
    throw new CloudinaryNotConfiguredError(
      `Image storage is not configured — missing ${missingCredentials().join(', ')}`,
    );
  }
  return { apiKey, apiSecret };
}
