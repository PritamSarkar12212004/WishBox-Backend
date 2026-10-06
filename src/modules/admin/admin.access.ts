import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { createChildLogger } from '../../config/logger.js';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors.js';
import type { UserDocument } from '../user/user.model.js';

const log = createChildLogger('admin');

/**
 * Who gets the admin panel is configuration, not data: the panel is opened by
 * signing in with one of the numbers in `ADMIN_PHONES`, which is the whole
 * access-control story. There is deliberately no way to become an admin by
 * editing a record through the API, so a leaked customer token can never
 * escalate itself.
 */
export function isAdminPhone(phone: string): boolean {
  return env.adminPhones.includes(phone);
}

/**
 * Grants the admin role when this number is on the allowlist, and returns
 * whether anything changed. Called on every sign-in and on every authenticated
 * request, so an account that predates the allowlist (or one whose number was
 * just added to `.env`) is corrected the next time it is used - and after the
 * first correction it is a no-op with no write.
 */
export async function ensureAdminRole(user: UserDocument): Promise<boolean> {
  if (user.role === 'admin' || !isAdminPhone(user.phone)) return false;

  user.role = 'admin';
  await user.save();
  log.info({ userId: user.id, phone: user.phone }, 'Account promoted to admin');
  return true;
}

/**
 * Gate for every `/admin` route. Runs after `requireAuth`, which has already
 * loaded the account, so the role is read from the database rather than from
 * the token - a promotion takes effect immediately instead of when the current
 * access token happens to expire.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  // The allowlist is the source of truth, so a number that is on it is admitted
  // even in the window before its role has been persisted.
  if (req.user.role !== 'admin' && !isAdminPhone(req.user.phone)) {
    next(new ForbiddenError('This account does not have admin access'));
    return;
  }

  next();
};
