import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

prisma.$on('query', (e) => {
  logger.debug({ query: e.query, duration: e.duration }, 'Database query');
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

