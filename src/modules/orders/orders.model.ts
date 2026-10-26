import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * A monotonic sequence, used for order numbers.
 *
 * The order number is what a shopper quotes to support, so it has to be unique
 * and readable (`#WB-1042`), not an ObjectId. A counter document is atomic in
 * MongoDB (`$inc`), which is exactly what a shared sequence needs: two shoppers
 * checking out at once cannot be handed the same number.
 *
 * `_id` is the sequence's name, so the same collection can serve order numbers,
 * return numbers and anything else that needs one.
 */
export interface CounterAttributes {
  _id: string;
  value: number;
}

export type CounterDocument = HydratedDocument<CounterAttributes>;
export type CounterModelType = Model<CounterAttributes>;

const counterSchema = new Schema<CounterAttributes>(
  {
    _id: { type: String, required: true },
    value: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const CounterModel = model<CounterAttributes>('Counter', counterSchema);

/** Reserves the next value of a named sequence. */
export async function nextSequence(name: string): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  return counter.value;
}

/** `ORDER_NUMBER_OFFSET` keeps the first live order at `#WB-1001`, not `#WB-1`. */
const ORDER_NUMBER_OFFSET = 1000;

/** The storefront's order id format. */
export async function nextOrderNumber(): Promise<string> {
  const sequence = await nextSequence('orders');
  return `#WB-${ORDER_NUMBER_OFFSET + sequence}`;
}

/** The storefront's return-request id format. */
export async function nextReturnNumber(): Promise<string> {
  const sequence = await nextSequence('returns');
  return `#RET-${ORDER_NUMBER_OFFSET + sequence}`;
}
