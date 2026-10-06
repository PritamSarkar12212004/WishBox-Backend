import type { Request } from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import { UnauthorizedError } from '../../shared/errors.js';
import * as addressService from './addresses.service.js';
import type { CreateAddressInput, UpdateAddressInput } from './addresses.validation.js';

/**
 * Every handler here needs the signed-in shopper, and every one of them passes
 * that shopper's id into the service - which is what scopes the query. There is
 * deliberately no way to name an address without also proving who is asking.
 */
function requireShopper(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return req.user.id;
}

/** GET /addresses */
export const listAddresses = asyncHandler(async (req, res) => {
  const addresses = await addressService.listAddresses(requireShopper(req));
  sendSuccess(res, addresses, { message: 'Your addresses' });
});

/** POST /addresses */
export const createAddress = asyncHandler(async (req, res) => {
  const address = await addressService.createAddress(
    requireShopper(req),
    req.body as CreateAddressInput,
  );
  sendSuccess(res, address, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Address saved',
  });
});

/** PATCH /addresses/:id */
export const updateAddress = asyncHandler(async (req, res) => {
  const address = await addressService.updateAddress(
    requireShopper(req),
    String(req.params.id),
    req.body as UpdateAddressInput,
  );
  sendSuccess(res, address, { message: 'Address updated' });
});

/** DELETE /addresses/:id */
export const deleteAddress = asyncHandler(async (req, res) => {
  await addressService.deleteAddress(requireShopper(req), String(req.params.id));
  sendSuccess(res, null, { message: 'Address removed' });
});
