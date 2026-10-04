import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

/**
 * Structured HTTP request logging with a per-request id.
 * The id is echoed back in the `x-request-id` response header and included
 * in every API response body so a user can quote it in a bug report.
 */
const httpLogger = pinoHttp({
  logger,

  genReqId: (req, res) => {
    const headerId = req.headers['x-request-id'];
    const id = (Array.isArray(headerId) ? headerId[0] : headerId) ?? randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },

  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,

  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
    err: (err) => ({
      type: err.type,
      message: err.message,
      stack: env.IS_PRODUCTION ? undefined : err.stack,
    }),
  },

  // Health checks are noisy and add no value to the log stream.
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url?.startsWith('/health?') === true,
  },
});

/**
 * Exposes the pino request id on `res.locals.requestId` so the response
 * formatter and the global error handler can attach it to every payload.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  httpLogger(req, res, () => {
    res.locals.requestId = req.id;
    next();
  });
};
