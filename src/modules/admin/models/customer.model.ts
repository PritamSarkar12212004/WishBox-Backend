import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * A shopper as the admin panel lists them.
 *
 * This is the order history's view of a customer, not `UserModel`: the panel
 * needs a city and a lifetime join date for people who checked out as a guest,
 * and those never create an account. Orders reference `id` (and the literal
 * `guest`), so nothing here writes back to the account collection.
 */
export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  joinedAt: number;
  isGuest: boolean;
}

export type AdminCustomerAttributes = Omit<AdminCustomer, 'id'> & { customerId: string };
export type AdminCustomerDocument = HydratedDocument<AdminCustomerAttributes>;
export type AdminCustomerModelType = Model<AdminCustomerAttributes>;

const customerSchema = new Schema<AdminCustomerAttributes>(
  {
    customerId: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    city: { type: String, default: '', index: true },
    joinedAt: { type: Number, required: true, index: true },
    isGuest: { type: Boolean, default: false, index: true },
  },
  { versionKey: false },
);

export const AdminCustomerModel = model<AdminCustomerAttributes>(
  'AdminCustomer',
  customerSchema,
);

export function toPublicCustomer(
  doc: AdminCustomerAttributes & { _id?: unknown },
): AdminCustomer {
  const { _id, customerId, ...rest } = doc;
  return { id: customerId, ...rest };
}
