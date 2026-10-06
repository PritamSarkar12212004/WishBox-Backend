import axios, { type AxiosInstance } from 'axios';

/**
 * The axios instance every outbound third-party call goes through.
 *
 * Choosing axios over raw `fetch` gives us, in one place: request timeouts,
 * automatic JSON parsing, and a consistent typed error shape.
 *
 * Behaviour notes:
 * - Non-2xx responses **throw** an `AxiosError` (axios default). A caller that
 *   wants to read a provider's error body reads `error.response.data`. This is
 *   deliberate: silently ignoring a failed status is worse for payments and
 *   shipping than for a notification, so the safe default wins here.
 * - Per-call `timeout` still overrides the default below.
 */
export const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

export const httpClient: AxiosInstance = axios.create({
  timeout: DEFAULT_HTTP_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
  },
});

/**
 * A short, log-safe description of an axios failure.
 * Never includes the response body or headers, which may carry credentials.
 */
export function describeHttpError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return `Request timed out after ${error.config?.timeout ?? DEFAULT_HTTP_TIMEOUT_MS}ms`;
    }
    if (error.response) {
      return `HTTP ${error.response.status}`;
    }
    return error.code ? `Network error (${error.code})` : 'Network error';
  }

  return error instanceof Error ? error.message : String(error);
}

/** The parts of a failed call worth acting on. */
export interface HttpResponseError {
  status: number;
  data: unknown;
}

/**
 * Returns the response when the host answered with a bad status, or `null`
 * when the call failed before any response arrived (network / timeout).
 * That distinction is what separates "do not retry" from "retry".
 */
export function httpResponseError(error: unknown): HttpResponseError | null {
  if (axios.isAxiosError(error) && error.response) {
    return { status: error.response.status, data: error.response.data };
  }
  return null;
}

/** Render a response body as text for logging, whatever axios parsed it into. */
export function bodyToText(data: unknown): string {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export default httpClient;
