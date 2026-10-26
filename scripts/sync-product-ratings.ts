/**
 * Recomputes every product's rating and review count from its reviews.
 *
 * Run with: `npm run reviews:sync`
 *
 * The reviews are the source of truth: a shopper's review, an admin's
 * publish/unpublish and a delete all recompute the product immediately. This
 * script exists for the two cases the API cannot see - a fresh import of
 * products, and reviews written before this rule was introduced - so a product
 * card never advertises a rating nobody gave.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createChildLogger } from '../src/config/logger.js';
import { ProductModel } from '../src/modules/products/products.model.js';
import { recalculateProductRating } from '../src/modules/reviews/reviews.service.js';

const log = createChildLogger('reviews-sync');

async function main(): Promise<void> {
  await connectDatabase();

  const products = await ProductModel.find().select('slug').lean();
  let rated = 0;
  let unrated = 0;

  for (const product of products) {
    const summary = await recalculateProductRating(product.slug);
    if (summary.count > 0) rated += 1;
    else unrated += 1;
  }

  log.info(
    { products: products.length, rated, unrated },
    'Product ratings rebuilt from reviews',
  );

  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  log.error({ message: error instanceof Error ? error.message : String(error) }, 'Sync failed');
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
