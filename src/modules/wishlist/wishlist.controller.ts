import type { Request } from 'express';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { UnauthorizedError } from '../../shared/errors.js';
import * as wishlistService from './wishlist.service.js';

/** Every wishlist route is account-scoped: the guard resolves the shopper once. */
function currentUser(req: Request) {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  return req.user;
}

const productIdOf = (req: Request) => String(req.params.productId);

/** GET /wishlist - the signed-in shopper's saved product ids. */
export const listWishlist = asyncHandler(async (req, res) => {
  const productIds = await wishlistService.listMyWishlist(currentUser(req));
  sendSuccess(res, { productIds }, { message: 'Your wishlist', meta: { total: productIds.length } });
});

/** PUT /wishlist/:productId - idempotent save. */
export const saveWishlistItem = asyncHandler(async (req, res) => {
  await wishlistService.saveProduct(currentUser(req), productIdOf(req));
  sendSuccess(res, null, { message: 'Saved to wishlist' });
});

/** DELETE /wishlist/:productId - removing something not saved is a no-op. */
export const removeWishlistItem = asyncHandler(async (req, res) => {
  await wishlistService.removeProduct(currentUser(req), productIdOf(req));
  sendSuccess(res, null, { message: 'Removed from wishlist' });
});
