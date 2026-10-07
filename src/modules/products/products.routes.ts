import { Router } from "express";
import { validate } from "../../middleware/index.js";
import {
  createProduct,
  deleteProduct,
  getProduct,
  getProductForAdmin,
  listAllProducts,
  listProducts,
  updateProduct,
} from "./products.controller.js";
import {
  adminListProductsQuerySchema,
  createProductSchema,
  productSlugParamSchema,
  publicListProductsQuerySchema,
  updateProductSchema,
} from "./products.validation.js";

export const productsRouter = Router();

productsRouter.get(
  "/",
  validate({ query: publicListProductsQuerySchema }),
  listProducts,
);
productsRouter.get(
  "/:slug",
  validate({ params: productSlugParamSchema }),
  getProduct,
);

export const productAdminRouter = Router();

productAdminRouter.get(
  "/",
  validate({ query: adminListProductsQuerySchema }),
  listAllProducts,
);
productAdminRouter.post(
  "/",
  validate({ body: createProductSchema }),
  createProduct,
);

productAdminRouter.get(
  "/:slug",
  validate({ params: productSlugParamSchema }),
  getProductForAdmin,
);
productAdminRouter.patch(
  "/:slug",
  validate({ params: productSlugParamSchema, body: updateProductSchema }),
  updateProduct,
);
productAdminRouter.delete(
  "/:slug",
  validate({ params: productSlugParamSchema }),
  deleteProduct,
);
