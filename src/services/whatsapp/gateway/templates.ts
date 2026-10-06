import { gatewayConfig } from './config.js';
import type { GatewayVariables } from './types.js';

/**
 * Variables for the approved OTP template. The gateway expects a single
 * placeholder whose key is configurable, and it must match the template
 * (SMS_API_VARIABLES_KEY, default "otpdev").
 */
export function otpVariables(code: string): GatewayVariables {
  return { [gatewayConfig.variablesKey]: code };
}

/**
 * Merge the OTP code into caller-supplied variables without ever overwriting a
 * caller key — a booking template shares the same request shape.
 */
export function mergeOtpVariables(
  code: string,
  variables: GatewayVariables = {},
): GatewayVariables {
  const merged: GatewayVariables = { ...variables };
  const key = gatewayConfig.variablesKey;

  if (!(key in merged)) {
    merged[key] = code;
  }

  return merged;
}

/** Template id for a notification type, falling back to the booking template. */
export function templateIdFor(
  kind: 'otp' | 'booking' | 'admin',
  override?: string,
): string {
  if (override?.trim()) return override.trim();

  switch (kind) {
    case 'otp':
      return gatewayConfig.otpTemplateId;
    case 'admin':
      return gatewayConfig.adminTemplateId ?? gatewayConfig.bookingTemplateId;
    case 'booking':
    default:
      return gatewayConfig.bookingTemplateId;
  }
}
