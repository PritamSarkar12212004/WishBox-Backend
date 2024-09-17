import express from "express";
import {
  likeController,
  likeCheker,
  likeControllerRemover,
  cartController,
  cartControllerRemover,
  cartCheker,
  cartPage,
  likePage
} from "../../controller/cart_like/cart_like_Controller.js";
const router = express.Router();
router.post("/like", likeController);
router.post("/like/chekar", likeCheker);
router.post("/like/remove", likeControllerRemover);
router.post("/cart", cartController);
router.post("/cart/chekar", cartCheker);
router.post("/cart/remove", cartControllerRemover);
router.post("/cart/page", cartPage);
router.post("/like/page", likePage);
export default router;
