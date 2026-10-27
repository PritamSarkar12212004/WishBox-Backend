/**
 * End-to-end tests for the website content.
 *
 * What matters here: a fresh database serves the shipped content, an admin edit
 * is stored and served to every visitor, a reset restores one section without
 * touching the others, and a shopper can never write it.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.OTP_DEBUG_RETURN_CODE = 'true';
process.env.SMS_API_URL = 'https://gateway.test/api/messaging/messages/send';
process.env.SMS_API_TOKEN = 'test-gateway-token';
process.env.SMS_API_VARIABLES_KEY = 'otpdev';
process.env.SMS_SIGNUP_TEMPLATE_ID = 'signup-template-id';
process.env.ADMIN_PHONES = '7796419792';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-content-test');

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { createApp } = await import('../src/app.js');
const { httpClient } = await import('../src/shared/httpClient.js');
const { createHttpMock } = await import('./helpers/http-mock.js');
const { OtpModel } = await import('../src/modules/auth/otp.model.js');
const { SiteContentModel } = await import('../src/modules/content/content.model.js');
const { DEFAULT_SITE_CONTENT } = await import('../src/modules/content/content.defaults.js');

const gateway = createHttpMock(httpClient);
gateway.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);

const API = '/api/v1';
const ADMIN_PHONE = '7796419792';
const SHOPPER = '9876500077';

let server: Server;
let baseUrl: string;
let admin = '';
let shopper = '';

before(async () => {
  await connectDatabase();
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  admin = await signIn(ADMIN_PHONE);
  shopper = await signIn(SHOPPER);
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await disconnectDatabase();
  await mongod.stop();
  gateway.restore();
});

beforeEach(async () => {
  await SiteContentModel.deleteMany({});
});

interface ApiBody<T = Record<string, unknown>> {
  success: boolean;
  message: string;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
}

async function request(
  method: 'GET' | 'POST' | 'PATCH',
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

async function signIn(phone: string): Promise<string> {
  await OtpModel.deleteMany({ phone });

  const requested = await request('POST', `${API}/auth/otp/request`, {
    body: { phone, name: 'Content Tester' },
  });
  const code = (requested.body.data as { devCode: string }).devCode;

  const verified = await request('POST', `${API}/auth/otp/verify`, {
    body: { phone, code, name: 'Content Tester' },
  });

  return (verified.body.data as { accessToken: string }).accessToken;
}

type Content = typeof DEFAULT_SITE_CONTENT;

async function getContent(): Promise<Content> {
  const response = await request('GET', `${API}/content`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data as Content;
}

describe('website content', () => {
  it('serves the shipped content before anything is saved', async () => {
    const content = await getContent();

    assert.deepEqual(content.home, DEFAULT_SITE_CONTENT.home);
    assert.deepEqual(content.alert, DEFAULT_SITE_CONTENT.alert);
    assert.deepEqual(content.footer, DEFAULT_SITE_CONTENT.footer);
    assert.deepEqual(content.contact, DEFAULT_SITE_CONTENT.contact);
    assert.equal(await SiteContentModel.countDocuments(), 0);
  });

  it('stores an admin edit and serves it to every visitor', async () => {
    const footer = {
      ...DEFAULT_SITE_CONTENT.footer,
      storeName: 'Paper & Post',
      email: 'studio@paperandpost.in',
      shopLinks: [{ id: 'shop-all', label: 'Shop all', to: '/shop' }],
    };

    const saved = await request('PATCH', `${API}/admin/content`, {
      token: admin,
      body: { footer },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal((saved.body.data as Content).footer.storeName, 'Paper & Post');

    // No token: this is what a shopper's browser reads.
    const publicContent = await getContent();
    assert.equal(publicContent.footer.storeName, 'Paper & Post');
    assert.equal(publicContent.footer.email, 'studio@paperandpost.in');
    assert.deepEqual(publicContent.footer.shopLinks, [
      { id: 'shop-all', label: 'Shop all', to: '/shop' },
    ]);

    // The other sections are untouched.
    assert.deepEqual(publicContent.alert, DEFAULT_SITE_CONTENT.alert);
    assert.deepEqual(publicContent.contact, DEFAULT_SITE_CONTENT.contact);
  });

  it('resets one section back to the shipped content', async () => {
    await request('PATCH', `${API}/admin/content`, {
      token: admin,
      body: {
        alert: { ...DEFAULT_SITE_CONTENT.alert, phone: '+91 90000 00000' },
        footer: { ...DEFAULT_SITE_CONTENT.footer, storeName: 'Edited' },
      },
    });

    const reset = await request('PATCH', `${API}/admin/content`, {
      token: admin,
      body: { reset: ['alert'] },
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));

    const content = await getContent();
    assert.deepEqual(content.alert, DEFAULT_SITE_CONTENT.alert);
    assert.equal(content.footer.storeName, 'Edited');
  });

  it('refuses a shopper writing the content', async () => {
    const response = await request('PATCH', `${API}/admin/content`, {
      token: shopper,
      body: { footer: DEFAULT_SITE_CONTENT.footer },
    });

    assert.equal(response.status, 403);
    assert.equal(await SiteContentModel.countDocuments(), 0);
  });

  it('rejects a malformed section instead of storing it', async () => {
    const response = await request('PATCH', `${API}/admin/content`, {
      token: admin,
      body: {
        alert: { ...DEFAULT_SITE_CONTENT.alert, marqueeSeconds: 5 },
      },
    });

    assert.equal(response.status, 422);
    assert.equal(await SiteContentModel.countDocuments(), 0);
  });

  it('refuses a section that is saved and reset at once', async () => {
    const response = await request('PATCH', `${API}/admin/content`, {
      token: admin,
      body: { footer: DEFAULT_SITE_CONTENT.footer, reset: ['footer'] },
    });

    assert.equal(response.status, 422);
  });
});
