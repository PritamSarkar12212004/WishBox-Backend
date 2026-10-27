import { slugify } from '../../shared/slug.js';
import { DEFAULT_SITE_CONTENT } from './content.defaults.js';
import { SITE_CONTENT_ID, SiteContentModel } from './content.model.js';
import type { FooterLink, SiteContent, SiteContentSection } from './content.types.js';
import type { ContentPatchInput } from './content.validation.js';

/**
 * Website content: read it, edit it, reset a section.
 *
 * A read always answers a *complete* object. The stored document is merged over
 * the shipped defaults, so a database written by an older build (or one an
 * operator edited by hand) can never serve a missing banner field to a page
 * that expects a string.
 */

const clone = <T>(value: T): T => structuredClone(value);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merges a stored value over the defaults.
 *
 * Arrays are stored values wholesale (an admin who deletes every offer means
 * it), scalars must match the default's type, and objects merge key by key so
 * a missing nested field keeps its shipped value.
 */
function mergeOverDefaults<T>(defaults: T, stored: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(stored) ? stored : clone(defaults)) as T;
  }

  if (isPlainObject(defaults)) {
    if (!isPlainObject(stored)) return clone(defaults);
    const merged: Record<string, unknown> = {};
    Object.entries(defaults).forEach(([key, value]) => {
      merged[key] = mergeOverDefaults(value, stored[key]);
    });
    return merged as T;
  }

  return (typeof stored === typeof defaults ? stored : defaults) as T;
}

/**
 * Turns a column's link ids into stable, unique slugs.
 *
 * The id is only a React key and a form handle - the shopper never sees it - so
 * it is repaired here instead of being validated: a paste, an older draft or a
 * label full of punctuation used to reject the whole footer and leave the
 * shopkeeper with "Validation failed".
 */
function normaliseFooterLinks(links: FooterLink[]): FooterLink[] {
  const used = new Set<string>();

  return links.map((link, index) => {
    const base = slugify(link.id) || slugify(link.label) || `link-${index + 1}`;
    let id = base.replace(/-+$/g, '') || `link-${index + 1}`;
    let suffix = 2;
    while (used.has(id)) {
      const stem = base.slice(0, 56).replace(/-+$/g, '') || 'link';
      id = `${stem}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return { ...link, id };
  });
}

/** The full site content, defaults included. */
export async function getSiteContent(): Promise<SiteContent> {
  const doc = await SiteContentModel.findOne({ contentId: SITE_CONTENT_ID })
    .lean<{ home?: unknown; alert?: unknown; footer?: unknown; contact?: unknown } | null>();

  return {
    home: mergeOverDefaults(DEFAULT_SITE_CONTENT.home, doc?.home),
    alert: mergeOverDefaults(DEFAULT_SITE_CONTENT.alert, doc?.alert),
    footer: mergeOverDefaults(DEFAULT_SITE_CONTENT.footer, doc?.footer),
    contact: mergeOverDefaults(DEFAULT_SITE_CONTENT.contact, doc?.contact),
  };
}

/**
 * Applies a validated change.
 *
 * Whole sections are replaced rather than deep-merged: the panel saves a
 * complete screen, and merging a list would make deleting the last link
 * impossible.
 */
export async function patchSiteContent(patch: ContentPatchInput): Promise<SiteContent> {
  const next = await getSiteContent();

  (patch.reset ?? []).forEach((section: SiteContentSection) => {
    // Written per section rather than through an index, because the sections
    // have different types and an index assignment would widen them.
    if (section === 'home') next.home = clone(DEFAULT_SITE_CONTENT.home);
    if (section === 'alert') next.alert = clone(DEFAULT_SITE_CONTENT.alert);
    if (section === 'footer') next.footer = clone(DEFAULT_SITE_CONTENT.footer);
    if (section === 'contact') next.contact = clone(DEFAULT_SITE_CONTENT.contact);
  });

  if (patch.home) next.home = patch.home;
  if (patch.alert) next.alert = patch.alert;
  if (patch.footer) {
    next.footer = {
      ...patch.footer,
      shopLinks: normaliseFooterLinks(patch.footer.shopLinks),
      companyLinks: normaliseFooterLinks(patch.footer.companyLinks),
    };
  }
  if (patch.contact) next.contact = patch.contact;

  await SiteContentModel.findOneAndUpdate(
    { contentId: SITE_CONTENT_ID },
    { $set: { ...next, contentId: SITE_CONTENT_ID } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return next;
}
