import pino from 'pino';
import { env } from './env.js';
import { SERVICE_NAME } from '../consts/constants.js';

/**
 * Application-wide pino logger.
 * - Human readable output in development (via pino-pretty)
 * - Structured JSON in production so log shippers can parse it
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: SERVICE_NAME, env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
      'token',
      '*.token',
      'accessToken',
      '*.accessToken',
      'refreshToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  transport: env.IS_PRODUCTION
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service,env',
          messageFormat: '[{context}] {msg}',
        },
      },
});

/** Create a namespaced child logger, e.g. `createChildLogger('db')`. */
export const createChildLogger = (context: string) => logger.child({ context });

export type Logger = typeof logger;
