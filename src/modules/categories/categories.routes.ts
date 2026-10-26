import { Router } from 'express';
import { validate } from '../../middleware/index.js';
import {
  createCategory,
  addCategoryCatalogue,
  deleteCategory,
  downloadCategoryCatalogue,
  downloadAdditionalCategoryCatalogue,
  getCategory,
  listCategories,
  removeCategoryCatalogue,
  removeAdditionalCategoryCatalogue,
  setCategoryCatalogue,
  updateCategory,
} from './categories.controller.js';
import {
  categoryCatalogueSchema,
  additionalCatalogueParamSchema,
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
  '/:slug/catalogues/:catalogueId/file',
  validate({ params: additionalCatalogueParamSchema }),
  downloadAdditionalCategoryCatalogue,
);
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
categoryAdminRouter.post(
  '/:slug/catalogues',
  validate({ params: categorySlugParamSchema, body: categoryCatalogueSchema }),
  addCategoryCatalogue,
);
categoryAdminRouter.delete(
  '/:slug/catalogues/:catalogueId',
  validate({ params: additionalCatalogueParamSchema }),
  removeAdditionalCategoryCatalogue,
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
