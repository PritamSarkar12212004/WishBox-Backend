import express from "express";
import productUploadController from "../../controller/product/productUploadController.js";
const router = express.Router();
router.post("/product", productUploadController);
export default router;
