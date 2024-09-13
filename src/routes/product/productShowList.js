import express from "express";
import { productShowClint } from "../../controller/product/productShowController.js";
const router = express.Router();
router.get("/clint", productShowClint);

export default router;
