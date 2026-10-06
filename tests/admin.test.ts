/**
 * End-to-end tests for the admin API.
 *
 * Covers the two things that make the panel real: who is allowed in (the
 * `ADMIN_PHONES` allowlist promoting an account to `admin`, and the guard
 * rejecting everybody else) and what an admin can change (orders, returns,
 * reviews and store settings), including the sequencing rules the service
 * enforces so a client cannot store an order in an impossible state.
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
// The allowlist under test. The second number exists to prove the list is
// parsed rather than hard-coded, and the spaces prove it is normalised.
process.env.ADMIN_PHONES = '7796419792, +91 98111 11111';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-admin-test');

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { signAccessToken } = await import('../src/shared/tokens.js');
const { httpClient } = await import('../src/shared/httpClient.js');
const { createHttpMock } = await import('./helpers/http-mock.js');
const { UserModel } = await import('../src/modules/user/user.model.js');
const { OtpModel } = await import('../src/modules/auth/otp.model.js');
const { AdminOrderModel } = await import('../src/modules/admin/models/order.model.js');
const { AdminCustomerModel } = await import('../src/modules/admin/models/customer.model.js');
const { AdminReturnModel } = await import('../src/modules/admin/models/return.model.js');
const { AdminReviewModel } = await import('../src/modules/admin/models/review.model.js');
const { AdminRestockModel } = await import('../src/modules/admin/models/restock.model.js');
const { AdminCouponModel } = await import('../src/modules/admin/models/coupon.model.js');
const { AdminSettingModel } = await import('../src/modules/admin/models/setting.model.js');
const { generateSeedDataset } = await import('../src/modules/admin/seed/generate.js');
const { SEED_CATALOG } = await import('../src/modules/admin/seed/catalog.js');

const GATEWAY_URL = 'https://gateway.test/api/messaging/messages/send';

const gateway = createHttpMock(httpClient);
gateway.onPost(GATEWAY_URL).reply(() => [200, { message: 'queued' }]);

const ADMIN_PHONE = '7796419792';
const CUSTOMER_PHONE = '9876500011';
const API = '/api/v1';

let server: Server;
let baseUrl: string;

before(async () => {
  await connectDatabase();
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
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
  message: string;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
}

async function request(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: ApiBody<Record<string, unknown>> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  return { status: res.status, body: (await res.json()) as ApiBody<Record<string, unknown>> };
}

/**
 * Full sign-in for a phone number, returning its access token.
 *
 * The pending challenge is cleared first so the resend cooldown never makes a
 * later test wait on an earlier one.
 */
async function signIn(phone: string): Promise<{ token: string; role: string; name: string }> {
  await OtpModel.deleteMany({ phone });

  const requested = await request('POST', `${API}/auth/otp/request`, {
    body: { phone, name: 'Admin Tester' },
  });
  const code = (requested.body.data as { devCode: string }).devCode;

  const verified = await request('POST', `${API}/auth/otp/verify`, {
    body: { phone, code, name: 'Admin Tester' },
  });

  const data = verified.body.data as { accessToken: string; user: { role: string; name: string } };
  return { token: data.accessToken, role: data.user.role, name: data.user.name };
}

const orderUrl = (id: string) => `${API}/admin/orders/${encodeURIComponent(id)}`;
const patch = (path: string, token: string, body: unknown) =>
  request('PATCH', path, { token, body });

const ORDER_ID = '#ORD9001';
const RETURN_ID = '#RET-9001';
const REVIEW_ID = '#REV-9001';

function orderFixture(): Record<string, unknown> {
  return {
    orderId: ORDER_ID,
    customerId: 'CUS-1000',
    customer: 'Test Shopper',
    email: 'test.shopper@example.com',
    city: 'Jaipur',
    isGuest: false,
    placedAt: Date.now() - 3 * 86_400_000,
    placedOn: 'Oct 03, 2026',
    status: 'Approval',
    payment: 'UPI',
    paymentStatus: 'Paid',
    amount: 1_299,
    subtotal: 1_250,
    shipping: 49,
    discount: 0,
    items: [
      {
        productId: 'premium-handmade-decorative-paper',
        name: 'Premium Handmade Decorative Paper Sheets',
        brand: 'PaperCraft',
        image: 'https://example.test/paper.jpg',
        category: 'paper-craft',
        qty: 5,
        price: 249,
        mrp: 399,
      },
    ],
    delayed: false,
    refund: 0,
    phone: '+91 98200 00000',
    address: 'House No. 12, Craft Lane, Jaipur, Rajasthan - 302001',
  };
}

async function seedFixtures(): Promise<void> {
  await Promise.all([
    AdminOrderModel.deleteMany({}),
    AdminCustomerModel.deleteMany({}),
    AdminReturnModel.deleteMany({}),
    AdminReviewModel.deleteMany({}),
    AdminCouponModel.deleteMany({}),
    AdminRestockModel.deleteMany({}),
    AdminSettingModel.deleteMany({}),
  ]);

  await AdminOrderModel.create(orderFixture());
  await AdminCustomerModel.create({
    customerId: 'CUS-1000',
    name: 'Test Shopper',
    email: 'test.shopper@example.com',
    phone: '+91 98200 00000',
    city: 'Jaipur',
    joinedAt: Date.now() - 30 * 86_400_000,
    isGuest: false,
  });
  await AdminReturnModel.create({
    returnId: RETURN_ID,
    orderId: ORDER_ID,
    customer: 'Test Shopper',
    city: 'Jaipur',
    productName: 'Premium Handmade Decorative Paper Sheets',
    image: 'https://example.test/paper.jpg',
    reason: 'Damaged in transit',
    requestedAt: Date.now() - 86_400_000,
    status: 'Requested',
    refundAmount: 649,
    refunded: false,
  });
  await AdminReviewModel.create({
    reviewId: REVIEW_ID,
    productId: 'premium-handmade-decorative-paper',
    productName: 'Premium Handmade Decorative Paper Sheets',
    image: 'https://example.test/paper.jpg',
    customer: 'Test Shopper',
    rating: 5,
    title: 'Exactly as described',
    comment: 'Lovely paper.',
    createdAt: Date.now() - 2 * 86_400_000,
    helpful: 4,
    status: 'Pending',
  });
  await AdminCouponModel.create({
    code: 'PAPER10',
    label: '10% off your first order',
    kind: 'percent',
    value: 10,
    minOrder: 499,
    status: 'Active',
    expiresOn: 'Nov 20, 2026',
    used: 3,
    discountGiven: 410,
  });
  await AdminRestockModel.create({
    productId: 'craft-paper-multipack',
    productName: 'Craft Paper Multipack – 50 Sheets',
    units: 120,
    at: Date.now() - 5 * 86_400_000,
  });
}

// ---------------------------------------------------------------------------
describe('admin allowlist', () => {
  it('parses ADMIN_PHONES into bare ten-digit numbers', () => {
    assert.deepEqual(env.adminPhones, ['7796419792', '9811111111']);
    assert.equal(env.ADMIN_ENABLED, true);
  });

  it('promotes an allowlisted number at sign-in, so its token is stamped admin', async () => {
    const session = await signIn(ADMIN_PHONE);
    assert.equal(session.role, 'admin');
  });

  it('leaves everybody else a customer', async () => {
    const session = await signIn(CUSTOMER_PHONE);
    assert.equal(session.role, 'customer');
  });

  it('promotes an existing account on its next authenticated request', async () => {
    // An account created before the number was added to the allowlist: it is
    // still a customer in the database and its token still says so.
    const legacy = await UserModel.create({
      name: 'Legacy Admin',
      phone: '9811111111',
      role: 'customer',
      phoneVerifiedAt: new Date(),
    });
    const token = signAccessToken(legacy.id, legacy.phone, 'customer');

    const session = await request('GET', `${API}/admin/session`, { token });
    assert.equal(session.status, 200);

    const reloaded = await UserModel.findById(legacy.id);
    assert.equal(reloaded?.role, 'admin');
  });
});

describe('admin guard', () => {
  it('rejects an anonymous caller with 401', async () => {
    const res = await request('GET', `${API}/admin/dataset`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'UNAUTHORIZED');
  });

  it('rejects a signed-in customer with 403', async () => {
    const { token } = await signIn(CUSTOMER_PHONE);
    const res = await request('GET', `${API}/admin/dataset`, { token });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  });

  it('keeps the gate on write routes too', async () => {
    const { token } = await signIn(CUSTOMER_PHONE);
    const res = await patch(orderUrl(ORDER_ID), token, { status: 'Approved' });
    assert.equal(res.status, 403);
  });
});

describe('GET /admin/session', () => {
  it('reports the signed-in admin and their identity', async () => {
    const { token, name } = await signIn(ADMIN_PHONE);
    const res = await request('GET', `${API}/admin/session`, { token });

    assert.equal(res.status, 200);
    assert.equal(res.body.data?.isAdmin, true);
    assert.equal((res.body.data?.user as { name: string }).name, name);
    assert.equal((res.body.data?.user as { role: string }).role, 'admin');
  });
});

describe('GET /admin/dataset', () => {
  it('serves every collection the panel charts', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);
    const res = await request('GET', `${API}/admin/dataset`, { token });

    assert.equal(res.status, 200);
    const data = res.body.data as Record<string, unknown[]>;

    assert.equal(data.orders.length, 1);
    assert.equal(data.customers.length, 1);
    assert.equal(data.returns.length, 1);
    assert.equal(data.reviews.length, 1);
    assert.equal(data.coupons.length, 1);
    assert.equal(data.restocks.length, 1);
    assert.equal(typeof (res.body.data as { generatedAt: number }).generatedAt, 'number');
  });

  it('returns the wire shape the panel is typed against', async () => {
    const { token } = await signIn(ADMIN_PHONE);
    const res = await request('GET', `${API}/admin/dataset`, { token });
    const order = (res.body.data as { orders: Record<string, unknown>[] }).orders[0];

    assert.equal(order.id, ORDER_ID);
    assert.equal(order.isLive, false);
    assert.equal(order.customer, 'Test Shopper');
    assert.deepEqual((order.items as unknown[]).length, 1);
    // Mongo's key must never reach the client.
    assert.equal('_id' in order, false);
    assert.equal('__v' in order, false);
  });

  it('404s on an unknown admin route', async () => {
    const { token } = await signIn(ADMIN_PHONE);
    const res = await request('GET', `${API}/admin/nope`, { token });
    assert.equal(res.status, 404);
  });
});

describe('PATCH /admin/orders/:id', () => {
  it('approves an order and stamps who did it', async () => {
    await seedFixtures();
    const { token, name } = await signIn(ADMIN_PHONE);
    const res = await patch(orderUrl(ORDER_ID), token, { status: 'Approved' });

    assert.equal(res.status, 200);
    const order = res.body.data as Record<string, unknown>;
    assert.equal(order.status, 'Approved');
    assert.equal(order.approvedBy, name);
    assert.equal(typeof order.approvedAt, 'number');
  });

  it('records the courier only once the order is on its way', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);

    const tooEarly = await patch(orderUrl(ORDER_ID), token, {
      courier: 'Blue Dart',
      trackingId: 'BD12345678',
    });
    assert.equal(tooEarly.status, 400);
    assert.equal(tooEarly.body.error?.code, 'BAD_REQUEST');

    const shipped = await patch(orderUrl(ORDER_ID), token, {
      status: 'Shipped',
      courier: 'Blue Dart',
      trackingId: 'BD12345678',
    });
    assert.equal(shipped.status, 200);
    assert.equal((shipped.body.data as Record<string, unknown>).courier, 'Blue Dart');
    assert.equal((shipped.body.data as Record<string, unknown>).trackingId, 'BD12345678');
  });

  it('requires a reason when cancelling, and opens the refund', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);

    const noReason = await patch(orderUrl(ORDER_ID), token, { status: 'Cancelled' });
    assert.equal(noReason.status, 400);
    assert.match(noReason.body.error?.message ?? '', /why the order is being cancelled/);

    const cancelled = await patch(orderUrl(ORDER_ID), token, {
      status: 'Cancelled',
      cancellationReason: 'Customer requested cancellation',
    });
    assert.equal(cancelled.status, 200);
    const order = cancelled.body.data as Record<string, unknown>;
    assert.equal(order.status, 'Cancelled');
    assert.equal(order.cancellationReason, 'Customer requested cancellation');
    assert.equal(order.refundStatus, 'Pending');
    assert.equal(typeof order.cancelledAt, 'number');
  });

  it('only accepts a refund screenshot on a cancelled order, then closes the refund', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);
    const screenshot = 'data:image/png;base64,AAAA';

    const tooEarly = await patch(orderUrl(ORDER_ID), token, { refundScreenshot: screenshot });
    assert.equal(tooEarly.status, 400);
    assert.match(tooEarly.body.error?.message ?? '', /Only a cancelled order/);

    await patch(orderUrl(ORDER_ID), token, {
      status: 'Cancelled',
      cancellationReason: 'Duplicate order',
    });

    const refunded = await patch(orderUrl(ORDER_ID), token, { refundScreenshot: screenshot });
    assert.equal(refunded.status, 200);
    const order = refunded.body.data as Record<string, unknown>;
    assert.equal(order.refundStatus, 'Completed');
    assert.equal(typeof order.refundedAt, 'number');
    assert.equal(order.refundScreenshot, screenshot);
  });

  it('rejects a field the service owns, and an empty patch', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);

    const spoofed = await patch(orderUrl(ORDER_ID), token, {
      status: 'Approved',
      approvedBy: 'somebody else',
    });
    assert.equal(spoofed.status, 422);
    assert.equal(spoofed.body.error?.code, 'VALIDATION_ERROR');

    const empty = await patch(orderUrl(ORDER_ID), token, {});
    assert.equal(empty.status, 422);
  });

  it('404s on an order that does not exist', async () => {
    const { token } = await signIn(ADMIN_PHONE);
    const res = await patch(orderUrl('#ORD0000000'), token, { status: 'Approved' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'NOT_FOUND');
  });
});

describe('PATCH /admin/returns/:id', () => {
  const returnUrl = (id: string) => `${API}/admin/returns/${encodeURIComponent(id)}`;

  it('releases the refund when a return is approved', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);
    const res = await patch(returnUrl(RETURN_ID), token, { status: 'Approved' });

    assert.equal(res.status, 200);
    const entry = res.body.data as Record<string, unknown>;
    assert.equal(entry.status, 'Approved');
    assert.equal(entry.refunded, true);
  });

  it('takes the refund back when a return is rejected', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);
    const res = await patch(returnUrl(RETURN_ID), token, { status: 'Rejected' });

    assert.equal(res.status, 200);
    const entry = res.body.data as Record<string, unknown>;
    assert.equal(entry.status, 'Rejected');
    assert.equal(entry.refunded, false);
  });

  it('validates the status and 404s on an unknown return', async () => {
    const { token } = await signIn(ADMIN_PHONE);

    const bad = await patch(returnUrl(RETURN_ID), token, { status: 'Refunded' });
    assert.equal(bad.status, 422);

    const missing = await patch(returnUrl('#RET-0000000'), token, { status: 'Approved' });
    assert.equal(missing.status, 404);
  });
});

describe('review moderation', () => {
  const reviewUrl = (id: string) => `${API}/admin/reviews/${encodeURIComponent(id)}`;

  it('publishes a reply stamped with the signed-in admin', async () => {
    await seedFixtures();
    const { token, name } = await signIn(ADMIN_PHONE);
    const res = await patch(reviewUrl(REVIEW_ID), token, {
      status: 'Published',
      reply: { message: 'Thanks for the kind words!' },
    });

    assert.equal(res.status, 200);
    const review = res.body.data as { status: string; reply: { message: string; by: string; at: number } };
    assert.equal(review.status, 'Published');
    assert.equal(review.reply.message, 'Thanks for the kind words!');
    assert.equal(review.reply.by, name);
    assert.equal(typeof review.reply.at, 'number');
  });

  it('takes a reply back down when null is sent', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);
    await patch(reviewUrl(REVIEW_ID), token, { reply: { message: 'First' } });

    const cleared = await patch(reviewUrl(REVIEW_ID), token, { reply: null });
    assert.equal(cleared.status, 200);
    assert.equal('reply' in (cleared.body.data as Record<string, unknown>), false);
  });

  it('refuses an empty body', async () => {
    const { token } = await signIn(ADMIN_PHONE);
    const res = await patch(reviewUrl(REVIEW_ID), token, {});
    assert.equal(res.status, 422);
  });

  it('deletes a review, and 404s the second time', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);

    const removed = await request('DELETE', reviewUrl(REVIEW_ID), { token });
    assert.equal(removed.status, 200);
    assert.equal(await AdminReviewModel.countDocuments({ reviewId: REVIEW_ID }), 0);

    const again = await request('DELETE', reviewUrl(REVIEW_ID), { token });
    assert.equal(again.status, 404);
  });
});

describe('store settings', () => {
  const settingsUrl = `${API}/admin/settings`;

  it('serves the shipped defaults before anything is saved', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);
    const res = await request('GET', settingsUrl, { token });

    assert.equal(res.status, 200);
    const settings = res.body.data as Record<string, unknown>;
    assert.equal(settings.storeName, 'WishBox');
    assert.equal(settings.lowStockThreshold, 10);
    assert.equal(settings.codEnabled, true);
  });

  it('merges a partial change and persists it', async () => {
    await seedFixtures();
    const { token } = await signIn(ADMIN_PHONE);

    const saved = await patch(settingsUrl, token, {
      lowStockThreshold: 25,
      codEnabled: false,
    });
    assert.equal(saved.status, 200);
    const settings = saved.body.data as Record<string, unknown>;
    assert.equal(settings.lowStockThreshold, 25);
    assert.equal(settings.codEnabled, false);
    // Untouched keys keep their value.
    assert.equal(settings.storeName, 'WishBox');

    const reread = await request('GET', settingsUrl, { token });
    assert.equal((reread.body.data as Record<string, unknown>).lowStockThreshold, 25);
  });

  it('rejects an unknown key and an empty change', async () => {
    const { token } = await signIn(ADMIN_PHONE);

    const unknown = await patch(settingsUrl, token, { notifyByEmail: true });
    assert.equal(unknown.status, 422);

    const empty = await patch(settingsUrl, token, {});
    assert.equal(empty.status, 422);
  });
});

describe('seed generator', () => {
  it('produces a full year of consistent history', () => {
    const now = Date.now();
    const dataset = generateSeedDataset(20261002, now);

    assert.equal(dataset.customers.length, 520);
    assert.ok(dataset.orders.length > 500, `expected a busy year, got ${dataset.orders.length}`);
    assert.ok(dataset.returns.length > 0);
    assert.ok(dataset.reviews.length > 0);
    assert.equal(dataset.coupons.length, 6);
    assert.ok(dataset.restocks.length > 0);

    // Orders run oldest to newest, and never into the future.
    const newest = dataset.orders[0].placedAt;
    assert.ok(newest <= now);
    for (const order of dataset.orders) {
      assert.ok(order.placedAt <= now);
      assert.ok(order.items.length > 0);
      assert.ok(order.orderId.startsWith('#ORD'));
      // Cash on delivery never has proof of payment; anything that does is an
      // inline image the panel can render as-is.
      if (order.payment === 'COD') {
        assert.equal(order.paymentScreenshot, undefined);
      }
      if (order.paymentScreenshot !== undefined) {
        assert.ok(order.paymentScreenshot.startsWith('data:image/svg+xml'));
      }
    }

    // Every line item resolves to a real catalogue product, so the panel can
    // never show an order for something that does not exist.
    const known = new Set(SEED_CATALOG.map((product) => product.id));
    for (const order of dataset.orders) {
      for (const item of order.items) {
        assert.ok(known.has(item.productId), `unknown product ${item.productId}`);
      }
    }
  });

  it('is deterministic for a fixed seed', () => {
    const at = Date.now();
    const first = generateSeedDataset(20261002, at);
    const second = generateSeedDataset(20261002, at);

    assert.equal(first.orders.length, second.orders.length);
    assert.deepEqual(first.orders[0], second.orders[0]);
  });
});
