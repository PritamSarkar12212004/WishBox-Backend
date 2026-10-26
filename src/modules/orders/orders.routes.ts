import { Router } from 'express';
import { requireAuth, validate } from '../../middleware/index.js';
import {
  createOrder,
  createReturn,
  getOrder,
  listOrders,
  listReturns,
} from './orders.controller.js';
import {
  createOrderSchema,
  createReturnSchema,
  orderIdParamSchema,
} from './orders.validation.js';

/**
 * Checkout and the shopper's own order history.
 *
 * Every route here needs an account: an order belongs to the person who placed
 * it, and "who is asking" is the whole authorisation rule. The service scopes
 * each query by that account id, so an order number belonging to somebody else
 * is a 404 rather than a leak.
 */
export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.post('/', validate({ body: createOrderSchema }), createOrder);
ordersRouter.get('/', listOrders);
ordersRouter.get('/:id', validate({ params: orderIdParamSchema }), getOrder);
ordersRouter.post(
  '/:id/returns',
  validate({ params: orderIdParamSchema, body: createReturnSchema }),
  createReturn,
);

/** The flip side of a return request: what the shopper has open, in one call. */
export const returnsRouter = Router();

returnsRouter.use(requireAuth);
returnsRouter.get('/', listReturns);
