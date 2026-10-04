import { createChildLogger } from '../../config/logger.js';
import type { OutboundMessage, WhatsAppProvider } from './whatsapp.types.js';

const log = createChildLogger('whatsapp:console');

/**
 * Development provider: writes the message to the log instead of sending it.
 * This is the default so the OTP flow works with zero third-party setup.
 */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  public readonly name = 'console';

  async send(message: OutboundMessage): Promise<void> {
    log.info(
      { channel: message.channel, to: message.to },
      `[dev] ${message.channel.toUpperCase()} to ${message.to} -> ${message.body}`,
    );
  }
}
