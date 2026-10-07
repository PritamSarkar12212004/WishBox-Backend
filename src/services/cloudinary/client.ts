import { createChildLogger } from '../../config/logger.js';
import {
  bodyToText,
  describeHttpError,
  httpClient,
  httpResponseError,
} from '../../shared/httpClient.js';
import { CloudinaryUploadError } from './cloudinary.errors.js';
import { cloudinaryConfig, requireCredentials, resourceUrl } from './config.js';
import { signedPayload } from './signature.js';
import type {
  CloudinaryApiResponse,
  CloudinaryDestroyResult,
  CloudinaryUploadResult,
  UploadImageInput,
} from './types.js';

const log = createChildLogger('cloudinary');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cloudinary prepends `folder` to whatever `public_id` it is given, so a caller
 * who writes the folder into the id as well ends up with it twice
 * (`wishbox/wishbox/photo`) - observed live, and always a surprise. When the
 * folder we are about to send already heads the requested id, drop it there and
 * let the provider add it once.
 */
function withoutFolderPrefix(publicId: string, folder: string): string {
  const prefix = `${folder.replace(/\/+$/, '')}/`;
  return folder && publicId.startsWith(prefix) ? publicId.slice(prefix.length) : publicId;
}

/** The body may arrive parsed, or as JSON-in-a-string. Handle both. */
function parseBody(data: unknown): CloudinaryApiResponse | null {
  if (data && typeof data === 'object') return data as CloudinaryApiResponse;
  if (typeof data === 'string' && data) {
    try {
      return JSON.parse(data) as CloudinaryApiResponse;
    } catch {
      return null;
    }
  }
  return null;
}

function toUploadResult(parsed: CloudinaryApiResponse): CloudinaryUploadResult {
  return {
    publicId: parsed.public_id ?? '',
    url: parsed.url ?? '',
    secureUrl: parsed.secure_url ?? '',
    format: parsed.format ?? '',
    bytes: parsed.bytes ?? 0,
    ...(parsed.width !== undefined ? { width: parsed.width } : {}),
    ...(parsed.height !== undefined ? { height: parsed.height } : {}),
    resourceType: parsed.resource_type ?? 'image',
    ...(parsed.created_at ? { createdAt: parsed.created_at } : {}),
  };
}

/**
 * Stores one image and returns the asset Cloudinary kept.
 *
 * Failure handling splits the same way the messaging gateway's does, because
 * the caller can act on exactly one of the two:
 * - Cloudinary answered with a bad status -> its own message is thrown, because
 *   "Upload preset not found" is the whole fix. Retrying cannot change it.
 * - Cloudinary was unreachable -> retried once, then thrown as a 502.
 */
export async function uploadImage(input: UploadImageInput): Promise<CloudinaryUploadResult> {
  const { apiKey, apiSecret } = requireCredentials();

  const file = input.file?.trim();
  if (!file) {
    throw new CloudinaryUploadError('Nothing to upload');
  }
  if (file.length > cloudinaryConfig.maxUploadBytes * 1.37) {
    // Base64 inflates by ~4/3, so this is the encoded size of the byte cap.
    throw new CloudinaryUploadError(
      `That image is too large (limit ${Math.round(cloudinaryConfig.maxUploadBytes / (1024 * 1024))} MB)`,
    );
  }

  const folder = input.folder?.trim() || cloudinaryConfig.folder;
  const tags = input.tags?.map((tag) => tag.trim()).filter(Boolean).join(',');
  const publicId = input.publicId?.trim()
    ? withoutFolderPrefix(input.publicId.trim(), folder)
    : '';

  const params: Record<string, string | number> = {
    folder,
    timestamp: Math.floor(Date.now() / 1000),
  };
  if (publicId) params.public_id = publicId;
  if (tags) params.tags = tags;

  const payload = { file, ...signedPayload(apiSecret, apiKey, params) };
  const url = resourceUrl('upload');

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= cloudinaryConfig.maxAttempts; attempt += 1) {
    try {
      const response = await httpClient.post(url, payload, {
        timeout: cloudinaryConfig.timeoutMs,
      });

      const parsed = parseBody(response.data);
      if (!parsed?.public_id || !parsed.secure_url) {
        throw new CloudinaryUploadError('Cloudinary answered without an asset', {
          body: bodyToText(response.data),
        });
      }

      log.info(
        { publicId: parsed.public_id, folder, bytes: parsed.bytes, attempt },
        'Image uploaded',
      );
      return toUploadResult(parsed);
    } catch (error) {
      // Cloudinary answered (4xx/5xx): its error body is the useful part.
      const failure = httpResponseError(error);
      if (failure) {
        const parsed = parseBody(failure.data);
        const text = bodyToText(failure.data);

        log.warn({ statusCode: failure.status, folder, body: text }, 'Cloudinary refused the upload');

        throw new CloudinaryUploadError(
          parsed?.error?.message || `Cloudinary rejected the upload (${failure.status})`,
          { statusCode: failure.status },
        );
      }

      // A shape problem in a *successful* answer is not worth retrying either.
      if (error instanceof CloudinaryUploadError) throw error;

      lastError = error;
      log.warn(
        {
          attempt,
          maxAttempts: cloudinaryConfig.maxAttempts,
          reason: describeHttpError(error),
        },
        'Cloudinary attempt failed',
      );

      if (attempt < cloudinaryConfig.maxAttempts) await sleep(cloudinaryConfig.retryDelayMs);
    }
  }

  throw new CloudinaryUploadError('Could not reach Cloudinary', {
    cause: describeHttpError(lastError),
  });
}

/**
 * Deletes a stored asset by public id.
 *
 * `not found` is a normal answer and is returned rather than thrown: the caller
 * asked for the asset to be gone, and it is. Only a genuine failure throws.
 */
export async function destroyImage(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
): Promise<CloudinaryDestroyResult> {
  const { apiKey, apiSecret } = requireCredentials();

  const id = publicId?.trim();
  if (!id) {
    throw new CloudinaryUploadError('Which image should be removed?');
  }

  const payload = signedPayload(apiSecret, apiKey, {
    public_id: id,
    timestamp: Math.floor(Date.now() / 1000),
  });

  try {
    const response = await httpClient.post(resourceUrl('destroy', resourceType), payload, {
      timeout: cloudinaryConfig.timeoutMs,
    });

    const parsed = parseBody(response.data);
    const result = (parsed as { result?: string } | null)?.result ?? 'ok';
    log.info({ publicId: id, result }, 'Image removed');
    return { result };
  } catch (error) {
    const failure = httpResponseError(error);
    if (failure) {
      const parsed = parseBody(failure.data);
      throw new CloudinaryUploadError(
        parsed?.error?.message || `Cloudinary refused the delete (${failure.status})`,
        { statusCode: failure.status },
      );
    }
    throw new CloudinaryUploadError('Could not reach Cloudinary', {
      cause: describeHttpError(error),
    });
  }
}
