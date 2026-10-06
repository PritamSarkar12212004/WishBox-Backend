/**
 * What an Indian delivery address is allowed to be.
 *
 * These lists are the contract: the API validates and *canonicalises* against
 * them, so "maharashtra", "Maharastra" and "MAHARASHTRA" can never end up as
 * three different states in the database. Keep this file dependency-free.
 */

/** India's 28 states and 8 union territories, in their official spelling. */
export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

/**
 * Normalises a state for comparison: case, punctuation and extra spaces are
 * ignored, so "jammu & kashmir" and "Jammu and Kashmir" are the same state.
 */
function normaliseState(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A spelling we accept, mapped for comparison once at module load. */
const STATE_INDEX: Map<string, IndianState> = new Map(
  INDIAN_STATES.map((state) => [normaliseState(state), state]),
);

export function isIndianState(value: string): boolean {
  return STATE_INDEX.has(normaliseState(value));
}

/** The official spelling of a state the shopper typed, or `null` if unknown. */
export function canonicalState(value: string): IndianState | null {
  return STATE_INDEX.get(normaliseState(value)) ?? null;
}

/**
 * Indian PIN codes are six digits and never start with zero - a leading zero is
 * the giveaway of a truncated or mistyped one.
 */
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

/**
 * Bound on the address book. A shopper who needs an eleventh is almost always
 * adding a duplicate rather than a new place, and the cap keeps one account
 * from filling a collection.
 */
export const MAX_ADDRESSES_PER_USER = 10;
