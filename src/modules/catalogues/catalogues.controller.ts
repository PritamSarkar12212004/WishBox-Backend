import type { Request } from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import * as catalogueService from './catalogues.service.js';
import type { CreateCatalogueInput } from './catalogues.validation.js';

/** Express 5 types a route param as `string | string[]`; this narrows it once. */
const idOf = (req: Request) => String(req.params.catalogueId);

/** GET /catalogues - every general catalogue, newest first. */
export const listCatalogues = asyncHandler(async (_req, res) => {
  const catalogues = await catalogueService.listCatalogues();
  sendSuccess(res, catalogues, {
    message: 'Catalogues',
    meta: { total: catalogues.length },
  });
});

/** POST /admin/catalogues - add one, category-free. */
export const addCatalogue = asyncHandler(async (req, res) => {
  const catalogue = await catalogueService.addCatalogue(
    req.body as CreateCatalogueInput,
    req.user?.name,
  );
  sendSuccess(res, catalogue, {
    statusCode: HTTP_STATUS.CREATED,
    message: `${catalogue.title} added`,
  });
});

/**
 * GET /catalogues/:catalogueId/file - the document itself.
 *
 * Public, because a catalogue is for shoppers. Served from this API so the
 * content type and the filename are right, and the download cannot be switched
 * off by an account setting on the storage provider.
 */
export const downloadCatalogue = asyncHandler(async (req, res) => {
  const file = await catalogueService.getCatalogueFile(idOf(req));
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Content-Length', String(file.bytes.length));
  // A catalogue changes only when an admin replaces it.
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(file.bytes);
});

/** DELETE /admin/catalogues/:catalogueId */
export const removeCatalogue = asyncHandler(async (req, res) => {
  await catalogueService.removeCatalogue(idOf(req));
  sendSuccess(res, null, { message: 'Catalogue removed' });
});
