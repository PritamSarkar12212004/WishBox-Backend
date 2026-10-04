import { AppError } from '../../shared/errors.js';
import { HTTP_STATUS } from '../../consts/constants.js';

/**
 * The login code travels over WhatsApp by default. `sms` is kept as a fallback
 * channel because the same gateway can deliver a plain text message.
 */
export type MessageChannel = 'whatsapp' | 'sms';

export interface OutboundMessage {
  /** E.164 number, e.g. `+919876543210`. */
  to: string;
  body: string;
  channel: MessageChannel;
}

/**
 * A delivery backend for one-time codes. Swapping gateways (Twilio, Meta
 * WhatsApp Cloud API, MSG91, …) means implementing this interface and adding
 * the slug to the WHATSAPP_PROVIDER env enum.
 */
export interface WhatsAppProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<void>;
}

/** Thrown when the upstream gateway refuses or fails to deliver a message. */
export class WhatsAppDeliveryError extends AppError {
  constructor(message = 'Could not deliver the verification code', details?: unknown) {
    super(
      message,
      HTTP_STATUS.BAD_GATEWAY,
      'WHATSAPP_DELIVERY_FAILED',
      { details, isOperational: true },
    );
  }
}
