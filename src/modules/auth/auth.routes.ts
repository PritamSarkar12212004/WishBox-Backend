import { Router } from 'express';
import { authRateLimiter, requireAuth, validate } from '../../middleware/index.js';
import { getMe } from '../user/user.controller.js';
import { logout, refresh, requestOtp, verifyOtp } from './auth.controller.js';
import {
  logoutSchema,
  refreshTokenSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from './auth.validation.js';

/**
 * Passwordless sign-in:
 *
 *   POST /auth/otp/request  { phone }              -> sends a code
 *   POST /auth/otp/verify   { phone, code, name? } -> creates/finds the user, returns JWTs
 *   POST /auth/refresh      { refreshToken }       -> new token pair
 *   POST /auth/logout       { refreshToken? }      -> retires the session
 *   GET  /auth/me                                  -> the signed-in profile
 *
 * The OTP endpoints are rate limited harder than the rest of the API: they
 * cost money per message and are the obvious target for abuse.
 */
export const authRouter = Router();

authRouter.post('/otp/request', authRateLimiter, validate({ body: requestOtpSchema }), requestOtp);
authRouter.post('/otp/verify', authRateLimiter, validate({ body: verifyOtpSchema }), verifyOtp);

authRouter.post('/refresh', validate({ body: refreshTokenSchema }), refresh);
authRouter.post('/logout', requireAuth, validate({ body: logoutSchema }), logout);
authRouter.get('/me', requireAuth, getMe);
