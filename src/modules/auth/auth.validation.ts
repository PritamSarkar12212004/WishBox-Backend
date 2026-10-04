import { z } from 'zod';
import { OTP_CODE_REGEX, OTP_LENGTH, PHONE_REGEX } from '../../consts/constants.js';

/**
 * Mirrors `normalizePhone` in the storefront (src/modules/auth/lib/otp.ts):
 * digits only, drop a leading country code when it wraps a 10-digit number,
 * then keep the last ten.
 */
const normalizePhone = (value: string): string =>
  value
    .replace(/\D/g, '')
    .replace(/^91(?=\d{10}$)/, '')
    .slice(-10);

const phone = z
  .string()
  .trim()
  .min(1, 'Your WhatsApp number is required')
  .transform(normalizePhone)
  .refine(
    (value) => PHONE_REGEX.test(value),
    'Enter a valid 10-digit WhatsApp number starting with 6, 7, 8 or 9',
  );

const name = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters');

/** Step one: the shopper gives their name and WhatsApp number. */
export const requestOtpSchema = z.object({
  phone,
  name: name.optional(),
});

/** Step two: the six-digit code from the message. */
export const verifyOtpSchema = z.object({
  phone,
  code: z
    .string()
    .trim()
    .regex(OTP_CODE_REGEX, `Enter the ${OTP_LENGTH}-digit code we sent you`),
  name: name.optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(10, 'A refresh token is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(10).optional(),
  /** Sign out of every device instead of just this one. */
  allDevices: z.boolean().optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
