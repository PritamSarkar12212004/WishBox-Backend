import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * A catalogue that does not belong to a category.
 *
 * Category catalogues describe one collection; these are the general ones - a
 * season lookbook, a trade price list, a gift guide - that cover the whole shop.
 * They live in their own collection because there is no category row to hang
 * them on, and an admin can add as many as they like.
 */
export interface CatalogueLibraryEntry {
  /** Stable public id, used in the download link and the admin list. */
  catalogueId: string;
  title: string;
  description: string;
  /** The document's delivery URL (Cloudinary raw upload), kept for reference. */
  url: string;
  /** What the browser saves it as, e.g. `spring-lookbook.pdf`. */
  fileName: string;
  /** The document itself, so the download never depends on a third party. */
  bytes: Buffer;
  contentType: string;
  size?: number;
  uploadedAt: Date;
  uploadedBy?: string;
}

export type CatalogueLibraryDocument = HydratedDocument<CatalogueLibraryEntry>;
export type CatalogueLibraryModelType = Model<CatalogueLibraryEntry>;

const schema = new Schema<CatalogueLibraryEntry>(
  {
    catalogueId: { type: String, required: true, unique: true, index: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', trim: true, maxlength: 240 },
    url: { type: String, required: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    bytes: { type: Buffer, required: true },
    contentType: { type: String, required: true, trim: true },
    size: { type: Number, min: 0 },
    uploadedAt: { type: Date, default: () => new Date(), index: true },
    uploadedBy: { type: String, trim: true },
  },
  { versionKey: false },
);

export const CatalogueLibraryModel = model<CatalogueLibraryEntry>(
  'CatalogueLibraryEntry',
  schema,
);

/**
 * The shape the storefront and the panel both read.
 *
 * `url` is a path on this API, not the Cloudinary link: the bytes are stored
 * here, so a download keeps its filename and cannot be switched off by an
 * account setting elsewhere. The client resolves it against its API base.
 */
export function toPublicCatalogue(doc: CatalogueLibraryEntry) {
  return {
    id: doc.catalogueId,
    title: doc.title,
    description: doc.description,
    url: `/catalogues/${doc.catalogueId}/file`,
    fileName: doc.fileName,
    ...(doc.size !== undefined ? { size: doc.size } : {}),
    uploadedAt: new Date(doc.uploadedAt).getTime(),
    ...(doc.uploadedBy ? { uploadedBy: doc.uploadedBy } : {}),
  };
}
