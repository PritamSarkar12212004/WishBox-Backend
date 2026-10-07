import type { Request } from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import * as categoryService from './categories.service.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validation.js';

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

/** DELETE /categories/:slug */
export const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(slugOf(req));
  sendSuccess(res, null, { message: 'Category removed' });
});
