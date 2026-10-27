import { Router } from 'express';
import { validate } from '../../middleware/index.js';
import {
  addCatalogue,
  downloadCatalogue,
  listCatalogues,
  removeCatalogue,
} from './catalogues.controller.js';
import { catalogueIdParamSchema, createCatalogueSchema } from './catalogues.validation.js';

/**
 * General catalogues: files that belong to no single category.
 *
 * Reading is public (the storefront's catalogue page lists them); writing hangs
 * off the admin router, so the same gate that protects products protects these.
 */
export const cataloguesRouter = Router();

cataloguesRouter.get('/', listCatalogues);
/* The document itself. Public: the storefront downloads it. */
cataloguesRouter.get(
  '/:catalogueId/file',
  validate({ params: catalogueIdParamSchema }),
  downloadCatalogue,
);

export const catalogueAdminRouter = Router();

catalogueAdminRouter.post('/', validate({ body: createCatalogueSchema }), addCatalogue);
catalogueAdminRouter.delete(
  '/:catalogueId',
  validate({ params: catalogueIdParamSchema }),
  removeCatalogue,
);
