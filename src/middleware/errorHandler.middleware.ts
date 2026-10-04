import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { buildError } from '../shared/apiResponse.js';
import { AppError, NotFoundError } from '../shared/errors.js';
import { ERROR_CODES, HTTP_STATUS } from '../consts/constants.js';

/** 404 for every route that never matched a handler. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  isOperational: boolean;
}

/** Map any thrown value onto a clean, client-safe error shape. */
function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      isOperational: error.isOperational,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
      isOperational: true,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Database validation failed',
      details: Object.values(error.errors).map((issue) => ({
        field: issue.path,
        message: issue.message,
      })),
      isOperational: true,
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      code: ERROR_CODES.BAD_REQUEST,
      message: `Invalid value for field "${error.path}"`,
      isOperational: true,
    };
  }

  // Duplicate key from a unique index.
  if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
    const keys = Object.keys((error as { keyValue?: Record<string, unknown> }).keyValue ?? {});
    return {
      statusCode: HTTP_STATUS.CONFLICT,
      code: ERROR_CODES.DUPLICATE_KEY,
      message: keys.length > 0 ? `Duplicate value for: ${keys.join(', ')}` : 'Duplicate key',
      isOperational: true,
    };
  }

  // Malformed JSON body produced by express.json().
  if (error instanceof SyntaxError && 'body' in error) {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      code: ERROR_CODES.BAD_REQUEST,
      message: 'Malformed JSON in request body',
      isOperational: true,
    };
  }

  const name = (error as { name?: string })?.name;
  if (name === 'JsonWebTokenError') {
    return {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid authentication token',
      isOperational: true,
    };
  }
  if (name === 'TokenExpiredError') {
    return {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Authentication token expired',
      isOperational: true,
    };
  }

  return {
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Something went wrong',
    isOperational: false,
  };
}

/**
 * Global error handler. Must be the last middleware registered.
 * - Operational errors (4xx, expected) are logged as warnings.
 * - Unexpected errors are logged as errors with a full stack trace.
 * - Internal details are never leaked when NODE_ENV=production.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const normalized = normalizeError(error);
  const requestId = res.locals.requestId as string | undefined;

  if (normalized.isOperational && normalized.statusCode < 500) {
    logger.warn(
      { requestId, method: req.method, url: req.originalUrl, code: normalized.code, message: normalized.message },
      'Request failed',
    );
  } else {
    logger.error(
      { requestId, method: req.method, url: req.originalUrl, err: error },
      'Unhandled error',
    );
  }

  const body = buildError(
    normalized.code,
    normalized.message,
    normalized.statusCode,
    normalized.details,
  );

  if (requestId) body.requestId = requestId;

  if (!env.IS_PRODUCTION && error instanceof Error && error.stack) {
    body.stack = error.stack;
  }

  res.status(normalized.statusCode).json(body);
};
