/**
 * Tests for the Cloudinary image-storage service.
 *
 * Two things here are worth guarding, because both fail *silently* in
 * production rather than loudly: the signature (a payload whose signature does
 * not match its own parameters is rejected by Cloudinary with a message that
 * does not say which parameter drifted) and the retry split (a refusal must not
 * be retried, an unreachable host must be).
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.CLOUDINARY_CLOUD_NAME = 'dftt4ow6q';
process.env.CLOUDINARY_API_KEY = 'test-api-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
process.env.CLOUDINARY_FOLDER = 'wishbox';

const { httpClient } = await import('../src/shared/httpClient.js');
const { createHttpMock } = await import('./helpers/http-mock.js');
const {
  CloudinaryUploadError,
  apiBaseUrl,
  buildUploadSignature,
  cloudinaryConfig,
  deliveryUrl,
  destroyImage,
  isConfigured,
  requireCredentials,
  resourceUrl,
  signedPayload,
  uploadImage,
} = await import('../src/services/cloudinary/index.js');

const mock = createHttpMock(httpClient);
const UPLOAD_URL = resourceUrl('upload');
const DESTROY_URL = resourceUrl('destroy');

const ASSET = {
  public_id: 'wishbox/photo',
  url: 'http://res.cloudinary.com/dftt4ow6q/image/upload/v1/wishbox/photo.png',
  secure_url: 'https://res.cloudinary.com/dftt4ow6q/image/upload/v1/wishbox/photo.png',
  format: 'png',
  bytes: 2048,
  width: 800,
  height: 600,
  resource_type: 'image',
  created_at: '2026-10-06T00:00:00Z',
};

const DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

beforeEach(() => mock.reset());

after(() => mock.restore());

describe('cloudinary config', () => {
  it('resolves the product environment and endpoints', () => {
    assert.equal(isConfigured(), true);
    assert.equal(cloudinaryConfig.cloudName, 'dftt4ow6q');
    assert.equal(cloudinaryConfig.folder, 'wishbox');
    assert.equal(apiBaseUrl(), 'https://api.cloudinary.com/v1_1/dftt4ow6q');
    assert.equal(resourceUrl('upload'), `${apiBaseUrl()}/image/upload`);
    assert.equal(resourceUrl('destroy', 'image'), `${apiBaseUrl()}/image/destroy`);
    assert.equal(
      deliveryUrl('wishbox/photo'),
      'https://res.cloudinary.com/dftt4ow6q/image/upload/wishbox/photo',
    );
  });

  it('hands the key and secret to a signed call', () => {
    assert.deepEqual(requireCredentials(), {
      apiKey: 'test-api-key',
      apiSecret: 'test-secret',
    });
  });
});

describe('signing', () => {
  it('matches the provider’s recipe', () => {
    // Computed independently of the implementation:
    //   sha1('folder=wishbox&timestamp=1759000000' + 'test-secret')
    assert.equal(
      buildUploadSignature({ folder: 'wishbox', timestamp: 1759000000 }, 'test-secret'),
      'e22ec562b6e89b9af77fc877c97b1bd9ea8838ba',
    );
  });

  it('excludes the parameters Cloudinary excludes', () => {
    const full = buildUploadSignature(
      {
        file: DATA_URI,
        api_key: 'test-api-key',
        resource_type: 'image',
        cloud_name: 'dftt4ow6q',
        signature: 'nonsense',
        folder: 'wishbox',
      },
      'test-secret',
    );

    assert.equal(full, buildUploadSignature({ folder: 'wishbox' }, 'test-secret'));
  });

  it('does not depend on parameter order, and drops blanks', () => {
    const a = buildUploadSignature({ folder: 'wishbox', public_id: 'x', timestamp: 1 }, 's');
    const b = buildUploadSignature({ timestamp: 1, public_id: 'x', folder: 'wishbox' }, 's');
    assert.equal(a, b);

    // A blank parameter must not leave a trailing `key=` in the signed string.
    assert.equal(
      buildUploadSignature({ folder: 'wishbox', public_id: '' }, 's'),
      buildUploadSignature({ folder: 'wishbox' }, 's'),
    );
  });

  it('changes when the secret changes', () => {
    const params = { folder: 'wishbox', timestamp: 1759000000 };
    assert.notEqual(
      buildUploadSignature(params, 'test-secret'),
      buildUploadSignature(params, 'another-secret'),
    );
  });

  it('packages a payload that carries the key and the signature', () => {
    const payload = signedPayload('test-secret', 'test-api-key', {
      folder: 'wishbox',
      timestamp: 1759000000,
      public_id: '',
      eager: true,
    });

    assert.equal(payload.api_key, 'test-api-key');
    assert.equal(payload.folder, 'wishbox');
    // Booleans are sent as their string form, which is what was hashed.
    assert.equal(payload.eager, 'true');
    assert.equal('public_id' in payload, false);

    // The signature is over the params, not over the api_key.
    assert.equal(
      payload.signature,
      buildUploadSignature({ folder: 'wishbox', timestamp: 1759000000, eager: true }, 'test-secret'),
    );
  });
});

describe('uploadImage', () => {
  it('uploads a signed payload and returns the stored asset', async () => {
    mock.onPost(UPLOAD_URL).reply((config) => {
      const body = JSON.parse(String(config.data)) as Record<string, unknown>;

      // The signature must agree with the payload's own parameters, or
      // Cloudinary rejects the request without saying which one drifted.
      const { signature, api_key: _apiKey, file: _file, ...signed } = body;
      const expected = createHash('sha1')
        .update(
          `${Object.entries(signed)
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('&')}test-secret`,
        )
        .digest('hex');

      assert.equal(signature, expected);
      assert.equal(body.file, DATA_URI);
      assert.equal(body.api_key, 'test-api-key');
      assert.equal(body.folder, 'wishbox');
      assert.ok(Number(body.timestamp) > 0);

      return [200, ASSET];
    });

    const uploaded = await uploadImage({ file: DATA_URI });

    assert.equal(uploaded.publicId, 'wishbox/photo');
    assert.equal(uploaded.secureUrl, ASSET.secure_url);
    assert.equal(uploaded.format, 'png');
    assert.equal(uploaded.bytes, 2048);
    assert.equal(uploaded.width, 800);
    assert.equal(uploaded.resourceType, 'image');
  });

  it('honours a folder and tags override', async () => {
    mock.onPost(UPLOAD_URL).reply((config) => {
      const body = JSON.parse(String(config.data)) as Record<string, unknown>;
      assert.equal(body.folder, 'products/paper');
      assert.equal(body.tags, 'paper,catalogue');
      return [200, ASSET];
    });

    await uploadImage({ file: DATA_URI, folder: 'products/paper', tags: ['paper', '', 'catalogue'] });
  });

  it('keeps a caller-named folder from landing twice in the public id', async () => {
    // Cloudinary prepends `folder` to the `public_id` it is given, so an id that
    // already starts with it would nest: `wishbox/wishbox/photo`.
    mock.onPost(UPLOAD_URL).reply((config) => {
      const body = JSON.parse(String(config.data)) as Record<string, unknown>;
      assert.equal(body.folder, 'wishbox');
      assert.equal(body.public_id, 'photo');
      return [200, ASSET];
    });
    await uploadImage({ file: DATA_URI, publicId: 'wishbox/photo' });

    // A deeper path keeps everything below the folder it is told to use.
    mock.reset();
    mock.onPost(UPLOAD_URL).reply((config) => {
      const body = JSON.parse(String(config.data)) as Record<string, unknown>;
      assert.equal(body.folder, 'products/paper');
      assert.equal(body.public_id, 'sheets/a4');
      return [200, ASSET];
    });
    await uploadImage({ file: DATA_URI, folder: 'products/paper', publicId: 'products/paper/sheets/a4' });

    // An id that has nothing to do with the folder is left exactly as asked.
    mock.reset();
    mock.onPost(UPLOAD_URL).reply((config) => {
      const body = JSON.parse(String(config.data)) as Record<string, unknown>;
      assert.equal(body.public_id, 'paper');
      return [200, ASSET];
    });
    await uploadImage({ file: DATA_URI, publicId: 'paper' });
  });

  it('surfaces Cloudinary’s own message and does not retry a refusal', async () => {
    let attempts = 0;
    mock.onPost(UPLOAD_URL).reply(() => {
      attempts += 1;
      return [400, { error: { message: 'Upload preset not found' } }];
    });

    const failure = await uploadImage({ file: DATA_URI }).catch((error: unknown) => error);

    assert.ok(failure instanceof CloudinaryUploadError);
    assert.equal(failure.message, 'Upload preset not found');
    assert.equal(failure.statusCode, 502);
    assert.equal((failure.details as { statusCode?: number }).statusCode, 400);
    // A refusal cannot be fixed by trying again.
    assert.equal(attempts, 1);
  });

  it('retries an unreachable host and then reports it', async () => {
    let attempts = 0;
    mock.onPost(UPLOAD_URL).reply(() => {
      attempts += 1;
      throw new Error('ECONNREFUSED');
    });

    const failure = await uploadImage({ file: DATA_URI }).catch((error: unknown) => error);

    assert.ok(failure instanceof CloudinaryUploadError);
    assert.equal(failure.message, 'Could not reach Cloudinary');
    assert.equal(attempts, 2);
  });

  it('refuses nothing to upload', async () => {
    await assert.rejects(() => uploadImage({ file: '   ' }), CloudinaryUploadError);
  });
});

describe('destroyImage', () => {
  it('deletes by public id with a signature', async () => {
    mock.onPost(DESTROY_URL).reply((config) => {
      const body = JSON.parse(String(config.data)) as Record<string, unknown>;
      assert.equal(body.public_id, 'wishbox/photo');
      assert.equal(body.api_key, 'test-api-key');
      assert.equal(body.signature, buildUploadSignature(
        { public_id: 'wishbox/photo', timestamp: Number(body.timestamp) },
        'test-secret',
      ));
      return [200, { result: 'ok' }];
    });

    const removed = await destroyImage('wishbox/photo');

    assert.equal(removed.result, 'ok');
  });

  it('passes a provider "not found" straight through', async () => {
    mock.onPost(DESTROY_URL).reply(200, { result: 'not found' });

    assert.equal((await destroyImage('gone')).result, 'not found');
  });

  it('needs a public id', async () => {
    await assert.rejects(() => destroyImage(''), CloudinaryUploadError);
  });
});
