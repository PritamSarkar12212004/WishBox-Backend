import { Router } from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { listActiveCoupons } from './coupons.service.js';

/**
 * The codes the storefront advertises.
 *
 * Public on purpose: the same codes are printed on the product page, and the
 * cart needs their shape (percent or flat, minimum basket) to preview a
 * discount. The order service re-reads the coupon at checkout, so what this
 * returns is a preview, never the authority.
 */
export const couponsRouter = Router();

couponsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const coupons = await listActiveCoupons();
    sendSuccess(res, coupons, { message: 'Coupons' });
  }),
);
