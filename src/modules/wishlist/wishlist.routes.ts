import { Router } from 'express';
import { requireAuth, validate } from '../../middleware/index.js';
import {
  listWishlist,
  removeWishlistItem,
  saveWishlistItem,
} from './wishlist.controller.js';
import { wishlistProductParamSchema } from './wishlist.validation.js';

/**
 * A shopper's wishlist.
 *
 * Account data end to end, so the guard is applied once for the whole router:
 * a new route cannot be added here without it. The admin's view of the same
 * rows is folded into `GET /admin/dataset`, behind the admin gate.
 */
export const wishlistRouter = Router();

wishlistRouter.use(requireAuth);

wishlistRouter.get('/', listWishlist);
wishlistRouter.put(
  '/:productId',
  validate({ params: wishlistProductParamSchema }),
  saveWishlistItem,
);
wishlistRouter.delete(
  '/:productId',
  validate({ params: wishlistProductParamSchema }),
  removeWishlistItem,
);
