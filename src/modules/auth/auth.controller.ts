import type { Request } from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { UnauthorizedError } from '../../shared/errors.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import * as authService from './auth.service.js';
import type {
  LogoutInput,
  RefreshTokenInput,
  RequestOtpInput,
  VerifyOtpInput,
} from './auth.validation.js';

function requestContext(req: Request) {
  return {
    userAgent: req.get('user-agent') ?? '',
    ip: req.ip ?? '',
  };
}

/** POST /auth/otp/request - step one, send the code. */
export const requestOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body as RequestOtpInput;
  const result = await authService.requestOtp(phone);

  sendSuccess(res, result, {
    statusCode: HTTP_STATUS.OK,
    message: 'We sent a code to your WhatsApp number',
  });
});

/** POST /auth/otp/verify - step two, verify, then find/create the user and issue a JWT. */
export const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, code, name } = req.body as VerifyOtpInput;
  const session = await authService.verifyOtp(phone, code, name, requestContext(req));

  sendSuccess(res, session, {
    statusCode: HTTP_STATUS.OK,
    message: `Welcome, ${session.user.name}`,
  });
});

/** POST /auth/refresh - exchange a refresh token for a fresh pair. */
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body as RefreshTokenInput;
  const session = await authService.refreshSession(refreshToken, requestContext(req));

  sendSuccess(res, session, { message: 'Session refreshed' });
});

/** POST /auth/logout - retire this device (or every device). */
export const logout = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const { refreshToken, allDevices } = (req.body ?? {}) as LogoutInput;
  await authService.logout(req.user.id, refreshToken, allDevices === true);

  sendSuccess(res, null, { message: allDevices ? 'Signed out everywhere' : 'Signed out' });
});
