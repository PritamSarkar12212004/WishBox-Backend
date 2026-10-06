import { createChildLogger } from '../../../config/logger.js';
import { WhatsAppDeliveryError } from '../whatsapp.errors.js';
import { postTemplateMessage } from './client.js';
import { gatewayConfig } from './config.js';
import { maskNumber } from './phone.js';
import { otpVariables } from './templates.js';

const log = createChildLogger('whatsapp:gateway');

/**
 * The login-code transport: Wishbox's own messaging gateway.
 *
 * Unlike a plain SMS API this address takes no free-text body - the code is
 * injected into an approved WhatsApp template, and every template carries a
 * header image. The client normalises the phone number.
 */
export class GatewayWhatsAppProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    const template = gatewayConfig.otpTemplateId;

    const result = await postTemplateMessage({
      to: phone,
      template,
      variables: otpVariables(code),
      mediaUrl: gatewayConfig.mediaUrl,
    });

    if (!result.success) {
      // Only the status is exposed to the client; the gateway's raw body stays
      // in the logs where it cannot leak through an API response.
      throw new WhatsAppDeliveryError(
        `The messaging gateway rejected the login code (${result.statusCode ?? 'no status'})`,
        { statusCode: result.statusCode, gatewayMessage: result.message },
      );
    }

    log.info({ to: maskNumber(phone), template }, 'Login code delivered via gateway');
  }
}
