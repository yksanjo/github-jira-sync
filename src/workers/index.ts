import { createSyncWorker } from '../modules/queue/client.js';
import { SyncService } from '../modules/sync/service.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { appConfig } from '../config/index.js';
import { SyncConfigSchema } from '../types/index.js';
import type { SyncJob } from '../types/index.js';

async function processSyncJob(job: SyncJob): Promise<void> {
  logger.info({ jobId: job.id, direction: job.direction, eventType: job.eventType }, 'Processing sync job');

  try {
    // Get sync config
    const configRecord = await prisma.syncConfig.findUnique({
      where: { id: job.configId },
    });

    if (!configRecord || !configRecord.active) {
      logger.warn({ configId: job.configId }, 'Config not found or inactive, skipping job');
      return;
    }

    const config = SyncConfigSchema.parse(configRecord.config);

    // Create sync service
    const syncService = new SyncService(
      config,
      appConfig.github.oauthToken,
      appConfig.jira.email,
      appConfig.jira.apiToken
    );

    // Process sync based on direction
    let result;
    if (job.direction === 'github_to_jira') {
      if (!job.githubOwner || !job.githubRepo || !job.githubIssueNumber) {
        throw new Error('Missing required GitHub fields for github_to_jira sync');
      }
      result = await syncService.syncGitHubToJira(
        job.githubOwner,
        job.githubRepo,
        job.githubIssueNumber
      );
    } else {
      if (!job.jiraIssueKey) {
        throw new Error('Missing required Jira field for jira_to_github sync');
      }
      result = await syncService.syncJiraToGitHub(job.jiraIssueKey);
    }

    if (result.success) {
      logger.info(
        {
          jobId: job.id,
          direction: result.direction,
          skipped: result.skipped,
          skipReason: result.skipReason,
        },
        'Sync job completed successfully'
      );
    } else {
      logger.error(
        { jobId: job.id, direction: result.direction, error: result.error },
        'Sync job failed'
      );
      throw new Error(result.error || 'Sync failed');
    }
  } catch (error) {
    logger.error({ jobId: job.id, error }, 'Error processing sync job');
    throw error;
  }
}

// Create and start worker
const worker = createSyncWorker(processSyncJob);

logger.info('Sync worker started');

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down worker...');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

