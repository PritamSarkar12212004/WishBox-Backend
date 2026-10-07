import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { meRouter, userRouter } from "../modules/user/user.routes.js";
import { adminRouter } from "../modules/admin/admin.routes.js";
import { addressesRouter } from "../modules/addresses/addresses.routes.js";
import { categoriesRouter } from "../modules/categories/categories.routes.js";
import { productsRouter } from "../modules/products/products.routes.js";
import { sendSuccess } from "../shared/apiResponse.js";
import { env } from "../config/env.js";

export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  sendSuccess(
    res,
    {
      name: "Wishbox API",
      version: "v1",
      prefix: env.API_PREFIX,
    },
    { message: "Wishbox API is running" },
  );
});

apiRouter.use("/health", healthRouter);

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);

// The customer profile and address book, on their short paths.
apiRouter.use("/me", meRouter);
apiRouter.use("/addresses", addressesRouter);

// The shop window: anyone may read the catalogue. Writing it lives under
// "/admin", where the admin gate is applied once.
apiRouter.use("/products", productsRouter);
apiRouter.use("/categories", categoriesRouter);

apiRouter.use("/admin", adminRouter);
