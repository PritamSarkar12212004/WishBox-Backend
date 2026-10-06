import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * One inventory top-up, a year of which backs the dashboard's stock chart.
 *
 * There is no product collection behind this: the catalogue lives in the
 * storefront's own store, so a restock records the product name and id it was
 * logged against and nothing more.
 */
export interface AdminRestock {
  productId: string;
  productName: string;
  units: number;
  at: number;
}

export type AdminRestockAttributes = AdminRestock;
export type AdminRestockDocument = HydratedDocument<AdminRestockAttributes>;
export type AdminRestockModelType = Model<AdminRestockAttributes>;

const restockSchema = new Schema<AdminRestockAttributes>(
  {
    productId: { type: String, required: true, index: true },
    productName: { type: String, default: '' },
    units: { type: Number, required: true, min: 0 },
    at: { type: Number, required: true, index: true },
  },
  { versionKey: false },
);

export const AdminRestockModel = model<AdminRestockAttributes>('AdminRestock', restockSchema);

export function toPublicRestock(doc: AdminRestockAttributes & { _id?: unknown }): AdminRestock {
  const { _id, ...rest } = doc;
  return rest;
}
