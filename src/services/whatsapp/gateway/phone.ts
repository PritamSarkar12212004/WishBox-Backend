/** Digits only, so both `+919876543210` and `9876543210` are understood. */
function digitsOf(input: string | number): string {
  return String(input).replace(/\D/g, '');
}

/**
 * Format for the gateway: country code, no plus sign.
 *
 * `+919876543210` → `919876543210`
 * `9876543210`    → `919876543210`
 *
 * The length check matters: a valid subscriber number can itself start with
 * "91" (e.g. `9198765432`), and trusting the prefix alone would drop the
 * country code for it.
 */
export function toGatewayNumber(input: string | number): string {
  const digits = digitsOf(input);
  if (!digits) return '';

  // Already carries the country code.
  if (digits.length === 12 && digits.startsWith('91')) return digits;

  // Bare ten-digit subscriber number.
  if (digits.length === 10) return `91${digits}`;

  // Anything else is assumed to be an international number.
  return digits.startsWith('91') ? digits : `91${digits}`;
}

/** `919876543210` → `91********3210` — keeps phone numbers out of logs. */
export function maskNumber(input: string | number): string {
  return digitsOf(input).replace(/\d(?=\d{4})/g, '*');
}

export { digitsOf };
