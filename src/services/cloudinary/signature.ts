import { createHash } from 'node:crypto';

/**
 * Cloudinary request signing.
 *
 * A signed request is authorised by a hash of its own parameters, so the API
 * secret never travels over the wire - only the signature computed from it does.
 * The provider's recipe, in order:
 *
 *   1. take every parameter **except** `file`, `api_key`, `resource_type`,
 *      `cloud_name` and `signature` itself;
 *   2. sort the remaining `key=value` pairs alphabetically;
 *   3. join them with `&`;
 *   4. append the API secret with no separator;
 *   5. SHA-1 the result and hex-encode it.
 *
 * Step 1 is the one that bites: including `file` would hash a multi-megabyte
 * payload, and including `api_key` produces a signature Cloudinary rejects.
 */

/** Parameters Cloudinary excludes from the signed string, by its own rules. */
export const UNSIGNED_PARAMETERS = Object.freeze([
  'file',
  'api_key',
  'api_secret',
  'resource_type',
  'cloud_name',
  'signature',
]);

export type SignableParams = Record<string, string | number | boolean | undefined | null>;

/**
 * Builds the signature for a set of parameters.
 *
 * Blank and undefined values are dropped rather than hashed as empty strings -
 * Cloudinary signs only what the request actually carries, so an omitted
 * parameter must not leave a `key=` behind.
 */
export function buildUploadSignature(params: SignableParams, apiSecret: string): string {
  const toSign = Object.entries(params)
    .filter(([key]) => !UNSIGNED_PARAMETERS.includes(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&');

  return createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
}

/** A parameter set, packaged the way the API expects it alongside the file. */
export function signedPayload(
  apiSecret: string,
  apiKey: string,
  params: SignableParams,
): Record<string, string | number> {
  const signature = buildUploadSignature(params, apiSecret);

  const payload: Record<string, string | number> = { api_key: apiKey, signature };
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    // Booleans are sent as their string form, which is exactly what the
    // signature above hashed - the two must agree or Cloudinary rejects it.
    payload[key] = typeof value === 'boolean' ? String(value) : value;
  }
  return payload;
}
