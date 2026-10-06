import { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * One saved delivery address, owned by exactly one account.
 *
 * `userId` is part of every query rather than a field the service has to
 * remember to check, so there is no code path that can read or write another
 * shopper's address. Addresses are kept as their parts (not one formatted
 * string) because the parts are what a courier integration needs and what the
 * form edits.
 */
export interface AddressAttributes {
  userId: Types.ObjectId;
  /** Flat / house / building. */
  address1: string;
  /** Area, landmark, street - required, so the door is findable. */
  address2: string;
  city: string;
  state: string;
  pincode: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The shape returned by the API.
 *
 * `address2` is optional only for rows saved before it became required; a
 * missing value is dropped by `JSON.stringify`, so it never reaches a client.
 */
export interface PublicAddress {
  id: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  createdAt: string;
  updatedAt: string;
}

export type AddressDocument = HydratedDocument<AddressAttributes>;
export type AddressModelType = Model<AddressAttributes>;

const addressSchema = new Schema<AddressAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    address1: { type: String, required: true, trim: true, maxlength: 120 },
    address2: { type: String, required: true, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.userId;
        delete ret._id;
        return ret;
      },
    },
  },
);

// The address book is always read as "this shopper's addresses, newest first".
addressSchema.index({ userId: 1, createdAt: -1 });

export const AddressModel = model<AddressAttributes>('Address', addressSchema);

export function toPublicAddress(address: AddressDocument): PublicAddress {
  return {
    id: address.id,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}
