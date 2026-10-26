import { z } from 'zod';
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
 * `file` is a reference, not multipart: either a PDF data URI that fits the
 * JSON body limit, or an https link to one already hosted. Cloudinary stores
 * the bytes, so the category record only ever holds the URL.
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
   * A base64 `data:` URI for a PDF or Word document, or an https link to one
   * already hosted. The bytes are decoded and checked in the service, which is
   * where the size limit and the file's magic bytes are enforced.
   */
  file: z
    .string()
    .trim()
    .min(1, 'Choose a document or paste a link to one')
    .max(900_000, 'That file is too large - keep it under about 650 KB')
    .refine(
      (value) =>
        /^https?:\/\//i.test(value) ||
        /^data:application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)/i.test(
          value,
        ),
      'Send a PDF/Word file or a hosted https link',
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

export type CategoryCatalogueInput = z.infer<typeof categoryCatalogueSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategorySlugParamInput = z.infer<typeof categorySlugParamSchema>;
