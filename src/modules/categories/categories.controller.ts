import type { Request } from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import * as categoryService from './categories.service.js';
import type {
  CategoryCatalogueInput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './categories.validation.js';

/** Express 5 types a route param as `string | string[]`; this narrows it once. */
function slugOf(req: Request): string {
  return String(req.params.slug);
}

/** GET /categories - the shop's filter row, with live product counts. */
export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await categoryService.listCategories();
  sendSuccess(res, categories, { message: 'Categories' });
});

/** GET /categories/:slug */
export const getCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategory(slugOf(req));
  sendSuccess(res, category, { message: 'Category' });
});

/** POST /categories */
export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body as CreateCategoryInput);
  sendSuccess(res, category, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Category created',
  });
});

/** PATCH /categories/:slug */
export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(
    slugOf(req),
    req.body as UpdateCategoryInput,
  );
  sendSuccess(res, category, { message: 'Category updated' });
});

/** PUT /categories/:slug/catalogue - upload or replace the official catalogue. */
export const setCategoryCatalogue = asyncHandler(async (req, res) => {
  const category = await categoryService.setCatalogue(
    slugOf(req),
    req.body as CategoryCatalogueInput,
    req.user?.name,
  );
  sendSuccess(res, category, { message: `Catalogue saved for ${category.label}` });
});

/** POST /admin/categories/:slug/catalogues - append an independently downloadable file. */
export const addCategoryCatalogue = asyncHandler(async (req, res) => {
  const category = await categoryService.addCatalogue(
    slugOf(req),
    req.body as CategoryCatalogueInput,
    req.user?.name,
  );
  sendSuccess(res, category, { statusCode: HTTP_STATUS.CREATED, message: 'Catalogue added' });
});

/** GET /categories/:slug/catalogues/:catalogueId/file */
export const downloadAdditionalCategoryCatalogue = asyncHandler(async (req, res) => {
  const file = await categoryService.getAdditionalCatalogueFile(
    slugOf(req),
    String(req.params.catalogueId),
  );
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Content-Length', String(file.bytes.length));
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(file.bytes);
});

/** DELETE /admin/categories/:slug/catalogues/:catalogueId */
export const removeAdditionalCategoryCatalogue = asyncHandler(async (req, res) => {
  const category = await categoryService.removeAdditionalCatalogue(
    slugOf(req),
    String(req.params.catalogueId),
  );
  sendSuccess(res, category, { message: 'Catalogue removed' });
});

/**
 * GET /categories/:slug/catalogue/file - the uploaded PDF/Word document itself.
 *
 * Public, because the catalogue is for shoppers. Served from this API rather
 * than a third-party URL so the content type and the filename are right, and so
 * the download cannot be switched off by an account setting elsewhere.
 */
export const downloadCategoryCatalogue = asyncHandler(async (req, res) => {
  const file = await categoryService.getCatalogueFile(slugOf(req));

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Content-Length', String(file.bytes.length));
  // A catalogue changes only when an admin replaces it.
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(file.bytes);
});

/** DELETE /categories/:slug/catalogue */
export const removeCategoryCatalogue = asyncHandler(async (req, res) => {
  const category = await categoryService.removeCatalogue(slugOf(req));
  sendSuccess(res, category, { message: `Catalogue removed from ${category.label}` });
});

/** DELETE /categories/:slug */
export const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(slugOf(req));
  sendSuccess(res, null, { message: 'Category removed' });
});
