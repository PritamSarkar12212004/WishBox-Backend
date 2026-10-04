import { Router } from 'express';
import { env } from '../config/env.js';
import { getDatabaseState, isDatabaseConnected } from '../config/database.js';
import { sendSuccess, sendError } from '../shared/apiResponse.js';
import { HTTP_STATUS, ERROR_CODES } from '../consts/constants.js';
import { asyncHandler } from '../shared/asyncHandler.js';

export const healthRouter = Router();

const startedAt = Date.now();

/**
 * GET /health
 * Liveness + readiness probe. Returns 200 when the process is up and the
 * database is reachable, 503 otherwise.
 */
healthRouter.get(
  '/',
  asyncHandler((_req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const database = getDatabaseState();
    const healthy = isDatabaseConnected();

    const payload = {
      status: healthy ? 'ok' : 'degraded',
      uptime: uptimeSeconds,
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      version: process.env.npm_package_version ?? '1.0.0',
      services: {
        database: {
          status: database,
          healthy,
        },
      },
    };

    if (!healthy) {
      sendError(res, 'Service unavailable: database is not connected', {
        statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        details: payload,
      });
      return;
    }

    sendSuccess(res, payload, { message: 'Service is healthy' });
  }),
);
