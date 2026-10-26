import { createChildLogger } from '../../config/logger.js';
import { NEW_BADGE_LIFETIME_MS, ProductModel } from './products.model.js';

const log = createChildLogger('products.new-badge-expiry');
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Remove expired NEW labels from stored product records. Safe to run repeatedly. */
export async function expireNewBadges(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - NEW_BADGE_LIFETIME_MS);
  const result = await ProductModel.updateMany(
    {
      badge: 'NEW',
      $or: [
        { badgeAddedAt: { $lte: cutoff } },
        { badgeAddedAt: { $exists: false }, createdAt: { $lte: cutoff } },
      ],
    },
    { $unset: { badge: 1, badgeAddedAt: 1 } },
  );
  const modified = result.modifiedCount ?? 0;
  if (modified > 0) log.info({ modified }, 'Expired NEW product badges');
  return modified;
}

/** Run on boot and hourly; public responses also hide expired badges exactly at day seven. */
export function startNewBadgeExpiryJob(): NodeJS.Timeout {
  const run = () => {
    void expireNewBadges().catch((error: unknown) => {
      log.error({ reason: error instanceof Error ? error.message : String(error) }, 'NEW badge expiry failed');
    });
  };
  run();
  const timer = setInterval(run, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
