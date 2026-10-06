import type { Request, RequestHandler } from 'express';
import { UserModel, type UserDocument } from '../modules/user/user.model.js';
import { ensureAdminRole } from '../modules/admin/admin.access.js';
import { asyncHandler } from '../shared/asyncHandler.js';
import { verifyAccessToken } from '../shared/tokens.js';
import { ForbiddenError, UnauthorizedError } from '../shared/errors.js';
import type { UserRole } from '../consts/constants.js';

/** `Authorization: Bearer <token>` → `<token>` */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;

  return token.trim() || null;
}

async function resolveUser(req: Request): Promise<UserDocument> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }

  // Throws UnauthorizedError for a malformed, expired or wrong-type token.
  const payload = verifyAccessToken(token);

  const user = await UserModel.findById(payload.sub);
  if (!user) {
    throw new UnauthorizedError('Your session is no longer valid, please sign in again');
  }
  if (user.status === 'blocked') {
    throw new ForbiddenError('This account has been blocked');
  }

  // An allowlisted number is an admin. Correcting it here (a no-op once the
  // role matches) means adding a number to ADMIN_PHONES takes effect on that
  // account's next request instead of only after a fresh sign-in.
  await ensureAdminRole(user);

  return user;
}

/**
 * Protects a route: any of the account-gated actions in the storefront
 * (wishlist, cart, orders, profile) sits behind this.
 */
export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  req.user = await resolveUser(req);
  next();
});

/**
 * Attaches `req.user` when a valid token is present and otherwise continues.
 * Useful on public routes that show extra data once you are signed in.
 */
export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (extractBearerToken(req)) {
    try {
      req.user = await resolveUser(req);
    } catch {
      // A bad token on a public route is simply ignored.
      req.user = undefined;
    }
  }
  next();
});

/** Restricts a route to specific roles. Must run after `requireAuth`. */
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role as UserRole)) {
      next(new ForbiddenError('You do not have access to this resource'));
      return;
    }
    next();
  };
