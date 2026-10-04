import { env } from '../../config/env.js';
import { createChildLogger } from '../../config/logger.js';
import { WhatsAppDeliveryError, type OutboundMessage, type WhatsAppProvider } from './whatsapp.types.js';

const log = createChildLogger('whatsapp:twilio');

const TIMEOUT_MS = 10_000;

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
}

/**
 * Twilio Messages API provider - handles both WhatsApp and plain SMS.
 * Implemented with fetch so the project needs no extra SDK dependency.
 *
 * WhatsApp delivery on Twilio requires a WhatsApp-enabled sender; the sandbox
 * number works for development once the recipient has joined it.
 */
export class TwilioWhatsAppProvider implements WhatsAppProvider {
  public readonly name = 'twilio';

  private credentials(): { sid: string; token: string } {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token } = env;

    // env validation guarantees these when WHATSAPP_PROVIDER=twilio; guard
    // anyway so a misconfiguration fails loudly instead of sending a header
    // containing "undefined".
    if (!sid || !token) {
      throw new WhatsAppDeliveryError('Twilio credentials are not configured');
    }

    return { sid, token };
  }

  private sender(channel: OutboundMessage['channel']): string {
    const raw = channel === 'whatsapp' ? env.TWILIO_WHATSAPP_FROM : env.TWILIO_SMS_FROM;

    if (!raw) {
      throw new WhatsAppDeliveryError(
        `No Twilio sender configured for ${channel} (set TWILIO_${channel === 'whatsapp' ? 'WHATSAPP' : 'SMS'}_FROM)`,
      );
    }

    // WhatsApp senders must be prefixed with the channel name.
    if (channel === 'whatsapp' && !raw.startsWith('whatsapp:')) {
      return `whatsapp:${raw}`;
    }

    return raw;
  }

  async send(message: OutboundMessage): Promise<void> {
    const { sid, token } = this.credentials();
    const from = this.sender(message.channel);
    const to = message.channel === 'whatsapp' ? `whatsapp:${message.to}` : message.to;

    const form = new URLSearchParams({ To: to, From: from, Body: message.body });

    let response: Response;
    try {
      response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      log.error({ err: error, to: message.to }, 'Twilio request failed');
      throw new WhatsAppDeliveryError('Could not reach the messaging provider', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      log.error({ status: response.status, to: message.to, detail }, 'Twilio rejected the message');
      throw new WhatsAppDeliveryError('The messaging provider rejected the request', {
        status: response.status,
      });
    }

    const payload = (await response.json().catch(() => ({}))) as TwilioMessageResponse;
    log.info(
      { sid: payload.sid, status: payload.status, channel: message.channel, to: message.to },
      'Verification code sent',
    );
  }
}
