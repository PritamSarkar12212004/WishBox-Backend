import type { Response } from 'express';
import { ERROR_CODES, HTTP_STATUS, type ErrorCode, type HttpStatus } from '../consts/constants.js';

/**
 * Every response the API returns - success or failure - uses this envelope.
 * That keeps clients simple: `if (success) use data; else read error.code`.
 */
export interface ApiError {
  code: ErrorCode | string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T | null;
  error: ApiError | null;
  /** Optional pagination or other response metadata. */
  meta?: Record<string, unknown>;
  timestamp: string;
  /** Request id assigned by the request logger, useful for support tickets. */
  requestId?: string;
  /** Only ever present outside production. */
  stack?: string;
}

export function buildSuccess<T>(
  data: T,
  message = 'Success',
  meta?: Record<string, unknown>,
): ApiResponse<T> {
  return {
    success: true,
    statusCode: HTTP_STATUS.OK,
    message,
    data,
    error: null,
    ...(meta ? { meta } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function buildError(
  code: ErrorCode | string,
  message: string,
  statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  details?: unknown,
): ApiResponse<never> {
  return {
    success: false,
    statusCode,
    message,
    data: null,
    error: { code, message, ...(details === undefined ? {} : { details }) },
    timestamp: new Date().toISOString(),
  };
}

export interface SendSuccessOptions {
  statusCode?: number;
  message?: string;
  meta?: Record<string, unknown>;
}

/** Send a standard success response. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  { statusCode = HTTP_STATUS.OK, message = 'Success', meta }: SendSuccessOptions = {},
): Response {
  const body = buildSuccess(data, message, meta);
  body.statusCode = statusCode;
  if (res.locals.requestId) body.requestId = String(res.locals.requestId);
  return res.status(statusCode).json(body);
}

export interface SendErrorOptions {
  statusCode?: number;
  code?: ErrorCode | string;
  details?: unknown;
}

/** Send a standard error response. Prefer throwing AppError and letting the
 *  global error handler call this, unless you are inside a middleware. */
export function sendError(
  res: Response,
  message: string,
  { statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, code = ERROR_CODES.INTERNAL_ERROR, details }: SendErrorOptions = {},
): Response {
  const body = buildError(code, message, statusCode, details);
  if (res.locals.requestId) body.requestId = String(res.locals.requestId);
  return res.status(statusCode).json(body);
}

export { HTTP_STATUS, ERROR_CODES };
export type { HttpStatus, ErrorCode };
