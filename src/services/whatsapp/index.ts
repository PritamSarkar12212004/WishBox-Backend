import { env } from '../../config/env.js';
import { createChildLogger } from '../../config/logger.js';
import { PHONE_COUNTRY_CODE } from '../../consts/constants.js';
import { ConsoleWhatsAppProvider } from './console.provider.js';
import { TwilioWhatsAppProvider } from './twilio.provider.js';
import type { OutboundMessage, WhatsAppProvider } from './whatsapp.types.js';

const log = createChildLogger('whatsapp');

export * from './whatsapp.types.js';

let cached: WhatsAppProvider | undefined;

/** Resolve the configured provider once and reuse it. */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;

  switch (env.WHATSAPP_PROVIDER) {
    case 'twilio':
      cached = new TwilioWhatsAppProvider();
      break;
    case 'console':
    default:
      cached = new ConsoleWhatsAppProvider();
      break;
  }

  log.info({ provider: cached.name, channel: env.AUTH_CHANNEL }, 'Login code delivery ready');
  return cached;
}

/** `9876543210` → `+919876543210` */
export function toE164(phone: string): string {
  return phone.startsWith('+') ? phone : `${PHONE_COUNTRY_CODE}${phone}`;
}

/** The message the shopper receives. Kept short so it fits one SMS segment. */
export function buildOtpMessage(code: string): string {
  const minutes = Math.max(1, Math.round(env.OTP_TTL_SECONDS / 60));
  return `${code} is your Wishbox verification code. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}. Never share this code with anyone.`;
}

/**
 * Deliver a one-time code over the configured channel (WhatsApp by default).
 * Throws WhatsAppDeliveryError if the provider refuses the message.
 */
export async function sendOtpCode(phone: string, code: string): Promise<void> {
  const provider = getWhatsAppProvider();
  const message: OutboundMessage = {
    to: toE164(phone),
    body: buildOtpMessage(code),
    channel: env.AUTH_CHANNEL,
  };

  await provider.send(message);
}
