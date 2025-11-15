import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { appConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { SyncJob } from '../../types/index.js';

const redisConnection = new Redis(appConfig.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const syncQueue = new Queue<SyncJob>('sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

export const queueEvents = new QueueEvents('sync', {
  connection: redisConnection,
});

// Event listeners for monitoring
queueEvents.on('completed', ({ jobId }) => {
  logger.info({ jobId }, 'Sync job completed');
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, 'Sync job failed');
});

queueEvents.on('stalled', ({ jobId }) => {
  logger.warn({ jobId }, 'Sync job stalled');
});

/**
 * Add a sync job to the queue with deduplication
 */
export async function addSyncJob(job: SyncJob, options?: { delay?: number }): Promise<string> {
  // Create a unique job ID based on the sync parameters to prevent duplicates
  const jobId = `${job.direction}:${job.eventType}:${job.githubIssueNumber || job.jiraIssueKey}:${job.timestamp}`;

  try {
    const jobResult = await syncQueue.add(
      'sync-job',
      job,
      {
        jobId,
        ...options,
      }
    );

    logger.info({ jobId: jobResult.id, direction: job.direction, eventType: job.eventType }, 'Added sync job to queue');
    return jobResult.id!;
  } catch (error) {
    logger.error({ job, error }, 'Failed to add sync job to queue');
    throw error;
  }
}

/**
 * Create a worker for processing sync jobs
 */
export function createSyncWorker(processor: (job: SyncJob) => Promise<void>) {
  return new Worker<SyncJob>(
    'sync',
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing sync job');
      await processor(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 jobs concurrently
      limiter: {
        max: 10,
        duration: 1000, // Max 10 jobs per second
      },
    }
  );
}

/**
 * Gracefully shutdown queue connections
 */
export async function closeQueueConnections(): Promise<void> {
  await syncQueue.close();
  await queueEvents.close();
  await redisConnection.quit();
}

