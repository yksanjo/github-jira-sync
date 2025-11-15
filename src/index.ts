import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { appConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { webhookRoutes } from './routes/webhooks.js';
import { syncRoutes } from './routes/sync.js';
import { configRoutes } from './routes/config.js';
import { closeQueueConnections } from './modules/queue/client.js';

const fastify = Fastify({
  logger: logger.child({ component: 'api' }),
});

// Register plugins
await fastify.register(helmet);
await fastify.register(cors, {
  origin: true,
});

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register routes
await fastify.register(webhookRoutes);
await fastify.register(syncRoutes);
await fastify.register(configRoutes);

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: appConfig.port, host: '0.0.0.0' });
    logger.info({ port: appConfig.port }, 'Server started');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  await fastify.close();
  await closeQueueConnections();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();

