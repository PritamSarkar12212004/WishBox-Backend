import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface AdditionalCatalogueFileAttributes {
  slug: string;
  catalogueId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export type AdditionalCatalogueFileDocument = HydratedDocument<AdditionalCatalogueFileAttributes>;
export type AdditionalCatalogueFileModelType = Model<AdditionalCatalogueFileAttributes>;

const schema = new Schema<AdditionalCatalogueFileAttributes>(
  {
    slug: { type: String, required: true, trim: true },
    catalogueId: { type: String, required: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    contentType: { type: String, required: true, trim: true },
    bytes: { type: Buffer, required: true },
    size: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

schema.index({ slug: 1, catalogueId: 1 }, { unique: true });

export const AdditionalCatalogueFileModel = model<AdditionalCatalogueFileAttributes>(
  'AdditionalCatalogueFile',
  schema,
);
