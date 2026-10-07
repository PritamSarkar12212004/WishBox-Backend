import { Router } from 'express';
import { validate } from '../../middleware/index.js';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from './categories.controller.js';
import {
  categorySlugParamSchema,
  createCategorySchema,
  updateCategorySchema,
} from './categories.validation.js';

/**
 * Categories are read by everyone and written by no one but an admin - the same
 * split as products. `categoriesRouter` (mounted at `/categories`) only reads;
 * `categoryAdminRouter` is mounted under `/admin/categories`, inside the admin
 * router that applies `requireAuth, requireAdmin` to all of it.
 */
export const categoriesRouter = Router();

categoriesRouter.get('/', listCategories);
categoriesRouter.get('/:slug', validate({ params: categorySlugParamSchema }), getCategory);

export const categoryAdminRouter = Router();

categoryAdminRouter.post('/', validate({ body: createCategorySchema }), createCategory);
categoryAdminRouter.patch(
  '/:slug',
  validate({ params: categorySlugParamSchema, body: updateCategorySchema }),
  updateCategory,
);
categoryAdminRouter.delete(
  '/:slug',
  validate({ params: categorySlugParamSchema }),
  deleteCategory,
);
