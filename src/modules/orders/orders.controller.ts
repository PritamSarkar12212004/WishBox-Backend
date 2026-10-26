import type { Request } from 'express';
import { HTTP_STATUS } from '../../consts/constants.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { UnauthorizedError } from '../../shared/errors.js';
import * as orderService from './orders.service.js';
import type { CreateOrderInput, CreateReturnInput } from './orders.validation.js';

/**
 * The order routes are all account-scoped, so the shopper is resolved once per
 * request (by `requireAuth`) and passed down rather than trusted from a body.
 */
function currentUser(req: Request) {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  return req.user;
}

const orderIdOf = (req: Request) => String(req.params.id);

/** POST /orders - checkout. */
export const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.placeOrder(currentUser(req), req.body as CreateOrderInput);
  sendSuccess(res, order, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Order placed',
  });
});

/** GET /orders - the signed-in shopper's history. */
export const listOrders = asyncHandler(async (req, res) => {
  const orders = await orderService.listMyOrders(currentUser(req));
  sendSuccess(res, orders, { message: 'Your orders', meta: { total: orders.length } });
});

/** GET /orders/:id - one order, only if it is theirs. */
export const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getMyOrder(currentUser(req), orderIdOf(req));
  sendSuccess(res, order, { message: 'Order' });
});

/** POST /orders/:id/returns - raise a return against a delivered order. */
export const createReturn = asyncHandler(async (req, res) => {
  const request = await orderService.requestReturn(
    currentUser(req),
    orderIdOf(req),
    req.body as CreateReturnInput,
  );
  sendSuccess(res, request, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Return requested',
  });
});

/** GET /returns - the shopper's own return requests. */
export const listReturns = asyncHandler(async (req, res) => {
  const requests = await orderService.listMyReturns(currentUser(req));
  sendSuccess(res, requests, {
    message: 'Your return requests',
    meta: { total: requests.length },
  });
});
