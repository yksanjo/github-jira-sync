/**
 * Main Entry Point
 * GitHub-Jira Sync Service
 */

import { startServer } from './server';
import { getWorker, stopWorker } from './queue/worker';
import { closeAllQueues } from './queue';
import { startMetricsCollection } from './monitoring';
import { logger } from './logger';

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await shutdown();
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await shutdown();
});

async function shutdown(): Promise<void> {
  try {
    // Stop accepting new jobs
    await stopWorker();
    
    // Wait for active jobs to complete (with timeout)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Close queue connections
    await closeAllQueues();
    
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Main function
async function main(): Promise<void> {
  logger.info('Starting GitHub-Jira Sync Service');
  
  // Start the worker
  getWorker();
  
  // Start metrics collection
  startMetricsCollection();
  
  // Start the HTTP server
  startServer();
}

// Run the service
main().catch((error) => {
  logger.error('Failed to start service', { error });
  process.exit(1);
});
