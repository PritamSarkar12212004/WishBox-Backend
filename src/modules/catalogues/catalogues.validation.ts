import { z } from 'zod';

/**
 * Rules for a general catalogue.
 *
 * Same shape as a category catalogue - a title, a short line of copy and the
 * document - but no category is involved, so nothing else has to exist first.
 */

export const createCatalogueSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(2, 'Give the catalogue a title')
    .max(80, 'Keep the title under 80 characters'),
  description: z.string().trim().max(240, 'Keep the description under 240 characters').default(''),
  /** The uploaded document's delivery URL. */
  file: z.string().trim().min(1, 'Upload a PDF or Word document').max(4096),
});

export const catalogueIdParamSchema = z.object({
  catalogueId: z.string().trim().min(1, 'A catalogue id is required').max(160),
});

export type CreateCatalogueInput = z.infer<typeof createCatalogueSchema>;
