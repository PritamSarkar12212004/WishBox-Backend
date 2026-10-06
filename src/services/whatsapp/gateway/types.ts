/** Placeholders filled into an approved template body. */
export type GatewayVariables = Record<string, string>;

/** One template message, already resolved against config. */
export interface GatewayMessageRequest {
  /** Local or E.164 number; the client normalises it. */
  to: string;
  template: string;
  variables: GatewayVariables;
  /** Header image. The gateway rejects a template without one. */
  mediaUrl: string;
  /** Per-flow override, e.g. a separate instance for bookings. */
  apiUrl?: string;
}

/** What the gateway answered. Never throws for a non-2xx response. */
export interface GatewaySendResult {
  success: boolean;
  statusCode?: number;
  response?: string;
  message?: string;
}

/** A business notification (booking confirmation, admin alert). */
export interface GatewayTemplateRequest {
  phone: string;
  /** Defaults to the booking template. */
  templateId?: string;
  variables: GatewayVariables;
  /** Defaults to the shared header image. */
  mediaUrl?: string;
  /** Label used in logs so each notification type is traceable. */
  label?: string;
  /** Defaults to SMS_BOOKING_API_URL, then SMS_API_URL. */
  apiUrl?: string;
}
