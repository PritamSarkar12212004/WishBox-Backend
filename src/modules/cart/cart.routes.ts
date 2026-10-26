import { Router } from 'express';
import { requireAuth, validate } from '../../middleware/index.js';
import { recordCartAdd } from './cart.controller.js';
import { cartAddSchema } from './cart.validation.js';

/**
 * Add-to-cart signals.
 *
 * Account data end to end, so the guard is applied once for the whole router.
 * The admin's view of the same rows is folded into `GET /admin/dataset`, behind
 * the admin gate.
 */
export const cartRouter = Router();

cartRouter.use(requireAuth);

cartRouter.post('/adds', validate({ body: cartAddSchema }), recordCartAdd);
