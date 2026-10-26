import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { meRouter, userRouter } from "../modules/user/user.routes.js";
import { adminRouter } from "../modules/admin/admin.routes.js";
import { addressesRouter } from "../modules/addresses/addresses.routes.js";
import { categoriesRouter } from "../modules/categories/categories.routes.js";
import { productsRouter } from "../modules/products/products.routes.js";
import { ordersRouter, returnsRouter } from "../modules/orders/orders.routes.js";
import { couponsRouter } from "../modules/coupons/coupons.routes.js";
import { contentRouter } from "../modules/content/content.routes.js";
import { wishlistRouter } from "../modules/wishlist/wishlist.routes.js";
import { cartRouter } from "../modules/cart/cart.routes.js";
import { productReviewsRouter } from "../modules/reviews/reviews.routes.js";
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
// Reviews live under their product: everyone reads them, a signed-in shopper
// writes their own. The admin panel moderates the same rows from "/admin".
apiRouter.use("/products", productReviewsRouter);
apiRouter.use("/categories", categoriesRouter);

// Checkout and the shopper's own history. The admin's view of the same orders
// lives under "/admin"; both read the one collection.
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/returns", returnsRouter);
apiRouter.use("/coupons", couponsRouter);

// A shopper's saved products. Persisted so the admin panel can report how many
// people want a product, not just what one browser kept in localStorage.
apiRouter.use("/wishlist", wishlistRouter);

// Add-to-cart demand, so the panel can report it next to the wishlist.
apiRouter.use("/cart", cartRouter);

// The website's own copy - alert bar, footer, contact page. Read by every
// visitor, written only under "/admin/content".
apiRouter.use("/content", contentRouter);

apiRouter.use("/admin", adminRouter);
