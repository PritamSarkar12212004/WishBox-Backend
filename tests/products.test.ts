/**
 * End-to-end tests for the product catalogue and the categories it files under.
 *
 * The two things worth protecting here are the *boundary* and the *shop rules*:
 * writing the catalogue is an admin action and reading it is public, a draft is
 * invisible to a shopper (a 404, not a redacted row), and a product can neither
 * file under a category that does not exist nor be priced above its own MRP.
 *
 * Cloudinary is deliberately pinned *unconfigured* in this file, whatever `.env`
 * holds: image cleanup has to degrade to a silent no-op rather than a failure,
 * and nothing may reach the network. The configured, signed path is covered in
 * `uploads.test.ts`.
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
process.env.CLOUDINARY_API_KEY = 'test-api-key';
// No secret: server-side signed uploads and image deletion stay off.
process.env.CLOUDINARY_API_SECRET = '';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-products-test');

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { createApp } = await import('../src/app.js');
const { httpClient } = await import('../src/shared/httpClient.js');
const { createHttpMock } = await import('./helpers/http-mock.js');
const { OtpModel } = await import('../src/modules/auth/otp.model.js');
const { ProductModel } = await import('../src/modules/products/products.model.js');
const { CategoryModel } = await import('../src/modules/categories/categories.model.js');

const mock = createHttpMock(httpClient);
mock.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);

const API = '/api/v1';
const ADMIN_PHONE = '7796419792';
const SHOPPER_PHONE = '9876500011';

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
  mock.restore();
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

type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  mrp: number;
  badge?: string;
  available: boolean;
  hidden: boolean;
  stock: number;
  image: string;
  hoverImage: string;
  description: string;
  highlights: string[];
  specs?: Record<string, string>;
  offer?: { code: string; label: string };
  gallery?: string[];
  createdAt: string;
};

type Category = { id: string; label: string; sortOrder: number; productCount?: number };

const IMAGE = 'https://res.cloudinary.com/dftt4ow6q/image/upload/v1789112613/wishbox/paper.jpg';
const HOVER = 'https://res.cloudinary.com/dftt4ow6q/image/upload/v1789112613/wishbox/paper-2.jpg';

/** A complete, valid product body; tests override one field at a time. */
const BASE = {
  name: 'Premium Handmade Decorative Paper Sheets',
  sku: 'WB-PAPER-001',
  brand: 'PaperCraft',
  category: 'paper-craft',
  price: 249,
  mrp: 399,
  description: 'Hand-pressed decorative paper with a smooth matte finish.',
  image: IMAGE,
};

let admin = '';
let shopper = '';

/** Two real categories, written through the admin API. */
async function seedCategories(): Promise<void> {
  await CategoryModel.deleteMany({});
  for (const label of ['Paper & Craft', 'Home Decor']) {
    const created = await request('POST', `${API}/admin/categories`, {
      token: admin,
      body: { label },
    });
    assert.equal(created.status, 201, `category "${label}" should be created`);
  }
}

const addProduct = (body: unknown) =>
  request<Product>('POST', `${API}/admin/products`, { token: admin, body });

async function seedProduct(overrides: Record<string, unknown> = {}): Promise<Product> {
  const created = await addProduct({ ...BASE, ...overrides });
  assert.equal(created.status, 201, `product should be created: ${created.body.message}`);
  return created.body.data!;
}

// ---------------------------------------------------------------------------
before(async () => {
  admin = await signIn(ADMIN_PHONE, 'WishBox Admin');
  shopper = await signIn(SHOPPER_PHONE, 'Ananya Sharma');
});

describe('categories', () => {
  it('are readable by anyone, with live product counts', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    await seedProduct();

    const list = await request<Category[]>('GET', `${API}/categories`);
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.data?.map((category) => category.id),
      ['home-decor', 'paper-craft'],
    );

    const paper = list.body.data!.find((category) => category.id === 'paper-craft')!;
    assert.equal(paper.label, 'Paper & Craft');
    // The count is a query, not a stored number, so it cannot drift.
    assert.equal(paper.productCount, 1);
    assert.equal(list.body.data!.find((category) => category.id === 'home-decor')!.productCount, 0);
  });

  it('404s an unknown slug and 422s a malformed one', async () => {
    const missing = await request('GET', `${API}/categories/nope`);
    assert.equal(missing.status, 404);

    const malformed = await request('GET', `${API}/categories/Not%20A%20Slug`);
    assert.equal(malformed.status, 422);
  });

  it('derives the slug from the label, and refuses a duplicate', async () => {
    const created = await request<Category>('POST', `${API}/admin/categories`, {
      token: admin,
      // No slug given: `Craft Supplies` has to become `craft-supplies`.
      body: { label: 'Craft Supplies' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data?.id, 'craft-supplies');

    const again = await request('POST', `${API}/admin/categories`, {
      token: admin,
      body: { label: 'Crafting Supplies', slug: 'craft-supplies' },
    });
    assert.equal(again.status, 409);
    assert.equal(again.body.error?.code, 'CONFLICT');
  });

  it('is an admin-only write', async () => {
    const anonymous = await request('POST', `${API}/admin/categories`, { body: { label: 'Nope' } });
    assert.equal(anonymous.status, 401);

    const forbidden = await request('POST', `${API}/admin/categories`, {
      token: shopper,
      body: { label: 'Nope' },
    });
    assert.equal(forbidden.status, 403);

    const unknownField = await request('POST', `${API}/admin/categories`, {
      token: admin,
      body: { label: 'Craft', color: 'blue' },
    });
    assert.equal(unknownField.status, 422);
  });

  it('cannot be deleted while products still reference it', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    await seedProduct();

    const blocked = await request('DELETE', `${API}/admin/categories/paper-craft`, {
      token: admin,
    });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error?.message ?? '', /Move them first/);

    await request('DELETE', `${API}/admin/products/${(await ProductModel.findOne())!.slug}`, {
      token: admin,
    });

    const removed = await request('DELETE', `${API}/admin/categories/paper-craft`, { token: admin });
    assert.equal(removed.status, 200);

    const again = await request('DELETE', `${API}/admin/categories/paper-craft`, { token: admin });
    assert.equal(again.status, 404);
  });
});

describe('creating a product', () => {
  it('is an admin-only write', async () => {
    await seedCategories();

    const anonymous = await addProductWith();
    assert.equal(anonymous.status, 401);

    const forbidden = await request('POST', `${API}/admin/products`, {
      token: shopper,
      body: BASE,
    });
    assert.equal(forbidden.status, 403);
  });

  it('files a product under a real category and returns it as the storefront expects', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();

    const created = await addProduct(BASE);
    assert.equal(created.status, 201);
    assert.equal(created.body.data?.id, 'premium-handmade-decorative-paper-sheets');
    assert.equal(created.body.data?.category, 'paper-craft');
    assert.equal(created.body.data?.price, 249);
    assert.equal(created.body.data?.available, true);
    assert.equal(created.body.data?.hidden, false);
    assert.equal(created.body.data?.stock, 0);
    // One photo is enough: the hover shot falls back to it.
    assert.equal(created.body.data?.hoverImage, IMAGE);
    assert.deepEqual(created.body.data?.highlights, []);
    assert.ok(created.body.data?.createdAt);
  });

  it('refuses a category that does not exist', async () => {
    const missing = await addProduct({ ...BASE, category: 'no-such-category' });
    assert.equal(missing.status, 404);
    assert.match(missing.body.error?.message ?? '', /no category/);
  });

  it('refuses a duplicate id and a duplicate SKU', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    await seedProduct();

    const sameId = await addProduct({ ...BASE, sku: 'WB-PAPER-999' });
    assert.equal(sameId.status, 409);
    assert.equal(sameId.body.error?.code, 'CONFLICT');

    const sameSku = await addProduct({ ...BASE, name: 'Another Paper Pack' });
    assert.equal(sameSku.status, 409);
    assert.match(sameSku.body.error?.message ?? '', /WB-PAPER-001/);
  });

  it('refuses a price above the MRP, and anything that is not an image', async () => {
    await seedCategories();

    const upsideDown = await addProduct({ ...BASE, sku: 'WB-X-1', price: 500, mrp: 400 });
    assert.equal(upsideDown.status, 422);
    assert.match(JSON.stringify(upsideDown.body.error?.details ?? {}), /MRP cannot be lower/);

    const notAnImage = await addProduct({ ...BASE, sku: 'WB-X-2', image: 'a-photo.jpg' });
    assert.equal(notAnImage.status, 422);

    const noDescription = await addProduct({ ...BASE, sku: 'WB-X-3', description: 'short' });
    assert.equal(noDescription.status, 422);

    const badSku = await addProduct({ ...BASE, sku: 'wb paper 4' });
    assert.equal(badSku.status, 422);

    const unknownField = await addProduct({ ...BASE, sku: 'WB-X-5', cost: 100 });
    assert.equal(unknownField.status, 422);
  });

  it('keeps an offer and a specification block when they are given', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();

    const created = await seedProduct({
      sku: 'WB-PAPER-777',
      badge: 'BESTSELLER',
      stock: 8,
      gallery: [HOVER],
      specs: { height: '12 in', gsm: '250 GSM', packaging: 'Sealed' },
      offer: { code: 'festive10', label: '10% off on festive orders' },
    });

    assert.equal(created.badge, 'BESTSELLER');
    assert.equal(created.stock, 8);
    assert.deepEqual(created.gallery, [HOVER]);
    assert.deepEqual(created.specs, { height: '12 in', gsm: '250 GSM', packaging: 'Sealed' });
    // Offer codes are normalised, so a shopper's lowercase entry still matches.
    assert.deepEqual(created.offer, { code: 'FESTIVE10', label: '10% off on festive orders' });
  });
});

describe('reading the catalogue', () => {
  it('is public, and never shows a draft', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    const live = await seedProduct();
    const draft = await seedProduct({ sku: 'WB-PAPER-002', name: 'Matte Pastel Pack', hidden: true });

    const list = await request<Product[]>('GET', `${API}/products`);
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.data?.map((product) => product.id),
      [live.id],
    );

    // A draft is a 404 to a shopper - the URL gives nothing away.
    const hidden = await request('GET', `${API}/products/${draft.id}`);
    assert.equal(hidden.status, 404);

    // ...and a 200 to an admin, both singly and on the admin listing.
    const forAdmin = await request<Product>('GET', `${API}/admin/products/${draft.id}`, {
      token: admin,
    });
    assert.equal(forAdmin.status, 200);
    assert.equal(forAdmin.body.data?.hidden, true);

    const drafts = await request<Product[]>('GET', `${API}/admin/products?visibility=hidden`, {
      token: admin,
    });
    assert.deepEqual(
      drafts.body.data?.map((product) => product.id),
      [draft.id],
    );

    const everything = await request<Product[]>('GET', `${API}/admin/products?visibility=all`, {
      token: admin,
    });
    assert.equal(everything.body.data?.length, 2);

    // The public listing has no way to ask for the drafts at all.
    const sneaky = await request('GET', `${API}/products?visibility=all`);
    assert.equal(sneaky.status, 200);
    assert.equal(sneaky.body.data?.length, 1);
  });

  it('422s a malformed product id', async () => {
    const malformed = await request('GET', `${API}/products/not_a_slug`);
    assert.equal(malformed.status, 422);
    assert.equal(malformed.body.error?.code, 'VALIDATION_ERROR');
  });
});

describe('filtering and paging the listing', () => {
  it('filters by category, badge and availability', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    await seedProduct({ sku: 'WB-PAPER-001', badge: 'SALE' });
    await seedProduct({
      sku: 'WB-DECOR-010',
      name: 'Modern Designer LED Round Wall Mirror',
      category: 'home-decor',
      price: 5270,
      mrp: 9999,
      available: false,
    });

    const byCategory = await request<Product[]>('GET', `${API}/products?category=home-decor`);
    assert.deepEqual(
      byCategory.body.data?.map((product) => product.id),
      ['modern-designer-led-round-wall-mirror'],
    );

    const byBadge = await request<Product[]>('GET', `${API}/products?badge=SALE`);
    assert.equal(byBadge.body.data?.length, 1);

    const inStock = await request<Product[]>('GET', `${API}/products?available=true`);
    assert.equal(inStock.body.data?.length, 1);
    const soldOut = await request<Product[]>('GET', `${API}/products?available=false`);
    assert.equal(soldOut.body.data?.[0].id, 'modern-designer-led-round-wall-mirror');
  });

  it('searches the name, the brand and the SKU, ignoring regex characters', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    await seedProduct({ sku: 'WB-PAPER-001' });
    await seedProduct({
      sku: 'WB-DECOR-010',
      name: 'Handmade Ceramic Vase Set',
      brand: 'ArtisanHome',
      category: 'home-decor',
      price: 1899,
      mrp: 2800,
    });

    const byName = await request<Product[]>('GET', `${API}/products?search=ceramic`);
    assert.equal(byName.body.data?.[0].id, 'handmade-ceramic-vase-set');

    const byBrand = await request<Product[]>('GET', `${API}/products?search=artisanhome`);
    assert.equal(byBrand.body.data?.length, 1);

    const bySku = await request<Product[]>('GET', `${API}/products?search=WB-PAPER`);
    assert.equal(bySku.body.data?.[0].sku, 'WB-PAPER-001');

    // A regex metacharacter is text, not syntax: this must not 500 or match all.
    const punctuation = await request<Product[]>('GET', `${API}/products?search=%28rare%29`);
    assert.equal(punctuation.status, 200);
    assert.deepEqual(punctuation.body.data, []);
  });

  it('sorts by price, and reports the page it is on', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    for (const [index, price] of [249, 149, 349].entries()) {
      await seedProduct({ sku: `WB-PAPER-00${index + 1}`, name: `Paper Pack ${index + 1}`, price });
    }

    const cheapest = await request<Product[]>('GET', `${API}/products?sort=price-asc`);
    assert.deepEqual(
      cheapest.body.data?.map((product) => product.price),
      [149, 249, 349],
    );

    const dearest = await request<Product[]>('GET', `${API}/products?sort=price-desc&limit=1`);
    assert.deepEqual(
      dearest.body.data?.map((product) => product.price),
      [349],
    );
    assert.deepEqual(dearest.body.meta, { total: 3, page: 1, limit: 1, pages: 3 });

    const secondPage = await request<Product[]>('GET', `${API}/products?sort=price-asc&limit=2&page=2`);
    assert.deepEqual(
      secondPage.body.data?.map((product) => product.price),
      [349],
    );
    assert.deepEqual(secondPage.body.meta, { total: 3, page: 2, limit: 2, pages: 2 });

    const beyondTheEnd = await request<Product[]>('GET', `${API}/products?page=9&limit=2`);
    assert.deepEqual(beyondTheEnd.body.data, []);
    assert.equal(beyondTheEnd.body.meta?.total, 3);
  });

  it('rejects nonsense in the query rather than ignoring it', async () => {
    const badSort = await request('GET', `${API}/products?sort=cheapest`);
    assert.equal(badSort.status, 422);

    const badPage = await request('GET', `${API}/products?page=0`);
    assert.equal(badPage.status, 422);

    const tooMany = await request('GET', `${API}/products?limit=500`);
    assert.equal(tooMany.status, 422);
  });
});

describe('updating a product', () => {
  it('applies a partial edit and leaves everything else alone', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    const created = await seedProduct({ stock: 4, badge: 'NEW' });

    const edited = await request<Product>('PATCH', `${API}/admin/products/${created.id}`, {
      token: admin,
      body: { price: 199, stock: 12, available: true },
    });

    assert.equal(edited.status, 200);
    assert.equal(edited.body.data?.price, 199);
    assert.equal(edited.body.data?.stock, 12);
    // Untouched fields survive.
    assert.equal(edited.body.data?.mrp, 399);
    assert.equal(edited.body.data?.badge, 'NEW');
    assert.equal(edited.body.data?.name, BASE.name);
  });

  it('keeps the MRP rule across a partial edit, whichever field arrives first', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    const created = await seedProduct();

    // Widening the MRP on its own is fine.
    const wider = await request<Product>('PATCH', `${API}/admin/products/${created.id}`, {
      token: admin,
      body: { mrp: 599 },
    });
    assert.equal(wider.status, 200);

    // Dropping the price on its own is fine.
    const cheaper = await request<Product>('PATCH', `${API}/admin/products/${created.id}`, {
      token: admin,
      body: { price: 179 },
    });
    assert.equal(cheaper.status, 200);

    // Ending up above the list price is not - even two fields at a time.
    const upsideDown = await request('PATCH', `${API}/admin/products/${created.id}`, {
      token: admin,
      body: { price: 700, mrp: 200 },
    });
    assert.equal(upsideDown.status, 422);

    const single = await request('PATCH', `${API}/admin/products/${created.id}`, {
      token: admin,
      body: { price: 900 },
    });
    assert.equal(single.status, 422);

    // Nothing was written by the rejected attempts.
    const stored = await ProductModel.findOne({ slug: created.id });
    assert.equal(stored?.price, 179);
    assert.equal(stored?.mrp, 599);
  });

  it('clears an optional block with null', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    const created = await seedProduct({
      sku: 'WB-PAPER-777',
      badge: 'SALE',
      specs: { gsm: '250 GSM' },
      offer: { code: 'FESTIVE10', label: '10% off' },
    });

    const cleared = await request<Product>('PATCH', `${API}/admin/products/${created.id}`, {
      token: admin,
      body: { badge: null, specs: null, offer: null },
    });

    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data?.badge, undefined);
    assert.equal(cleared.body.data?.specs, undefined);
    assert.equal(cleared.body.data?.offer, undefined);

    // And it is gone from the document, not merely from the response.
    const stored = await ProductModel.findOne({ slug: created.id }).lean();
    assert.equal(stored?.badge, undefined);
    assert.equal(stored?.specs, undefined);
    assert.equal(stored?.offer, undefined);
  });

  it('renames the product id, and the old URL stops working', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    const created = await seedProduct();

    const renamed = await request<Product>('PATCH', `${API}/admin/products/${created.id}`, {
      token: admin,
      body: { slug: 'handmade-paper-sheets' },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data?.id, 'handmade-paper-sheets');

    const old = await request('GET', `${API}/products/${created.id}`);
    assert.equal(old.status, 404);

    const fresh = await request('GET', `${API}/products/handmade-paper-sheets`);
    assert.equal(fresh.status, 200);
  });

  it('refuses a SKU that belongs to another product, and an unknown product', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    await seedProduct({ sku: 'WB-PAPER-001' });
    const second = await seedProduct({ sku: 'WB-PAPER-002', name: 'Matte Pastel Pack' });

    const clash = await request('PATCH', `${API}/admin/products/${second.id}`, {
      token: admin,
      body: { sku: 'WB-PAPER-001' },
    });
    assert.equal(clash.status, 409);

    const missing = await request('PATCH', `${API}/admin/products/no-such-product`, {
      token: admin,
      body: { stock: 1 },
    });
    assert.equal(missing.status, 404);

    const empty = await request('PATCH', `${API}/admin/products/${second.id}`, {
      token: admin,
      body: {},
    });
    assert.equal(empty.status, 422);

    const unknownField = await request('PATCH', `${API}/admin/products/${second.id}`, {
      token: admin,
      body: { rating: 4, discount: 10 },
    });
    assert.equal(unknownField.status, 422);
  });

  it('lets an admin publish a draft by flipping one flag', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    const draft = await seedProduct({ hidden: true });

    assert.equal((await request('GET', `${API}/products/${draft.id}`)).status, 404);

    const published = await request<Product>('PATCH', `${API}/admin/products/${draft.id}`, {
      token: admin,
      body: { hidden: false },
    });
    assert.equal(published.status, 200);
    assert.equal(published.body.data?.hidden, false);

    assert.equal((await request('GET', `${API}/products/${draft.id}`)).status, 200);
  });
});

describe('deleting a product', () => {
  it('removes it, and leaves its images alone without a Cloudinary secret', async () => {
    await ProductModel.deleteMany({});
    await seedCategories();
    const created = await seedProduct({ gallery: [HOVER] });

    mock.reset();
    mock.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);

    const removed = await request('DELETE', `${API}/admin/products/${created.id}`, { token: admin });
    assert.equal(removed.status, 200);
    assert.equal(await ProductModel.countDocuments({}), 0);

    const again = await request('DELETE', `${API}/admin/products/${created.id}`, { token: admin });
    assert.equal(again.status, 404);

    // The cleanup is best effort and must never reach the network unconfigured.
    const cloudinaryCalls = mock.history.post.filter((call) =>
      String(call.url).includes('cloudinary'),
    );
    assert.equal(cloudinaryCalls.length, 0);
  });

  it('is admin-only', async () => {
    const forbidden = await request('DELETE', `${API}/admin/products/anything`, { token: shopper });
    assert.equal(forbidden.status, 403);

    const anonymous = await request('DELETE', `${API}/admin/products/anything`);
    assert.equal(anonymous.status, 401);
  });
});

describe('uploads, with no server secret', () => {
  it('says so, and refuses to sign', async () => {
    const status = await request<{ configured: boolean; missing: string[] }>(
      'GET',
      `${API}/admin/uploads/status`,
      { token: admin },
    );
    assert.equal(status.status, 200);
    assert.equal(status.body.data?.configured, false);
    assert.ok(status.body.data?.missing.includes('CLOUDINARY_API_SECRET'));

    mock.reset();
    mock.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);

    const upload = await request('POST', `${API}/admin/uploads`, { token: admin, body: { file: IMAGE } });
    assert.equal(upload.status, 503);
    assert.equal(upload.body.error?.code, 'CLOUDINARY_NOT_CONFIGURED');
    assert.equal(mock.history.post.filter((call) => String(call.url).includes('cloudinary')).length, 0);
  });
});

/** An unauthenticated create, for the auth-boundary assertion. */
function addProductWith(): Promise<{ status: number }> {
  return request('POST', `${API}/admin/products`, { body: BASE });
}
