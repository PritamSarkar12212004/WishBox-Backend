
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import { createHttpMock } from './helpers/http-mock.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused-by-this-test';
process.env.SMS_API_URL = 'https://gateway.test/api/messaging/messages/send';
process.env.SMS_API_TOKEN = 'test-gateway-token';
process.env.SMS_API_VARIABLES_KEY = 'code';
process.env.SMS_OTP_TEMPLATE_ID = 'otp-template-id';
process.env.SMS_BOOKING_TEMPLATE_ID = 'booking-template-id';
process.env.SMS_ADMIN_TEMPLATE_ID = '';
process.env.SMS_BOOKING_API_URL = '';
process.env.SMS_MEDIA_URL = 'https://cdn.test/header.jpg';
process.env.SMS_TIMEOUT_MS = '5000';
process.env.SMS_MAX_ATTEMPTS = '2';

const { sendOtpCode } = await import('../src/services/whatsapp/index.js');
const { sendTemplateNotification } = await import(
  '../src/services/whatsapp/gateway/notifications.js'
);
const { toGatewayNumber, maskNumber } = await import(
  '../src/services/whatsapp/gateway/phone.js'
);
const { templateIdFor } = await import('../src/services/whatsapp/gateway/templates.js');
const { httpClient } = await import('../src/shared/httpClient.js');
const { isAppError } = await import('../src/shared/errors.js');

const GATEWAY_URL = 'https://gateway.test/api/messaging/messages/send';

const mock = createHttpMock(httpClient);

interface GatewayPayload {
  to: string;
  template: string;
  variables: Record<string, string>;
  media: { url: string };
}

function firstPayload(): GatewayPayload {
  const request = mock.history.post[0];
  assert.ok(request, 'no request was recorded');
  return JSON.parse(String(request.data)) as GatewayPayload;
}

function firstHeaders(): Record<string, unknown> {
  return (mock.history.post[0]?.headers ?? {}) as Record<string, unknown>;
}

/** The storefront sends a bare ten-digit number, as the login modal does. */
const sendCode = (code = '483920') => sendOtpCode('9876543210', code);

afterEach(() => {
  mock.reset();
});

after(() => {
  mock.restore();
});

describe('gateway number formatting', () => {
  it('prefixes the country code for a local number', () => {
    assert.equal(toGatewayNumber('9876543210'), '919876543210');
  });

  it('keeps an E.164 number as digits with the country code', () => {
    assert.equal(toGatewayNumber('+919876543210'), '919876543210');
  });

  it('does not mistake a subscriber number starting with 91 for a prefixed one', () => {
    // 9198765432 is a valid ten-digit Indian mobile number.
    assert.equal(toGatewayNumber('9198765432'), '919198765432');
  });

  it('masks all but the last four digits for logs', () => {
    assert.equal(maskNumber('+919876543210'), '********3210');
  });
});

describe('template ids', () => {
  it('uses the configured OTP template', () => {
    assert.equal(templateIdFor('otp'), 'otp-template-id');
  });

  it('falls back to the booking template when the admin one is blank', () => {
    assert.equal(templateIdFor('admin'), 'booking-template-id');
  });

  it('lets a caller override the template', () => {
    assert.equal(templateIdFor('booking', ' custom-id '), 'custom-id');
  });
});

describe('sendOtpCode', () => {
  it('posts the OTP template with the code in a variable slot', async () => {
    mock.onPost(GATEWAY_URL).reply(200, { message: 'queued', id: 'msg_1' });

    await sendCode();

    assert.equal(mock.history.post.length, 1);
    assert.equal(String(mock.history.post[0]?.url), GATEWAY_URL);

    const headers = firstHeaders();
    assert.equal(headers.Authorization, 'Bearer test-gateway-token');
    assert.match(String(headers['Content-Type']), /application\/json/);

    const payload = firstPayload();
    assert.equal(payload.to, '919876543210');
    assert.equal(payload.template, 'otp-template-id');
    assert.deepEqual(payload.variables, { code: '483920' });
    // The gateway rejects a template whose header media is missing.
    assert.equal(payload.media.url, 'https://cdn.test/header.jpg');
  });

  it('accepts an E.164 number from the API layer', async () => {
    mock.onPost(GATEWAY_URL).reply(200, { message: 'queued' });

    await sendOtpCode('+919876543210', '111222');

    const payload = firstPayload();
    assert.equal(payload.to, '919876543210');
    assert.deepEqual(payload.variables, { code: '111222' });
  });

  it('sends the payload as a JSON string body', async () => {
    mock.onPost(GATEWAY_URL).reply(200, { message: 'queued' });

    await sendCode();

    assert.equal(typeof mock.history.post[0]?.data, 'string');
  });

  it('throws a 502 when the gateway rejects the code', async () => {
    mock.onPost(GATEWAY_URL).reply(400, { error: 'template not found' });

    await assert.rejects(
      () => sendCode(),
      (error: unknown) => {
        assert.ok(isAppError(error), 'expected an AppError');
        assert.equal(error.statusCode, 502);
        assert.equal(error.code, 'WHATSAPP_DELIVERY_FAILED');
        assert.ok(!error.message.includes('template not found'), 'gateway body must not leak');
        return true;
      },
    );
  });

  it('does not retry a rejection, only a network failure', async () => {
    mock.onPost(GATEWAY_URL).reply(400, { error: 'nope' });

    await assert.rejects(() => sendCode());

    assert.equal(mock.history.post.length, 1, 'a 4xx must not be retried');
  });

  it('retries a network failure once, then throws a 502', async () => {
    mock.onPost(GATEWAY_URL).networkError();

    await assert.rejects(
      () => sendCode(),
      (error: unknown) => isAppError(error) && error.statusCode === 502,
    );

    assert.equal(mock.history.post.length, 2, 'SMS_MAX_ATTEMPTS=2 means two attempts');
  });
});

describe('sendTemplateNotification', () => {
  it('sends the booking template and returns the result', async () => {
    mock.onPost(GATEWAY_URL).reply(200, { message: 'queued' });

    const result = await sendTemplateNotification({
      phone: '9876543210',
      variables: { name: 'Ananya', hall: 'Grand Hall' },
      label: 'booking',
    });

    assert.equal(result.success, true);

    const payload = firstPayload();
    assert.equal(payload.to, '919876543210');
    assert.equal(payload.template, 'booking-template-id');
    assert.deepEqual(payload.variables, { name: 'Ananya', hall: 'Grand Hall' });
  });

  it('never throws when the gateway fails', async () => {
    mock.onPost(GATEWAY_URL).reply(500, { error: 'boom' });

    const result = await sendTemplateNotification({
      phone: '9876543210',
      variables: {},
      label: 'booking',
    });

    assert.equal(result.success, false);
    assert.equal(result.statusCode, 500);
  });

  it('never throws when the gateway is unreachable', async () => {
    mock.onPost(GATEWAY_URL).networkError();

    const result = await sendTemplateNotification({
      phone: '9876543210',
      variables: {},
    });

    assert.equal(result.success, false);
    assert.ok(result.message);
  });

  it('still rejects a missing phone number', async () => {
    await assert.rejects(
      () => sendTemplateNotification({ phone: '', variables: {} }),
      (error: unknown) => isAppError(error) && error.statusCode === 400,
    );
  });
});
