import { z } from 'zod';
import { PINCODE_REGEX, canonicalState, isIndianState } from './addresses.constants.js';

/**
 * Address rules, kept stricter than the form on purpose.
 *
 * Every one of these messages is written for the shopper, because the form
 * shows the API's message when it has one. The state is *canonicalised* rather
 * than merely checked, so a shopper who types "maharashtra" stores the official
 * "Maharashtra" and the stored data stays groupable.
 */

const address1 = z
  .string()
  .trim()
  .min(4, 'Enter the flat, house or building number')
  .max(120, 'Keep the first address line under 120 characters');

const address2 = z
  .string()
  .trim()
  .min(3, 'Enter the area, landmark or street')
  .max(120, 'Keep the second address line under 120 characters');

const city = z
  .string()
  .trim()
  .min(2, 'Enter your city')
  .max(60, 'Keep the city name under 60 characters');

const state = z
  .string()
  .trim()
  .min(2, 'Choose your state')
  .refine(isIndianState, 'Choose an Indian state or union territory')
  .transform((value) => canonicalState(value) ?? value);

const pincode = z
  .string()
  .trim()
  .regex(PINCODE_REGEX, 'Enter the 6-digit PIN code (it cannot start with 0)');

export const createAddressSchema = z.strictObject({
  address1,
  /** Required: a building number alone does not get a courier to the door. */
  address2,
  city,
  state,
  pincode,
});

export const updateAddressSchema = z
  .strictObject({
    address1: address1.optional(),
    /** Editable like any other field, but never blank when it is sent. */
    address2: address2.optional(),
    city: city.optional(),
    state: state.optional(),
    pincode: pincode.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change',
  });

/** A Mongo id in the URL, checked here so a bad one is a 422 and not a cast error. */
export const addressIdParamSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'That address id is not valid'),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type AddressIdParamInput = z.infer<typeof addressIdParamSchema>;
