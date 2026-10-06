import { createChildLogger } from '../../../config/logger.js';
import {
  bodyToText,
  describeHttpError,
  httpClient,
  httpResponseError,
} from '../../../shared/httpClient.js';
import { WhatsAppDeliveryError } from '../whatsapp.errors.js';
import { gatewayConfig, requireToken } from './config.js';
import { maskNumber, toGatewayNumber } from './phone.js';
import type { GatewayMessageRequest, GatewaySendResult } from './types.js';

const log = createChildLogger('whatsapp:gateway');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface GatewayResponseBody {
  message?: string;
  error?: string;
}

/** The gateway may answer with JSON, or with JSON as text. Handle both. */
function parseBody(data: unknown): GatewayResponseBody | null {
  if (data && typeof data === 'object') return data as GatewayResponseBody;
  if (typeof data === 'string' && data) {
    try {
      return JSON.parse(data) as GatewayResponseBody;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * POST one template message to the gateway.
 *
 * The gateway runs on a free tier that can cold-start for 30s+, so a single
 * network blip must not fail a login: attempts are retried with a timeout.
 *
 * Failure handling splits in two, mirroring what the caller can act on:
 * - The gateway answered with a bad status -> returned as `success: false`, so
 *   the caller can fail loudly (login codes) or stay quiet (notifications).
 * - The gateway was unreachable -> retried, then thrown as a 502.
 */
export async function postTemplateMessage(
  request: GatewayMessageRequest,
): Promise<GatewaySendResult> {
  const token = requireToken();
  const apiUrl = request.apiUrl?.trim() || gatewayConfig.apiUrl;
  const to = toGatewayNumber(request.to);

  if (!to) {
    throw new WhatsAppDeliveryError('Invalid mobile number');
  }

  const payload = {
    to,
    template: request.template,
    variables: request.variables,
    media: { url: request.mediaUrl },
  };

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= gatewayConfig.maxAttempts; attempt += 1) {
    try {
      const response = await httpClient.post(apiUrl, payload, {
        timeout: gatewayConfig.timeoutMs,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const parsed = parseBody(response.data);
      log.info(
        { statusCode: response.status, template: request.template, to: maskNumber(to), attempt },
        'Gateway accepted the message',
      );

      return {
        success: true,
        statusCode: response.status,
        response: bodyToText(response.data),
        message: parsed?.message ?? parsed?.error,
      };
    } catch (error) {
      // The gateway answered (4xx/5xx): its error body is the useful part, and
      // a retry would not change the outcome.
      const failure = httpResponseError(error);
      if (failure) {
        const parsed = parseBody(failure.data);
        const text = bodyToText(failure.data);

        log.warn(
          { statusCode: failure.status, to: maskNumber(to), body: text },
          'Gateway rejected the message',
        );

        return {
          success: false,
          statusCode: failure.status,
          response: text,
          message: parsed?.message ?? parsed?.error ?? `HTTP ${failure.status}`,
        };
      }

      // Unreachable: worth another attempt.
      lastError = error;
      log.warn(
        {
          attempt,
          maxAttempts: gatewayConfig.maxAttempts,
          to: maskNumber(to),
          reason: describeHttpError(error),
        },
        'Gateway attempt failed',
      );

      if (attempt < gatewayConfig.maxAttempts) {
        await sleep(gatewayConfig.retryDelayMs);
      }
    }
  }

  throw new WhatsAppDeliveryError('Could not reach the messaging gateway', {
    cause: describeHttpError(lastError),
  });
}
