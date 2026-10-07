import { z } from 'zod';
import { SLUG_REGEX } from '../../shared/slug.js';
import { PRODUCT_BADGES, PRODUCT_PACKAGING } from './products.model.js';

/**
 * Product rules.
 *
 * The prices are whole rupees, `mrp` may never sit below `price`, and every image
 * must be something a browser can actually load - a hosted URL (which is what
 * Cloudinary returns) or a data URI (the editor's local fallback). Anything else
 * would render as a broken card with no clue why.
 *
 * Bodies are strict: a typo'd field is a 422 instead of being silently dropped.
 * Query strings are not, because browsers and analytics append their own.
 */

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'A slug needs at least two characters')
  .max(80, 'Keep the slug under 80 characters')
  .regex(SLUG_REGEX, 'Use lowercase letters, numbers and single hyphens (e.g. paper-craft)');

const name = z.string().trim().min(2, 'Give the product a name').max(140, 'Keep the name under 140 characters');

const sku = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'A SKU needs at least three characters')
  .max(32, 'Keep the SKU under 32 characters')
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, 'SKUs use letters, numbers and hyphens (e.g. WB-PAPER-001)');

const brand = z.string().trim().min(1, 'Add the brand').max(60, 'Keep the brand under 60 characters');

/** Whole rupees: the storefront never renders paise. */
const rupees = z.coerce.number().int('Use whole rupees').min(1, 'The price must be at least ₹1').max(10_000_000);

const imageUrl = z
  .string()
  .trim()
  .min(1, 'An image URL is required')
  .max(4096, 'That URL is too long')
  .refine(
    (value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value),
    'Use a hosted https URL or an image data URI',
  );

const optionalUrl = z.union([imageUrl, z.null()]);

const highlights = z
  .array(z.string().trim().min(2, 'Each highlight needs at least two characters').max(120))
  .max(12, 'Keep it to twelve highlights');

const gallery = z.array(imageUrl).max(10, 'Keep the gallery to ten images');

const specs = z.strictObject({
  height: z.string().trim().max(30).optional(),
  width: z.string().trim().max(30).optional(),
  gsm: z.string().trim().max(30).optional(),
  packaging: z.enum(PRODUCT_PACKAGING).optional(),
});

const offer = z.strictObject({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, 'An offer code needs at least three characters')
    .max(24)
    .regex(/^[A-Z0-9-]+$/, 'Offer codes use letters, numbers and hyphens'),
  label: z.string().trim().min(3, 'Describe the offer').max(60),
});

const rating = z.coerce.number().min(0, 'A rating is between 0 and 5').max(5, 'A rating is between 0 and 5');

export const createProductSchema = z
  .strictObject({
    name,
    /** Optional: derived from the name when it is left out. */
    slug: slug.optional(),
    sku,
    brand,
    /** Must be an existing category slug - the service checks that. */
    category: slug,
    rating: rating.default(0),
    reviewCount: z.coerce.number().int().min(0).default(0),
    price: rupees,
    mrp: rupees,
    badge: z.enum(PRODUCT_BADGES).optional(),
    available: z.boolean().default(true),
    hidden: z.boolean().default(false),
    stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
    image: imageUrl,
    /** Defaults to the main image when the admin has only one shot. */
    hoverImage: imageUrl.optional(),
    beforeImage: imageUrl.optional(),
    afterImage: imageUrl.optional(),
    gallery: gallery.default([]),
    videoUrl: z.string().trim().url('Use a full https URL for the video').max(2048).optional(),
    description: z
      .string()
      .trim()
      .min(10, 'Write at least a short description')
      .max(2000, 'Keep the description under 2000 characters'),
    highlights: highlights.default([]),
    specs: specs.optional(),
    offer: offer.optional(),
  })
  .refine((value) => value.mrp >= value.price, {
    message: 'MRP cannot be lower than the selling price',
    path: ['mrp'],
  });

/**
 * A partial edit.
 *
 * `null` is meaningful on the optional blocks (badge, specs, offer, the extra
 * images, the video): it is how a client *clears* a field it can no longer
 * describe by omission. Omitting a field still leaves it untouched.
 */
export const updateProductSchema = z
  .strictObject({
    name: name.optional(),
    slug: slug.optional(),
    sku: sku.optional(),
    brand: brand.optional(),
    category: slug.optional(),
    rating: rating.optional(),
    reviewCount: z.coerce.number().int().min(0).optional(),
    price: rupees.optional(),
    mrp: rupees.optional(),
    badge: z.union([z.enum(PRODUCT_BADGES), z.null()]).optional(),
    available: z.boolean().optional(),
    hidden: z.boolean().optional(),
    stock: z.coerce.number().int().min(0).max(1_000_000).optional(),
    image: imageUrl.optional(),
    hoverImage: imageUrl.optional(),
    beforeImage: optionalUrl.optional(),
    afterImage: optionalUrl.optional(),
    gallery: gallery.optional(),
    videoUrl: z.union([z.string().trim().url(), z.literal(''), z.null()]).optional(),
    description: z.string().trim().min(10).max(2000).optional(),
    highlights: highlights.optional(),
    specs: z.union([specs, z.null()]).optional(),
    offer: z.union([offer, z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change',
  });

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const PRODUCT_SORTS = ['featured', 'newest', 'price-asc', 'price-desc', 'name'] as const;

const listingFilters = {
  category: slug.optional(),
  search: z.string().trim().min(1).max(80).optional(),
  badge: z.enum(PRODUCT_BADGES).optional(),
  available: booleanQuery.optional(),
  sort: z.enum(PRODUCT_SORTS).default('featured'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
};

/**
 * The public listing: published products only, and no way to ask for anything
 * else - `visibility` is not even a parameter a shopper can send.
 */
export const publicListProductsQuerySchema = z.object(listingFilters);

/** The admin listing: the same filters, plus the unpublished ones. */
export const adminListProductsQuerySchema = z.object({
  ...listingFilters,
  visibility: z.enum(['published', 'hidden', 'all']).default('published'),
});

/** The slug is the product id, so it is validated as a slug, not a Mongo id. */
export const productSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_REGEX, 'That product id is not valid'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type PublicListProductsQueryInput = z.infer<typeof publicListProductsQuerySchema>;
export type AdminListProductsQueryInput = z.infer<typeof adminListProductsQuerySchema>;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export type ProductVisibility = 'published' | 'hidden' | 'all';

/**
 * What the service receives from either listing route. The public controller
 * pins `visibility` to `published`; the admin route passes what it was asked for.
 */
export type ListProductsQuery = Omit<PublicListProductsQueryInput, 'sort'> & {
  sort: ProductSort;
  visibility?: ProductVisibility;
};
