import * as Sentry from '@sentry/node';
import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { initSentry, captureError } from './lib/sentry';

initSentry();

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  await Sentry.close(2000).catch(() => undefined);
  await Promise.allSettled([disconnectDatabase()]);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal(err, 'Uncaught exception');
  captureError(err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error(reason, 'Unhandled rejection');
  captureError(reason);
});

// Start server
const start = async () => {
  await connectDatabase();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 CareerOS API running on port ${env.PORT} (${env.NODE_ENV})`);
  });
  // SSE chat streams can run for a while; don't let Node cut them off
  server.requestTimeout = 5 * 60_000;
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 61_000;
};

start();

