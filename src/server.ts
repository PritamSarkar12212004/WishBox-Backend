import { createServer, type Server } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createChildLogger } from './config/logger.js';
import { SERVICE_NAME } from './consts/constants.js';

const log = createChildLogger('server');

const SHUTDOWN_TIMEOUT_MS = 10_000;

let httpServer: Server | undefined;
let isShuttingDown = false;

async function startHttpServer(): Promise<Server> {
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.PORT, () => {
      server.off('error', reject);
      resolve();
    });
  });

  log.info(
    { port: env.PORT, env: env.NODE_ENV, url: `http://localhost:${env.PORT}` },
    `${SERVICE_NAME} listening on port ${env.PORT}`,
  );

  return server;
}

async function bootstrap(): Promise<void> {
  log.info({ env: env.NODE_ENV, node: process.version }, `Starting ${SERVICE_NAME}...`);

  await connectDatabase();

  httpServer = await startHttpServer();
  log.info(`Health check available at http://localhost:${env.PORT}/health`);
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info({ signal }, 'Shutting down gracefully...');

  const forceExit = setTimeout(() => {
    log.error('Graceful shutdown timed out, forcing exit');
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((error) => (error ? reject(error) : resolve()));
      });
      log.info('HTTP server closed');
    }

    await disconnectDatabase();
  } catch (error) {
    log.error({ err: error }, 'Error during shutdown');
    exitCode = exitCode === 0 ? 1 : exitCode;
  } finally {
    clearTimeout(forceExit);
  }

  log.info('Shutdown complete');
  process.exit(exitCode);
}

// --- Process-level safety nets -------------------------------------------
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  log.fatal({ err: error }, 'Uncaught exception - shutting down');
  void shutdown('uncaughtException', 1);
});

void bootstrap().catch((error) => {
  log.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
