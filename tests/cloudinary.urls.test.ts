/**
 * Reading a public id back out of a stored delivery URL.
 *
 * Deleting an image that a product no longer uses depends entirely on this
 * translation, and the cost of getting it wrong is asymmetric: a missed id
 * leaves one orphaned asset, a *wrong* id deletes somebody else's picture. So the
 * refusals matter as much as the successes, and they are what most of this file
 * is about.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.CLOUDINARY_CLOUD_NAME = 'dftt4ow6q';

const { isStoredAsset, publicIdFromDeliveryUrl } = await import(
  '../src/services/cloudinary/index.js'
);

const CLOUD = 'dftt4ow6q';

describe('publicIdFromDeliveryUrl', () => {
  it('reads a plain product upload', () => {
    assert.equal(
      publicIdFromDeliveryUrl(
        `https://res.cloudinary.com/${CLOUD}/image/upload/v1789112613/wishbox/paper.jpg`,
      ),
      'wishbox/paper',
    );
  });

  it('ignores a transformation segment in front of the version', () => {
    // Cloudinary can be asked for a resized variant; the asset behind it is the
    // same one, and it is still the one to delete.
    assert.equal(
      publicIdFromDeliveryUrl(
        `https://res.cloudinary.com/${CLOUD}/image/upload/w_600,h_750,c_fill/v1789112613/wishbox/paper.jpg`,
      ),
      'wishbox/paper',
    );
  });

  it('keeps nested folders and hyphens intact', () => {
    assert.equal(
      publicIdFromDeliveryUrl(
        `https://res.cloudinary.com/${CLOUD}/image/upload/v1/wishbox/products/2026/premium-paper.webp`,
      ),
      'wishbox/products/2026/premium-paper',
    );
  });

  it('recognises video and raw assets', () => {
    assert.equal(
      publicIdFromDeliveryUrl(`https://res.cloudinary.com/${CLOUD}/video/upload/v9/wishbox/promo.mp4`),
      'wishbox/promo',
    );
    // `raw` public ids include the extension, so it stays.
    assert.equal(
      publicIdFromDeliveryUrl(`https://res.cloudinary.com/${CLOUD}/raw/upload/v9/wishbox/notes.pdf`),
      'wishbox/notes.pdf',
    );
  });

  it('refuses another cloud, so a foreign asset is never deleted', () => {
    assert.equal(
      publicIdFromDeliveryUrl('https://res.cloudinary.com/someone-else/image/upload/v1/wishbox/paper.jpg'),
      null,
    );
  });

  it('refuses anything that is not an https Cloudinary URL', () => {
    assert.equal(
      publicIdFromDeliveryUrl(`http://res.cloudinary.com/${CLOUD}/image/upload/v1/wishbox/paper.jpg`),
      null,
    );
    assert.equal(
      publicIdFromDeliveryUrl('https://images.unsplash.com/photo-1586075010923?w=600'),
      null,
    );
    assert.equal(publicIdFromDeliveryUrl('data:image/png;base64,iVBORw0KGgo='), null);
    assert.equal(publicIdFromDeliveryUrl('not a url at all'), null);
    assert.equal(publicIdFromDeliveryUrl('   '), null);
  });

  it('refuses a URL with no version segment rather than guessing', () => {
    // Without `v…` there is no way to tell a transformation from a folder name,
    // so this is left alone.
    assert.equal(
      publicIdFromDeliveryUrl(`https://res.cloudinary.com/${CLOUD}/image/upload/wishbox/paper.jpg`),
      null,
    );
    assert.equal(
      publicIdFromDeliveryUrl(`https://res.cloudinary.com/${CLOUD}/image/upload/v1`),
      null,
    );
  });

  it('refuses a non-upload action', () => {
    assert.equal(
      publicIdFromDeliveryUrl(
        `https://res.cloudinary.com/${CLOUD}/image/fetch/v1/wishbox/paper.jpg`,
      ),
      null,
    );
  });

  it('reports whether a URL is one of ours', () => {
    assert.equal(
      isStoredAsset(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/wishbox/paper.jpg`),
      true,
    );
    assert.equal(isStoredAsset('https://images.unsplash.com/photo-1'), false);
  });

  it('accepts an explicit cloud name, and refuses everything when there is none', () => {
    const url = 'https://res.cloudinary.com/other-cloud/image/upload/v1/wishbox/paper.jpg';
    assert.equal(publicIdFromDeliveryUrl(url, 'other-cloud'), 'wishbox/paper');
    assert.equal(publicIdFromDeliveryUrl(url, ''), null);
  });
});
