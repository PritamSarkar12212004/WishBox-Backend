import { randomUUID } from 'node:crypto';
import { createChildLogger } from '../../config/logger.js';
import { destroyImage } from '../../services/cloudinary/index.js';
import { publicIdFromDeliveryUrl } from '../../services/cloudinary/urls.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { slugify } from '../../shared/slug.js';
import {
  CatalogueLibraryModel,
  toPublicCatalogue,
  type CatalogueLibraryEntry,
} from './catalogues.model.js';
import type { CreateCatalogueInput } from './catalogues.validation.js';

const log = createChildLogger('catalogues');

/**
 * The shop-wide catalogue library.
 *
 * A category can already carry its own catalogues; this is the answer to "I
 * have a file that isn't about one category" - a season lookbook, a trade price
 * list, a gift guide. Reads are public (the storefront lists them), writes are
 * admin-only, and an admin can add as many as they want.
 */

export async function listCatalogues() {
  const rows = await CatalogueLibraryModel.find().sort({ uploadedAt: -1 }).lean();
  return rows.map(toPublicCatalogue);
}

/** The filename the browser should save, derived from the title. */
function fileNameFor(title: string, url: string): string {
  const fromUrl = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
  if (/\.(pdf|docx?)$/i.test(fromUrl)) return fromUrl;
  return `${slugify(title) || 'wishbox-catalogue'}.pdf`;
}

/** A defence-in-depth cap: a catalogue is a document, not a media library. */
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Pulls the uploaded document from Cloudinary and keeps a copy here.
 *
 * Storing the bytes is what makes the download reliable: the link the shopper
 * clicks is our own route, so it carries the right filename and content type
 * and does not depend on PDF delivery being enabled on the storage account.
 */
async function fetchDocument(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!response || !response.ok) {
    throw new BadRequestError('The uploaded file could not be read - try uploading it again');
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new BadRequestError('The uploaded file is empty');
  }
  if (bytes.length > MAX_BYTES) {
    throw new BadRequestError('Keep the catalogue under 12 MB');
  }

  const headerType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
  const contentType = headerType.startsWith('application/')
    ? headerType
    : /^%PDF-/.test(bytes.subarray(0, 5).toString('latin1'))
      ? 'application/pdf'
      : 'application/octet-stream';

  return { bytes, contentType };
}

export async function addCatalogue(input: CreateCatalogueInput, actor?: string) {
  const url = input.file.trim();
  const { bytes, contentType } = await fetchDocument(url);

  const entry = await CatalogueLibraryModel.create({
    catalogueId: randomUUID(),
    title: input.title,
    description: input.description ?? '',
    url,
    fileName: fileNameFor(input.title, url),
    bytes,
    contentType,
    size: bytes.length,
    uploadedAt: new Date(),
    ...(actor ? { uploadedBy: actor } : {}),
  } satisfies CatalogueLibraryEntry);

  log.info({ catalogueId: entry.catalogueId, title: entry.title, actor }, 'Catalogue added');
  return toPublicCatalogue(entry);
}

export async function removeCatalogue(catalogueId: string): Promise<void> {
  const entry = await CatalogueLibraryModel.findOneAndDelete({ catalogueId });
  if (!entry) {
    throw new NotFoundError('That catalogue was not found');
  }

  // Best effort: the row is already gone, so a storage failure must not undo it.
  const publicId = publicIdFromDeliveryUrl(entry.url);
  if (publicId) {
    await destroyImage(publicId, 'raw').catch((error: unknown) => {
      log.warn(
        { catalogueId, reason: error instanceof Error ? error.message : 'unknown' },
        'Could not delete the catalogue file from Cloudinary',
      );
    });
  }

  log.info({ catalogueId }, 'Catalogue removed');
}

/** The stored document, for the public download route. */
export async function getCatalogueFile(catalogueId: string): Promise<{
  fileName: string;
  contentType: string;
  bytes: Buffer;
}> {
  /* Deliberately not `.lean()`: a lean read hands back the raw BSON Binary and
   * `Buffer.from(binary)` is empty, which is how a download ends up 0 bytes. */
  const entry = await CatalogueLibraryModel.findOne({ catalogueId });
  if (!entry) {
    throw new NotFoundError('That catalogue was not found');
  }

  return {
    fileName: entry.fileName,
    contentType: entry.contentType,
    bytes: Buffer.from(entry.bytes),
  };
}
