import type { Request } from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import * as productService from './products.service.js';
import type {
  AdminListProductsQueryInput,
  CreateProductInput,
  PublicListProductsQueryInput,
  UpdateProductInput,
} from './products.validation.js';

/** Express 5 types a route param as `string | string[]`; this narrows it once. */
function slugOf(req: Request): string {
  return String(req.params.slug);
}

/** The listing shape is the same for both audiences; only the filter differs. */
function sendPage(
  res: Parameters<typeof sendSuccess>[0],
  page: productService.ProductPage,
  message: string,
): void {
  sendSuccess(res, page.items, {
    message,
    meta: { total: page.total, page: page.page, limit: page.limit, pages: page.pages },
  });
}

/**
 * GET /products
 *
 * The storefront listing. Unpublished products are unreachable from here: the
 * controller pins visibility to `published` rather than trusting the query, so a
 * shopper cannot ask to see the drafts.
 */
export const listProducts = asyncHandler(async (req, res) => {
  const query = req.validatedQuery as PublicListProductsQueryInput;
  const page = await productService.listProducts({ ...query, visibility: 'published' });
  sendPage(res, page, 'Products');
});

/** GET /products/:slug - the product page. */
export const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProduct(slugOf(req));
  sendSuccess(res, product, { message: 'Product' });
});

/** GET /admin/products - the catalogue table, drafts included. */
export const listAllProducts = asyncHandler(async (req, res) => {
  const query = req.validatedQuery as AdminListProductsQueryInput;
  const page = await productService.listProducts(query);
  sendPage(res, page, 'Products');
});

/** GET /admin/products/:slug - a single product that may still be a draft. */
export const getProductForAdmin = asyncHandler(async (req, res) => {
  const product = await productService.getProduct(slugOf(req), true);
  sendSuccess(res, product, { message: 'Product' });
});

/** POST /admin/products */
export const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body as CreateProductInput);
  sendSuccess(res, product, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Product created',
  });
});

/** PATCH /admin/products/:slug */
export const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(
    slugOf(req),
    req.body as UpdateProductInput,
  );
  sendSuccess(res, product, { message: 'Product updated' });
});

/** DELETE /admin/products/:slug */
export const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(slugOf(req));
  sendSuccess(res, null, { message: 'Product removed' });
});
