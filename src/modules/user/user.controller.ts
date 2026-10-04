import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { UnauthorizedError } from '../../shared/errors.js';
import * as userService from './user.service.js';
import type { UpdateProfileInput } from './user.validation.js';

/**
 * GET /users/me (also mounted as /auth/me)
 * Everything the storefront needs to render the signed-in identity:
 * the confirmed name and WhatsApp number.
 */
export const getMe = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  sendSuccess(res, userService.getProfile(req.user), { message: 'Your profile' });
});

/** PATCH /users/me - currently edits the display name. */
export const updateMe = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const updated = await userService.updateProfile(req.user, req.body as UpdateProfileInput);
  sendSuccess(res, updated, { message: 'Profile updated' });
});
