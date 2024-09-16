import express from "express";
import userAuthController from "../../controller/user/userAuthController.js";
const router = express.Router();
router.post("/user", userAuthController);
export default router;
