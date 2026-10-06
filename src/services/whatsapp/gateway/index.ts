/**
 * Wishbox messaging gateway (WhatsApp templates).
 *
 * Layout:
 *   config.ts        every gateway setting, resolved from validated env
 *   phone.ts         number formatting for this gateway
 *   templates.ts     template ids + placeholder builders
 *   client.ts        the HTTP call, with timeout and retry
 *   provider.ts      the login-code transport
 *   notifications.ts fire-and-forget templates for business notifications
 *   types.ts         request/response shapes
 */
export { gatewayConfig, requireToken } from './config.js';
export { postTemplateMessage } from './client.js';
export { GatewayWhatsAppProvider } from './provider.js';
export { sendTemplateNotification } from './notifications.js';
export { otpVariables, mergeOtpVariables, templateIdFor } from './templates.js';
export { toGatewayNumber, maskNumber, digitsOf } from './phone.js';
export type {
  GatewayMessageRequest,
  GatewaySendResult,
  GatewayTemplateRequest,
  GatewayVariables,
} from './types.js';
