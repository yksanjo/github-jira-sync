/**
 * Sync Engine - Core synchronization logic
 * Handles the actual sync operations between GitHub and Jira
 */

import { 
  SyncDirection, 
  SyncEventType,
  GitHubIssue,
  JiraIssue,
  GitHubComment,
  JiraComment,
} from '../types';
import { githubClient } from './github-client';
import { jiraClient } from './jira-client';
import { getConfig } from '../config';
import { logger } from '../logger';
import { detectConflicts, resolveConflict } from '../conflict-resolution';
import { markAsProcessed } from '../deduplication';

export interface SyncResult {
  success: boolean;
  sourceId: string;
  targetId?: string;
  error?: string;
  conflictResolved?: boolean;
}

/**
 * Main sync engine class
 */
export class SyncEngine {
  private config = getConfig();

  /**
   * Process a sync job based on direction and event type
   */
  async processSync(
    direction: SyncDirection,
    eventType: SyncEventType,
    sourceData: Record<string, unknown>
  ): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing sync job', { direction, eventType });
      
      let result: SyncResult;
      
      if (direction === SyncDirection.GITHUB_TO_JIRA) {
        result = await this.syncGitHubToJira(eventType, sourceData);
      } else {
        result = await this.syncJiraToGitHub(eventType, sourceData);
      }
      
      const processingTime = Date.now() - startTime;
      logger.info('Sync job completed', { 
        direction, 
        eventType, 
        processingTimeMs: processingTime,
        success: result.success,
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Sync job failed', { direction, eventType, error: errorMessage });
      
      return {
        success: false,
        sourceId: String(sourceData.id || sourceData.issue?.id || 'unknown'),
        error: errorMessage,
      };
    }
  }

  /**
   * Sync from GitHub to Jira
   */
  private async syncGitHubToJira(
    eventType: SyncEventType,
    sourceData: Record<string, unknown>
  ): Promise<SyncResult> {
    const issue = sourceData.issue as GitHubIssue;
    const comment = sourceData.comment as GitHubComment;
    const action = sourceData.action as string;
    
    if (!issue && !comment) {
      return { success: false, sourceId: 'unknown', error: 'No issue or comment data' };
    }

    switch (eventType) {
      case SyncEventType.ISSUE_CREATED:
        return this.syncGitHubIssueCreated(issue);
      
      case SyncEventType.ISSUE_UPDATED:
        return this.syncGitHubIssueUpdated(issue, action);
      
      case SyncEventType.ISSUE_DELETED:
        return this.syncGitHubIssueDeleted(issue);
      
      case SyncEventType.COMMENT_CREATED:
        return this.syncGitHubCommentCreated(comment, issue);
      
      case SyncEventType.COMMENT_UPDATED:
        return this.syncGitHubCommentUpdated(comment, issue);
      
      case SyncEventType.LABEL_CHANGED:
        return this.syncGitHubLabelsChanged(issue);
      
      case SyncEventType.ASSIGNEE_CHANGED:
        return this.syncGitHubAssigneeChanged(issue);
      
      default:
        return { success: false, sourceId: String(issue?.id), error: 'Unknown event type' };
    }
  }

  /**
   * Sync from Jira to GitHub
   */
  private async syncJiraToGitHub(
    eventType: SyncEventType,
    sourceData: Record<string, unknown>
  ): Promise<SyncResult> {
    const issue = sourceData.issue as JiraIssue;
    const comment = sourceData.comment as JiraComment;
    
    if (!issue && !comment) {
      return { success: false, sourceId: 'unknown', error: 'No issue or comment data' };
    }

    switch (eventType) {
      case SyncEventType.ISSUE_CREATED:
        return this.syncJiraIssueCreated(issue);
      
      case SyncEventType.ISSUE_UPDATED:
        return this.syncJiraIssueUpdated(issue);
      
      case SyncEventType.ISSUE_DELETED:
        return this.syncJiraIssueDeleted(issue);
      
      case SyncEventType.COMMENT_CREATED:
        return this.syncJiraCommentCreated(comment, issue);
      
      case SyncEventType.COMMENT_UPDATED:
        return this.syncJiraCommentUpdated(comment, issue);
      
      default:
        return { success: false, sourceId: issue?.key || 'unknown', error: 'Unknown event type' };
    }
  }

  // ==========================================================================
  // GITHUB TO JIRA OPERATIONS
  // ==========================================================================

  private async syncGitHubIssueCreated(githubIssue: GitHubIssue): Promise<SyncResult> {
    // Check for existing Jira issue mapped to this GitHub issue
    const jiraKey = await this.getJiraKeyForGitHubIssue(githubIssue.id);
    
    if (jiraKey) {
      // Already synced, update instead
      return this.syncGitHubIssueUpdated(githubIssue, 'edited');
    }

    // Create new Jira issue
    const result = await jiraClient.createIssue({
      projectKey: this.config.jira.projectKey,
      summary: githubIssue.title,
      description: githubIssue.body || '',
      labels: githubIssue.labels.map(l => l.name),
    });

    // Store mapping
    await this.storeMapping(githubIssue.id.toString(), result.key);

    return {
      success: true,
      sourceId: githubIssue.id.toString(),
      targetId: result.key,
    };
  }

  private async syncGitHubIssueUpdated(githubIssue: GitHubIssue, _action: string): Promise<SyncResult> {
    const jiraKey = await this.getJiraKeyForGitHubIssue(githubIssue.id);
    
    if (!jiraKey) {
      // Create new issue if doesn't exist
      return this.syncGitHubIssueCreated(githubIssue);
    }

    // Get current Jira issue for conflict detection
    const jiraIssue = await jiraClient.getIssue(jiraKey);
    
    // Check for conflicts
    const conflictData = detectConflicts(githubIssue, jiraIssue);
    let conflictResolved = false;
    
    if (conflictData) {
      const resolution = resolveConflict(conflictData, this.config.sync.conflictResolution);
      conflictResolved = resolution.resolved;
      
      if (resolution.requiresManualReview) {
        logger.warn('Conflict requires manual review', { 
          githubIssueId: githubIssue.id, 
          jiraKey,
          conflicts: conflictData.conflictingFields,
        });
      }
    }

    // Update Jira issue
    await jiraClient.updateIssue(jiraKey, {
      summary: githubIssue.title,
      description: githubIssue.body || '',
      labels: githubIssue.labels.map(l => l.name),
    });

    // Handle status transition
    if (githubIssue.state === 'closed') {
      const transitions = await jiraClient.getTransitions(jiraKey);
      const closeTransition = transitions.find(t => t.to.name === 'Done');
      if (closeTransition) {
        await jiraClient.transitionIssue(jiraKey, closeTransition.id);
      }
    }

    return {
      success: true,
      sourceId: githubIssue.id.toString(),
      targetId: jiraKey,
      conflictResolved,
    };
  }

  private async syncGitHubIssueDeleted(githubIssue: GitHubIssue): Promise<SyncResult> {
    const jiraKey = await this.getJiraKeyForGitHubIssue(githubIssue.id);
    
    if (!jiraKey) {
      return { success: true, sourceId: githubIssue.id.toString() };
    }

    // Note: Usually we don't delete issues, just close them or add a label
    await jiraClient.updateIssue(jiraKey, {
      labels: ['archived', 'github-deleted'],
    });

    return {
      success: true,
      sourceId: githubIssue.id.toString(),
      targetId: jiraKey,
    };
  }

  private async syncGitHubCommentCreated(comment: GitHubComment, issue: GitHubIssue): Promise<SyncResult> {
    const jiraKey = await this.getJiraKeyForGitHubIssue(issue.id);
    
    if (!jiraKey) {
      return { success: false, sourceId: comment.id.toString(), error: 'Jira issue not found' };
    }

    // Format comment with author info
    const commentBody = `**${comment.user.login}** commented on GitHub:\n\n${comment.body}`;
    
    const result = await jiraClient.createComment(jiraKey, commentBody);

    return {
      success: true,
      sourceId: comment.id.toString(),
      targetId: result.id,
    };
  }

  private async syncGitHubCommentUpdated(comment: GitHubComment, issue: GitHubIssue): Promise<SyncResult> {
    const jiraKey = await this.getJiraKeyForGitHubIssue(issue.id);
    
    if (!jiraKey) {
      return { success: false, sourceId: comment.id.toString(), error: 'Jira issue not found' };
    }

    // Find and update the comment (simplified - would need mapping storage)
    const comments = await jiraClient.getComments(jiraKey);
    const existingComment = comments.find(c => 
      c.body.content[0]?.content[0]?.text?.includes(comment.user.login)
    );

    if (existingComment) {
      const commentBody = `**${comment.user.login}** commented on GitHub:\n\n${comment.body}`;
      await jiraClient.updateComment(jiraKey, existingComment.id, commentBody);
    }

    return {
      success: true,
      sourceId: comment.id.toString(),
      targetId: existingComment?.id,
    };
  }

  private async syncGitHubLabelsChanged(githubIssue: GitHubIssue): Promise<SyncResult> {
    const jiraKey = await this.getJiraKeyForGitHubIssue(githubIssue.id);
    
    if (!jiraKey) {
      return { success: false, sourceId: githubIssue.id.toString(), error: 'Jira issue not found' };
    }

    await jiraClient.updateIssue(jiraKey, {
      labels: githubIssue.labels.map(l => l.name),
    });

    return {
      success: true,
      sourceId: githubIssue.id.toString(),
      targetId: jiraKey,
    };
  }

  private async syncGitHubAssigneeChanged(githubIssue: GitHubIssue): Promise<SyncResult> {
    const jiraKey = await this.getJiraKeyForGitHubIssue(githubIssue.id);
    
    if (!jiraKey) {
      return { success: false, sourceId: githubIssue.id.toString(), error: 'Jira issue not found' };
    }

    // Note: Assignee syncing would require mapping GitHub usernames to Jira accounts
    logger.info('Assignee change detected', { 
      jiraKey, 
      assignees: githubIssue.assignees.map(a => a.login) 
    });

    return {
      success: true,
      sourceId: githubIssue.id.toString(),
      targetId: jiraKey,
    };
  }

  // ==========================================================================
  // JIRA TO GITHUB OPERATIONS
  // ==========================================================================

  private async syncJiraIssueCreated(jiraIssue: JiraIssue): Promise<SyncResult> {
    // Check for existing GitHub issue
    const githubNumber = await this.getGitHubNumberForJiraIssue(jiraIssue.key);
    
    if (githubNumber) {
      return this.syncJiraIssueUpdated(jiraIssue);
    }

    const result = await githubClient.createIssue(
      this.config.github.org,
      this.config.github.repo,
      {
        title: jiraIssue.fields.summary,
        body: jiraIssue.fields.description || '',
        labels: jiraIssue.fields.labels,
      }
    );

    // Store mapping
    await this.storeMapping(result.number.toString(), jiraIssue.key);

    return {
      success: true,
      sourceId: jiraIssue.key,
      targetId: result.number.toString(),
    };
  }

  private async syncJiraIssueUpdated(jiraIssue: JiraIssue): Promise<SyncResult> {
    const githubNumber = await this.getGitHubNumberForJiraIssue(jiraIssue.key);
    
    if (!githubNumber) {
      return this.syncJiraIssueCreated(jiraIssue);
    }

    // Check for conflicts
    const githubIssue = await githubClient.getIssue(
      this.config.github.org,
      this.config.github.repo,
      githubNumber
    );
    
    const conflictData = detectConflicts(githubIssue, jiraIssue);
    let conflictResolved = false;
    
    if (conflictData) {
      const resolution = resolveConflict(conflictData, this.config.sync.conflictResolution);
      conflictResolved = resolution.resolved;
    }

    await githubClient.updateIssue(
      this.config.github.org,
      this.config.github.repo,
      githubNumber,
      {
        title: jiraIssue.fields.summary,
        body: jiraIssue.fields.description || '',
        labels: jiraIssue.fields.labels,
        state: jiraIssue.fields.status.statusCategory.key === 'done' ? 'closed' : 'open',
      }
    );

    return {
      success: true,
      sourceId: jiraIssue.key,
      targetId: githubNumber.toString(),
      conflictResolved,
    };
  }

  private async syncJiraIssueDeleted(jiraIssue: JiraIssue): Promise<SyncResult> {
    const githubNumber = await this.getGitHubNumberForJiraIssue(jiraIssue.key);
    
    if (!githubNumber) {
      return { success: true, sourceId: jiraIssue.key };
    }

    // Close the GitHub issue instead of deleting
    await githubClient.updateIssue(
      this.config.github.org,
      this.config.github.repo,
      githubNumber,
      { state: 'closed' }
    );

    return {
      success: true,
      sourceId: jiraIssue.key,
      targetId: githubNumber.toString(),
    };
  }

  private async syncJiraCommentCreated(comment: JiraComment, issue: JiraIssue): Promise<SyncResult> {
    const githubNumber = await this.getGitHubNumberForJiraIssue(issue.key);
    
    if (!githubNumber) {
      return { success: false, sourceId: comment.id, error: 'GitHub issue not found' };
    }

    const commentBody = `**${comment.author.displayName}** commented on Jira:\n\n${this.extractTextFromJiraBody(comment.body)}`;
    
    const result = await githubClient.createComment(
      this.config.github.org,
      this.config.github.repo,
      githubNumber,
      commentBody
    );

    return {
      success: true,
      sourceId: comment.id,
      targetId: result.id.toString(),
    };
  }

  private async syncJiraCommentUpdated(comment: JiraComment, issue: JiraIssue): Promise<SyncResult> {
    const githubNumber = await this.getGitHubNumberForJiraIssue(issue.key);
    
    if (!githubNumber) {
      return { success: false, sourceId: comment.id, error: 'GitHub issue not found' };
    }

    // Simplified - would need more robust comment matching
    const comments = await githubClient.getComments(
      this.config.github.org,
      this.config.github.repo,
      githubNumber
    );

    return {
      success: true,
      sourceId: comment.id,
      targetId: undefined,
    };
  }

  // ==========================================================================
  // MAPPING HELPERS
  // ==========================================================================

  private async getJiraKeyForGitHubIssue(githubIssueId: number): Promise<string | null> {
    // In production, this would query a database or Redis
    return null;
  }

  private async getGitHubNumberForJiraIssue(jiraKey: string): Promise<number | null> {
    // In production, this would query a database or Redis
    return null;
  }

  private async storeMapping(githubId: string, jiraKey: string): Promise<void> {
    // In production, this would store in a database
    logger.debug('Stored mapping', { githubId, jiraKey });
  }

  private extractTextFromJiraBody(body: JiraComment['body']): string {
    try {
      return body.content
        .map(block => block.content.map(span => span.text).join(''))
        .join('\n');
    } catch {
      return '';
    }
  }
}

// Export singleton
export const syncEngine = new SyncEngine();
