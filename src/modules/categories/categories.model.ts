import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

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
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
