/**
 * Generates a stable year of trading history for the admin panel.
 *
 * The storefront keeps its orders in the browser and the backend has no
 * customer checkouts yet, so a freshly seeded database would leave every
 * dashboard flat. This produces the volume those screens need - orders,
 * customers, returns, reviews, coupons and restocks - from a fixed seed, so the
 * same script run twice yields the same year and a screenshot in a bug report
 * still matches what the reporter saw.
 *
 * Everything it writes is ordinary data in ordinary collections: once seeded,
 * the API serves it exactly like records an admin created by hand. Running the
 * seed again replaces the history (see `seed.ts`).
 */

import {
  CANCELLATION_REASONS,
  type AdminOrderStatus,
  type CancellationReason,
  type PaymentMethod,
  type PaymentStatus,
  type RefundStatus,
  type ReturnReason,
  type ReturnStatus,
} from '../admin.constants.js';
import type { AdminCouponAttributes } from '../models/coupon.model.js';
import type { AdminCustomerAttributes } from '../models/customer.model.js';
import type { AdminOrderAttributes, AdminOrderItem } from '../models/order.model.js';
import type { AdminRestockAttributes } from '../models/restock.model.js';
import type { AdminReviewAttributes } from '../models/review.model.js';
import type { AdminReturnAttributes } from '../models/return.model.js';
import { SEED_CATALOG, type SeedProduct } from './catalog.js';

export const DAY_MS = 86_400_000;

/** Default seed - the same constant the panel's own demo data used. */
export const ADMIN_SEED = 20261002;

/** The admin the seeded approvals are stamped with. */
export const SEED_APPROVER = 'admin@wishbox.in';

export interface SeedDataset {
  customers: AdminCustomerAttributes[];
  orders: AdminOrderAttributes[];
  returns: AdminReturnAttributes[];
  reviews: AdminReviewAttributes[];
  coupons: AdminCouponAttributes[];
  restocks: AdminRestockAttributes[];
}

/* ------------------------------------------------------------------ */
/*  Seeded random                                                     */
/* ------------------------------------------------------------------ */

interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(list: readonly T[]) => T;
  chance: (probability: number) => boolean;
  weighted: <T>(entries: ReadonlyArray<readonly [T, number]>) => T;
}

/** mulberry32 - tiny, fast and stable for a fixed seed. */
function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (probability) => next() < probability,
    weighted: (entries) => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Pools                                                             */
/* ------------------------------------------------------------------ */

const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Rahul', 'Priya', 'Rohit', 'Sneha', 'Amit', 'Neha', 'Vikram', 'Kavya',
  'Arjun', 'Meera', 'Sanjay', 'Divya', 'Karan', 'Pooja', 'Nikhil', 'Riya', 'Manish', 'Ishita',
  'Aditya', 'Shreya', 'Rajesh', 'Tanvi', 'Varun', 'Nisha', 'Siddharth', 'Anjali', 'Harsh', 'Deepika',
  'Kabir', 'Preeti', 'Mohit', 'Sakshi', 'Gaurav', 'Ritika', 'Yash', 'Aisha', 'Devansh', 'Sanya',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Mehta', 'Singh', 'Kaur',
  'Bose', 'Chopra', 'Joshi', 'Kapoor', 'Malhotra', 'Rao', 'Das', 'Banerjee', 'Kulkarni', 'Menon',
  'Shetty', 'Agarwal', 'Trivedi', 'Bhatt', 'Sinha', 'Pillai', 'Desai', 'Ghosh', 'Yadav', 'Mishra',
];

const CITIES: ReadonlyArray<readonly [string, number]> = [
  ['Mumbai', 4],
  ['Delhi', 4],
  ['Bengaluru', 3.5],
  ['Jaipur', 3],
  ['Pune', 2.5],
  ['Hyderabad', 2.5],
  ['Chennai', 2],
  ['Kolkata', 2],
  ['Ahmedabad', 2],
  ['Lucknow', 1.5],
  ['Gurugram', 1.5],
  ['Indore', 1],
];

const COURIERS: ReadonlyArray<readonly [string, number]> = [
  ['Delhivery', 3],
  ['Blue Dart', 2.2],
  ['Ekart', 2],
  ['XpressBees', 1.6],
  ['India Post', 1],
];

const COURIER_PREFIX: Record<string, string> = {
  Delhivery: 'DLV',
  'Blue Dart': 'BD',
  Ekart: 'EK',
  XpressBees: 'XB',
  'India Post': 'IP',
};

/** City → state + pincode, so a seeded address reads like a real one. */
const LOCATION: Record<string, { state: string; pin: string }> = {
  Mumbai: { state: 'Maharashtra', pin: '400001' },
  Delhi: { state: 'Delhi', pin: '110001' },
  Bengaluru: { state: 'Karnataka', pin: '560001' },
  Jaipur: { state: 'Rajasthan', pin: '302001' },
  Pune: { state: 'Maharashtra', pin: '411001' },
  Hyderabad: { state: 'Telangana', pin: '500001' },
  Chennai: { state: 'Tamil Nadu', pin: '600001' },
  Kolkata: { state: 'West Bengal', pin: '700001' },
  Ahmedabad: { state: 'Gujarat', pin: '380001' },
  Lucknow: { state: 'Uttar Pradesh', pin: '226001' },
  Gurugram: { state: 'Haryana', pin: '122001' },
  Indore: { state: 'Madhya Pradesh', pin: '452001' },
};

const HOUSE_STREETS = [
  'Wardha Road',
  'Craft Lane',
  'MG Road',
  'Lake View Apartments',
  'Palm Grove',
  'Rose Avenue',
  'Green Park Colony',
  'Sector 21',
  'Gandhi Nagar',
  'Sunrise Layout',
  'Nehru Street',
  'Garden Estate',
];

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});

const PAYMENT_WEIGHTS: ReadonlyArray<readonly [PaymentMethod, number]> = [
  ['UPI', 48],
  ['Credit Card', 22],
  ['Debit Card', 12],
  ['COD', 15],
  ['Wallet', 3],
];

/** Relative demand by category - paper craft is the volume business. */
const CATEGORY_POPULARITY: Record<string, number> = {
  'paper-craft': 5.2,
  'home-decor': 2.1,
  lighting: 1.6,
  clocks: 1.1,
};

const DEFAULT_CATEGORY_POPULARITY = 1.6;

const CATALOG_POOL = SEED_CATALOG.map((product) => ({
  product,
  // Cheaper products turn over faster than the flagship decor pieces.
  weight:
    (CATEGORY_POPULARITY[product.category] ?? DEFAULT_CATEGORY_POPULARITY) /
    Math.sqrt(product.price / 200),
}));

const REVIEW_TITLES: Record<number, string[]> = {
  5: ['Exactly as described', 'Beautiful finish', 'Will order again', 'Great value'],
  4: ['Very good quality', 'Looks lovely', 'Happy with it'],
  3: ['Decent for the price', 'Okay, not perfect', 'Average'],
  2: ['Expected better', 'Packaging was weak', 'Colour is off'],
  1: ['Arrived damaged', 'Not as shown', 'Disappointed'],
};

const REVIEW_BODIES: Record<number, string[]> = {
  5: [
    'The texture is lovely and it folded cleanly for my invitations. Packaging kept every sheet flat.',
    'Ordered twice now - colours are consistent and the finish photographs beautifully.',
    'Genuinely premium paper. Used it for gift wrapping and everyone asked where it was from.',
  ],
  4: [
    'Good quality overall. A couple of sheets had slight edge marks but the rest were perfect.',
    'Nice matte finish and true to the photos. Delivery took a little longer than promised.',
    'Works well for crafting. Would have liked slightly thicker GSM.',
  ],
  3: [
    'Usable but thinner than I expected. Fine for practice, not for premium gifting.',
    'Product is okay; the packaging arrived slightly dented though nothing was damaged.',
  ],
  2: [
    'Colour is noticeably duller than the product photos suggested.',
    'Two sheets were creased. Replacement process was straightforward at least.',
  ],
  1: ['Arrived with a torn pack and several sheets unusable.'],
};

/**
 * A small, self-contained "receipt" image so a seeded order has a real payment
 * or refund screenshot to preview. Drawn as an inline SVG data URL: nothing hits
 * the network and no binary asset ships with the API.
 */
function receiptImage(
  kind: 'payment' | 'refund',
  amount: number,
  reference: string,
  dateLabel: string,
): string {
  const title = kind === 'payment' ? 'Payment Successful' : 'Refund Processed';
  const subtitle = kind === 'payment' ? 'Paid to WishBox' : 'Refunded to customer';
  const accent = kind === 'payment' ? '#5A7A58' : '#C97B5D';
  const value = `₹${Math.round(amount).toLocaleString('en-IN')}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="600" viewBox="0 0 360 600">` +
    `<rect width="360" height="600" fill="#F5EFE6"/>` +
    `<rect x="16" y="16" width="328" height="568" rx="20" fill="#FFFFFF" stroke="#E8E0D8"/>` +
    `<circle cx="180" cy="98" r="34" fill="${accent}"/>` +
    `<path d="M165 98l11 11 20-24" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="180" y="166" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="19" fill="#2C2420">${title}</text>` +
    `<text x="180" y="194" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#9A8D85">${subtitle}</text>` +
    `<text x="180" y="258" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="bold" fill="#2C2420">${value}</text>` +
    `<line x1="48" y1="300" x2="312" y2="300" stroke="#E8E0D8"/>` +
    `<text x="48" y="334" font-family="sans-serif" font-size="11" fill="#9A8D85">Reference</text>` +
    `<text x="312" y="334" text-anchor="end" font-family="sans-serif" font-size="11" fill="#2C2420">${reference}</text>` +
    `<text x="48" y="366" font-family="sans-serif" font-size="11" fill="#9A8D85">Date</text>` +
    `<text x="312" y="366" text-anchor="end" font-family="sans-serif" font-size="11" fill="#2C2420">${dateLabel}</text>` +
    `<text x="180" y="540" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#9A8D85">WishBox · UPI / net banking</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A single-line delivery address built from the customer's city. */
function buildAddress(rng: Rng, city: string): string {
  const location = LOCATION[city] ?? { state: 'Maharashtra', pin: '440001' };
  return `House No. ${rng.int(1, 260)}, ${rng.pick(HOUSE_STREETS)}, ${city}, ${location.state} - ${location.pin}`;
}

/** A demo contact number in the +91 XXXXX XXXXX shape. */
function buildPhone(rng: Rng): string {
  return `+91 ${rng.int(60_000, 99_999)} ${rng.int(10_000, 99_999)}`;
}

interface CouponSeed {
  code: string;
  label: string;
  kind: 'percent' | 'flat';
  value: number;
  minOrder: number;
  status: 'Active' | 'Scheduled' | 'Expired';
  expiresInDays: number;
}

const COUPON_SEED: CouponSeed[] = [
  { code: 'PAPER10', label: '10% off your first order', kind: 'percent', value: 10, minOrder: 499, status: 'Active', expiresInDays: 46 },
  { code: 'SAVE5', label: '5% off sitewide', kind: 'percent', value: 5, minOrder: 0, status: 'Active', expiresInDays: 12 },
  { code: 'PREPAID100', label: 'Flat ₹100 off prepaid orders', kind: 'flat', value: 100, minOrder: 999, status: 'Active', expiresInDays: 30 },
  { code: 'BULK9', label: '9% off bulk packs', kind: 'percent', value: 9, minOrder: 5000, status: 'Active', expiresInDays: 74 },
  { code: 'FESTIVE15', label: '15% festive season sale', kind: 'percent', value: 15, minOrder: 1499, status: 'Scheduled', expiresInDays: 95 },
  { code: 'WELCOME200', label: 'Flat ₹200 off the first order', kind: 'flat', value: 200, minOrder: 1999, status: 'Expired', expiresInDays: -18 },
];

/** Status weights by how old an order is, so the pipeline always has work in it. */
const STATUS_BY_AGE: Array<{ maxAge: number; weights: ReadonlyArray<readonly [AdminOrderStatus, number]> }> = [
  { maxAge: 2, weights: [['Approval', 62], ['Approved', 14], ['Shipped', 18], ['Cancelled', 6]] },
  {
    maxAge: 5,
    weights: [
      ['Approval', 20], ['Approved', 14], ['Shipped', 38],
      ['Out for Delivery', 14], ['Delivered', 10], ['Cancelled', 8],
    ],
  },
  {
    maxAge: 11,
    weights: [
      ['Approved', 6], ['Shipped', 24], ['Out for Delivery', 20],
      ['Delivered', 44], ['Approval', 6], ['Cancelled', 6],
    ],
  },
  { maxAge: 22, weights: [['Delivered', 80], ['Shipped', 8], ['Out for Delivery', 5], ['Approval', 3], ['Cancelled', 4]] },
  { maxAge: Number.POSITIVE_INFINITY, weights: [['Delivered', 88], ['Cancelled', 6], ['Shipped', 3], ['Out for Delivery', 3]] },
];

/* ------------------------------------------------------------------ */
/*  Generation                                                        */
/* ------------------------------------------------------------------ */

export function generateSeedDataset(seed = ADMIN_SEED, now = Date.now()): SeedDataset {
  const rng = createRng(seed);

  /* ── Customers ────────────────────────────────────────────────── */
  const customers: AdminCustomerAttributes[] = Array.from({ length: 520 }, (_, index) => {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    return {
      customerId: `CUS-${String(1000 + index)}`,
      name: `${first} ${last}`,
      email: `${first}.${last}${index % 97}@example.com`.toLowerCase(),
      phone: buildPhone(rng),
      city: rng.weighted(CITIES),
      // Skew towards recent sign-ups so "new customers" is a real signal.
      joinedAt: now - Math.floor(600 * rng.next() ** 1.7) * DAY_MS - rng.int(0, 20) * 3_600_000,
      isGuest: rng.chance(0.3),
    };
  });

  const shoppers = customers.filter((customer) => !customer.isGuest);
  const discountCoupons = COUPON_SEED.filter(
    (coupon) => coupon.status === 'Active' && coupon.kind === 'percent',
  );

  /* ── Orders: one pass per day, oldest first ───────────────────── */
  const orders: AdminOrderAttributes[] = [];
  const hourPool = [9, 10, 10, 11, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22];
  const currentHour = new Date(now).getHours();
  let sequence = 1000;

  for (let dayOffset = 364; dayOffset >= 0; dayOffset -= 1) {
    const dayStart = now - dayOffset * DAY_MS;
    const weekday = new Date(dayStart).getDay();
    const progress = (364 - dayOffset) / 364;
    const weekdayFactor = weekday === 0 || weekday === 6 ? 1.14 : weekday === 2 || weekday === 3 ? 0.9 : 1;
    // A gentle festive lift over the last six weeks.
    const festive = dayOffset < 42 ? 1.32 : 1;
    const base = 2.2 + 3.1 * progress;
    const statusWeights = STATUS_BY_AGE.find((band) => dayOffset <= band.maxAge)!.weights;
    const count = Math.max(
      0,
      Math.round(base * weekdayFactor * festive * (0.62 + rng.next() * 0.76)),
    );

    for (let index = 0; index < count; index += 1) {
      // Today's orders only exist up to the current hour.
      const hour = dayOffset === 0 ? rng.int(0, currentHour) : rng.pick(hourPool);
      const placedAt = dayStart + hour * 3_600_000 + rng.int(0, 59) * 60_000;
      if (placedAt > now) continue;

      const isGuest = rng.chance(0.12);
      const customer = isGuest
        ? {
            customerId: 'guest',
            name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES).charAt(0)}.`,
            email: 'guest checkout',
            phone: buildPhone(rng),
            city: rng.weighted(CITIES),
          }
        : rng.pick(shoppers);

      /* Line items */
      const lineCount = rng.weighted<number>([[1, 42], [2, 34], [3, 16], [4, 8]]);
      const chosen = new Set<SeedProduct>();
      while (chosen.size < lineCount) {
        chosen.add(rng.weighted(CATALOG_POOL.map((entry) => [entry.product, entry.weight] as const)));
      }

      const items: AdminOrderItem[] = [...chosen].map((product) => ({
        productId: product.id,
        name: product.name,
        brand: product.brand,
        image: product.image,
        category: product.category,
        // Cheap paper travels in bulk; decor pieces almost always singly.
        qty:
          product.category === 'paper-craft'
            ? rng.weighted<number>([[1, 52], [2, 22], [3, 12], [5, 8], [10, 4], [25, 2]])
            : rng.weighted<number>([[1, 86], [2, 14]]),
        price: product.price,
        mrp: product.mrp,
      }));

      const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

      let couponCode: string | undefined;
      let discount = 0;
      if (rng.chance(0.22)) {
        const eligible = discountCoupons.filter((coupon) => subtotal >= coupon.minOrder);
        if (eligible.length > 0) {
          const coupon = rng.pick(eligible);
          couponCode = coupon.code;
          discount = Math.round((subtotal * coupon.value) / 100);
        }
      }

      const shipping = rng.chance(0.78) ? 0 : 49;
      const status = rng.weighted(statusWeights);
      const payment = rng.weighted(PAYMENT_WEIGHTS);
      const amount = Math.max(subtotal - discount, 0) + shipping;

      /*
       * A cancelled prepaid order has either been refunded already or is still
       * waiting on the admin. The refund screenshot only exists once it went
       * through, which is what leaves the order sheet's "not uploaded yet"
       * empty state reachable.
       */
      let refundStatus: RefundStatus | undefined;
      let refundedAt: number | undefined;
      if (status === 'Cancelled') {
        refundStatus = payment !== 'COD' && rng.chance(0.55) ? 'Completed' : 'Pending';
        if (refundStatus === 'Completed') {
          refundedAt = Math.min(placedAt + rng.int(3, 96) * 3_600_000, now);
        }
      }

      let paymentStatus: PaymentStatus;
      if (payment === 'COD') paymentStatus = status === 'Delivered' ? 'Paid' : 'Pending';
      else if (status === 'Cancelled') paymentStatus = refundStatus === 'Completed' ? 'Refunded' : 'Paid';
      else paymentStatus = rng.weighted<PaymentStatus>([['Paid', 96], ['Pending', 2.5], ['Failed', 1.5]]);

      /*
       * A parcel only exists once it has actually been handed to a courier, so
       * an approved-but-not-shipped order has no courier yet - that is the gap
       * the order sheet's "mark as shipped" step fills.
       */
      const inCourier = status === 'Shipped' || status === 'Out for Delivery' || status === 'Delivered';
      const courier = inCourier ? rng.weighted(COURIERS) : undefined;
      const trackingId = courier
        ? `${COURIER_PREFIX[courier] ?? 'WB'}${rng.int(10_000_000, 99_999_999)}`
        : undefined;

      // Parcels past their window: shipped and still moving after a week.
      const delayed =
        (status === 'Shipped' && dayOffset > 7) || (status === 'Out for Delivery' && dayOffset > 4);

      const placedOn = DATE_FMT.format(placedAt);
      /*
       * Any online order the customer actually paid for carries a proof of
       * payment - including a cancelled one, which was paid before it was
       * refunded. Cash on delivery and unpaid rails never have one.
       */
      const paidOnline = payment !== 'COD' && (status === 'Cancelled' || paymentStatus === 'Paid');
      const paymentScreenshot = paidOnline
        ? receiptImage('payment', amount, `UPI${rng.int(10_000_000, 99_999_999)}`, placedOn)
        : undefined;

      // Everything past the approval gate has been accepted by an admin.
      const approved = status !== 'Approval' && status !== 'Cancelled';

      orders.push({
        orderId: `#ORD${sequence}`,
        customerId: customer.customerId,
        customer: customer.name,
        email: customer.email,
        city: customer.city,
        isGuest,
        placedAt,
        placedOn,
        status,
        payment,
        paymentStatus,
        amount,
        subtotal,
        shipping,
        discount,
        couponCode,
        items,
        courier,
        trackingId,
        delayed,
        refund: 0,
        phone: customer.phone,
        address: buildAddress(rng, customer.city),
        paymentScreenshot,
        approvedAt: approved ? Math.min(placedAt + rng.int(1, 40) * 3_600_000, now) : undefined,
        approvedBy: approved ? SEED_APPROVER : undefined,
        cancelledAt:
          status === 'Cancelled' ? Math.min(placedAt + rng.int(2, 72) * 3_600_000, now) : undefined,
        cancellationReason:
          status === 'Cancelled' ? (rng.pick(CANCELLATION_REASONS) as CancellationReason) : undefined,
        refundStatus,
        refundedAt,
        refundScreenshot:
          refundedAt === undefined
            ? undefined
            : receiptImage(
                'refund',
                amount,
                `RFD${rng.int(10_000_000, 99_999_999)}`,
                DATE_FMT.format(refundedAt),
              ),
      });
      sequence += 1;
    }
  }

  orders.sort((a, b) => b.placedAt - a.placedAt);

  /* ── Returns & refunds ────────────────────────────────────────── */
  const returns: AdminReturnAttributes[] = [];
  let returnSequence = 5000;

  orders.forEach((order) => {
    if (order.status !== 'Delivered' || !rng.chance(0.06)) return;

    const item = order.items[0];
    const status = rng.weighted<ReturnStatus>([
      ['Requested', 52],
      ['Processing', 30],
      ['Approved', 12],
      ['Rejected', 6],
    ]);
    const reason = rng.weighted<ReturnReason>([
      ['Damaged in transit', 32],
      ['Wrong item shipped', 18],
      ['Quality not as expected', 22],
      ['Changed my mind', 21],
      ['Other', 7],
    ]);
    const refundAmount =
      status === 'Rejected'
        ? 0
        : Math.round(order.amount * rng.weighted<number>([[1, 62], [0.5, 24], [0.8, 14]]));
    const refunded = status === 'Approved' && rng.chance(0.7);

    returns.push({
      returnId: `#RET-${returnSequence}`,
      orderId: order.orderId,
      customer: order.customer,
      city: order.city,
      productName: item.name,
      image: item.image,
      reason,
      requestedAt: order.placedAt + rng.int(4, 16) * DAY_MS,
      status,
      refundAmount,
      refunded,
    });
    returnSequence += 1;

    order.returnReason = reason;
    if (refunded) {
      order.refund = refundAmount;
      order.paymentStatus = 'Refunded';
    }
  });

  returns.sort((a, b) => b.requestedAt - a.requestedAt);

  /* ── Reviews, from delivered orders ───────────────────────────── */
  const reviews: AdminReviewAttributes[] = [];
  let reviewSequence = 7000;

  orders.forEach((order) => {
    if (order.status !== 'Delivered' || !rng.chance(0.34)) return;

    const item = rng.pick(order.items);
    const rating = rng.weighted<number>([[5, 52], [4, 31], [3, 12], [2, 4], [1, 1]]);
    reviews.push({
      reviewId: `#REV-${reviewSequence}`,
      productId: item.productId,
      productName: item.name,
      image: item.image,
      customer: order.customer,
      rating,
      title: rng.pick(REVIEW_TITLES[rating]),
      comment: rng.pick(REVIEW_BODIES[rating]),
      createdAt: order.placedAt + rng.int(3, 14) * DAY_MS,
      helpful: rng.int(0, 42),
      status: rng.chance(0.88) ? 'Published' : 'Pending',
    });
    reviewSequence += 1;
  });

  reviews.sort((a, b) => b.createdAt - a.createdAt);

  /* ── Coupons: usage rolled up from the orders above ───────────── */
  const coupons: AdminCouponAttributes[] = COUPON_SEED.map((coupon) => {
    const usage = orders.filter((order) => order.couponCode === coupon.code);
    return {
      code: coupon.code,
      label: coupon.label,
      kind: coupon.kind,
      value: coupon.value,
      minOrder: coupon.minOrder,
      status: coupon.status,
      expiresOn: DATE_FMT.format(now + coupon.expiresInDays * DAY_MS),
      used: usage.length,
      discountGiven: usage.reduce((sum, order) => sum + order.discount, 0),
    };
  });

  /* ── Restock log ──────────────────────────────────────────────── */
  const restocks: AdminRestockAttributes[] = [];
  for (let monthBack = 11; monthBack >= 0; monthBack -= 1) {
    const entries = rng.int(2, 4);
    for (let index = 0; index < entries; index += 1) {
      const product = rng.pick(SEED_CATALOG);
      restocks.push({
        productId: product.id,
        productName: product.name,
        units: product.category === 'paper-craft' ? rng.int(40, 260) : rng.int(6, 40),
        at: now - monthBack * 30 * DAY_MS - rng.int(0, 18) * DAY_MS,
      });
    }
  }

  return { customers, orders, returns, reviews, coupons, restocks };
}
