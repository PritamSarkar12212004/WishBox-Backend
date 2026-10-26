import { AdminCouponModel } from '../admin/models/coupon.model.js';

/**
 * What the storefront is allowed to know about a coupon.
 *
 * The codes are advertised on the product page anyway, so the useful public
 * facts are the code, its label, its shape and its minimum basket. Usage
 * counts, discount given and whatever the panel keeps stay on the admin side.
 */
export interface PublicCoupon {
  code: string;
  label: string;
  kind: 'percent' | 'flat';
  value: number;
  minOrder: number;
}

function hasExpired(expiresOn: string): boolean {
  if (!expiresOn) return false;
  const at = Date.parse(expiresOn);
  return Number.isFinite(at) && at < Date.now();
}

/**
 * Every coupon a shopper can actually use right now.
 *
 * This is the same table the order service charges from, so the shop's "apply
 * coupon" list and the rules enforced at checkout cannot drift apart the way
 * two hard-coded copies eventually do.
 */
export async function listActiveCoupons(): Promise<PublicCoupon[]> {
  const coupons = await AdminCouponModel.find({ status: 'Active' }).sort({ code: 1 });

  return coupons
    .filter((coupon) => !hasExpired(coupon.expiresOn))
    .map((coupon) => ({
      code: coupon.code,
      label: coupon.label,
      kind: coupon.kind,
      value: coupon.value,
      minOrder: coupon.minOrder,
    }));
}
