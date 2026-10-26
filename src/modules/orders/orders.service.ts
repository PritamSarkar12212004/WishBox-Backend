import { createChildLogger } from '../../config/logger.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import type { AdminCouponAttributes } from '../admin/models/coupon.model.js';
import { AdminCouponModel } from '../admin/models/coupon.model.js';
import { AdminCustomerModel } from '../admin/models/customer.model.js';
import {
  AdminOrderModel,
  toPublicOrder,
  type AdminOrder,
  type AdminOrderAttributes,
  type AdminOrderItem,
} from '../admin/models/order.model.js';
import { AdminReturnModel, toPublicReturn } from '../admin/models/return.model.js';
import type { UserDocument } from '../user/user.model.js';
import { AddressModel } from '../addresses/addresses.model.js';
import { unitPriceFor } from '../products/products.pricing.js';
import { ProductModel, type ProductDocument } from '../products/products.model.js';
import { nextOrderNumber, nextReturnNumber } from './orders.model.js';
import type { CreateOrderInput, CreateReturnInput } from './orders.validation.js';

const log = createChildLogger('orders');

/**
 * The shopper's half of the order flow.
 *
 * There is one orders collection, not two: a shopper's order *is* the record the
 * admin panel approves, ships and refunds. That is what removes the old
 * "orders placed in this browser" merge - there is nothing local left to
 * reconcile, and the two surfaces cannot disagree about a status.
 *
 * Three rules hold this module together:
 *  - the server prices the basket from the product records, never the client;
 *  - stock is decremented atomically, so two shoppers cannot buy the last unit;
 *  - a shopper can only ever read back orders placed by their own account.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});

function formatPlacedOn(timestamp: number): string {
  return DATE_FORMAT.format(new Date(timestamp));
}

/** One line, the way it reads on an order and on the admin's sheet. */
function formatAddress(address: {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
}): string {
  const second = address.address2?.trim();
  return `${address.address1.trim()}${second ? `, ${second}` : ''}, ${address.city.trim()}, ${address.state.trim()} - ${address.pincode.trim()}`;
}

/** A saved address belongs to one account, so the owner is part of the lookup. */
async function resolveDeliveryAddress(
  userId: string,
  input: CreateOrderInput,
): Promise<{ address1: string; address2: string; city: string; state: string; pincode: string }> {
  if (input.addressId) {
    const saved = await AddressModel.findOne({ _id: input.addressId, userId });
    if (!saved) {
      throw new NotFoundError('That delivery address was not found');
    }
    return {
      address1: saved.address1,
      address2: saved.address2,
      city: saved.city,
      state: saved.state,
      pincode: saved.pincode,
    };
  }

  if (!input.address) {
    throw new ValidationError('Choose a saved address or enter a delivery address', {
      address: 'A delivery address is required',
    });
  }
  return input.address;
}

/**
 * A coupon is looked up in the table the admin maintains, and its minimum
 * basket is enforced here. An unknown, inactive or expired code is a 422 with a
 * message written for the shopper rather than a silent full-price order.
 */
async function resolveCoupon(
  code: string | undefined,
  subtotal: number,
): Promise<{ coupon: AdminCouponAttributes; discount: number } | null> {
  if (!code) return null;

  const coupon = await AdminCouponModel.findOne({ code });
  if (!coupon || coupon.status !== 'Active') {
    throw new ValidationError(`Coupon "${code}" is not valid`, { couponCode: 'This code cannot be used' });
  }

  if (coupon.expiresOn) {
    const expiresAt = Date.parse(coupon.expiresOn);
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      throw new ValidationError(`Coupon "${code}" has expired`, {
        couponCode: 'This code has expired',
      });
    }
  }

  if (subtotal < coupon.minOrder) {
    throw new ValidationError(
      `Coupon "${code}" needs a cart of at least ₹${coupon.minOrder}`,
      { couponCode: `Add ₹${coupon.minOrder - subtotal} more to use this code` },
    );
  }

  const raw =
    coupon.kind === 'percent'
      ? Math.round((subtotal * coupon.value) / 100)
      : Math.min(coupon.value, subtotal);

  return { coupon, discount: Math.max(0, Math.min(raw, subtotal)) };
}

/** A basket line, priced from the product record at the quantity ordered. */
function priceLine(product: ProductDocument, qty: number): AdminOrderItem {
  return {
    productId: product.slug,
    name: product.name,
    brand: product.brand,
    image: product.image,
    category: product.category,
    qty,
    price: unitPriceFor(product.price, product.bulkTiers, qty),
    mrp: product.mrp,
  };
}

/** Merges duplicate lines, so a cart with the same product twice prices it once. */
function mergeQuantities(items: CreateOrderInput['items']): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.qty);
  }
  return quantities;
}

/**
 * Places an order for the signed-in shopper.
 *
 * The sequence matters: prices and totals are computed first, then stock is
 * taken (with a rollback if any line lost the race), and only then is the order
 * written. A failure after the stock step puts every unit back, so a refused
 * checkout never eats inventory.
 */
export async function placeOrder(
  user: UserDocument,
  input: CreateOrderInput,
): Promise<AdminOrder> {
  const address = await resolveDeliveryAddress(user.id, input);
  const quantities = mergeQuantities(input.items);

  const products = await ProductModel.find({ slug: { $in: [...quantities.keys()] } });
  const bySlug = new Map(products.map((product) => [product.slug, product]));

  const items: AdminOrderItem[] = [];
  for (const [slug, qty] of quantities) {
    const product = bySlug.get(slug);
    if (!product || product.hidden) {
      throw new NotFoundError('One of the products in your cart is no longer available');
    }
    if (!product.available || product.stock < qty) {
      throw new ConflictError(`${product.name} does not have ${qty} in stock`, {
        productId: slug,
        available: product.stock,
      });
    }
    items.push(priceLine(product, qty));
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const applied = await resolveCoupon(input.couponCode, subtotal);
  const discount = applied?.discount ?? 0;
  // Delivery is free storewide; a paid tier would read its fee from settings.
  const shipping = 0;
  const amount = Math.max(subtotal - discount, 0) + shipping;

  // Atomic per line: `stock >= qty` is part of the filter, so the database
  // decides the winner and a sold-out line modifies nothing.
  const taken: Array<{ slug: string; qty: number }> = [];
  for (const [slug, qty] of quantities) {
    const result = await ProductModel.updateOne(
      { slug, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
    );
    if (result.modifiedCount === 0) {
      await Promise.all(
        taken.map((line) =>
          ProductModel.updateOne({ slug: line.slug }, { $inc: { stock: line.qty } }),
        ),
      );
      const product = bySlug.get(slug);
      throw new ConflictError(
        `${product?.name ?? 'That product'} just sold out - please update your cart`,
        { productId: slug },
      );
    }
    taken.push({ slug, qty });
  }

  const placedAt = Date.now();
  const orderId = await nextOrderNumber();

  let order: AdminOrder;
  try {
    const created = await AdminOrderModel.create({
      orderId,
      customerId: user.id,
      customer: user.name,
      email: '',
      city: address.city,
      isGuest: false,
      placedAt,
      placedOn: formatPlacedOn(placedAt),
      status: 'Approval',
      payment: input.payment,
      paymentStatus: 'Pending',
      amount,
      subtotal,
      shipping,
      discount,
      ...(applied ? { couponCode: applied.coupon.code } : {}),
      items,
      delayed: false,
      refund: 0,
      phone: user.phone,
      address: formatAddress(address),
      ...(input.paymentScreenshot ? { paymentScreenshot: input.paymentScreenshot } : {}),
    });
    order = toPublicOrder(
      created.toObject() as unknown as AdminOrderAttributes & { _id?: unknown },
    );
  } catch (error) {
    // The order was never written, so the stock it reserved goes back.
    await Promise.all(
      taken.map((line) =>
        ProductModel.updateOne({ slug: line.slug }, { $inc: { stock: line.qty } }),
      ),
    );
    throw error;
  }

  // A line that just sold out stops being purchasable, without being unpublished.
  await ProductModel.updateMany(
    { slug: { $in: taken.map((line) => line.slug) }, stock: 0 },
    { $set: { available: false } },
  );

  // The panel's customer list is fed by orders, so a first-time buyer appears.
  await AdminCustomerModel.updateOne(
    { customerId: user.id },
    {
      $set: { name: user.name, phone: user.phone, city: address.city },
      $setOnInsert: { email: '', joinedAt: placedAt, isGuest: false },
    },
    { upsert: true },
  ).catch((error: unknown) =>
    // The order stands even if the rollup row cannot be written.
    log.warn(
      { orderId, reason: error instanceof Error ? error.message : String(error) },
      'Customer rollup failed',
    ),
  );

  if (applied) {
    await AdminCouponModel.updateOne(
      { code: applied.coupon.code },
      { $inc: { used: 1, discountGiven: discount } },
    ).catch(() => undefined);
  }

  log.info(
    { orderId, subtotal, discount, amount, items: items.length },
    'Order placed',
  );
  return order;
}

/** The signed-in shopper's orders, newest first. */
export async function listMyOrders(user: UserDocument, limit = 100): Promise<AdminOrder[]> {
  const orders = await AdminOrderModel.find({ customerId: user.id })
    .sort({ placedAt: -1 })
    .limit(limit);
  return orders.map((order) =>
    toPublicOrder(order.toObject() as unknown as AdminOrderAttributes & { _id?: unknown }),
  );
}

/** One order, scoped to its owner - somebody else's id is a 404. */
export async function getMyOrder(user: UserDocument, orderId: string): Promise<AdminOrder> {
  const order = await AdminOrderModel.findOne({ orderId, customerId: user.id });
  if (!order) {
    throw new NotFoundError('That order was not found');
  }
  return toPublicOrder(
    order.toObject() as unknown as AdminOrderAttributes & { _id?: unknown },
  );
}

/**
 * Raises a return request against a delivered order.
 *
 * It is written straight into the admin's returns queue, so the shopper's
 * request and the panel's list are the same row from the start.
 */
export async function requestReturn(
  user: UserDocument,
  orderId: string,
  input: CreateReturnInput,
) {
  const order = await AdminOrderModel.findOne({ orderId, customerId: user.id });
  if (!order) {
    throw new NotFoundError('That order was not found');
  }
  if (order.status !== 'Delivered') {
    throw new ValidationError('Only a delivered order can be returned', {
      status: 'This order has not been delivered yet',
    });
  }

  const existing = await AdminReturnModel.exists({ orderId });
  if (existing) {
    throw new ConflictError('A return is already open for this order');
  }

  const first = order.items[0];
  const created = await AdminReturnModel.create({
    returnId: await nextReturnNumber(),
    orderId,
    customer: order.customer,
    city: order.city,
    productName: first?.name ?? 'Order items',
    image: first?.image ?? '',
    reason: input.reason,
    requestedAt: Date.now(),
    status: 'Requested',
    refundAmount: order.amount,
    refunded: false,
  });

  // Gives the admin queue the reason without opening the order.
  order.returnReason = input.reason;
  await order.save();

  log.info({ orderId, returnId: created.returnId, reason: input.reason }, 'Return requested');
  return toPublicReturn(created.toObject() as unknown as Parameters<typeof toPublicReturn>[0]);
}

/** Every return this shopper has raised, newest first. */
export async function listMyReturns(user: UserDocument) {
  const orders = await AdminOrderModel.find({ customerId: user.id }).select('orderId').lean();
  const orderIds = orders.map((order) => order.orderId);
  if (orderIds.length === 0) return [];

  const returns = await AdminReturnModel.find({ orderId: { $in: orderIds } }).sort({
    requestedAt: -1,
  });
  return returns.map((entry) =>
    toPublicReturn(entry.toObject() as unknown as Parameters<typeof toPublicReturn>[0]),
  );
}
