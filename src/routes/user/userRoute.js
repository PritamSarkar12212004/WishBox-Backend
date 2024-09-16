import express from "express";
import {
  userRegisterController,
  userLoginController,
} from "../../controller/user/userController.js";
const router = express.Router();
router.post("/user", userRegisterController);
router.post("/user/login", userLoginController);
export default router;
