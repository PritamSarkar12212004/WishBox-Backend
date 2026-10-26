import { Router } from 'express';
import { validate } from '../../middleware/index.js';
import {
  createCategory,
  deleteCategory,
  downloadCategoryCatalogue,
  getCategory,
  listCategories,
  removeCategoryCatalogue,
  setCategoryCatalogue,
  updateCategory,
} from './categories.controller.js';
import {
  categoryCatalogueSchema,
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
/* The uploaded catalogue document. Public: the storefront downloads it. */
categoriesRouter.get(
  '/:slug/catalogue/file',
  validate({ params: categorySlugParamSchema }),
  downloadCategoryCatalogue,
);
categoriesRouter.get('/:slug', validate({ params: categorySlugParamSchema }), getCategory);

export const categoryAdminRouter = Router();

categoryAdminRouter.post('/', validate({ body: createCategorySchema }), createCategory);
categoryAdminRouter.patch(
  '/:slug',
  validate({ params: categorySlugParamSchema, body: updateCategorySchema }),
  updateCategory,
);
/* The official catalogue: a title, a short description and the PDF itself. */
categoryAdminRouter.put(
  '/:slug/catalogue',
  validate({ params: categorySlugParamSchema, body: categoryCatalogueSchema }),
  setCategoryCatalogue,
);
categoryAdminRouter.delete(
  '/:slug/catalogue',
  validate({ params: categorySlugParamSchema }),
  removeCategoryCatalogue,
);

categoryAdminRouter.delete(
  '/:slug',
  validate({ params: categorySlugParamSchema }),
  deleteCategory,
);
