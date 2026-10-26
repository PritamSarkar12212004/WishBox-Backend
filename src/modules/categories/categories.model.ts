import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * The curated catalogue an admin attaches to a category.
 *
 * The document bytes live in a separate MongoDB collection, so the category
 * record stays small and catalogue entries only hold download metadata.
 */
export interface CategoryCatalogue {
  id?: string;
  title: string;
  /** One or two lines shown beside the download button. */
  description: string;
  /** Public URL of the document: our own file route, or a legacy hosted link. */
  url: string;
  /** What the browser saves it as, when this API stored the file. */
  fileName?: string;
  /** Legacy: a Cloudinary public id, from before catalogues were served here. */
  publicId?: string;
  uploadedAt: Date;
  uploadedBy?: string;
}

/**
 * A product category.
 *
 * The slug is the identity: storefront URLs, product records and the shop
 * filters all reference `paper-craft`, not an ObjectId. `_id` therefore never
 * needs to reach a client, and a product's `category` stays human-readable in
 * the database.
 */
export interface CategoryAttributes {
  /** URL-safe identity, e.g. `paper-craft`. Unique, lowercase. */
  slug: string;
  /** Human label, e.g. `Paper & Craft`. */
  label: string;
  /** Display order in the shop's filter row; ties fall back to the label. */
  sortOrder: number;
  /** The official catalogue, when an admin has uploaded one. */
  catalogue?: CategoryCatalogue;
  /** Extra category catalogues, each independently uploaded and removable. */
  additionalCatalogues?: CategoryCatalogue[];
  createdAt: Date;
  updatedAt: Date;
}

/** The shape the API returns. `id` is the slug. */
export interface PublicCategory {
  id: string;
  label: string;
  sortOrder: number;
  /** How many products are filed under it (storefront list only). */
  productCount?: number;
  /** Public view of the official catalogue - never the stored public id. */
  catalogue?: {
    id?: string;
    title: string;
    description: string;
    /** Absolute for a hosted link; `/categories/<slug>/catalogue/file` for ours. */
    url: string;
    fileName?: string;
    uploadedAt: string;
  };
  catalogues: Array<{
    id: string;
    title: string;
    description: string;
    url: string;
    fileName?: string;
    uploadedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type CategoryDocument = HydratedDocument<CategoryAttributes>;
export type CategoryModelType = Model<CategoryAttributes>;

const categorySchema = new Schema<CategoryAttributes>(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    sortOrder: { type: Number, default: 0 },
    catalogue: {
      type: new Schema<CategoryCatalogue>(
        {
          title: { type: String, required: true, trim: true, maxlength: 80 },
          description: { type: String, default: '', trim: true, maxlength: 240 },
          url: { type: String, required: true, trim: true },
          fileName: { type: String, trim: true },
          publicId: { type: String, trim: true },
          uploadedAt: { type: Date, default: () => new Date() },
          uploadedBy: { type: String, trim: true },
        },
        { _id: false },
      ),
      required: false,
    },
    additionalCatalogues: {
      type: [new Schema<CategoryCatalogue>(
        {
          id: { type: String, required: true },
          title: { type: String, required: true, trim: true, maxlength: 80 },
          description: { type: String, default: '', trim: true, maxlength: 240 },
          url: { type: String, required: true, trim: true },
          fileName: { type: String, trim: true },
          uploadedAt: { type: Date, default: () => new Date() },
          uploadedBy: { type: String, trim: true },
        },
        { _id: false },
      )],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    // `_id` is an implementation detail here; the slug is the public identity.
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        return ret;
      },
    },
  },
);

// The shop reads categories as one ordered list.
categorySchema.index({ sortOrder: 1, label: 1 });

export const CategoryModel = model<CategoryAttributes>('Category', categorySchema);

export function toPublicCategory(
  category: CategoryDocument,
  productCount?: number,
): PublicCategory {
  return {
    id: category.slug,
    label: category.label,
    sortOrder: category.sortOrder,
    ...(productCount === undefined ? {} : { productCount }),
    ...(category.catalogue
      ? {
          catalogue: {
            ...(category.catalogue.id ? { id: category.catalogue.id } : {}),
            title: category.catalogue.title,
            description: category.catalogue.description,
            url: category.catalogue.url,
            ...(category.catalogue.fileName ? { fileName: category.catalogue.fileName } : {}),
            uploadedAt: category.catalogue.uploadedAt.toISOString(),
          },
        }
      : {}),
    catalogues: (category.additionalCatalogues ?? []).map((catalogue) => ({
      id: catalogue.id!,
      title: catalogue.title,
      description: catalogue.description,
      url: catalogue.url,
      ...(catalogue.fileName ? { fileName: catalogue.fileName } : {}),
      uploadedAt: catalogue.uploadedAt.toISOString(),
    })),
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
