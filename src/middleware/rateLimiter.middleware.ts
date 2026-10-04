import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { sendError } from '../shared/apiResponse.js';
import { ERROR_CODES, HTTP_STATUS } from '../consts/constants.js';

const MINUTE = 60 * 1000;

function rateLimitHandler(req: Request, res: Response): void {
  logger.warn(
    { method: req.method, url: req.originalUrl, ip: req.ip },
    'Rate limit exceeded',
  );
  sendError(res, 'Too many requests, please try again later.', {
    statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
    code: ERROR_CODES.TOO_MANY_REQUESTS,
  });
}

/** Broad limiter applied to every route. Disabled while running tests. */
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.IS_TEST,
  handler: rateLimitHandler,
});

/** Strict limiter for sensitive endpoints such as login, signup or OTP. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: env.IS_TEST ? 10_000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler,
});
