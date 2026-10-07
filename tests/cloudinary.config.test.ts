/**
 * The Cloudinary service with no API secret set.
 *
 * This is the state the repo ships in (the secret is deliberately absent), so it
 * must be safe: a signed operation has to fail with a 503 that *names* the
 * missing key rather than half-uploading, and it must never reach the network.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.CLOUDINARY_CLOUD_NAME = 'dftt4ow6q';
process.env.CLOUDINARY_API_KEY = 'test-api-key';
// The one that matters: signing is impossible without it.
process.env.CLOUDINARY_API_SECRET = '';
process.env.CLOUDINARY_FOLDER = 'wishbox';

const { httpClient } = await import('../src/shared/httpClient.js');
const { createHttpMock } = await import('./helpers/http-mock.js');
const {
  CloudinaryNotConfiguredError,
  isConfigured,
  missingCredentials,
  requireCredentials,
  storeImage,
  uploadImage,
} = await import('../src/services/cloudinary/index.js');

const mock = createHttpMock(httpClient);

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

describe('cloudinary without an API secret', () => {
  it('reports itself unconfigured and names what is missing', () => {
    assert.equal(isConfigured(), false);
    assert.deepEqual(missingCredentials(), ['CLOUDINARY_API_SECRET']);
  });

  it('refuses to sign, with a 503 that names the missing key', () => {
    assert.throws(
      () => requireCredentials(),
      (error: unknown) => {
        assert.ok(error instanceof CloudinaryNotConfiguredError);
        assert.equal(error.statusCode, 503);
        assert.equal(error.code, 'CLOUDINARY_NOT_CONFIGURED');
        assert.match(error.message, /CLOUDINARY_API_SECRET/);
        return true;
      },
    );
  });

  it('keeps uploads off without touching the network', async () => {
    mock.reset();

    await assert.rejects(() => uploadImage({ file: DATA_URI }), CloudinaryNotConfiguredError);
    await assert.rejects(() => storeImage({ file: DATA_URI }), CloudinaryNotConfiguredError);

    assert.equal(mock.history.post.length, 0);
    mock.restore();
  });
});
