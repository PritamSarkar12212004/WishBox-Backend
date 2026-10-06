import { Types } from 'mongoose';
import { createChildLogger } from '../../config/logger.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { MAX_ADDRESSES_PER_USER } from './addresses.constants.js';
import { AddressModel, toPublicAddress, type PublicAddress } from './addresses.model.js';
import type { CreateAddressInput, UpdateAddressInput } from './addresses.validation.js';

const log = createChildLogger('addresses');

/**
 * The shopper's address book.
 *
 * Every query is scoped by `userId`, so an id that belongs to somebody else is
 * indistinguishable from one that does not exist - a 404 either way, and no way
 * to probe for other shoppers' addresses.
 */

export async function listAddresses(userId: string): Promise<PublicAddress[]> {
  // Newest first: the one just added is the one they are about to use.
  const addresses = await AddressModel.find({ userId }).sort({ createdAt: -1 });
  return addresses.map(toPublicAddress);
}

export async function createAddress(
  userId: string,
  input: CreateAddressInput,
): Promise<PublicAddress> {
  const saved = await AddressModel.countDocuments({ userId });
  if (saved >= MAX_ADDRESSES_PER_USER) {
    throw new ConflictError(
      `You can save up to ${MAX_ADDRESSES_PER_USER} addresses. Delete one to add another.`,
    );
  }

  const address = await AddressModel.create({
    userId: new Types.ObjectId(userId),
    ...input,
  });

  log.info({ userId, addressId: address.id }, 'Address saved');
  return toPublicAddress(address);
}

export async function updateAddress(
  userId: string,
  id: string,
  input: UpdateAddressInput,
): Promise<PublicAddress> {
  const address = await AddressModel.findOne({ _id: id, userId });
  if (!address) {
    throw new NotFoundError('That address was not found');
  }

  if (input.address1 !== undefined) address.address1 = input.address1;
  // Validation guarantees this is never blank, so it is a plain replace.
  if (input.address2 !== undefined) address.address2 = input.address2;
  if (input.city !== undefined) address.city = input.city;
  if (input.state !== undefined) address.state = input.state;
  if (input.pincode !== undefined) address.pincode = input.pincode;

  await address.save();
  log.info({ userId, addressId: address.id }, 'Address updated');
  return toPublicAddress(address);
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  const removed = await AddressModel.deleteOne({ _id: id, userId });
  if (removed.deletedCount === 0) {
    throw new NotFoundError('That address was not found');
  }

  log.info({ userId, addressId: id }, 'Address removed');
}
