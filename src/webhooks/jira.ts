import crypto from 'crypto';
import { addSyncJob } from '../modules/queue/client.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { appConfig } from '../config/index.js';
import type { JiraWebhookPayload, SyncJob } from '../types/index.js';

export function verifyJiraSignature(payload: string, signature: string): boolean {
  if (!appConfig.jira.webhookSecret) {
    logger.warn('Jira webhook secret not configured, skipping signature verification');
    return true;
  }

  const hmac = crypto.createHmac('sha256', appConfig.jira.webhookSecret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function handleJiraWebhook(payload: JiraWebhookPayload): Promise<void> {
  const { webhookEvent, issue, comment } = payload;

  if (!issue) {
    logger.debug({ webhookEvent }, 'No issue in webhook payload, skipping');
    return;
  }

  const jiraIssueKey = issue.key;

  // Find mapping to get config
  const mapping = await prisma.syncMapping.findUnique({
    where: { jiraIssueKey },
  });

  if (!mapping) {
    logger.debug({ jiraIssueKey }, 'No mapping found for Jira issue, skipping');
    return;
  }

  // Get sync config
  const configs = await prisma.syncConfig.findMany({
    where: {
      active: true,
      config: {
        path: ['github', 'owner'],
        equals: mapping.githubOwner,
      },
    },
  });

  const matchingConfigs = configs.filter((config) => {
    const configData = config.config as { github?: { owner?: string; repo?: string } };
    return (
      configData.github?.owner === mapping.githubOwner &&
      (configData.github?.repo === mapping.githubRepo || configData.github?.repo === '*')
    );
  });

  if (matchingConfigs.length === 0) {
    logger.debug({ jiraIssueKey }, 'No matching sync configs found for Jira issue');
    return;
  }

  // Determine event type
  let eventType: SyncJob['eventType'] = 'issue.updated';
  if (webhookEvent === 'jira:issue_created') {
    eventType = 'issue.created';
  } else if (webhookEvent === 'jira:issue_updated') {
    // Check what changed
    if (comment) {
      eventType = 'comment.created';
    } else {
      eventType = 'issue.updated';
    }
  } else if (webhookEvent === 'jira:issue_deleted') {
    // Handle deletion if needed
    return;
  }

  // Create sync jobs for each matching config
  for (const config of matchingConfigs) {
    const job: SyncJob = {
      id: `${Date.now()}-${Math.random()}`,
      direction: 'jira_to_github',
      eventType,
      jiraIssueKey,
      githubIssueNumber: mapping.githubIssueNumber,
      githubRepo: mapping.githubRepo,
      githubOwner: mapping.githubOwner,
      payload: payload,
      configId: config.id,
      timestamp: Date.now(),
    };

    await addSyncJob(job);
    logger.info({ jiraIssueKey, eventType, configId: config.id }, 'Created sync job from Jira webhook');
  }
}

