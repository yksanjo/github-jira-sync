/**
 * Jira Webhook Handler
 * Processes Jira webhooks and creates sync jobs
 */

import { 
  JiraWebhookPayloadSchema,
  JiraWebhookPayload,
  SyncDirection,
  SyncEventType,
} from '../types';
import { addSyncJob } from '../queue';
import { logger } from '../logger';
import { isDuplicate } from '../deduplication';

// Map Jira webhook events to sync event types
const JIRA_EVENT_MAPPING: Record<string, SyncEventType> = {
  'jira:issue_created': SyncEventType.ISSUE_CREATED,
  'jira:issue_updated': SyncEventType.ISSUE_UPDATED,
  'jira:issue_deleted': SyncEventType.ISSUE_DELETED,
  'comment_created': SyncEventType.COMMENT_CREATED,
  'comment_updated': SyncEventType.COMMENT_UPDATED,
  'sprint_started': SyncEventType.STATUS_CHANGED,
  'sprint_closed': SyncEventType.STATUS_CHANGED,
};

/**
 * Processes incoming Jira webhook
 */
export async function handleJiraWebhook(
  payload: unknown,
  // Jira doesn't send signatures by default, but you can configure JWT
  options?: {
    verifyJwt?: boolean;
    jwtToken?: string;
  }
): Promise<{
  success: boolean;
  event?: string;
  syncJobId?: string;
  error?: string;
}> {
  try {
    // Validate payload with Zod
    const validatedPayload = JiraWebhookPayloadSchema.parse(payload);
    const event = validatedPayload;
    
    logger.info('Received Jira webhook', {
      event: event.webhookEvent,
      issueKey: event.issueKey,
    });

    // Map webhook event to sync event type
    const syncEventType = mapJiraWebhookToSyncEvent(event);
    
    if (!syncEventType) {
      logger.debug('Ignoring non-relevant Jira webhook', {
        event: event.webhookEvent,
      });
      return { success: true };
    }

    // Check for duplicates
    const eventHash = generateEventHash('jira', event);
    
    if (await isDuplicate(eventHash)) {
      logger.info('Duplicate webhook ignored', { eventHash });
      return { success: true };
    }

    // Create sync job based on event type
    let syncJobId: string | undefined;
    
    if (event.issue) {
      syncJobId = await handleIssueEvent(event, syncEventType);
    } else if (event.comment) {
      syncJobId = await handleCommentEvent(event, syncEventType);
    }

    return {
      success: true,
      event: event.webhookEvent,
      syncJobId,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing Jira webhook', { error: errorMessage });
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Handles issue-related events from Jira
 */
async function handleIssueEvent(
  event: JiraWebhookPayload,
  syncEventType: SyncEventType
): Promise<string | undefined> {
  if (!event.issue) {
    return undefined;
  }

  const sourceData = {
    issue: event.issue,
    webhookEvent: event.webhookEvent,
    user: event.user,
  };

  const jobId = await addSyncJob(
    SyncDirection.JIRA_TO_GITHUB,
    syncEventType,
    event.issue.key,
    sourceData,
    {
      metadata: {
        issueKey: event.issue.key,
        projectKey: event.issue.fields?.project?.key,
      },
    }
  );

  return jobId;
}

/**
 * Handles comment-related events from Jira
 */
async function handleCommentEvent(
  event: JiraWebhookPayload,
  syncEventType: SyncEventType
): Promise<string | undefined> {
  if (!event.comment || !event.issueKey) {
    return undefined;
  }

  const sourceData = {
    comment: event.comment,
    issueKey: event.issueKey,
    webhookEvent: event.webhookEvent,
    user: event.user,
  };

  const jobId = await addSyncJob(
    SyncDirection.JIRA_TO_GITHUB,
    syncEventType,
    event.comment.id,
    sourceData,
    {
      metadata: {
        issueKey: event.issueKey,
        commentId: event.comment.id,
      },
    }
  );

  return jobId;
}

/**
 * Maps Jira webhook to sync event type
 */
function mapJiraWebhookToSyncEvent(event: JiraWebhookPayload): SyncEventType | null {
  const webhookEvent = event.webhookEvent;
  
  // Check if this is an issue field change
  if (webhookEvent === 'jira:issue_updated' && event.issue) {
    // Determine the specific type of update
    return mapIssueUpdateType(event);
  }
  
  return JIRA_EVENT_MAPPING[webhookEvent] || null;
}

/**
 * Maps Jira issue update to specific sync event type
 */
function mapIssueUpdateType(event: JiraWebhookPayload): SyncEventType {
  // In a real implementation, you'd check the issue.changelog
  // For now, we default to ISSUE_UPDATED
  return SyncEventType.ISSUE_UPDATED;
}

/**
 * Generates a hash for deduplication
 */
function generateEventHash(source: string, event: JiraWebhookPayload): string {
  const data = `${source}:${event.webhookEvent}:${event.issueKey || event.issue?.key}:${event.user?.accountId}`;
  
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
 * Jira webhook verification (JWT)
 * Note: This is optional and depends on Jira configuration
 */
export function verifyJiraJwt(
  token: string,
  sharedSecret: string
): boolean {
  // Implement JWT verification if needed
  // This is optional and depends on your Jira setup
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }
    
    // Verify the token (simplified - in production use proper JWT library)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}
