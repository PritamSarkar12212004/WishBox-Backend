/**
 * Puts the shop's opening catalogue into MongoDB.
 *
 * Run with: npm run catalog:seed
 *
 * The storefront has no catalogue of its own any more - `GET /products` reads
 * this collection and the admin panel writes it - so a fresh database has an
 * empty shop until this runs once.
 *
 * Idempotent by design: a product is matched on its slug and its *content* is
 * updated, while the fields an admin owns after launch (stock, availability,
 * visibility) are only written when the row is first inserted. Re-running after
 * a copy change therefore fixes descriptions without putting sold-out stock
 * back on the shelf.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createChildLogger } from '../src/config/logger.js';
import { AdminCouponModel } from '../src/modules/admin/models/coupon.model.js';
import { CategoryModel } from '../src/modules/categories/categories.model.js';
import { ProductModel } from '../src/modules/products/products.model.js';
import {
  CATALOG_CATEGORY_SEED,
  CATALOG_COUPON_SEED,
  CATALOG_PRODUCT_SEED,
} from '../src/modules/products/products.seed.js';

const log = createChildLogger('catalog-seed');

async function main(): Promise<void> {
  const startedAt = Date.now();
  await connectDatabase();

  for (const category of CATALOG_CATEGORY_SEED) {
    await CategoryModel.updateOne(
      { slug: category.slug },
      { $set: { label: category.label, sortOrder: category.sortOrder } },
      { upsert: true },
    );
  }

  for (const product of CATALOG_PRODUCT_SEED) {
    // Fields a shopkeeper changes through the panel, and which must survive a
    // reseed: the catalogue seed only writes them on insert.
    const { stock, available, hidden, rating, reviewCount, ...content } = product;

    await ProductModel.updateOne(
      { slug: product.slug },
      {
        $set: content,
        $setOnInsert: { stock, available, hidden, rating, reviewCount },
      },
      { upsert: true },
    );
  }

  for (const coupon of CATALOG_COUPON_SEED) {
    await AdminCouponModel.updateOne(
      { code: coupon.code },
      {
        $set: {
          label: coupon.label,
          kind: coupon.kind,
          value: coupon.value,
          minOrder: coupon.minOrder,
          status: 'Active',
        },
        $setOnInsert: { expiresOn: '', used: 0, discountGiven: 0 },
      },
      { upsert: true },
    );
  }

  log.info(
    {
      categories: CATALOG_CATEGORY_SEED.length,
      products: CATALOG_PRODUCT_SEED.length,
      coupons: CATALOG_COUPON_SEED.length,
      durationMs: Date.now() - startedAt,
    },
    'Catalogue seeded',
  );

  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  log.error(
    { message: error instanceof Error ? error.message : String(error) },
    'Catalogue seed failed',
  );
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
