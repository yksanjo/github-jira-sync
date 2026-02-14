/**
 * GitHub Webhook Handler
 * Processes GitHub webhooks and creates sync jobs
 */

import { 
  WebhookEventMap, 
  EmitterWebhookEvent as GithubEmitterEvent,
} from '@octokit/webhooks';
import { v4 as uuidv4 } from 'uuid';
import { 
  GitHubWebhookPayloadSchema,
  GitHubWebhookPayload,
  SyncDirection,
  SyncEventType,
} from '../types';
import { addSyncJob } from '../queue';
import { logger } from '../logger';
import { getConfig } from '../config';
import { processDeduplication, isDuplicate } from '../deduplication';

// Event action types we care about
const RELEVANT_ACTIONS = [
  'opened',
  'edited',
  'closed',
  'reopened',
  'labeled',
  'unlabeled',
  'assigned',
  'unassigned',
  'milestoned',
  'demilestoned',
];

const COMMENT_ACTIONS = [
  'created',
  'edited',
  'deleted',
];

/**
 * Processes incoming GitHub webhook
 */
export async function handleGitHubWebhook(
  payload: unknown,
  signature: string
): Promise<{
  success: boolean;
  event?: string;
  action?: string;
  syncJobId?: string;
  error?: string;
}> {
  try {
    // Validate payload with Zod
    const validatedPayload = GitHubWebhookPayloadSchema.parse(payload);
    const event = validatedPayload;
    
    logger.info('Received GitHub webhook', {
      action: event.action,
      sender: event.sender?.login,
    });

    // Map webhook event to sync event type
    const syncEvent = mapWebhookToSyncEvent(event);
    
    if (!syncEvent) {
      logger.debug('Ignoring non-relevant GitHub webhook', {
        action: event.action,
      });
      return { success: true };
    }

    // Check for duplicates
    const eventHash = generateEventHash('github', event);
    
    if (await isDuplicate(eventHash)) {
      logger.info('Duplicate webhook ignored', { eventHash });
      return { success: true };
    }

    // Create sync job based on event type
    let syncJobId: string | undefined;
    
    if (event.issue) {
      syncJobId = await handleIssueEvent(event, syncEvent);
    } else if (event.comment) {
      syncJobId = await handleCommentEvent(event, syncEvent);
    }

    return {
      success: true,
      event: 'issues' in event ? 'issues' : 'issue_comment',
      action: event.action,
      syncJobId,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing GitHub webhook', { error: errorMessage });
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Handles issue-related events
 */
async function handleIssueEvent(
  event: GitHubWebhookPayload,
  syncEventType: SyncEventType
): Promise<string | undefined> {
  if (!event.issue || !event.repository) {
    return undefined;
  }

  const sourceData = {
    issue: event.issue,
    repository: event.repository,
    action: event.action,
    changes: event.changes,
  };

  const jobId = await addSyncJob(
    SyncDirection.GITHUB_TO_JIRA,
    syncEventType,
    String(event.issue.id),
    sourceData,
    {
      metadata: {
        issueNumber: event.issue.number,
        repositoryFullName: event.repository.full_name,
      },
    }
  );

  return jobId;
}

/**
 * Handles comment-related events
 */
async function handleCommentEvent(
  event: GitHubWebhookPayload,
  syncEventType: SyncEventType
): Promise<string | undefined> {
  if (!event.comment || !event.issue || !event.repository) {
    return undefined;
  }

  const sourceData = {
    comment: event.comment,
    issue: event.issue,
    repository: event.repository,
    action: event.action,
  };

  const jobId = await addSyncJob(
    SyncDirection.GITHUB_TO_JIRA,
    syncEventType,
    String(event.comment.id),
    sourceData,
    {
      metadata: {
        issueNumber: event.issue.number,
        commentId: event.comment.id,
      },
    }
  );

  return jobId;
}

/**
 * Maps GitHub webhook to sync event type
 */
function mapWebhookToSyncEvent(event: GitHubWebhookPayload): SyncEventType | null {
  const action = event.action;

  // Issue events
  if (event.issue) {
    if (action === 'opened') {
      return SyncEventType.ISSUE_CREATED;
    }
    if (action === 'closed' || action === 'reopened') {
      return SyncEventType.ISSUE_UPDATED;
    }
    if (action === 'edited') {
      return SyncEventType.ISSUE_UPDATED;
    }
    if (action === 'labeled' || action === 'unlabeled') {
      return SyncEventType.LABEL_CHANGED;
    }
    if (action === 'assigned' || action === 'unassigned') {
      return SyncEventType.ASSIGNEE_CHANGED;
    }
  }

  // Comment events
  if (event.comment && action === 'created') {
    return SyncEventType.COMMENT_CREATED;
  }
  if (event.comment && action === 'edited') {
    return SyncEventType.COMMENT_UPDATED;
  }

  return null;
}

/**
 * Generates a hash for deduplication
 */
function generateEventHash(source: string, event: GitHubWebhookPayload): string {
  const data = `${source}:${event.action}:${event.repository?.full_name}:${event.issue?.id || event.comment?.id}:${event.sender?.id}`;
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * GitHub webhook verification
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}
