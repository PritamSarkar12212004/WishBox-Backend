import express from "express";
const router = express.Router();
import {authAdminController} from '../../controller/auth/authController.js'

router.post("/admin",authAdminController)
export default router;