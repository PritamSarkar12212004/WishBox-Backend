import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * A storefront product.
 *
 * The document deliberately mirrors `CatalogProduct` in the frontend's
 * `catalogData.ts`, so a product served by this API is a drop-in replacement for
 * one of the shipped catalogue entries: same field names, same meaning, `id` is
 * the slug. Adding a field here is adding it to the shop's card and PDP.
 *
 * Two fields carry real policy:
 *  - `hidden` means *unpublished*: it is excluded from the public listing, search
 *    and its own product page (a 404 to a shopper), but admins still see it.
 *  - `available` means *in stock*: it stays listed, and drives the out-of-stock
 *    treatment. `stock` is the count shown on the PDP.
 */

export const PRODUCT_BADGES = ['SALE', 'BESTSELLER', 'NEW'] as const;
export type ProductBadge = (typeof PRODUCT_BADGES)[number];

/** Packaging options the admin editor offers. */
export const PRODUCT_PACKAGING = ['Sealed', 'Standard'] as const;
export type ProductPackaging = (typeof PRODUCT_PACKAGING)[number];

/** Physical details, all free text so any unit can be written. */
export interface ProductSpecs {
  height?: string;
  width?: string;
  /** Paper weight, e.g. `250 GSM`. */
  gsm?: string;
  packaging?: ProductPackaging;
}

/** Storefront offer attached to a product from the admin editor. */
export interface ProductOffer {
  code: string;
  label: string;
}

export interface ProductAttributes {
  /** URL-safe identity, e.g. `premium-handmade-decorative-paper`. Unique. */
  slug: string;
  /** Stock-keeping unit, e.g. `WB-PAPER-001`. Unique, uppercase. */
  sku: string;
  name: string;
  brand: string;
  /** A category slug - the category's own public id. */
  category: string;
  /** Average of the shoppers' ratings, 0-5. */
  rating: number;
  reviewCount: number;
  /** Selling price in whole rupees. */
  price: number;
  /** List price; never below `price`. */
  mrp: number;
  badge?: ProductBadge;
  available: boolean;
  hidden: boolean;
  stock: number;
  image: string;
  hoverImage: string;
  beforeImage?: string;
  afterImage?: string;
  gallery: string[];
  videoUrl?: string;
  description: string;
  highlights: string[];
  specs?: ProductSpecs;
  offer?: ProductOffer;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The shape returned by the API - the frontend's `CatalogProduct`, plus the two
 * timestamps the admin table sorts on.
 */
export interface PublicProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  rating: number;
  reviewCount: number;
  price: number;
  mrp: number;
  badge?: ProductBadge;
  available: boolean;
  hidden: boolean;
  stock: number;
  image: string;
  hoverImage: string;
  beforeImage?: string;
  afterImage?: string;
  gallery?: string[];
  videoUrl?: string;
  description: string;
  highlights: string[];
  specs?: ProductSpecs;
  offer?: ProductOffer;
  createdAt: string;
  updatedAt: string;
}

export type ProductDocument = HydratedDocument<ProductAttributes>;
export type ProductModelType = Model<ProductAttributes>;

/** `_id` is never the identity of a product; the slug is. */
const specsSchema = new Schema<ProductSpecs>(
  {
    height: { type: String, trim: true, maxlength: 30 },
    width: { type: String, trim: true, maxlength: 30 },
    gsm: { type: String, trim: true, maxlength: 30 },
    packaging: { type: String, enum: PRODUCT_PACKAGING },
  },
  { _id: false },
);

const offerSchema = new Schema<ProductOffer>(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { _id: false },
);

const productSchema = new Schema<ProductAttributes>(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    sku: { type: String, required: true, trim: true, uppercase: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    brand: { type: String, required: true, trim: true, maxlength: 60 },
    category: { type: String, required: true, trim: true, lowercase: true, index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    price: { type: Number, required: true, min: 1 },
    mrp: { type: Number, required: true, min: 1 },
    badge: { type: String, enum: PRODUCT_BADGES },
    available: { type: Boolean, default: true },
    hidden: { type: Boolean, default: false },
    stock: { type: Number, default: 0, min: 0 },
    image: { type: String, required: true, trim: true },
    hoverImage: { type: String, required: true, trim: true },
    beforeImage: { type: String, trim: true },
    afterImage: { type: String, trim: true },
    gallery: { type: [String], default: [] },
    videoUrl: { type: String, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    highlights: { type: [String], default: [] },
    specs: { type: specsSchema },
    offer: { type: offerSchema },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        return ret;
      },
    },
  },
);

// The shop's two hot reads: "published products in this category" and "the
// newest published products" for the home rails.
productSchema.index({ category: 1, hidden: 1, createdAt: -1 });
productSchema.index({ hidden: 1, createdAt: -1 });

export const ProductModel = model<ProductAttributes>('Product', productSchema);

/** Subdocuments are read through `toObject`, so no Mongoose internals leak out. */
function cleanSpecs(raw: ProductSpecs): ProductSpecs {
  const specs: ProductSpecs = {};
  if (raw.height) specs.height = raw.height;
  if (raw.width) specs.width = raw.width;
  if (raw.gsm) specs.gsm = raw.gsm;
  if (raw.packaging) specs.packaging = raw.packaging;
  return specs;
}

/**
 * Optional fields are omitted rather than sent as `undefined`, so a response is
 * exactly the product - `JSON.stringify` would drop them anyway, and a test can
 * compare the object directly.
 */
export function toPublicProduct(product: ProductDocument): PublicProduct {
  const gallery = product.gallery ?? [];
  // The subdocument exposes one getter per schema path, which is exactly the
  // shape `cleanSpecs` reads - no `toObject` needed, and no internals leak.
  const specs = product.specs ? cleanSpecs(product.specs as ProductSpecs) : undefined;

  return {
    id: product.slug,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    category: product.category,
    rating: product.rating,
    reviewCount: product.reviewCount,
    price: product.price,
    mrp: product.mrp,
    ...(product.badge ? { badge: product.badge } : {}),
    available: product.available,
    hidden: product.hidden,
    stock: product.stock,
    image: product.image,
    hoverImage: product.hoverImage,
    ...(product.beforeImage ? { beforeImage: product.beforeImage } : {}),
    ...(product.afterImage ? { afterImage: product.afterImage } : {}),
    ...(gallery.length > 0 ? { gallery } : {}),
    ...(product.videoUrl ? { videoUrl: product.videoUrl } : {}),
    description: product.description,
    highlights: product.highlights ?? [],
    ...(specs && Object.keys(specs).length > 0 ? { specs } : {}),
    ...(product.offer
      ? { offer: { code: product.offer.code, label: product.offer.label } }
      : {}),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
