import { env } from '../../../config/env.js';
import { WhatsAppDeliveryError } from '../whatsapp.errors.js';

/**
 * An optional env var that was left blank in `.env` arrives as `""`, which
 * would defeat `??` fallbacks further down. Normalise it to `undefined`.
 */
const optional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Every gateway setting in one place, resolved once from validated env.
 * Defaults (URL, templates, media, timeout) live in the env schema so there is
 * a single source of configuration truth.
 */
export const gatewayConfig = Object.freeze({
  apiUrl: env.SMS_API_URL,
  token: optional(env.SMS_API_TOKEN),

  /** Template variable that carries the OTP code. */
  variablesKey: env.SMS_API_VARIABLES_KEY,

  otpTemplateId: env.SMS_OTP_TEMPLATE_ID,
  signupTemplateId: env.SMS_SIGNUP_TEMPLATE_ID,
  bookingTemplateId: env.SMS_BOOKING_TEMPLATE_ID,

  /**
   * The signup template's contacts. Keys are the template's placeholders, so
   * they are kept verbatim and are never renamed by a caller.
   */
  supportContacts: Object.freeze({
    email: env.SMS_SUPPORT_EMAIL,
    insta: env.SMS_SUPPORT_INSTA,
    phoneSupport: env.SMS_SUPPORT_PHONE,
  }),
  adminTemplateId: optional(env.SMS_ADMIN_TEMPLATE_ID),
  bookingApiUrl: optional(env.SMS_BOOKING_API_URL),

  mediaUrl: env.SMS_MEDIA_URL,
  timeoutMs: env.SMS_TIMEOUT_MS,
  maxAttempts: env.SMS_MAX_ATTEMPTS,
  retryDelayMs: 1_000,
});

/**
 * The token is a bearer credential, so it is never defaulted in source -
 * env validation already refuses to boot without it.
 */
export function requireToken(): string {
  if (!gatewayConfig.token) {
    throw new WhatsAppDeliveryError(
      'The messaging gateway token is not configured (set SMS_API_TOKEN)',
    );
  }
  return gatewayConfig.token;
}
