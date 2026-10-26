/**
 * End-to-end tests for the shopper's orders.
 *
 * The invariants worth protecting are the ones a client could otherwise decide
 * for itself: the price comes from the product record (including quantity
 * breaks), stock is taken atomically, a coupon is re-checked server-side, and a
 * shopper can only ever read back their own orders. The last section proves the
 * admin panel sees the very same rows, and that a return request lands in the
 * admin's queue rather than in a browser.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.OTP_DEBUG_RETURN_CODE = 'true';
process.env.SMS_API_URL = 'https://gateway.test/api/messaging/messages/send';
process.env.SMS_API_TOKEN = 'test-gateway-token';
process.env.SMS_API_VARIABLES_KEY = 'otpdev';
process.env.SMS_SIGNUP_TEMPLATE_ID = 'signup-template-id';
process.env.ADMIN_PHONES = '7796419792';
process.env.CLOUDINARY_CLOUD_NAME = 'dftt4ow6q';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-orders-test');

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { createApp } = await import('../src/app.js');
const { httpClient } = await import('../src/shared/httpClient.js');
const { createHttpMock } = await import('./helpers/http-mock.js');
const { OtpModel } = await import('../src/modules/auth/otp.model.js');
const { ProductModel } = await import('../src/modules/products/products.model.js');
const { CategoryModel } = await import('../src/modules/categories/categories.model.js');
const { AdminOrderModel } = await import('../src/modules/admin/models/order.model.js');
const { AdminCouponModel } = await import('../src/modules/admin/models/coupon.model.js');
const { AdminCustomerModel } = await import('../src/modules/admin/models/customer.model.js');
const { AdminReturnModel } = await import('../src/modules/admin/models/return.model.js');

const gateway = createHttpMock(httpClient);
gateway.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);

const API = '/api/v1';
const ADMIN_PHONE = '7796419792';
const SHOPPER = '9876500011';
const OTHER = '9876500022';

let server: Server;
let baseUrl: string;
let admin = '';
let shopper = '';
let other = '';

before(async () => {
  await connectDatabase();
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  admin = await signIn(ADMIN_PHONE, 'WishBox Admin');
  shopper = await signIn(SHOPPER, 'Ananya Sharma');
  other = await signIn(OTHER, 'Rahul Verma');
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await disconnectDatabase();
  await mongod.stop();
  gateway.restore();
});

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------
interface ApiBody<T = Record<string, unknown>> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: Record<string, unknown>;
}

async function request<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: ApiBody<T> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  return { status: res.status, body: (await res.json()) as ApiBody<T> };
}

async function signIn(phone: string, name: string): Promise<string> {
  await OtpModel.deleteMany({ phone });

  const requested = await request<{ devCode: string }>('POST', `${API}/auth/otp/request`, {
    body: { phone, name },
  });
  const code = requested.body.data!.devCode;

  const verified = await request<{ accessToken: string }>('POST', `${API}/auth/otp/verify`, {
    body: { phone, code, name },
  });

  return verified.body.data!.accessToken;
}

type OrderItem = {
  productId: string;
  name: string;
  qty: number;
  price: number;
  mrp: number;
};

type Order = {
  id: string;
  customerId: string;
  customer: string;
  placedOn: string;
  status: string;
  payment: string;
  paymentStatus: string;
  amount: number;
  subtotal: number;
  shipping: number;
  discount: number;
  couponCode?: string;
  items: OrderItem[];
  phone: string;
  address: string;
};

type ReturnRequest = {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  refundAmount: number;
};

const IMAGE = 'https://res.cloudinary.com/dftt4ow6q/image/upload/v1789112613/wishbox/paper.jpg';

const ADDRESS = {
  address1: 'Flat 4B, Shanti Residency',
  address2: 'Wardha Road',
  city: 'Nagpur',
  state: 'Maharashtra',
  pincode: '440001',
};

/** One product with quantity breaks, written through the admin API. */
async function seedProduct(overrides: Record<string, unknown> = {}): Promise<void> {
  await CategoryModel.deleteMany({});
  await ProductModel.deleteMany({});
  await request('POST', `${API}/admin/categories`, {
    token: admin,
    body: { label: 'Paper & Craft' },
  });

  const created = await request('POST', `${API}/admin/products`, {
    token: admin,
    body: {
      name: 'Premium Handmade Decorative Paper Sheets',
      sku: 'WB-PAPER-001',
      brand: 'PaperCraft',
      category: 'paper-craft',
      price: 249,
      mrp: 399,
      stock: 40,
      description: 'Hand-pressed decorative paper with a smooth matte finish.',
      image: IMAGE,
      bulkTiers: [
        { minQty: 1, maxQty: 9, unitPrice: 249 },
        { minQty: 10, maxQty: 49, unitPrice: 237 },
      ],
      ...overrides,
    },
  });
  assert.equal(created.status, 201, `product should be created: ${created.body.message}`);
}

async function seedCoupons(): Promise<void> {
  await AdminCouponModel.deleteMany({});
  await AdminCouponModel.create([
    { code: 'PAPER10', label: '10% OFF', kind: 'percent', value: 10, minOrder: 499, status: 'Active' },
    { code: 'PREPAID100', label: '₹100 OFF', kind: 'flat', value: 100, minOrder: 0, status: 'Active' },
    { code: 'OFF', label: 'Inactive', kind: 'flat', value: 50, minOrder: 0, status: 'Expired' },
  ]);
}

const checkout = (body: unknown, token = shopper) =>
  request<Order>('POST', `${API}/orders`, { token, body });

// ---------------------------------------------------------------------------
describe('placing an order', () => {
  it('needs an account', async () => {
    const res = await request('POST', `${API}/orders`, {
      body: { items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 1 }], address: ADDRESS },
    });
    assert.equal(res.status, 401);
  });

  it('prices the basket from the product record, including quantity breaks', async () => {
    await seedProduct();
    await seedCoupons();
    await AdminOrderModel.deleteMany({});
    await AdminCustomerModel.deleteMany({});

    const placed = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 12 }],
      address: ADDRESS,
      payment: 'COD',
    });

    assert.equal(placed.status, 201, placed.body.message);
    const order = placed.body.data!;

    // 12 packs are in the ₹237 break, and the client never sent a price.
    assert.equal(order.items[0]?.price, 237);
    assert.equal(order.subtotal, 237 * 12);
    assert.equal(order.shipping, 0);
    assert.equal(order.discount, 0);
    assert.equal(order.amount, 237 * 12);

    assert.equal(order.status, 'Approval');
    assert.equal(order.payment, 'COD');
    assert.equal(order.paymentStatus, 'Pending');
    assert.match(order.id, /^#WB-\d+$/);
    assert.ok(order.placedOn);
    assert.equal(order.customer, 'Ananya Sharma');
    assert.equal(order.phone, SHOPPER);
    assert.match(order.address, /Wardha Road, Nagpur/);

    // Stock moved, and the order is stored once.
    const stored = await ProductModel.findOne({ slug: 'premium-handmade-decorative-paper-sheets' });
    assert.equal(stored?.stock, 28);
    assert.equal(await AdminOrderModel.countDocuments({}), 1);

    // The panel's customer list is fed from orders, so the buyer appears.
    const customer = await AdminCustomerModel.findOne({ phone: SHOPPER });
    assert.ok(customer);
    assert.equal(customer?.city, 'Nagpur');
  });

  it('validates a coupon against its minimum basket, and records the discount', async () => {
    await seedProduct();
    await seedCoupons();
    await AdminOrderModel.deleteMany({});

    const below = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 1 }],
      address: ADDRESS,
      couponCode: 'PAPER10',
    });
    assert.equal(below.status, 422);
    const details = below.body.error?.details as { couponCode?: string } | undefined;
    assert.match(details?.couponCode ?? '', /Add ₹250 more/);

    const placed = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 10 }],
      address: ADDRESS,
      couponCode: 'paper10',
    });
    assert.equal(placed.status, 201, placed.body.message);
    // 10 × ₹237 = ₹2370, 10% = ₹237.
    assert.equal(placed.body.data?.discount, 237);
    assert.equal(placed.body.data?.amount, 2370 - 237);
    assert.equal(placed.body.data?.couponCode, 'PAPER10');

    const coupon = await AdminCouponModel.findOne({ code: 'PAPER10' });
    assert.equal(coupon?.used, 1);
    assert.equal(coupon?.discountGiven, 237);
  });

  it('rejects an unknown, inactive or expired code', async () => {
    await seedProduct();
    await seedCoupons();

    const unknown = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 2 }],
      address: ADDRESS,
      couponCode: 'NOTACODE',
    });
    assert.equal(unknown.status, 422);

    const expired = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 2 }],
      address: ADDRESS,
      couponCode: 'OFF',
    });
    assert.equal(expired.status, 422);
  });

  it('refuses a basket that is out of stock, and takes nothing when it does', async () => {
    await seedProduct({ stock: 2 });
    await AdminOrderModel.deleteMany({});

    const placed = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 5 }],
      address: ADDRESS,
    });
    assert.equal(placed.status, 409);
    assert.equal(placed.body.error?.code, 'CONFLICT');

    // Nothing was reserved and nothing was written.
    const stored = await ProductModel.findOne({ slug: 'premium-handmade-decorative-paper-sheets' });
    assert.equal(stored?.stock, 2);
    assert.equal(await AdminOrderModel.countDocuments({}), 0);
  });

  it('refuses a hidden or unknown product', async () => {
    await seedProduct({ hidden: true });

    const draft = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 1 }],
      address: ADDRESS,
    });
    assert.equal(draft.status, 404);

    const missing = await checkout({
      items: [{ productId: 'no-such-product', qty: 1 }],
      address: ADDRESS,
    });
    assert.equal(missing.status, 404);

    const empty = await checkout({ items: [], address: ADDRESS });
    assert.equal(empty.status, 422);
  });

  it('requires a delivery address, either saved or inline', async () => {
    await seedProduct();

    const none = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 1 }],
    });
    assert.equal(none.status, 422);

    const both = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 1 }],
      address: ADDRESS,
      addressId: '64b7f9c2f1a2b3c4d5e6f7a8',
    });
    assert.equal(both.status, 422);

    // A saved address from the shopper's own book works.
    const saved = await request<{ id: string }>('POST', `${API}/addresses`, {
      token: shopper,
      body: { ...ADDRESS, address1: 'Plot 9, IT Park' },
    });
    assert.equal(saved.status, 201);

    const placed = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 1 }],
      addressId: saved.body.data!.id,
    });
    assert.equal(placed.status, 201, placed.body.message);
    assert.match(placed.body.data!.address, /Plot 9, IT Park/);
  });
});

describe('order history', () => {
  it('lists only the signed-in shopper’s orders', async () => {
    await seedProduct();
    await AdminOrderModel.deleteMany({});

    const mine = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 2 }],
      address: ADDRESS,
    });
    assert.equal(mine.status, 201);

    const theirList = await request<Order[]>('GET', `${API}/orders`, { token: other });
    assert.equal(theirList.status, 200);
    assert.deepEqual(theirList.body.data, []);

    const myList = await request<Order[]>('GET', `${API}/orders`, { token: shopper });
    assert.equal(myList.body.data?.length, 1);
    assert.equal(myList.body.data?.[0].id, mine.body.data?.id);

    // A foreign order id is a 404, indistinguishable from a missing one.
    const stolen = await request('GET', `${API}/orders/${encodeURIComponent(mine.body.data!.id)}`, {
      token: other,
    });
    assert.equal(stolen.status, 404);

    const own = await request<Order>(
      'GET',
      `${API}/orders/${encodeURIComponent(mine.body.data!.id)}`,
      { token: shopper },
    );
    assert.equal(own.status, 200);
    assert.equal(own.body.data?.id, mine.body.data?.id);
  });

  it('is the same collection the admin panel charts', async () => {
    await AdminOrderModel.deleteMany({});
    await seedProduct();

    const placed = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 3 }],
      address: ADDRESS,
    });
    assert.equal(placed.status, 201);

    const dataset = await request<{ orders: Order[] }>('GET', `${API}/admin/dataset`, {
      token: admin,
    });
    assert.equal(dataset.status, 200);
    assert.equal(dataset.body.data?.orders.length, 1);
    assert.equal(dataset.body.data?.orders[0].id, placed.body.data?.id);
  });
});

describe('returns', () => {
  const returnPath = (orderId: string) =>
    `${API}/orders/${encodeURIComponent(orderId)}/returns`;

  it('can only be raised against a delivered order', async () => {
    await seedProduct();
    await AdminReturnModel.deleteMany({});

    const placed = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 1 }],
      address: ADDRESS,
    });
    const orderId = placed.body.data!.id;

    const tooEarly = await request('POST', returnPath(orderId), {
      token: shopper,
      body: { reason: 'Damaged in transit' },
    });
    assert.equal(tooEarly.status, 422);

    await AdminOrderModel.updateOne({ orderId }, { $set: { status: 'Delivered' } });

    const raised = await request<ReturnRequest>('POST', returnPath(orderId), {
      token: shopper,
      body: { reason: 'Damaged in transit', note: 'Packaging was crushed' },
    });
    assert.equal(raised.status, 201, raised.body.message);
    assert.match(raised.body.data!.id, /^#RET-\d+$/);
    assert.equal(raised.body.data?.status, 'Requested');
    assert.equal(raised.body.data?.orderId, orderId);

    // It is in the admin's queue, not in a browser.
    const queue = await request<{ returns: ReturnRequest[] }>('GET', `${API}/admin/dataset`, {
      token: admin,
    });
    assert.equal(queue.body.data?.returns.length, 1);
    assert.equal(queue.body.data?.returns[0].id, raised.body.data?.id);

    const mine = await request<ReturnRequest[]>('GET', `${API}/returns`, { token: shopper });
    assert.equal(mine.body.data?.length, 1);

    const theirs = await request<ReturnRequest[]>('GET', `${API}/returns`, { token: other });
    assert.deepEqual(theirs.body.data, []);

    // One open request per order.
    const again = await request('POST', returnPath(orderId), {
      token: shopper,
      body: { reason: 'Changed my mind' },
    });
    assert.equal(again.status, 409);
  });

  it('rejects a reason outside the vocabulary', async () => {
    await seedProduct();
    const placed = await checkout({
      items: [{ productId: 'premium-handmade-decorative-paper-sheets', qty: 1 }],
      address: ADDRESS,
    });
    const orderId = placed.body.data!.id;
    await AdminOrderModel.updateOne({ orderId }, { $set: { status: 'Delivered' } });

    const bad = await request('POST', returnPath(orderId), {
      token: shopper,
      body: { reason: 'I felt like it' },
    });
    assert.equal(bad.status, 422);
  });
});
