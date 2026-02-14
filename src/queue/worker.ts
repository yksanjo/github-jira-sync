/**
 * Sync Worker - Processes sync jobs from the queue
 */

import { Worker, Job } from 'bullmq';
import { getConfig } from '../config';
import { syncEngine } from '../core/sync-engine';
import { SyncJobData, SyncJobResult, redisConnection, QUEUE_NAMES } from './index';
import { logger } from '../logger';
import { recordSyncJob } from '../monitoring';

/**
 * Creates and starts the sync worker
 */
export function createWorker(
  concurrency: number = getConfig().queue.concurrency
): Worker {
  const worker = new Worker<SyncJobData>(
    'sync-worker',
    async (job: Job<SyncJobData>): Promise<SyncJobResult> => {
      const startTime = Date.now();
      
      logger.info('Processing sync job', {
        jobId: job.id,
        direction: job.data.direction,
        eventType: job.data.eventType,
      });

      try {
        const result = await syncEngine.processSync(
          job.data.direction,
          job.data.eventType,
          job.data.sourceData
        );

        const processingTime = Date.now() - startTime;
        
        // Record metrics
        recordSyncJob(
          job.data.direction,
          job.data.eventType,
          result.success ? 'success' : 'failed',
          processingTime
        );

        if (!result.success) {
          throw new Error(result.error);
        }

        logger.info('Sync job completed', {
          jobId: job.id,
          processingTimeMs: processingTime,
          targetId: result.targetId,
        });

        return {
          success: true,
          targetId: result.targetId,
          processingTimeMs: processingTime,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const processingTime = Date.now() - startTime;
        
        logger.error('Sync job failed', {
          jobId: job.id,
          error: errorMessage,
          processingTimeMs: processingTime,
        });

        // Record failed metrics
        recordSyncJob(
          job.data.direction,
          job.data.eventType,
          'failed',
          processingTime
        );

        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency,
      limiter: {
        max: 10,
        duration: 1000,
      },
    }
  );

  // Event handlers
  worker.on('completed', (job) => {
    logger.info('Job completed', {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error('Job failed', {
      jobId: job?.id,
      error: error.message,
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Job stalled', { jobId });
  });

  logger.info('Sync worker created', { concurrency });

  return worker;
}

// Export singleton worker instance
let workerInstance: Worker | null = null;

/**
 * Gets or creates the sync worker
 */
export function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = createWorker();
  }
  return workerInstance;
}

/**
 * Stops the sync worker
 */
export async function stopWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    logger.info('Sync worker stopped');
  }
}
