/** Type of asset Cloudinary is asked to store. */
export type CloudinaryResourceType = 'image' | 'video' | 'raw' | 'auto';

/**
 * One image to store.
 *
 * `file` is deliberately a string, not a stream: Cloudinary accepts a data URI
 * (`data:image/png;base64,…`) or a public `http(s)` URL it fetches itself, which
 * covers both "the admin pasted a base64 proof" and "re-host this existing
 * image" without this service ever handling multipart parsing.
 */
export interface UploadImageInput {
  file: string;
  /** Defaults to `CLOUDINARY_FOLDER` (`wishbox`). */
  folder?: string;
  /** Force a stable public id instead of a random one. */
  publicId?: string;
  /** Searchable tags attached to the asset. */
  tags?: string[];
}

/** The stored asset, as returned by Cloudinary. */
export interface CloudinaryUploadResult {
  publicId: string;
  /** http URL - what gets saved on a record. */
  url: string;
  /** https URL; the one to prefer. */
  secureUrl: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  resourceType: string;
  createdAt?: string;
}

/** The outcome of deleting an asset. `not found` is a normal answer. */
export interface CloudinaryDestroyResult {
  result: string;
}

/** What Cloudinary answered about a single asset. */
export interface CloudinaryApiResource {
  public_id?: string;
  url?: string;
  secure_url?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  resource_type?: string;
  created_at?: string;
}

/** A refusal carries its own message, which is the actionable part. */
export interface CloudinaryApiErrorBody {
  error?: { message?: string };
}

export type CloudinaryApiResponse = CloudinaryApiResource & CloudinaryApiErrorBody;
