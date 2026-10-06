import { Router } from 'express';
import { requireAuth, validate } from '../../middleware/index.js';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from './addresses.controller.js';
import {
  addressIdParamSchema,
  createAddressSchema,
  updateAddressSchema,
} from './addresses.validation.js';

export const addressesRouter = Router();

/**
 * The address book is account data end to end, so the guard is applied once for
 * the whole router: a new route cannot be added here without it.
 */
addressesRouter.use(requireAuth);

addressesRouter.get('/', listAddresses);
addressesRouter.post('/', validate({ body: createAddressSchema }), createAddress);
addressesRouter.patch(
  '/:id',
  validate({ params: addressIdParamSchema, body: updateAddressSchema }),
  updateAddress,
);
addressesRouter.delete('/:id', validate({ params: addressIdParamSchema }), deleteAddress);
