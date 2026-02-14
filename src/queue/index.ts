/**
 * Queue Service - BullMQ implementation for reliable job processing
 * Handles GitHub-Jira sync jobs with retry logic and concurrency
 */

import { 
  Queue, 
  Worker, 
  JobsOptions, 
  WorkerOptions,
  QueueOptions,
} from 'bullmq';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config';
import { 
  SyncDirection, 
  SyncEventType, 
  SyncStatus,
  SyncJob,
} from '../types';
import { logger } from '../logger';

// Connection options for Redis
const connectionOptions = {
  host: getConfig().redis.host,
  port: getConfig().redis.port,
  password: getConfig().redis.password,
  maxRetriesPerRequest: null,
};

// Create Redis connection
export const redisConnection = new Redis(connectionOptions);

// Queue names
export const QUEUE_NAMES = {
  GITHUB_SYNC: 'github-sync',
  JIRA_SYNC: 'jira-sync',
  SYNC_WORKER: 'sync-worker',
  CLEANUP: 'cleanup',
} as const;

// Job types
export interface SyncJobData {
  id: string;
  direction: SyncDirection;
  eventType: SyncEventType;
  sourceId: string;
  sourceData: Record<string, unknown>;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncJobResult {
  success: boolean;
  targetId?: string;
  error?: string;
  processingTimeMs: number;
}

// ============================================================================
// QUEUE CREATION
// ============================================================================

/**
 * Creates a new queue with standard options
 */
export function createQueue(name: string): Queue {
  const queueOptions: QueueOptions = {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: {
        count: 1000,
        age: 24 * 3600, // 24 hours
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 3600, // 7 days
      },
      attempts: getConfig().queue.maxRetries,
      backoff: {
        type: 'exponential' as const,
        delay: getConfig().queue.retryDelay,
      },
    },
  };

  return new Queue(name, queueOptions);
}

// Queue instances
export const githubSyncQueue = createQueue(QUEUE_NAMES.GITHUB_SYNC);
export const jiraSyncQueue = createQueue(QUEUE_NAMES.JIRA_SYNC);

// ============================================================================
// JOB MANAGEMENT
// ============================================================================

/**
 * Adds a new sync job to the queue
 */
export async function addSyncJob(
  direction: SyncDirection,
  eventType: SyncEventType,
  sourceId: string,
  sourceData: Record<string, unknown>,
  options?: {
    targetId?: string;
    metadata?: Record<string, unknown>;
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const jobId = uuidv4();
  
  const jobData: SyncJobData = {
    id: jobId,
    direction,
    eventType,
    sourceId,
    sourceData,
    targetId: options?.targetId,
    metadata: options?.metadata,
  };

  const jobOptions: JobsOptions = {};
  
  if (options?.priority) {
    jobOptions.priority = options.priority;
  }
  
  if (options?.delay) {
    jobOptions.delay = options.delay;
  }

  const queue = direction === SyncDirection.GITHUB_TO_JIRA 
    ? githubSyncQueue 
    : jiraSyncQueue;

  await queue.add(eventType, jobData, jobOptions);
  
  logger.info('Sync job added', {
    jobId,
    direction,
    eventType,
    sourceId,
  });

  return jobId;
}

/**
 * Gets the count of waiting and active jobs
 */
export async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const queue = queueName === QUEUE_NAMES.GITHUB_SYNC 
    ? githubSyncQueue 
    : jiraSyncQueue;

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

/**
 * Gets all queues stats
 */
export async function getAllQueueStats(): Promise<Record<string, {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}>> {
  const [githubStats, jiraStats] = await Promise.all([
    getQueueStats(QUEUE_NAMES.GITHUB_SYNC),
    getQueueStats(QUEUE_NAMES.JIRA_SYNC),
  ]);

  return {
    [QUEUE_NAMES.GITHUB_SYNC]: githubStats,
    [QUEUE_NAMES.JIRA_SYNC]: jiraStats,
  };
}

/**
 * Pauses a queue
 */
export async function pauseQueue(queueName: string): Promise<void> {
  const queue = queueName === QUEUE_NAMES.GITHUB_SYNC 
    ? githubSyncQueue 
    : jiraSyncQueue;
  
  await queue.pause();
  logger.info('Queue paused', { queueName });
}

/**
 * Resumes a queue
 */
export async function resumeQueue(queueName: string): Promise<void> {
  const queue = queueName === QUEUE_NAMES.GITHUB_SYNC 
    ? githubSyncQueue 
    : jiraSyncQueue;
  
  await queue.resume();
  logger.info('Queue resumed', { queueName });
}

/**
 * Cleans up old completed/failed jobs
 */
export async function cleanOldJobs(
  queueName: string,
  olderThan: number = 7 * 24 * 3600 * 1000 // 7 days
): Promise<number> {
  const queue = queueName === QUEUE_NAMES.GITHUB_SYNC 
    ? githubSyncQueue 
    : jiraSyncQueue;

  const cleaned = await queue.clean(olderThan, 1000, 'completed');
  const failedCleaned = await queue.clean(olderThan, 1000, 'failed');
  
  logger.info('Old jobs cleaned', { 
    queueName, 
    completedCount: cleaned.length,
    failedCount: failedCleaned.length,
  });

  return cleaned.length + failedCleaned.length;
}

/**
 * Drains all jobs from a queue (for shutdown)
 */
export async function drainQueue(queueName: string): Promise<void> {
  const queue = queueName === QUEUE_NAMES.GITHUB_SYNC 
    ? githubSyncQueue 
    : jiraSyncQueue;

  await queue.drain();
  logger.info('Queue drained', { queueName });
}

/**
 * Closes all queue connections
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all([
    githubSyncQueue.close(),
    jiraSyncQueue.close(),
    redisConnection.quit(),
  ]);
  
  logger.info('All queues closed');
}

// ============================================================================
// ORCHESTRATION HELPERS
// ============================================================================

/**
 * Health check for queues
 */
export async function checkQueueHealth(): Promise<{
  healthy: boolean;
  details: Record<string, unknown>;
}> {
  try {
    const stats = await getAllQueueStats();
    const redisInfo = await redisConnection.info();
    
    const healthy = redisInfo.includes('redis_version');
    
    return {
      healthy,
      details: {
        queues: stats,
        redisConnected: healthy,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
