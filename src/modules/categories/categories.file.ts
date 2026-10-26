import { BadRequestError } from '../../shared/errors.js';

/**
 * Uploaded catalogue documents.
 *
 * A catalogue is usually a PDF but can be a Word document, so the accepted
 * types are an allowlist rather than "anything": the bytes are served back to
 * shoppers, and a mislabelled file would be delivered with the wrong content
 * type. The magic bytes are checked too - a caller can label a file whatever it
 * likes, but a PDF has to start with `%PDF`.
 */

/** ~650 KB decoded. The JSON body cap makes anything larger unreachable anyway. */
export const MAX_CATALOGUE_BYTES = 700 * 1024;

type CatalogueExtension = 'pdf' | 'doc' | 'docx';

const DOCUMENT_TYPES: Record<string, { contentType: string; extension: CatalogueExtension }> = {
  'application/pdf': { contentType: 'application/pdf', extension: 'pdf' },
  'application/msword': { contentType: 'application/msword', extension: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  },
};

/** The extensions a browser may pick in the admin dialog. */
export const CATALOGUE_EXTENSIONS = Object.values(DOCUMENT_TYPES).map(
  (entry) => entry.extension,
);

function looksLike(bytes: Buffer, extension: CatalogueExtension): boolean {
  if (extension === 'pdf') return bytes.subarray(0, 4).toString('latin1') === '%PDF';
  if (extension === 'docx') return bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK" zip
  return bytes.subarray(0, 4).toString('hex') === 'd0cf11e0'; // legacy .doc
}

export interface DecodedCatalogueFile {
  bytes: Buffer;
  contentType: string;
  fileName: string;
}

/**
 * Turns the admin's `data:` URI into bytes this API can serve.
 *
 * A plain `https://` link never reaches here - a hosted file is kept as a link,
 * because the admin already put it somewhere they control.
 */
export function decodeCatalogueFile(value: string, slug: string): DecodedCatalogueFile {
  const match = /^data:([^;,]+)(;base64)?,(.+)$/s.exec(value);
  if (!match) {
    throw new BadRequestError('Send the file as a data URI, or paste a hosted https link');
  }

  const [, mime, base64Flag, payload] = match;
  if (!base64Flag) {
    throw new BadRequestError('Send the file base64-encoded');
  }

  const kind = DOCUMENT_TYPES[(mime ?? '').toLowerCase()];
  if (!kind) {
    throw new BadRequestError('Attach a PDF or a Word document', { field: 'file' });
  }

  const bytes = Buffer.from(payload ?? '', 'base64');
  if (bytes.length === 0) {
    throw new BadRequestError('That file came through empty', { field: 'file' });
  }
  if (bytes.length > MAX_CATALOGUE_BYTES) {
    throw new BadRequestError(
      `That file is too large (limit ${Math.round(MAX_CATALOGUE_BYTES / 1024)} KB) - paste a hosted link for a bigger one`,
      { field: 'file' },
    );
  }
  if (!looksLike(bytes, kind.extension)) {
    throw new BadRequestError(
      `That file does not look like a ${kind.extension.toUpperCase()}`,
      { field: 'file' },
    );
  }

  return {
    bytes,
    contentType: kind.contentType,
    fileName: `${slug}-catalogue.${kind.extension}`,
  };
}
