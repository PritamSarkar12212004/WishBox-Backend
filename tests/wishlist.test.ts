/**
 * Service-level tests for the wishlist.
 *
 * The storefront keeps a local copy, so the two things that must hold here are:
 * a shopper's saves are one row per product (saving twice is not two saves), and
 * the admin report joins them to real names rather than ids. The HTTP routes
 * above these functions are thin wrappers around the same calls.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('wishbox-wishlist-test');

const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
const { UserModel } = await import('../src/modules/user/user.model.js');
const { ProductModel } = await import('../src/modules/products/products.model.js');
const { WishlistEntryModel } = await import('../src/modules/wishlist/wishlist.model.js');
const { listAllSaves, listMyWishlist, removeProduct, saveProduct } = await import(
  '../src/modules/wishlist/wishlist.service.js'
);

const SLUG = 'handmade-paper-ribbon';
const OTHER_SLUG = 'pressed-flower-card';

async function seedProduct(slug: string, name: string) {
  await ProductModel.create({
    slug,
    sku: `SKU-${slug}`.toUpperCase().slice(0, 32),
    name,
    brand: 'WishBox',
    category: 'paper',
    rating: 4.6,
    reviewCount: 12,
    price: 249,
    mrp: 299,
    available: true,
    hidden: false,
    stock: 40,
    image: '/images/product.jpg',
    hoverImage: '/images/product-2.jpg',
    gallery: [],
    description: 'Handmade paper.',
    highlights: [],
  });
}

type UserDocument = import('../src/modules/user/user.model.js').UserDocument;

let asha: UserDocument;
let rohan: UserDocument;

before(async () => {
  await connectDatabase();

  await seedProduct(SLUG, 'Handmade Paper Ribbon');
  await seedProduct(OTHER_SLUG, 'Pressed Flower Card');

  asha = await UserModel.create({ name: 'Asha', phone: '9876500031' });
  rohan = await UserModel.create({ name: 'Rohan', phone: '9876500032' });
});

after(async () => {
  await disconnectDatabase();
  await mongod.stop();
});

describe('wishlist persistence', () => {
  it('records one save per shopper per product, however many times it is sent', async () => {
    await saveProduct(asha, SLUG);
    await saveProduct(asha, SLUG);

    assert.deepEqual(await listMyWishlist(asha), [SLUG]);
    assert.equal(await WishlistEntryModel.countDocuments({ userId: asha._id }), 1);
  });

  it('keeps each shopper’s list to their own account', async () => {
    await saveProduct(rohan, SLUG);
    await saveProduct(rohan, OTHER_SLUG);

    assert.deepEqual(await listMyWishlist(rohan), [OTHER_SLUG, SLUG]);
    assert.deepEqual(await listMyWishlist(asha), [SLUG]);
  });

  it('removes only the caller’s save, and never fails on a repeat', async () => {
    await removeProduct(rohan, SLUG);
    await removeProduct(rohan, SLUG);

    assert.deepEqual(await listMyWishlist(rohan), [OTHER_SLUG]);
    assert.deepEqual(await listMyWishlist(asha), [SLUG]);
  });

  it('refuses a product that does not exist', async () => {
    await assert.rejects(() => saveProduct(asha, 'not-a-product'), /was not found/);
  });

  it('reports every save with the product and the shopper joined in', async () => {
    const saves = await listAllSaves();

    assert.equal(saves.length, 2);
    const ribbon = saves.find((entry) => entry.productId === SLUG);
    assert.equal(ribbon?.name, 'Handmade Paper Ribbon');
    assert.equal(ribbon?.customer, 'Asha');
    assert.equal(ribbon?.phone, '9876500031');
    assert.equal(ribbon?.available, true);
    assert.ok((ribbon?.savedAt ?? 0) > 0);

    const card = saves.find((entry) => entry.productId === OTHER_SLUG);
    assert.equal(card?.customer, 'Rohan');
  });
});
