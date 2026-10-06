import { AppError } from '../../shared/errors.js';
import { HTTP_STATUS } from '../../consts/constants.js';

/** Thrown when the Wishbox gateway refuses a message or cannot be reached. */
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
