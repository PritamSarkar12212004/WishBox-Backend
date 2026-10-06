import { Router } from "express";
import {
  authRateLimiter,
  requireAuth,
  validate,
} from "../../middleware/index.js";
import { getMe } from "../user/user.controller.js";
import { logout, refresh, requestOtp, verifyOtp } from "./auth.controller.js";
import {
  logoutSchema,
  refreshTokenSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from "./auth.validation.js";

export const authRouter = Router();

authRouter.post(
  "/otp/request",
  authRateLimiter,
  validate({ body: requestOtpSchema }),
  requestOtp,
);
authRouter.post(
  "/otp/verify",
  authRateLimiter,
  validate({ body: verifyOtpSchema }),
  verifyOtp,
);

authRouter.post("/refresh", validate({ body: refreshTokenSchema }), refresh);
authRouter.post(
  "/logout",
  requireAuth,
  validate({ body: logoutSchema }),
  logout,
);
authRouter.get("/me", requireAuth, getMe);
