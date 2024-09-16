import express from "express";
import {productFinderController,productFinderSingleController} from "../../controller/product/roductFinderController.js";
const router = express.Router();
router.post("/product", productFinderController);
router.get("/product/single", productFinderSingleController);
export default router;
