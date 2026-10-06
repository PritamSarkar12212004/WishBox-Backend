/**
 * Login-code delivery.
 *
 * There is exactly one transport: Wishbox's own messaging gateway, which sends
 * an approved WhatsApp template. `sendOtpCode` is the only thing the auth flow
 * needs; the gateway module below owns the HTTP details.
 */
import { GatewayWhatsAppProvider } from './gateway/provider.js';

export { sendSignupWelcome, sendTemplateNotification } from './gateway/notifications.js';
export { gatewayConfig, requireToken } from './gateway/config.js';
export { GatewayWhatsAppProvider } from './gateway/provider.js';
export { WhatsAppDeliveryError } from './whatsapp.errors.js';
export type {
  GatewaySendResult,
  GatewayTemplateRequest,
  GatewayVariables,
} from './gateway/types.js';

/** One adapter instance, reused for every send. */
const provider = new GatewayWhatsAppProvider();

/**
 * Deliver a one-time login code as a WhatsApp template message.
 * Throws `WhatsAppDeliveryError` (502) if the gateway rejects or is unreachable.
 */
export async function sendOtpCode(phone: string, code: string): Promise<void> {
  await provider.sendOtp(phone, code);
}
