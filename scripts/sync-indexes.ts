/**
 * Creates every collection's indexes.
 *
 * Run with: npm run db:indexes
 *
 * Mongoose's `autoIndex` is off in production on purpose - building an index on
 * every boot is a surprise for a live database - so the indexes a model declares
 * (unique slugs, unique coupon codes, the account/order lookups) have to be
 * created once, deliberately, when a database is provisioned or a deploy adds
 * one. This is that step: idempotent, safe to re-run, and it reports what it
 * found rather than silently doing nothing.
 *
 * `syncIndexes()` also drops indexes that no longer exist on the model, so a
 * renamed or removed index does not linger.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createChildLogger } from '../src/config/logger.js';
import { AddressModel } from '../src/modules/addresses/addresses.model.js';
import { AdminCouponModel } from '../src/modules/admin/models/coupon.model.js';
import { AdminCustomerModel } from '../src/modules/admin/models/customer.model.js';
import { AdminOrderModel } from '../src/modules/admin/models/order.model.js';
import { AdminRestockModel } from '../src/modules/admin/models/restock.model.js';
import { AdminReturnModel } from '../src/modules/admin/models/return.model.js';
import { AdminReviewModel } from '../src/modules/admin/models/review.model.js';
import { AdminSettingModel } from '../src/modules/admin/models/setting.model.js';
import { OtpModel } from '../src/modules/auth/otp.model.js';
import { CategoryModel } from '../src/modules/categories/categories.model.js';
import { AdditionalCatalogueFileModel } from '../src/modules/categories/categories.additional-file.model.js';
import { SiteContentModel } from '../src/modules/content/content.model.js';
import { CounterModel } from '../src/modules/orders/orders.model.js';
import { ProductModel } from '../src/modules/products/products.model.js';
import { UserModel } from '../src/modules/user/user.model.js';

const log = createChildLogger('db-indexes');

const MODELS = [
  AddressModel,
  AdminCouponModel,
  AdminCustomerModel,
  AdminOrderModel,
  AdminRestockModel,
  AdminReturnModel,
  AdminReviewModel,
  AdminSettingModel,
  CategoryModel,
  AdditionalCatalogueFileModel,
  CounterModel,
  OtpModel,
  ProductModel,
  SiteContentModel,
  UserModel,
];

async function main(): Promise<void> {
  const startedAt = Date.now();
  await connectDatabase();

  const results = await Promise.all(
    MODELS.map(async (model) => {
      const dropped = await model.syncIndexes();
      return {
        collection: model.collection.name,
        indexes: Object.keys(model.schema.indexes()).length,
        dropped,
      };
    }),
  );

  const withDropped = results.filter((entry) => entry.dropped.length > 0);
  if (withDropped.length > 0) {
    log.warn({ collections: withDropped }, 'Dropped indexes that no model declares any more');
  }

  log.info(
    {
      collections: results.length,
      indexes: results.reduce((sum, entry) => sum + entry.indexes, 0),
      durationMs: Date.now() - startedAt,
    },
    'Indexes synced',
  );

  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  log.error(
    { message: error instanceof Error ? error.message : String(error) },
    'Index sync failed',
  );
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
