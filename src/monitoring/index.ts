/**
 * Monitoring and Observability Service
 * Prometheus metrics and health checks
 */

import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { getConfig } from '../config';
import { getAllQueueStats } from '../queue';
import { getDedupStats } from '../deduplication';
import { logger } from '../logger';

// Create registry
export const registry = new Registry();

// Add default metrics
collectDefaultMetrics({ register: registry });

// ============================================================================
// CUSTOM METRICS
// ============================================================================

// Sync job counters
export const syncJobTotal = new Counter({
  name: 'github_jira_sync_jobs_total',
  help: 'Total number of sync jobs processed',
  labelNames: ['direction', 'event_type', 'status'],
  registers: [registry],
});

export const syncJobDuration = new Histogram({
  name: 'github_jira_sync_job_duration_seconds',
  help: 'Duration of sync job processing in seconds',
  labelNames: ['direction', 'event_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

// Conflict metrics
export const conflictsDetected = new Counter({
  name: 'github_jira_sync_conflicts_detected_total',
  help: 'Total number of conflicts detected',
  labelNames: ['resolution_strategy'],
  registers: [registry],
});

export const conflictsResolved = new Counter({
  name: 'github_jira_sync_conflicts_resolved_total',
  help: 'Total number of conflicts resolved',
  labelNames: ['resolution_type'],
  registers: [registry],
});

// Deduplication metrics
export const deduplicationHits = new Counter({
  name: 'github_jira_sync_deduplication_hits_total',
  help: 'Total number of duplicate events filtered',
  registers: [registry],
});

// Queue metrics
export const queueWaitingJobs = new Gauge({
  name: 'github_jira_sync_queue_waiting_jobs',
  help: 'Number of waiting jobs in the queue',
  labelNames: ['queue'],
  registers: [registry],
});

export const queueActiveJobs = new Gauge({
  name: 'github_jira_sync_queue_active_jobs',
  help: 'Number of active jobs in the queue',
  labelNames: ['queue'],
  registers: [registry],
});

// API metrics
export const webhookReceived = new Counter({
  name: 'github_jira_sync_webhooks_received_total',
  help: 'Total number of webhooks received',
  labelNames: ['source', 'event_type'],
  registers: [registry],
});

export const webhookProcessingDuration = new Histogram({
  name: 'github_jira_sync_webhook_processing_duration_seconds',
  help: 'Duration of webhook processing in seconds',
  labelNames: ['source'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [registry],
});

// Error metrics
export const errorsTotal = new Counter({
  name: 'github_jira_sync_errors_total',
  help: 'Total number of errors',
  labelNames: ['source', 'error_type'],
  registers: [registry],
});

// ============================================================================
// METRICS UPDATE HELPERS
// ============================================================================

/**
 * Updates queue metrics from BullMQ
 */
export async function updateQueueMetrics(): Promise<void> {
  try {
    const stats = await getAllQueueStats();
    
    for (const [queueName, queueStats] of Object.entries(stats)) {
      queueWaitingJobs.set({ queue: queueName }, queueStats.waiting);
      queueActiveJobs.set({ queue: queueName }, queueStats.active);
    }
  } catch (error) {
    logger.error('Error updating queue metrics', { error });
  }
}

/**
 * Updates deduplication metrics
 */
export async function updateDeduplicationMetrics(): Promise<void> {
  try {
    const stats = await getDedupStats();
    logger.debug('Deduplication stats', { stats });
  } catch (error) {
    logger.error('Error updating deduplication metrics', { error });
  }
}

/**
 * Records a sync job completion
 */
export function recordSyncJob(
  direction: string,
  eventType: string,
  status: 'success' | 'failed',
  durationMs: number
): void {
  syncJobTotal.inc({ direction, event_type: eventType, status });
  syncJobDuration.observe({ direction, event_type: eventType }, durationMs / 1000);
  
  if (status === 'failed') {
    errorsTotal.inc({ source: 'sync', error_type: 'job_failed' });
  }
}

/**
 * Records a conflict
 */
export function recordConflict(strategy: string, resolved: boolean): void {
  conflictsDetected.inc({ resolution_strategy: strategy });
  
  if (resolved) {
    conflictsResolved.inc({ resolution_type: 'auto' });
  } else {
    conflictsResolved.inc({ resolution_type: 'manual' });
  }
}

/**
 * Records a deduplication hit
 */
export function recordDeduplicationHit(): void {
  deduplicationHits.inc();
}

/**
 * Records a webhook received
 */
export function recordWebhook(source: string, eventType: string): void {
  webhookReceived.inc({ source, event_type: eventType });
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

export interface HealthCheckResult {
  healthy: boolean;
  checks: Record<string, {
    healthy: boolean;
    message?: string;
    details?: unknown;
  }>;
}

/**
 * Performs a comprehensive health check
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult['checks'] = {};
  let allHealthy = true;

  // Check Redis connection
  try {
    const { checkQueueHealth } = await import('../queue');
    const redisHealth = await checkQueueHealth();
    checks.redis = {
      healthy: redisHealth.healthy,
      details: redisHealth.details,
    };
    allHealthy = allHealthy && redisHealth.healthy;
  } catch (error) {
    checks.redis = {
      healthy: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    allHealthy = false;
  }

  // Check queues
  try {
    const queueStats = await getAllQueueStats();
    const hasBacklog = Object.values(queueStats).some(
      stats => stats.waiting > 1000
    );
    
    checks.queues = {
      healthy: !hasBacklog,
      message: hasBacklog ? 'Queue backlog detected' : undefined,
      details: queueStats,
    };
    allHealthy = allHealthy && !hasBacklog;
  } catch (error) {
    checks.queues = {
      healthy: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    allHealthy = false;
  }

  // Check API clients
  checks.github = { healthy: true, message: 'Client initialized' };
  checks.jira = { healthy: true, message: 'Client initialized' };

  return {
    healthy: allHealthy,
    checks,
  };
}

// ============================================================================
// METRICS SERVER
// ============================================================================

import express from 'express';

/**
 * Starts the metrics server
 */
export function startMetricsServer(): void {
  const config = getConfig();
  
  if (!config.app.nodeEnv === 'production') {
    logger.info('Skipping metrics server in non-production mode');
    return;
  }

  const app = express();
  
  app.get('/health', async (_req, res) => {
    const health = await performHealthCheck();
    res.status(health.healthy ? 200 : 503).json(health);
  });
  
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    } catch (error) {
      res.status(500).end(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  app.listen(config.app.port + 1 || 9090, () => {
    logger.info('Metrics server started', { port: config.app.port + 1 || 9090 });
  });
}

// ============================================================================
// METRICS EXPORTER
// ============================================================================

/**
 * Periodic metrics collection
 */
export function startMetricsCollection(intervalMs: number = 30000): void {
  setInterval(async () => {
    await updateQueueMetrics();
    await updateDeduplicationMetrics();
  }, intervalMs);
  
  logger.info('Metrics collection started', { intervalMs });
}
