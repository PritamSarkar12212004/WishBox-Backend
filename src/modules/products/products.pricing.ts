import type { ProductBulkTier } from './products.model.js';

/**
 * What one unit of a product costs at a given quantity.
 *
 * The order service is the only caller that matters, and it is the reason this
 * lives on the server: a basket is priced from the product record, so a cart
 * that was edited in the browser cannot decide what the shopper pays.
 *
 * A tier can only ever lower the price. If a product's tiers are somehow
 * inconsistent (an admin edited the price below a break, say), the list price
 * wins rather than the shopper being overcharged.
 */
export function unitPriceFor(
  price: number,
  tiers: ProductBulkTier[] | undefined,
  quantity: number,
): number {
  if (!tiers || tiers.length === 0) return price;

  const match = [...tiers]
    .filter((tier) => quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty))
    .sort((a, b) => b.minQty - a.minQty)[0];

  return Math.min(match?.unitPrice ?? price, price);
}

/** True when a set of breaks is usable: ordered, well-formed and never dearer than list. */
export function bulkTiersAreValid(
  tiers: ProductBulkTier[] | undefined,
  price: number,
): boolean {
  if (!tiers || tiers.length === 0) return true;

  return tiers.every((tier, index) => {
    const previous = tiers[index - 1];
    if (previous && tier.minQty <= previous.minQty) return false;
    if (tier.maxQty !== null && tier.maxQty < tier.minQty) return false;
    return tier.unitPrice > 0 && tier.unitPrice <= price;
  });
}
