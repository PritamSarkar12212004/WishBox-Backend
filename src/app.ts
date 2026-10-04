import compression from 'compression';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import {
  errorHandler,
  globalRateLimiter,
  notFoundHandler,
  requestLogger,
} from './middleware/index.js';
import { apiRouter } from './routes/index.js';
import { healthRouter } from './routes/health.routes.js';
import { sendSuccess } from './shared/apiResponse.js';
import { ForbiddenError } from './shared/errors.js';
import { SERVICE_NAME } from './consts/constants.js';

function buildCorsOptions(): CorsOptions {
  const allowAllOrigins = env.corsOrigins.includes('*');

  return {
    origin: allowAllOrigins
      ? true // reflect the request origin (keeps credentials working)
      : (origin, callback) => {
          if (!origin || env.corsOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(new ForbiddenError(`Origin "${origin}" is not allowed by CORS`));
        },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 24 * 60 * 60,
  };
}

/**
 * Builds the Express application. Exported separately from `app` so tests can
 * create isolated instances.
 */
export function createApp(): Express {
  const app = express();

  // --- Proxy / misc -------------------------------------------------------
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('json spaces', env.IS_PRODUCTION ? 0 : 2);

  // --- Security -----------------------------------------------------------
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(buildCorsOptions()));

  // --- Performance --------------------------------------------------------
  app.use(compression());

  // --- Body parsing -------------------------------------------------------
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // --- Observability & abuse protection -----------------------------------
  app.use(requestLogger);
  app.use(globalRateLimiter);

  // --- Routes -------------------------------------------------------------
  app.get('/', (_req, res) => {
    sendSuccess(
      res,
      {
        name: 'Wishbox API',
        service: SERVICE_NAME,
        version: 'v1',
        environment: env.NODE_ENV,
        docs: `${env.API_PREFIX}`,
      },
      { message: 'Wishbox API is running' },
    );
  });

  // Health is intentionally mounted at the root as well, so orchestrators can
  // probe `/health` without knowing the API prefix.
  app.use('/health', healthRouter);
  app.use(env.API_PREFIX, apiRouter);

  // --- Fallbacks (must stay last) -----------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.debug({ apiPrefix: env.API_PREFIX, cors: env.corsOrigins }, 'Express app configured');
  return app;
}

export const app = createApp();

export default app;
