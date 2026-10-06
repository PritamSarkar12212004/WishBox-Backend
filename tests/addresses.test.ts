/**
 * End-to-end tests for the customer profile and the address book.
 *
 * Covers the two things that make an address book real: the rules (an Indian
 * state, a six-digit PIN code, a canonical spelling) and the boundary that
 * matters most - one shopper can never read, change or delete another's
 * address, and a foreign id is indistinguishable from a missing one.
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

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-addresses-test');

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { createApp } = await import('../src/app.js');
const { httpClient } = await import('../src/shared/httpClient.js');
const { createHttpMock } = await import('./helpers/http-mock.js');
const { UserModel } = await import('../src/modules/user/user.model.js');
const { AddressModel } = await import('../src/modules/addresses/addresses.model.js');
const { OtpModel } = await import('../src/modules/auth/otp.model.js');
const { MAX_ADDRESSES_PER_USER } = await import('../src/modules/addresses/addresses.constants.js');

const GATEWAY_URL = 'https://gateway.test/api/messaging/messages/send';
const gateway = createHttpMock(httpClient);
gateway.onPost(GATEWAY_URL).reply(() => [200, { message: 'queued' }]);

const API = '/api/v1';
const SHOPPER = '9876500011';
const OTHER = '9876500022';

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

/** A real sign-in, so the token is one the API issued rather than a forgery. */
async function signIn(phone: string, name = 'Address Tester'): Promise<string> {
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

type Address = {
  id: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  createdAt: string;
  updatedAt: string;
};

const VALID = {
  address1: 'Flat 4B, Shanti Residency',
  address2: 'Wardha Road',
  city: 'Nagpur',
  state: 'Maharashtra',
  pincode: '440001',
};

const addAddress = (token: string, body: unknown) =>
  request<Address>('POST', `${API}/addresses`, { token, body });

// ---------------------------------------------------------------------------
describe('GET /me and PATCH /me', () => {
  it('returns the signed-in profile and requires a token', async () => {
    const anonymous = await request('GET', `${API}/me`);
    assert.equal(anonymous.status, 401);

    const token = await signIn(SHOPPER, 'Ananya Sharma');
    const me = await request<{ name: string; phone: string; role: string }>('GET', `${API}/me`, {
      token,
    });

    assert.equal(me.status, 200);
    assert.equal(me.body.data?.name, 'Ananya Sharma');
    assert.equal(me.body.data?.phone, SHOPPER);
  });

  it('renames the shopper, and keeps the phone read-only', async () => {
    const token = await signIn(SHOPPER, 'Ananya Sharma');

    const renamed = await request<{ name: string }>('PATCH', `${API}/me`, {
      token,
      body: { name: 'Ananya S. Sharma' },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data?.name, 'Ananya S. Sharma');

    const reread = await request<{ name: string }>('GET', `${API}/me`, { token });
    assert.equal(reread.body.data?.name, 'Ananya S. Sharma');

    // Changing the number would need it verified again, so it is not patchable.
    const phoneChange = await request('PATCH', `${API}/me`, {
      token,
      body: { phone: '9876500999' },
    });
    assert.equal(phoneChange.status, 422);
  });

  it('rejects an empty or too-short name', async () => {
    const token = await signIn(SHOPPER, 'Ananya Sharma');

    const empty = await request('PATCH', `${API}/me`, { token, body: {} });
    assert.equal(empty.status, 422);

    const short = await request('PATCH', `${API}/me`, { token, body: { name: 'A' } });
    assert.equal(short.status, 422);
  });
});

describe('address book', () => {
  it('starts empty and needs a token', async () => {
    await AddressModel.deleteMany({});
    const anonymous = await request('GET', `${API}/addresses`);
    assert.equal(anonymous.status, 401);

    const token = await signIn(SHOPPER);
    const list = await request<Address[]>('GET', `${API}/addresses`, { token });

    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data, []);
  });

  it('saves an address and returns it on the list, newest first', async () => {
    await AddressModel.deleteMany({});
    const token = await signIn(SHOPPER);

    const created = await addAddress(token, VALID);
    assert.equal(created.status, 201);
    assert.equal(created.body.data?.city, 'Nagpur');
    assert.equal(created.body.data?.state, 'Maharashtra');
    assert.equal(created.body.data?.pincode, '440001');
    assert.equal(created.body.data?.address2, 'Wardha Road');
    assert.ok(created.body.data?.id);

    const second = await addAddress(token, { ...VALID, address1: 'Plot 9, IT Park', address2: 'IT Park Road' });
    assert.equal(second.status, 201);

    const list = await request<Address[]>('GET', `${API}/addresses`, { token });
    assert.equal(list.body.data?.length, 2);
    // Newest first: the one just added is the one they are about to use.
    assert.equal(list.body.data?.[0].id, second.body.data?.id);
    // Both lines come back - the second is required, not a nicety.
    assert.equal(list.body.data?.[0].address2, 'IT Park Road');

    // The first address stored only the shopper's own fields.
    const stored = await AddressModel.findById(created.body.data?.id);
    assert.ok(stored);
    assert.equal(stored?.userId.toString(), (await UserModel.findOne({ phone: SHOPPER }))?.id);
  });

  it('canonicalises the state, so it can never be stored twice', async () => {
    await AddressModel.deleteMany({});
    const token = await signIn(SHOPPER);

    const lowercase = await addAddress(token, { ...VALID, state: 'maharashtra' });
    assert.equal(lowercase.status, 201);
    assert.equal(lowercase.body.data?.state, 'Maharashtra');

    const punctuation = await addAddress(token, {
      ...VALID,
      address1: 'Second home, 12 Hill Road',
      state: 'jammu & kashmir',
    });
    assert.equal(punctuation.status, 201);
    assert.equal(punctuation.body.data?.state, 'Jammu and Kashmir');
  });

  it('refuses a state that is not Indian, and a bad PIN code', async () => {
    const token = await signIn(SHOPPER);

    const badState = await addAddress(token, { ...VALID, state: 'Maharastra' });
    assert.equal(badState.status, 422);
    assert.equal(badState.body.error?.code, 'VALIDATION_ERROR');

    const notIndian = await addAddress(token, { ...VALID, state: 'California' });
    assert.equal(notIndian.status, 422);

    const shortPin = await addAddress(token, { ...VALID, pincode: '44001' });
    assert.equal(shortPin.status, 422);

    const leadingZero = await addAddress(token, { ...VALID, pincode: '040001' });
    assert.equal(leadingZero.status, 422);

    const letters = await addAddress(token, { ...VALID, pincode: '4400AB' });
    assert.equal(letters.status, 422);

    const missingLine = await addAddress(token, { ...VALID, address1: '' });
    assert.equal(missingLine.status, 422);
  });

  it('requires both address lines', async () => {
    const token = await signIn(SHOPPER);

    const missingSecond = await addAddress(token, {
      address1: 'Flat 4B, Shanti Residency',
      city: 'Nagpur',
      state: 'Maharashtra',
      pincode: '440001',
    });
    assert.equal(missingSecond.status, 422);
    assert.equal(missingSecond.body.error?.code, 'VALIDATION_ERROR');

    const blankSecond = await addAddress(token, { ...VALID, address2: '   ' });
    assert.equal(blankSecond.status, 422);
  });

  it('rejects an unknown field rather than storing it', async () => {
    const token = await signIn(SHOPPER);
    const res = await addAddress(token, { ...VALID, landmark: 'Near the temple' });

    assert.equal(res.status, 422);
  });

  it('edits an address, but never lets the second line go blank', async () => {
    await AddressModel.deleteMany({});
    const token = await signIn(SHOPPER);
    const created = await addAddress(token, VALID);
    const id = created.body.data!.id;

    const edited = await request<Address>('PATCH', `${API}/addresses/${id}`, {
      token,
      body: { city: 'Pune', pincode: '411001' },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data?.city, 'Pune');
    assert.equal(edited.body.data?.pincode, '411001');
    // Untouched fields survive a partial edit.
    assert.equal(edited.body.data?.address1, VALID.address1);
    assert.equal(edited.body.data?.address2, VALID.address2);

    // Required means required: a blank second line is refused, not cleared.
    const cleared = await request('PATCH', `${API}/addresses/${id}`, {
      token,
      body: { address2: '' },
    });
    assert.equal(cleared.status, 422);

    const moved = await request<Address>('PATCH', `${API}/addresses/${id}`, {
      token,
      body: { address2: 'Sitabuldi Main Road' },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data?.address2, 'Sitabuldi Main Road');

    const empty = await request('PATCH', `${API}/addresses/${id}`, { token, body: {} });
    assert.equal(empty.status, 422);
  });

  it('deletes an address, and 404s the second time', async () => {
    await AddressModel.deleteMany({});
    const token = await signIn(SHOPPER);
    const created = await addAddress(token, VALID);
    const id = created.body.data!.id;

    const removed = await request('DELETE', `${API}/addresses/${id}`, { token });
    assert.equal(removed.status, 200);
    assert.equal(await AddressModel.countDocuments({}), 0);

    const again = await request('DELETE', `${API}/addresses/${id}`, { token });
    assert.equal(again.status, 404);
  });

  it('422s a malformed id instead of failing a database cast', async () => {
    const token = await signIn(SHOPPER);

    const bad = await request('PATCH', `${API}/addresses/not-an-id`, {
      token,
      body: { city: 'Pune' },
    });
    assert.equal(bad.status, 422);
  });

  it('caps the address book', async () => {
    await AddressModel.deleteMany({});
    const token = await signIn(SHOPPER);

    for (let index = 0; index < MAX_ADDRESSES_PER_USER; index += 1) {
      const created = await addAddress(token, { ...VALID, address1: `Flat ${index + 1}, Test Residency` });
      assert.equal(created.status, 201, `address ${index + 1} should be accepted`);
    }

    const overflow = await addAddress(token, VALID);
    assert.equal(overflow.status, 409);
    assert.equal(overflow.body.error?.code, 'CONFLICT');
  });
});

describe('one shopper cannot touch another’s address', () => {
  it('hides the list, the edit and the delete behind ownership', async () => {
    await AddressModel.deleteMany({});

    const mine = await signIn(SHOPPER, 'Ananya Sharma');
    const theirs = await signIn(OTHER, 'Rahul Verma');

    const created = await addAddress(mine, VALID);
    assert.equal(created.status, 201);
    const id = created.body.data!.id;

    // The other shopper starts empty.
    const theirList = await request<Address[]>('GET', `${API}/addresses`, { token: theirs });
    assert.deepEqual(theirList.body.data, []);

    // Reading, editing and deleting a foreign id all look like a missing one.
    const stolen = await request('PATCH', `${API}/addresses/${id}`, {
      token: theirs,
      body: { city: 'Stolen' },
    });
    assert.equal(stolen.status, 404);

    const stolenDelete = await request('DELETE', `${API}/addresses/${id}`, { token: theirs });
    assert.equal(stolenDelete.status, 404);

    // And the owner's address is untouched.
    const stillMine = await request<Address[]>('GET', `${API}/addresses`, { token: mine });
    assert.equal(stillMine.body.data?.[0].city, 'Nagpur');
  });
});
