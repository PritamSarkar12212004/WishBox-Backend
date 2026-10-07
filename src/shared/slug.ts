/**
 * Slugs are the public identity for products and categories.
 *
 * A slug is what a URL, a filter and a product's `category` field carry, so it
 * has to be stable, lowercase and free of anything that needs escaping. Deriving
 * it from a label keeps the two in step when an admin only types a name.
 */

/** `Paper & Craft` → `paper-craft`; ` 12" x 9" Sheets ` → `12-x-9-sheets`. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Drop diacritics so `Café` becomes `cafe`, not `caf`.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** One or more lowercase alphanumeric words, hyphen-separated. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return SLUG_REGEX.test(value);
}
