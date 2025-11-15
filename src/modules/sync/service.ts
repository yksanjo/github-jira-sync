import { GitHubClient } from '../github/client.js';
import { JiraClient } from '../jira/client.js';
import { MappingEngine } from '../mapping/engine.js';
import { prisma } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import { jiraDocumentToText } from '../../utils/jira.js';
import type { SyncConfig, SyncResult, SyncDirection, GitHubIssue, JiraIssue } from '../../types/index.js';
import { appConfig } from '../../config/index.js';

export class SyncService {
  private githubClient: GitHubClient;
  private jiraClient: JiraClient;
  private mappingEngine: MappingEngine;
  private config: SyncConfig;

  constructor(config: SyncConfig, githubToken?: string, jiraEmail?: string, jiraToken?: string) {
    this.config = config;
    this.githubClient = new GitHubClient(githubToken);
    this.jiraClient = new JiraClient(undefined, jiraEmail, jiraToken);
    this.mappingEngine = new MappingEngine(config);
  }

  /**
   * Get or create a sync mapping between GitHub issue and Jira issue
   */
  private async getOrCreateMapping(
    githubOwner: string,
    githubRepo: string,
    githubIssueNumber: number,
    jiraIssueKey?: string
  ): Promise<{ jiraIssueKey: string; isNew: boolean }> {
    // Check if mapping already exists
    const existing = await prisma.syncMapping.findUnique({
      where: {
        githubOwner_githubRepo_githubIssueNumber: {
          githubOwner,
          githubRepo,
          githubIssueNumber,
        },
      },
    });

    if (existing) {
      return { jiraIssueKey: existing.jiraIssueKey, isNew: false };
    }

    // If jiraIssueKey provided, create mapping
    if (jiraIssueKey) {
      const mapping = await prisma.syncMapping.create({
        data: {
          githubOwner,
          githubRepo,
          githubIssueNumber,
          jiraIssueKey,
        },
      });
      return { jiraIssueKey: mapping.jiraIssueKey, isNew: true };
    }

    throw new Error('No existing mapping and no jiraIssueKey provided');
  }

  /**
   * Acquire a lock to prevent concurrent syncs on the same resource
   */
  private async acquireLock(resourceId: string, ttlSeconds: number = 60): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    try {
      // Try to create lock
      await prisma.syncLock.create({
        data: {
          resourceId,
          lockedBy: `sync-${Date.now()}`,
          expiresAt,
        },
      });
      return true;
    } catch (error) {
      // Lock already exists, check if expired
      const existing = await prisma.syncLock.findUnique({
        where: { resourceId },
      });

      if (existing && existing.expiresAt < new Date()) {
        // Lock expired, delete and try again
        await prisma.syncLock.delete({ where: { resourceId } });
        try {
          await prisma.syncLock.create({
            data: {
              resourceId,
              lockedBy: `sync-${Date.now()}`,
              expiresAt,
            },
          });
          return true;
        } catch {
          return false;
        }
      }

      return false;
    }
  }

  /**
   * Release a lock
   */
  private async releaseLock(resourceId: string): Promise<void> {
    try {
      await prisma.syncLock.delete({ where: { resourceId } });
    } catch (error) {
      logger.warn({ resourceId, error }, 'Failed to release lock (may already be released)');
    }
  }

  /**
   * Check if we should skip sync based on timestamp and priority
   */
  private shouldSkipSync(
    direction: SyncDirection,
    githubUpdatedAt: string,
    jiraUpdatedAt: string
  ): boolean {
    if (this.config.syncPriority === 'github_first') {
      return direction === 'jira_to_github';
    }

    if (this.config.syncPriority === 'jira_first') {
      return direction === 'github_to_jira';
    }

    // timestamp mode: skip if source is older than destination
    if (direction === 'github_to_jira') {
      return new Date(githubUpdatedAt) <= new Date(jiraUpdatedAt);
    } else {
      return new Date(jiraUpdatedAt) <= new Date(githubUpdatedAt);
    }
  }

  /**
   * Sync GitHub issue to Jira
   */
  async syncGitHubToJira(
    owner: string,
    repo: string,
    issueNumber: number,
    skipLock = false
  ): Promise<SyncResult> {
    const resourceId = `github:${owner}/${repo}#${issueNumber}`;

    if (!skipLock) {
      const locked = await this.acquireLock(resourceId);
      if (!locked) {
        return {
          success: false,
          direction: 'github_to_jira',
          githubIssueNumber: issueNumber,
          skipped: true,
          skipReason: 'Resource is locked',
        };
      }
    }

    try {
      // Get GitHub issue
      const githubIssue = await this.githubClient.getIssue(owner, repo, issueNumber);

      // Check if should skip
      if (this.mappingEngine.shouldSkipUpdate('github', undefined, githubIssue.labels.map((l) => l.name))) {
        return {
          success: true,
          direction: 'github_to_jira',
          githubIssueNumber: issueNumber,
          skipped: true,
          skipReason: 'Issue matches ignore rules',
        };
      }

      // Get or create mapping
      let mapping = await this.getOrCreateMapping(owner, repo, issueNumber).catch(() => null);
      let jiraIssue: JiraIssue;

      if (!mapping) {
        // Create new Jira issue
        const jiraStatus = this.mappingEngine.githubStatusToJira(
          githubIssue.state,
          githubIssue.labels.map((l) => l.name)
        );

        if (!jiraStatus) {
          return {
            success: true,
            direction: 'github_to_jira',
            githubIssueNumber: issueNumber,
            skipped: true,
            skipReason: 'No valid Jira status mapping',
          };
        }

        // Map assignee
        let assigneeAccountId: string | undefined;
        if (githubIssue.assignees.length > 0 && this.config.syncAssignees) {
          assigneeAccountId =
            (await this.mappingEngine.githubUserToJira(
              githubIssue.assignees[0].login,
              this.jiraClient
            )) || undefined;
        }

        jiraIssue = await this.jiraClient.createIssue(
          this.config.jira.projectKey,
          githubIssue.title,
          githubIssue.body || '',
          'Task',
          assigneeAccountId ? { assignee: { accountId: assigneeAccountId } } : undefined
        );

        // Create mapping
        mapping = await this.getOrCreateMapping(owner, repo, issueNumber, jiraIssue.key);
        logger.info({ owner, repo, issueNumber, jiraIssueKey: jiraIssue.key }, 'Created new Jira issue from GitHub');
      } else {
        // Update existing Jira issue
        jiraIssue = await this.jiraClient.getIssue(mapping.jiraIssueKey);

        // Check if we should skip based on timestamps
        if (this.shouldSkipSync('github_to_jira', githubIssue.updated_at, jiraIssue.fields.updated)) {
          return {
            success: true,
            direction: 'github_to_jira',
            githubIssueNumber: issueNumber,
            jiraIssueKey: mapping.jiraIssueKey,
            skipped: true,
            skipReason: 'Jira issue is newer',
          };
        }

        // Update Jira issue
        const jiraStatus = this.mappingEngine.githubStatusToJira(
          githubIssue.state,
          githubIssue.labels.map((l) => l.name)
        );

        const updates: Parameters<typeof this.jiraClient.updateIssue>[1] = {
          summary: githubIssue.title,
          description: githubIssue.body || '',
        };

        if (jiraStatus) {
          updates.status = jiraStatus;
        }

        if (this.config.syncAssignees && githubIssue.assignees.length > 0) {
          const assigneeAccountId = await this.mappingEngine.githubUserToJira(
            githubIssue.assignees[0].login,
            this.jiraClient
          );
          updates.assignee = assigneeAccountId || null;
        }

        await this.jiraClient.updateIssue(mapping.jiraIssueKey, updates);
        logger.info({ owner, repo, issueNumber, jiraIssueKey: mapping.jiraIssueKey }, 'Updated Jira issue from GitHub');
      }

      // Sync comments if enabled
      if (this.config.syncComments) {
        await this.syncCommentsGitHubToJira(owner, repo, issueNumber, mapping.jiraIssueKey);
      }

      return {
        success: true,
        direction: 'github_to_jira',
        githubIssueNumber: issueNumber,
        jiraIssueKey: mapping.jiraIssueKey,
      };
    } catch (error) {
      logger.error({ owner, repo, issueNumber, error }, 'Failed to sync GitHub to Jira');
      return {
        success: false,
        direction: 'github_to_jira',
        githubIssueNumber: issueNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (!skipLock) {
        await this.releaseLock(resourceId);
      }
    }
  }

  /**
   * Sync Jira issue to GitHub
   */
  async syncJiraToGitHub(jiraIssueKey: string, skipLock = false): Promise<SyncResult> {
    const resourceId = `jira:${jiraIssueKey}`;

    if (!skipLock) {
      const locked = await this.acquireLock(resourceId);
      if (!locked) {
        return {
          success: false,
          direction: 'jira_to_github',
          jiraIssueKey,
          skipped: true,
          skipReason: 'Resource is locked',
        };
      }
    }

    try {
      // Get Jira issue
      const jiraIssue = await this.jiraClient.getIssue(jiraIssueKey);

      // Check if should skip
      if (this.mappingEngine.shouldSkipUpdate('jira', jiraIssue.fields.status.name)) {
        return {
          success: true,
          direction: 'jira_to_github',
          jiraIssueKey,
          skipped: true,
          skipReason: 'Issue matches ignore rules',
        };
      }

      // Find mapping
      const mapping = await prisma.syncMapping.findUnique({
        where: { jiraIssueKey },
      });

      if (!mapping) {
        return {
          success: false,
          direction: 'jira_to_github',
          jiraIssueKey,
          error: 'No mapping found for Jira issue',
        };
      }

      // Get GitHub issue
      const githubIssue = await this.githubClient.getIssue(
        mapping.githubOwner,
        mapping.githubRepo,
        mapping.githubIssueNumber
      );

      // Check if we should skip based on timestamps
      if (this.shouldSkipSync('jira_to_github', githubIssue.updated_at, jiraIssue.fields.updated)) {
        return {
          success: true,
          direction: 'jira_to_github',
          githubIssueNumber: mapping.githubIssueNumber,
          jiraIssueKey,
          skipped: true,
          skipReason: 'GitHub issue is newer',
        };
      }

      // Update GitHub issue
      const labels = this.mappingEngine.jiraStatusToGitHubLabels(jiraIssue.fields.status.name);
      const state = jiraIssue.fields.status.name === 'Done' ? 'closed' : 'open';

      const updates: Parameters<typeof this.githubClient.updateIssue>[3] = {
        title: jiraIssue.fields.summary,
        body: jiraIssue.fields.description ? jiraDocumentToText(jiraIssue.fields.description) : '',
        state: state as 'open' | 'closed',
        labels: this.config.syncLabels ? labels : undefined,
      };

      if (this.config.syncAssignees && jiraIssue.fields.assignee) {
        const githubUsername = this.mappingEngine.jiraUserToGitHub(jiraIssue.fields.assignee.accountId);
        updates.assignees = githubUsername ? [githubUsername] : [];
      }

      await this.githubClient.updateIssue(
        mapping.githubOwner,
        mapping.githubRepo,
        mapping.githubIssueNumber,
        updates
      );

      logger.info(
        { owner: mapping.githubOwner, repo: mapping.githubRepo, issueNumber: mapping.githubIssueNumber, jiraIssueKey },
        'Updated GitHub issue from Jira'
      );

      // Sync comments if enabled
      if (this.config.syncComments) {
        await this.syncCommentsJiraToGitHub(
          mapping.githubOwner,
          mapping.githubRepo,
          mapping.githubIssueNumber,
          jiraIssueKey
        );
      }

      return {
        success: true,
        direction: 'jira_to_github',
        githubIssueNumber: mapping.githubIssueNumber,
        jiraIssueKey,
      };
    } catch (error) {
      logger.error({ jiraIssueKey, error }, 'Failed to sync Jira to GitHub');
      return {
        success: false,
        direction: 'jira_to_github',
        jiraIssueKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (!skipLock) {
        await this.releaseLock(resourceId);
      }
    }
  }

  /**
   * Sync comments from GitHub to Jira
   */
  private async syncCommentsGitHubToJira(
    owner: string,
    repo: string,
    issueNumber: number,
    jiraIssueKey: string
  ): Promise<void> {
    const githubComments = await this.githubClient.getComments(owner, repo, issueNumber);
    const jiraComments = await this.jiraClient.getComments(jiraIssueKey);

    // Simple deduplication: check if comment body exists
    const jiraCommentBodies = new Set(
      jiraComments.map((c) => {
        if (typeof c.body === 'string') return c.body;
        // Handle Jira's document format
        return JSON.stringify(c.body);
      })
    );

    for (const githubComment of githubComments) {
      // Skip if comment already exists in Jira
      if (jiraCommentBodies.has(githubComment.body)) {
        continue;
      }

      // Add comment to Jira
      await this.jiraClient.createComment(jiraIssueKey, githubComment.body);
    }
  }

  /**
   * Sync comments from Jira to GitHub
   */
  private async syncCommentsJiraToGitHub(
    owner: string,
    repo: string,
    issueNumber: number,
    jiraIssueKey: string
  ): Promise<void> {
    const jiraComments = await this.jiraClient.getComments(jiraIssueKey);
    const githubComments = await this.githubClient.getComments(owner, repo, issueNumber);

    // Simple deduplication: check if comment body exists
    const githubCommentBodies = new Set(githubComments.map((c) => c.body));

    for (const jiraComment of jiraComments) {
      // Extract text from Jira's document format
      const commentBody = jiraDocumentToText(jiraComment.body);

      if (!commentBody || githubCommentBodies.has(commentBody)) {
        continue;
      }

      // Add comment to GitHub
      await this.githubClient.createComment(owner, repo, issueNumber, commentBody);
    }
  }
}

