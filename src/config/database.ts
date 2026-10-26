import mongoose from 'mongoose';
import { env } from './env.js';
import { createChildLogger } from './logger.js';
import { MONGODB_CONNECTION_STATES } from '../consts/constants.js';

const log = createChildLogger('db');

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hide credentials when logging a connection string.
 */
function safeUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, '//***:***@');
}

let listenersRegistered = false;

/**
 * The database this connection talks to.
 *
 * A URI that already names a database keeps it; one that stops at the host (as
 * Atlas hands them out) gets `MONGODB_DB` instead of the driver's "test"
 * default, so the app never quietly writes to a scratch database.
 */
function resolveDbName(uri: string): string | undefined {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const hostAndPath = withoutScheme.slice(withoutScheme.indexOf('@') + 1);
  const slash = hostAndPath.indexOf('/');
  if (slash === -1) return env.MONGODB_DB;

  const path = hostAndPath.slice(slash + 1).split('?')[0]?.trim();
  return path ? undefined : env.MONGODB_DB;
}

function registerConnectionListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => log.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => log.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => log.info('MongoDB reconnected'));
  mongoose.connection.on('error', (error) => log.error({ err: error }, 'MongoDB error'));
}

/**
 * Connect to MongoDB with exponential backoff.
 * Throws once every retry has been exhausted so boot can fail loudly.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  registerConnectionListeners();

  const state = mongoose.connection.readyState;
  if (state === 1) {
    log.debug('MongoDB already connected, reusing existing connection');
    return mongoose;
  }

  log.info({ uri: safeUri(env.MONGODB_URI) }, 'Connecting to MongoDB...');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      mongoose.set('strictQuery', true);

      const dbName = resolveDbName(env.MONGODB_URI);
      if (dbName) log.info({ database: dbName }, 'No database in MONGODB_URI, using MONGODB_DB');

      await mongoose.connect(env.MONGODB_URI, {
        ...(dbName ? { dbName } : {}),
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        maxPoolSize: 10,
        minPoolSize: 1,
        autoIndex: !env.IS_PRODUCTION,
      });

      log.info('MongoDB connection established');
      return mongoose;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const message = error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        log.error({ err: error, attempts: attempt }, 'MongoDB connection failed permanently');
        throw new Error(`Unable to connect to MongoDB after ${attempt} attempts: ${message}`);
      }

      const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
      log.warn(
        { attempt, maxRetries: MAX_RETRIES, retryInMs: delay, reason: message },
        'MongoDB connection failed, retrying...',
      );
      await sleep(delay);
    }
  }

  throw new Error('Unreachable: MongoDB connection loop exited without a result');
}

/** Close the MongoDB connection (used during graceful shutdown). */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
  log.info('MongoDB connection closed');
}

/** Human-readable connection state, handy for health checks. */
export function getDatabaseState(): string {
  return MONGODB_CONNECTION_STATES[mongoose.connection.readyState] ?? 'unknown';
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export { mongoose };
