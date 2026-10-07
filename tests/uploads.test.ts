/**
 * The signed upload path, end to end, through the admin API.
 *
 * The repo ships without `CLOUDINARY_API_SECRET`, so the live server can only
 * ever answer "not configured" (covered in `products.test.ts`). Here the secret
 * *is* set and Cloudinary is faked, which is the only way to prove the parts that
 * cannot be seen otherwise: that the signature is correct, that the secret never
 * travels with the request, that a refusal keeps Cloudinary's own words, and that
 * an unreachable provider is retried once and then reported as a 502.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
// The point of this file: a secret exists.
process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
process.env.CLOUDINARY_FOLDER = 'wishbox';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-uploads-test');

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { createApp } = await import('../src/app.js');
const { httpClient } = await import('../src/shared/httpClient.js');
const { createHttpMock } = await import('./helpers/http-mock.js');
const { OtpModel } = await import('../src/modules/auth/otp.model.js');

const API = '/api/v1';
const ADMIN_PHONE = '7796419792';
const SHOPPER_PHONE = '9876500077';

const UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dftt4ow6q/image/upload';
const DESTROY_URL = 'https://api.cloudinary.com/v1_1/dftt4ow6q/image/destroy';

const mock = createHttpMock(httpClient);

/** The gateway is only in play for sign-in. */
mock.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);

const IMAGE_URL = 'https://res.cloudinary.com/dftt4ow6q/image/upload/v1789112613/wishbox/paper.jpg';

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

async function signIn(phone: string, name = 'Upload Tester'): Promise<string> {
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

/** Recomputes the signature the way Cloudinary does, from the request we sent. */
function expectedSignature(payload: Record<string, unknown>, secret: string): string {
  const signable = Object.entries(payload)
    .filter(([key]) => !['file', 'api_key', 'resource_type', 'cloud_name', 'signature'].includes(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join('&');

  return createHash('sha1').update(`${signable}${secret}`).digest('hex');
}

type StoredImage = { publicId: string; url: string; format: string; bytes: number };

const lastBody = (): Record<string, unknown> => {
  const calls = mock.history.post.filter((call) => String(call.url).startsWith(UPLOAD_URL));
  assert.ok(calls.length > 0, 'expected an upload call to Cloudinary');
  const raw = calls[calls.length - 1]!.data as string;
  return JSON.parse(raw) as Record<string, unknown>;
};

// ---------------------------------------------------------------------------
describe('signed uploads against a faked Cloudinary', () => {
  it('reports itself configured and never leaks the secret', async () => {
    const token = await signIn(ADMIN_PHONE, 'Admin');

    const status = await request<{ configured: boolean; missing: string[]; folder: string }>(
      'GET',
      `${API}/admin/uploads/status`,
      { token },
    );

    assert.equal(status.status, 200);
    assert.equal(status.body.data?.configured, true);
    assert.deepEqual(status.body.data?.missing, []);
    assert.equal(status.body.data?.folder, 'wishbox');
    // The status is about the secret, so it must not carry one.
    assert.equal(JSON.stringify(status.body).includes('test-api-secret'), false);
  });

  it('uploads a re-hosted URL with a valid signature', async () => {
    mock.reset();
    mock.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);
    mock.onPost(UPLOAD_URL).reply(config => {
      const payload = JSON.parse(String(config.data)) as Record<string, unknown>;
      if (payload.signature === expectedSignature(payload, 'test-api-secret')) {
        return [
          200,
          {
            public_id: 'wishbox/paper',
            url: 'http://res.cloudinary.com/dftt4ow6q/image/upload/v1/wishbox/paper.jpg',
            secure_url: IMAGE_URL,
            format: 'jpg',
            bytes: 24_000,
            width: 600,
            height: 750,
            resource_type: 'image',
            created_at: '2026-10-06T20:00:00Z',
          },
        ];
      }
      return [401, { error: { message: 'Invalid Signature' } }];
    });

    const token = await signIn(ADMIN_PHONE, 'Admin');
    const uploaded = await request<StoredImage>('POST', `${API}/admin/uploads`, {
      token,
      body: { file: 'https://images.unsplash.com/photo-1586075010923?w=600', tags: ['paper', 'craft'] },
    });

    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.data?.publicId, 'wishbox/paper');
    // The https URL is the one a product stores.
    assert.equal(uploaded.body.data?.url, IMAGE_URL);

    const payload = lastBody();
    assert.equal(payload.api_key, 'test-api-key');
    assert.equal(payload.folder, 'wishbox');
    assert.equal(payload.tags, 'paper,craft');
    assert.ok(typeof payload.timestamp === 'number');
    // The secret signs the request; it is never part of it.
    assert.equal('api_secret' in payload, false);
    assert.equal(JSON.stringify(payload).includes('test-api-secret'), false);
  });

  it('passes a refusal straight through, in Cloudinary’s own words', async () => {
    mock.reset();
    mock.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);
    mock.onPost(UPLOAD_URL).reply(400, { error: { message: 'Upload preset not found' } });

    const token = await signIn(ADMIN_PHONE, 'Admin');
    const refused = await request('POST', `${API}/admin/uploads`, {
      token,
      body: { file: IMAGE_URL },
    });

    assert.equal(refused.status, 502);
    assert.equal(refused.body.error?.code, 'CLOUDINARY_UPLOAD_FAILED');
    assert.match(refused.body.error?.message ?? '', /Upload preset not found/);
    // A refusal cannot be fixed by trying again, so it must not be.
    assert.equal(mock.history.post.filter((call) => String(call.url).startsWith(UPLOAD_URL)).length, 1);
  });

  it('retries an unreachable provider once, then reports 502', async () => {
    mock.reset();
    mock.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);
    mock.onPost(UPLOAD_URL).networkError();

    const token = await signIn(ADMIN_PHONE, 'Admin');
    const unreachable = await request('POST', `${API}/admin/uploads`, {
      token,
      body: { file: IMAGE_URL },
    });

    assert.equal(unreachable.status, 502);
    assert.match(unreachable.body.error?.message ?? '', /Could not reach Cloudinary/);
    assert.equal(mock.history.post.filter((call) => String(call.url).startsWith(UPLOAD_URL)).length, 2);
  });

  it('deletes an asset, and treats already-gone as success', async () => {
    mock.reset();
    mock.onPost(process.env.SMS_API_URL!).reply(() => [200, { message: 'queued' }]);

    let destroys = 0;
    mock.onPost(DESTROY_URL).reply(() => {
      destroys += 1;
      // First time the asset is there; the second time it is already gone.
      return [200, { result: destroys === 1 ? 'ok' : 'not found' }];
    });

    const token = await signIn(ADMIN_PHONE, 'Admin');

    const removed = await request<{ publicId: string; result: string }>(
      'DELETE',
      `${API}/admin/uploads?publicId=${encodeURIComponent('wishbox/paper')}`,
      { token },
    );
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data?.publicId, 'wishbox/paper');

    // Asked to delete something already deleted: the caller's wish is granted.
    const again = await request<{ result: string }>(
      'DELETE',
      `${API}/admin/uploads?publicId=${encodeURIComponent('wishbox/paper')}`,
      { token },
    );
    assert.equal(again.status, 200);
    assert.equal(again.body.data?.result, 'not found');

    const payload = JSON.parse(String(mock.history.post.find((call) => String(call.url).startsWith(DESTROY_URL))!.data));
    assert.equal(payload.public_id, 'wishbox/paper');
    assert.equal(typeof payload.signature, 'string');
  });

  it('needs the public id, and needs an admin', async () => {
    const anonymous = await request('DELETE', `${API}/admin/uploads?publicId=wishbox/paper`);
    assert.equal(anonymous.status, 401);

    const shopper = await signIn(SHOPPER_PHONE, 'Shopper');
    const shopperForbidden = await request('POST', `${API}/admin/uploads`, {
      token: shopper,
      body: { file: IMAGE_URL },
    });
    assert.equal(shopperForbidden.status, 403);

    const admin = await signIn(ADMIN_PHONE, 'Admin');
    const noId = await request('DELETE', `${API}/admin/uploads`, { token: admin });
    assert.equal(noId.status, 422);
    assert.equal(noId.body.error?.code, 'VALIDATION_ERROR');
  });

  it('rejects a body that is not an image reference', async () => {
    const token = await signIn(ADMIN_PHONE, 'Admin');

    const notAnImage = await request('POST', `${API}/admin/uploads`, {
      token,
      body: { file: 'just some text' },
    });
    assert.equal(notAnImage.status, 422);

    const unknownField = await request('POST', `${API}/admin/uploads`, {
      token,
      body: { file: IMAGE_URL, upload_preset: 'wishbox_products' },
    });
    assert.equal(unknownField.status, 422);
  });
});
