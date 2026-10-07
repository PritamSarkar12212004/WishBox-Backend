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

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategorySlugParamInput = z.infer<typeof categorySlugParamSchema>;
