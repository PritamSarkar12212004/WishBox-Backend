import { z } from 'zod';

/**
 * Validation for the website content the admin edits.
 *
 * Every string is bounded, every list has a ceiling, and ids are slugs. The
 * storefront prints these values directly, so the important guarantee is that
 * nothing unbounded or structurally wrong can be stored — the panel's own
 * checks (dashes, valid links, dialable numbers) are a convenience, not the
 * boundary.
 */

const text = (max: number) => z.string().trim().max(max);

const slug = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Ids are lowercase letters, numbers and dashes');

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), {
    message: 'Use a full https:// URL',
  });

const alertMessageSchema = z.strictObject({
  id: slug,
  text: text(120),
});

export const alertContentSchema = z.strictObject({
  phone: text(30),
  email: text(160),
  messages: z.array(alertMessageSchema).max(10),
  marqueeSeconds: z.coerce.number().int().min(8).max(120),
});

/**
 * A footer link's id is an internal key, not something a shopper ever sees.
 *
 * It is deliberately lenient here and normalised by the service: rejecting a
 * whole footer because an id lost its slug shape (a paste, an older draft) made
 * "add a custom link, then save" fail with nothing the shopkeeper could act on.
 */
const footerLinkSchema = z.strictObject({
  id: z.string().trim().max(120).default(''),
  label: text(60),
  to: text(500),
});

export const footerContentSchema = z.strictObject({
  storeName: text(80),
  tagline: text(400),
  instagramUrl: httpUrl,
  whatsappUrl: httpUrl,
  shopHeading: text(40),
  shopLinks: z
    .array(footerLinkSchema)
    .max(8, 'Keep the Shop column to 8 links or fewer'),
  companyHeading: text(40),
  companyLinks: z
    .array(footerLinkSchema)
    .max(8, 'Keep the Company column to 8 links or fewer'),
  contactHeading: text(40),
  address: text(200),
  phone: text(30),
  email: text(160),
  subscribeHeading: text(80),
  copyright: text(120),
});

/**
 * The home page hero.
 *
 * Same principle as the rest of the content: plain strings, bounded lengths,
 * printed straight into the page. An empty field hides that line rather than
 * erroring, so the shop can run with a headline and nothing else.
 */
export const homeContentSchema = z.strictObject({
  hero: z.strictObject({
    eyebrow: text(60),
    title: text(140),
    lead: text(600),
  }),
});

const contactTopicSchema = z.strictObject({ id: slug, label: text(60) });
const supportHourSchema = z.strictObject({ id: slug, days: text(60), time: text(60) });

export const contactContentSchema = z.strictObject({
  hero: z.strictObject({
    eyebrow: text(60),
    title: text(160),
    lead: text(600),
    pills: z.strictObject({ whatsapp: text(120), email: text(120), location: text(120) }),
  }),
  whatsapp: z.strictObject({
    kicker: text(60),
    number: text(30),
    bestFor: text(200),
    meta: text(120),
    buttonLabel: text(40),
    prefill: text(200),
    copyLabel: text(40),
  }),
  email: z.strictObject({
    kicker: text(60),
    address: text(160),
    bestFor: text(200),
    meta: text(120),
    buttonLabel: text(40),
    subject: text(120),
    copyLabel: text(40),
  }),
  form: z.strictObject({ heading: text(80), intro: text(400) }),
  call: z.strictObject({ title: text(80), phone: text(30), note: text(200) }),
  studio: z.strictObject({
    title: text(80),
    lines: z.array(text(160)).min(1).max(6),
    directionsLabel: text(40),
    directionsUrl: httpUrl,
  }),
  hours: z.strictObject({
    title: text(80),
    rows: z.array(supportHourSchema).max(8),
  }),
  social: z.strictObject({ title: text(80), note: text(240), instagramUrl: httpUrl }),
  topics: z.array(contactTopicSchema).min(1).max(12),
});

/** The sections an admin can reset back to the shipped content. */
export const SITE_CONTENT_SECTIONS = ['home', 'alert', 'footer', 'contact'] as const;

/**
 * `PATCH /admin/content` takes whole sections — the panel always saves a
 * complete screen — and optionally a list of sections to reset. A section that
 * is both sent and reset is a mistake, so it is rejected rather than guessed at.
 */
export const contentPatchSchema = z
  .strictObject({
    home: homeContentSchema.optional(),
    alert: alertContentSchema.optional(),
    footer: footerContentSchema.optional(),
    contact: contactContentSchema.optional(),
    reset: z.array(z.enum(SITE_CONTENT_SECTIONS)).max(4).optional(),
  })
  .refine(
    (value) =>
      value.home !== undefined ||
      value.alert !== undefined ||
      value.footer !== undefined ||
      value.contact !== undefined ||
      (value.reset?.length ?? 0) > 0,
    { message: 'Provide a section to change or reset' },
  )
  .refine(
    (value) =>
      !value.reset?.some(
        (section) => value[section as 'home' | 'alert' | 'footer' | 'contact'] !== undefined,
      ),
    { message: 'A section cannot be saved and reset in the same request' },
  );

export type ContentPatchInput = z.infer<typeof contentPatchSchema>;
