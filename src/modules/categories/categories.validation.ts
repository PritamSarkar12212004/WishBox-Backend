import { z } from 'zod';
import { cloudinaryConfig } from '../../services/cloudinary/config.js';
import { SLUG_REGEX } from '../../shared/slug.js';

/**
 * Category rules.
 *
 * The slug is optional on create - the service derives it from the label - but
 * when it *is* given it must already be a valid slug, so a caller cannot smuggle
 * in something that needs escaping.
 */

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'A slug needs at least two characters')
  .max(80, 'Keep the slug under 80 characters')
  .regex(SLUG_REGEX, 'Use lowercase letters, numbers and single hyphens (e.g. paper-craft)');

const label = z
  .string()
  .trim()
  .min(2, 'Give the category a name')
  .max(60, 'Keep the name under 60 characters');

export const createCategorySchema = z.strictObject({
  label,
  /** Optional: derived from the label when it is left out. */
  slug: slug.optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateCategorySchema = z
  .strictObject({
    label: label.optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change',
  });

/**
 * The official catalogue an admin uploads for a category.
 *
 * `file` must be the result of a signed Cloudinary raw upload. The API only
 * stores its delivery URL alongside the catalogue metadata.
 */
export const categoryCatalogueSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(2, 'Give the catalogue a title')
    .max(80, 'Keep the title under 80 characters'),
  description: z
    .string()
    .trim()
    .max(240, 'Keep the description under 240 characters')
    .default(''),
  /**
   * A base64 `data:` URI for a PDF or Word document. The bytes are decoded and
   * checked in the service, which enforces the size limit and magic bytes.
   */
  file: z
    .string()
    .trim()
    .url('Upload a PDF or Word document to Cloudinary first')
    .max(2_048)
    .refine(
      (value) => Boolean(cloudinaryConfig.cloudName) && value.startsWith(`https://res.cloudinary.com/${cloudinaryConfig.cloudName}/raw/upload/`),
      'The catalogue must be uploaded to Cloudinary',
    ),
});

/**
 * The slug is the id here, so the param is validated as a slug rather than a
 * Mongo id - `paper-craft` is a valid category id and `6ac4ff…` is not.
 */
export const categorySlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_REGEX, 'That category id is not valid'),
});

export const additionalCatalogueParamSchema = categorySlugParamSchema.extend({
  catalogueId: z.string().uuid('That catalogue id is not valid'),
});

export type CategoryCatalogueInput = z.infer<typeof categoryCatalogueSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategorySlugParamInput = z.infer<typeof categorySlugParamSchema>;
