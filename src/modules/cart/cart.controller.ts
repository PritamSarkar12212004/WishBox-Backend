import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { UnauthorizedError } from '../../shared/errors.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import * as cartService from './cart.service.js';
import type { CartAddInput } from './cart.validation.js';

/**
 * POST /cart/adds
 *
 * Records that the signed-in shopper added a product to their cart. The cart
 * itself stays in the browser - this is the demand signal the admin panel reads.
 */
export const recordCartAdd = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const { productId, qty } = req.body as CartAddInput;
  await cartService.recordCartAdd(req.user, productId, qty);

  sendSuccess(res, null, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Added to cart',
  });
});
