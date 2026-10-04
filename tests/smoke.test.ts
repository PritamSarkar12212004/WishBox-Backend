/**
 * Smoke tests for the HTTP layer. These boot the real Express app on an
 * ephemeral port without connecting to MongoDB, so they verify the
 * middleware stack, response envelope, 404 handling and security headers.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/app.js');

let server: Server;
let baseUrl: string;

before(async () => {
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('HTTP layer', () => {
  it('responds on the root route with the standard envelope', async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = (await res.json()) as Record<string, unknown>;

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.error, null);
    assert.equal((body.data as { name: string }).name, 'Wishbox API');
    assert.equal(typeof body.timestamp, 'string');
  });

  it('exposes a request id on the header and in the body', async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = (await res.json()) as Record<string, unknown>;

    assert.equal(res.headers.get('x-request-id'), body.requestId);
    assert.ok(body.requestId);
  });

  it('returns 503 from /health when the database is not connected', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string } | null;
      data: unknown;
    };

    assert.equal(res.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.error?.code, 'SERVICE_UNAVAILABLE');
  });

  it('returns 404 with a NOT_FOUND error code for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/definitely-not-a-route`);
    const body = (await res.json()) as { success: boolean; error: { code: string } | null };

    assert.equal(res.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error?.code, 'NOT_FOUND');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not valid json',
    });
    const body = (await res.json()) as { success: boolean; error: { code: string } | null };

    assert.equal(res.status, 400);
    assert.equal(body.error?.code, 'BAD_REQUEST');
  });

  it('sets helmet security headers', async () => {
    const res = await fetch(`${baseUrl}/`);

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('reflects an allowed CORS origin', async () => {
    const origin = 'http://localhost:5173';
    const res = await fetch(`${baseUrl}/`, { headers: { origin } });

    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  });
});
