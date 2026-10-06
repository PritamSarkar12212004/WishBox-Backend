import { createChildLogger } from '../../../config/logger.js';
import { BadRequestError } from '../../../shared/errors.js';
import { postTemplateMessage } from './client.js';
import { gatewayConfig } from './config.js';
import { signupVariables, templateIdFor } from './templates.js';
import type { GatewaySendResult, GatewayTemplateRequest } from './types.js';

const log = createChildLogger('whatsapp:notifications');

/**
 * Template delivery for the non-login flows (booking confirmation, admin
 * alerts).
 *
 * Deliberately never throws on a gateway failure: callers use it
 * fire-and-forget after a business action has already succeeded, so a dead
 * gateway must not fail that action. Only a missing phone number is a caller
 * error.
 *
 * Booking variables are passed in by the caller — the template's placeholder
 * keys belong to the template, not to this transport layer.
 */
export async function sendTemplateNotification(
  request: GatewayTemplateRequest,
): Promise<GatewaySendResult> {
  if (!request.phone) {
    throw new BadRequestError('Phone number is required');
  }

  const label = request.label ?? 'template';

  try {
    const apiUrl = request.apiUrl?.trim() || gatewayConfig.bookingApiUrl?.trim() || undefined;

    const result = await postTemplateMessage({
      to: request.phone,
      template: templateIdFor('booking', request.templateId),
      variables: request.variables,
      mediaUrl: request.mediaUrl?.trim() || gatewayConfig.mediaUrl,
      ...(apiUrl ? { apiUrl } : {}),
    });

    if (!result.success) {
      log.error(
        { label, statusCode: result.statusCode, message: result.message },
        `${label} message rejected by the gateway`,
      );
      return result;
    }

    log.info({ label }, `${label} message sent`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ label, message }, `${label} message failed`);
    return { success: false, message };
  }
}

/**
 * Welcome message sent after a shopper's login code has been verified: the
 * approved signup template, filled with the storefront's support contacts.
 *
 * Inherits the never-throws contract above, so a slow or dead gateway cannot
 * turn a successful sign-in into an error response — the shopper is already
 * signed in by the time this runs.
 */
export async function sendSignupWelcome(phone: string): Promise<GatewaySendResult> {
  return sendTemplateNotification({
    phone,
    templateId: templateIdFor('signup'),
    variables: signupVariables(),
    label: 'signup welcome',
    // Pinned to the main gateway: the booking override must not capture it.
    apiUrl: gatewayConfig.apiUrl,
  });
}
