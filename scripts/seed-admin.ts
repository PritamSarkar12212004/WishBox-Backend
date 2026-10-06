/**
 * Fills the admin panel's collections with a year of seeded trading history.
 *
 * Run with: npm run admin:seed
 *
 * This REPLACES the existing history: the six collections below are cleared
 * first, so a re-run always lands on exactly the year the seed describes
 * instead of stacking a second copy on top of the first. Settings are left
 * alone (they fall back to defaults until an admin saves them), and nothing
 * here touches `users`, so accounts and logins survive a reseed.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createChildLogger } from '../src/config/logger.js';
import { AdminCouponModel } from '../src/modules/admin/models/coupon.model.js';
import { AdminCustomerModel } from '../src/modules/admin/models/customer.model.js';
import { AdminOrderModel } from '../src/modules/admin/models/order.model.js';
import { AdminRestockModel } from '../src/modules/admin/models/restock.model.js';
import { AdminReviewModel } from '../src/modules/admin/models/review.model.js';
import { AdminReturnModel } from '../src/modules/admin/models/return.model.js';
import { generateSeedDataset } from '../src/modules/admin/seed/generate.js';

const log = createChildLogger('admin-seed');

async function main(): Promise<void> {
  const startedAt = Date.now();
  await connectDatabase();

  const dataset = generateSeedDataset();

  await Promise.all([
    AdminOrderModel.deleteMany({}),
    AdminCustomerModel.deleteMany({}),
    AdminReturnModel.deleteMany({}),
    AdminReviewModel.deleteMany({}),
    AdminCouponModel.deleteMany({}),
    AdminRestockModel.deleteMany({}),
  ]);

  // In chunks, to stay well clear of the driver's batch limit.
  const chunk = async <T>(label: string, docs: T[], insert: (batch: T[]) => Promise<unknown>) => {
    const size = 500;
    for (let index = 0; index < docs.length; index += size) {
      await insert(docs.slice(index, index + size));
    }
    log.info({ collection: label, documents: docs.length }, 'Seeded collection');
  };

  await chunk('customers', dataset.customers, (batch) => AdminCustomerModel.insertMany(batch));
  await chunk('orders', dataset.orders, (batch) => AdminOrderModel.insertMany(batch));
  await chunk('returns', dataset.returns, (batch) => AdminReturnModel.insertMany(batch));
  await chunk('reviews', dataset.reviews, (batch) => AdminReviewModel.insertMany(batch));
  await chunk('coupons', dataset.coupons, (batch) => AdminCouponModel.insertMany(batch));
  await chunk('restocks', dataset.restocks, (batch) => AdminRestockModel.insertMany(batch));

  log.info(
    {
      customers: dataset.customers.length,
      orders: dataset.orders.length,
      returns: dataset.returns.length,
      reviews: dataset.reviews.length,
      coupons: dataset.coupons.length,
      restocks: dataset.restocks.length,
      durationMs: Date.now() - startedAt,
    },
    'Admin dataset seeded',
  );

  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  log.error({ message: error instanceof Error ? error.message : String(error) }, 'Seed failed');
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
