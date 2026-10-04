/**
 * Unit tests for the WhatsApp / SMS delivery adapters.
 *
 * The outbound HTTP call is stubbed, so these assert the exact request Twilio
 * would receive (URL, Basic auth, WhatsApp prefixes, body) and that a rejected
 * message surfaces as a clean 502 instead of leaking provider internals.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused-by-this-test';
process.env.WHATSAPP_PROVIDER = 'twilio';
process.env.AUTH_CHANNEL = 'whatsapp';
process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
process.env.TWILIO_AUTH_TOKEN = 'secret-token';
process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';
process.env.TWILIO_SMS_FROM = '+15005550006';

const { getWhatsAppProvider, toE164, buildOtpMessage, sendOtpCode } = await import(
  '../src/services/whatsapp/index.js'
);
const { isAppError } = await import('../src/shared/errors.js');

const realFetch = globalThis.fetch;
let captured: { url: string; init: RequestInit } | null = null;

function stubFetch(response: Response) {
  captured = null;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    captured = { url: String(input), init: init ?? {} };
    return response;
  }) as typeof fetch;
}

function okResponse(): Response {
  return new Response(JSON.stringify({ sid: 'SM123', status: 'queued' }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
  captured = null;
});

describe('phone and message formatting', () => {
  it('adds the Indian country code once', () => {
    assert.equal(toE164('9876543210'), '+919876543210');
    assert.equal(toE164('+919876543210'), '+919876543210');
  });

  it('builds a message containing the code and the expiry', () => {
    const message = buildOtpMessage('483920');
    assert.ok(message.includes('483920'));
    assert.ok(message.includes('5 minutes'));
  });
});

describe('TwilioWhatsAppProvider', () => {
  it('posts a WhatsApp message with Basic auth and prefixed numbers', async () => {
    stubFetch(okResponse());

    await getWhatsAppProvider().send({
      to: '+919876543210',
      body: '483920 is your code',
      channel: 'whatsapp',
    });

    assert.ok(captured, 'fetch should have been called');
    assert.equal(
      captured.url,
      'https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json',
    );

    const headers = captured.init.headers as Record<string, string>;
    assert.equal(
      headers.Authorization,
      `Basic ${Buffer.from('ACtest123:secret-token').toString('base64')}`,
    );
    assert.match(headers['Content-Type'], /x-www-form-urlencoded/);

    const form = new URLSearchParams(String(captured.init.body));
    assert.equal(form.get('To'), 'whatsapp:+919876543210');
    assert.equal(form.get('From'), 'whatsapp:+14155238886');
    assert.equal(form.get('Body'), '483920 is your code');
  });

  it('posts a plain SMS when the sms channel is selected', async () => {
    stubFetch(okResponse());

    await getWhatsAppProvider().send({ to: '+919876543210', body: 'code', channel: 'sms' });

    const form = new URLSearchParams(String(captured?.init.body));
    assert.equal(form.get('To'), '+919876543210');
    assert.equal(form.get('From'), '+15005550006');
  });

  it('routes the whole sendOtpCode helper over WhatsApp by default', async () => {
    stubFetch(okResponse());

    await sendOtpCode('9876543210', '483920');

    const form = new URLSearchParams(String(captured?.init.body));
    assert.equal(form.get('To'), 'whatsapp:+919876543210');
    assert.ok(String(form.get('Body')).includes('483920'));
  });

  it('does not double-prefix a sender that already has whatsapp:', async () => {
    stubFetch(okResponse());

    await getWhatsAppProvider().send({ to: '+919876543210', body: 'code', channel: 'whatsapp' });

    const form = new URLSearchParams(String(captured?.init.body));
    assert.equal(form.get('From'), 'whatsapp:+14155238886');
  });

  it('turns a provider rejection into a 502 without leaking the body', async () => {
    stubFetch(
      new Response(JSON.stringify({ message: 'Authenticate', code: 20003 }), { status: 401 }),
    );

    await assert.rejects(
      () => getWhatsAppProvider().send({ to: '+919876543210', body: 'code', channel: 'whatsapp' }),
      (error: unknown) => {
        assert.ok(isAppError(error), 'expected an AppError');
        assert.equal(error.statusCode, 502);
        assert.equal(error.code, 'WHATSAPP_DELIVERY_FAILED');
        assert.ok(!error.message.includes('20003'), 'provider detail must not leak');
        return true;
      },
    );
  });

  it('turns a network failure into a 502', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;

    await assert.rejects(
      () => getWhatsAppProvider().send({ to: '+919876543210', body: 'code', channel: 'whatsapp' }),
      (error: unknown) => isAppError(error) && error.statusCode === 502,
    );
  });
});
