import crypto from 'crypto';
import { addSyncJob } from '../modules/queue/client.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { appConfig } from '../config/index.js';
import type { GitHubWebhookPayload, SyncJob } from '../types/index.js';

export function verifyGitHubSignature(payload: string, signature: string): boolean {
  if (!appConfig.github.webhookSecret) {
    logger.warn('GitHub webhook secret not configured, skipping signature verification');
    return true;
  }

  const hmac = crypto.createHmac('sha256', appConfig.github.webhookSecret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function handleGitHubWebhook(payload: GitHubWebhookPayload): Promise<void> {
  const { action, issue, pull_request, comment, repository } = payload;

  // Only handle issues, not PRs (unless configured otherwise)
  const targetIssue = issue || pull_request;
  if (!targetIssue) {
    logger.debug({ action }, 'No issue or PR in webhook payload, skipping');
    return;
  }

  const owner = repository.owner.login;
  const repo = repository.name;
  const issueNumber = targetIssue.number;

  // Get active sync configs for this repo
  const configs = await prisma.syncConfig.findMany({
    where: {
      active: true,
      config: {
        path: ['github', 'owner'],
        equals: owner,
      },
    },
  });

  // Filter configs that match this repo
  const matchingConfigs = configs.filter((config) => {
    const configData = config.config as { github?: { owner?: string; repo?: string } };
    return (
      configData.github?.owner === owner &&
      (configData.github?.repo === repo || configData.github?.repo === '*')
    );
  });

  if (matchingConfigs.length === 0) {
    logger.debug({ owner, repo }, 'No matching sync configs found for repository');
    return;
  }

  // Determine event type
  let eventType: SyncJob['eventType'] = 'issue.updated';
  if (action === 'opened') {
    eventType = 'issue.created';
  } else if (action === 'closed') {
    eventType = 'issue.closed';
  } else if (action === 'reopened') {
    eventType = 'issue.reopened';
  } else if (action === 'assigned' || action === 'unassigned') {
    eventType = 'assignee.changed';
  } else if (action === 'labeled' || action === 'unlabeled') {
    eventType = 'label.changed';
  } else if (comment && action === 'created') {
    eventType = 'comment.created';
  } else if (comment && action === 'edited') {
    eventType = 'comment.updated';
  }

  // Create sync jobs for each matching config
  for (const config of matchingConfigs) {
    const job: SyncJob = {
      id: `${Date.now()}-${Math.random()}`,
      direction: 'github_to_jira',
      eventType,
      githubIssueNumber: issueNumber,
      githubRepo: repo,
      githubOwner: owner,
      payload: payload,
      configId: config.id,
      timestamp: Date.now(),
    };

    await addSyncJob(job);
    logger.info(
      { owner, repo, issueNumber, eventType, configId: config.id },
      'Created sync job from GitHub webhook'
    );
  }
}

