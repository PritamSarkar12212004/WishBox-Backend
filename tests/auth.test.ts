/**
 * End-to-end tests for the passwordless auth flow, run against an in-memory
 * MongoDB so they need no local database.
 *
 * Covers: request OTP -> verify OTP -> create/find user -> issue JWT, plus the
 * abuse guards (cooldown, attempt limit, single-use code) and the profile.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
// Lets the tests read the generated code back from the API response.
process.env.OTP_DEBUG_RETURN_CODE = 'true';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-test');

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { createApp } = await import('../src/app.js');
const { OtpModel } = await import('../src/modules/auth/otp.model.js');
const { UserModel } = await import('../src/modules/user/user.model.js');

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
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
interface ApiBody<T = Record<string, unknown>> {
  success: boolean;
  message: string;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
}

async function post<T = Record<string, unknown>>(
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: ApiBody<T> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ApiBody<T> };
}

async function get<T = Record<string, unknown>>(
  path: string,
  token?: string,
): Promise<{ status: number; body: ApiBody<T> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: (await res.json()) as ApiBody<T> };
}

async function patch<T = Record<string, unknown>>(
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: ApiBody<T> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ApiBody<T> };
}

interface OtpRequestData {
  phone: string;
  channel: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  isNewUser: boolean;
  devCode?: string;
}

interface SessionData {
  user: { id: string; name: string; phone: string; phoneVerifiedAt: string | null };
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

/** Requests a code and returns it, asserting the happy path along the way. */
async function requestCode(phone: string): Promise<string> {
  const { status, body } = await post<OtpRequestData>('/api/v1/auth/otp/request', { phone });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.ok(body.data?.devCode, 'test env should expose the generated code');
  return body.data.devCode;
}

/** Full login, returning the issued session. */
async function signIn(phone: string, name: string): Promise<SessionData> {
  const code = await requestCode(phone);
  const { status, body } = await post<SessionData>('/api/v1/auth/otp/verify', {
    phone,
    code,
    name,
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(body.data?.accessToken);
  return body.data;
}

let phoneCounter = 0;
/** A fresh valid Indian mobile number for each test. */
function nextPhone(): string {
  phoneCounter += 1;
  return `9${String(100000000 + phoneCounter).slice(0, 9)}`;
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------
describe('POST /auth/otp/request', () => {
  it('sends a code and reports the resend window', async () => {
    const phone = nextPhone();
    const { status, body } = await post<OtpRequestData>('/api/v1/auth/otp/request', { phone });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data?.phone, phone);
    assert.equal(body.data?.channel, 'whatsapp');
    assert.equal(body.data?.resendAfterSeconds, 30);
    assert.equal(body.data?.isNewUser, true);
  });

  it('never stores the code in plain text', async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);

    const challenge = await OtpModel.findOne({ phone });
    assert.ok(challenge, 'challenge should be persisted');
    assert.notEqual(challenge.codeHash, code);
    assert.ok(challenge.codeHash.startsWith('$2'), 'expected a bcrypt hash');
  });

  it('normalises a number written with a country code', async () => {
    const { status, body } = await post<OtpRequestData>('/api/v1/auth/otp/request', {
      phone: '+91 98765 43210',
    });

    assert.equal(status, 200);
    assert.equal(body.data?.phone, '9876543210');
  });

  it('rejects a number that is not a valid Indian mobile', async () => {
    const { status, body } = await post('/api/v1/auth/otp/request', { phone: '12345' });

    assert.equal(status, 422);
    assert.equal(body.error?.code, 'VALIDATION_ERROR');
  });

  it('throttles a resend inside the cooldown window', async () => {
    const phone = nextPhone();
    await requestCode(phone);

    const { status, body } = await post<{ retryAfterSeconds: number }>(
      '/api/v1/auth/otp/request',
      { phone },
    );

    assert.equal(status, 429);
    assert.equal(body.error?.code, 'OTP_COOLDOWN');
    assert.ok((body.error?.details as { retryAfterSeconds: number }).retryAfterSeconds > 0);
  });
});

describe('POST /auth/otp/verify', () => {
  it('creates the user and issues JWTs', async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);

    const { status, body } = await post<SessionData>('/api/v1/auth/otp/verify', {
      phone,
      code,
      name: 'Ananya Sharma',
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data?.user.name, 'Ananya Sharma');
    assert.equal(body.data?.user.phone, phone);
    assert.ok(body.data?.user.phoneVerifiedAt);
    assert.equal(body.data?.expiresInSeconds, 900);
    assert.ok(body.data?.accessToken.split('.').length === 3, 'expected a JWT');

    const stored = await UserModel.findOne({ phone });
    assert.equal(stored?.name, 'Ananya Sharma');
  });

  it('finds the existing user on the next sign-in', async () => {
    const phone = nextPhone();
    const first = await signIn(phone, 'Ravi Kumar');

    // Clear the cooldown / single-use state the way a real user would by waiting.
    await OtpModel.deleteOne({ phone });
    const second = await signIn(phone, 'Ravi Kumar');

    assert.equal(first.user.id, second.user.id, 'same shopper, same record');
  });

  it('requires a name when creating a brand new account', async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);

    const { status, body } = await post('/api/v1/auth/otp/verify', { phone, code });

    assert.equal(status, 400);
    assert.equal(body.success, false);
  });

  it('rejects a wrong code and counts down the attempts', async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);
    const wrong = code === '000000' ? '111111' : '000000';

    const { status, body } = await post<null>('/api/v1/auth/otp/verify', {
      phone,
      code: wrong,
      name: 'Test Shopper',
    });

    assert.equal(status, 400);
    assert.equal(body.error?.code, 'OTP_INVALID');
    assert.equal((body.error?.details as { attemptsRemaining: number }).attemptsRemaining, 4);
  });

  it('burns the code after too many wrong attempts', async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post('/api/v1/auth/otp/verify', { phone, code: wrong, name: 'Test Shopper' });
    }

    // The challenge is gone, so even the correct code no longer works.
    const { status, body } = await post('/api/v1/auth/otp/verify', {
      phone,
      code,
      name: 'Test Shopper',
    });

    assert.ok(status === 429 || status === 400, `unexpected status ${status}`);
    assert.ok(
      body.error?.code === 'OTP_TOO_MANY_ATTEMPTS' || body.error?.code === 'OTP_EXPIRED',
      `unexpected code ${body.error?.code}`,
    );
  });

  it('accepts a code only once', async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);

    const first = await post<SessionData>('/api/v1/auth/otp/verify', {
      phone,
      code,
      name: 'One Time',
    });
    assert.equal(first.status, 200);

    const second = await post('/api/v1/auth/otp/verify', { phone, code, name: 'One Time' });
    assert.equal(second.status, 400);
    assert.equal(second.body.error?.code, 'OTP_EXPIRED');
  });
});

describe('profile', () => {
  it('returns the signed-in shopper from /users/me', async () => {
    const phone = nextPhone();
    const session = await signIn(phone, 'Meera Nair');

    const { status, body } = await get<{ name: string; phone: string }>(
      '/api/v1/users/me',
      session.accessToken,
    );

    assert.equal(status, 200);
    assert.equal(body.data?.name, 'Meera Nair');
    assert.equal(body.data?.phone, phone);
  });

  it('exposes the same profile on /auth/me', async () => {
    const session = await signIn(nextPhone(), 'Alias Check');
    const { status, body } = await get<{ name: string }>('/api/v1/auth/me', session.accessToken);

    assert.equal(status, 200);
    assert.equal(body.data?.name, 'Alias Check');
  });

  it('rejects a request with no token', async () => {
    const { status, body } = await get('/api/v1/users/me');

    assert.equal(status, 401);
    assert.equal(body.error?.code, 'UNAUTHORIZED');
  });

  it('rejects a garbage token', async () => {
    const { status, body } = await get('/api/v1/users/me', 'not-a-real-jwt');

    assert.equal(status, 401);
    assert.equal(body.error?.code, 'UNAUTHORIZED');
  });

  it('updates the display name', async () => {
    const session = await signIn(nextPhone(), 'Old Name');

    const { status, body } = await patch<{ name: string }>(
      '/api/v1/users/me',
      { name: 'New Name' },
      session.accessToken,
    );

    assert.equal(status, 200);
    assert.equal(body.data?.name, 'New Name');

    const reread = await get<{ name: string }>('/api/v1/users/me', session.accessToken);
    assert.equal(reread.body.data?.name, 'New Name');
  });

  it('refuses an empty profile update', async () => {
    const session = await signIn(nextPhone(), 'No Changes');

    const { status, body } = await patch('/api/v1/users/me', {}, session.accessToken);

    assert.equal(status, 422);
    assert.equal(body.error?.code, 'VALIDATION_ERROR');
  });
});

describe('sessions', () => {
  it('rotates the refresh token and rejects the old one', async () => {
    const session = await signIn(nextPhone(), 'Rotation Test');

    const refreshed = await post<SessionData>('/api/v1/auth/refresh', {
      refreshToken: session.refreshToken,
    });

    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.data?.refreshToken, session.refreshToken);

    const reused = await post('/api/v1/auth/refresh', { refreshToken: session.refreshToken });
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error?.code, 'UNAUTHORIZED');
  });

  it('rejects a refresh token that is actually an access token', async () => {
    const session = await signIn(nextPhone(), 'Wrong Token Type');

    const { status } = await post('/api/v1/auth/refresh', {
      refreshToken: session.accessToken,
    });

    assert.equal(status, 401);
  });

  it('invalidates the session on logout', async () => {
    const session = await signIn(nextPhone(), 'Logout Test');

    const loggedOut = await post('/api/v1/auth/logout', {
      refreshToken: session.refreshToken,
    }, session.accessToken);
    assert.equal(loggedOut.status, 200);

    const after = await post('/api/v1/auth/refresh', { refreshToken: session.refreshToken });
    assert.equal(after.status, 401);
  });

  it('signs out every device with allDevices', async () => {
    const phone = nextPhone();
    const first = await signIn(phone, 'Two Devices');

    // A second device signs in from the same number.
    await OtpModel.deleteOne({ phone });
    const second = await signIn(phone, 'Two Devices');

    const res = await post('/api/v1/auth/logout', { allDevices: true }, second.accessToken);
    assert.equal(res.status, 200);

    const firstToken = await post('/api/v1/auth/refresh', { refreshToken: first.refreshToken });
    const secondToken = await post('/api/v1/auth/refresh', { refreshToken: second.refreshToken });

    assert.equal(firstToken.status, 401);
    assert.equal(secondToken.status, 401);
  });

  it('keeps the number of stored sessions within the configured cap', async () => {
    const phone = nextPhone();
    await signIn(phone, 'Many Devices');

    for (let round = 0; round < 7; round += 1) {
      await OtpModel.deleteOne({ phone });
      await signIn(phone, 'Many Devices');
    }

    const user = await UserModel.findOne({ phone });
    assert.ok(user, 'user should exist');
    assert.ok(
      user.sessions.length <= 5,
      `expected at most 5 sessions, found ${user.sessions.length}`,
    );
  });
});
