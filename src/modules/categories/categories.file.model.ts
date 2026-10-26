import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * The bytes of one category's uploaded catalogue.
 *
 * It sits in its own collection rather than inside the category document, for
 * two reasons:
 *
 *  - **Legacy fallback.** Older catalogues were stored here while Cloudinary
 *    raw-file delivery was being configured. New uploads go to Cloudinary; the
 *    migration removes a legacy blob after its Cloudinary URL is saved.
 *  - **The category stays small.** A 650 KB blob in every category read would
 *    bloat the shop's filter row.
 *
 * One row per category: uploading again replaces it, and removing the catalogue
 * deletes it.
 */
export interface CategoryCatalogueFileAttributes {
  /** The category slug - also the unique key. */
  slug: string;
  /** What the browser saves it as, e.g. `paper-craft-catalogue.pdf`. */
  fileName: string;
  /** `application/pdf`, or the Word type for a .doc/.docx catalogue. */
  contentType: string;
  /** The document itself. */
  bytes: Buffer;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoryCatalogueFileDocument = HydratedDocument<CategoryCatalogueFileAttributes>;
export type CategoryCatalogueFileModelType = Model<CategoryCatalogueFileAttributes>;

const catalogueFileSchema = new Schema<CategoryCatalogueFileAttributes>(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    contentType: { type: String, required: true, trim: true },
    bytes: { type: Buffer, required: true },
    size: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

export const CategoryCatalogueFileModel = model<CategoryCatalogueFileAttributes>(
  'CategoryCatalogueFile',
  catalogueFileSchema,
);
