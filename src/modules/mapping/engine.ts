import type { SyncConfig, StatusMap, UserMap, FieldMap } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

export class MappingEngine {
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
  }

  /**
   * Map GitHub status/labels to Jira status
   */
  githubStatusToJira(githubState: string, githubLabels: string[]): string | null {
    // Check if we should ignore this status
    if (this.config.mappings.ignoreLabels) {
      for (const label of githubLabels) {
        if (this.config.mappings.ignoreLabels.includes(label)) {
          logger.debug({ label }, 'Ignoring GitHub label');
          return null;
        }
      }
    }

    // Map based on state
    if (githubState === 'closed') {
      return this.config.mappings.status['Done'] || 'Done';
    }

    // Map based on labels
    for (const label of githubLabels) {
      const mappedStatus = this.config.mappings.status[label];
      if (mappedStatus) {
        return mappedStatus;
      }
    }

    // Default mapping
    return this.config.mappings.status['To Do'] || 'To Do';
  }

  /**
   * Map Jira status to GitHub labels
   */
  jiraStatusToGitHubLabels(jiraStatus: string): string[] {
    // Check if we should ignore this status
    if (this.config.mappings.ignoreStatuses?.includes(jiraStatus)) {
      logger.debug({ jiraStatus }, 'Ignoring Jira status');
      return [];
    }

    // Find GitHub labels that map to this Jira status
    const labels: string[] = [];
    for (const [githubLabel, jiraStatusName] of Object.entries(this.config.mappings.status)) {
      if (jiraStatusName === jiraStatus) {
        labels.push(githubLabel);
      }
    }

    return labels;
  }

  /**
   * Map GitHub user to Jira user account ID
   */
  async githubUserToJira(githubUsername: string, jiraClient: { getUserByEmail: (email: string) => Promise<{ accountId: string } | null> }): Promise<string | null> {
    if (this.config.mappings.users) {
      const mappedAccountId = this.config.mappings.users[githubUsername];
      if (mappedAccountId) {
        return mappedAccountId;
      }
    }

    // Try to find by email (would need GitHub API to get user email)
    // For now, return null and let the caller handle it
    return null;
  }

  /**
   * Map Jira user to GitHub username
   */
  jiraUserToGitHub(jiraAccountId: string): string | null {
    if (this.config.mappings.users) {
      for (const [githubUsername, jiraAccountIdValue] of Object.entries(this.config.mappings.users)) {
        if (jiraAccountIdValue === jiraAccountId) {
          return githubUsername;
        }
      }
    }
    return null;
  }

  /**
   * Map custom fields
   */
  mapFields(sourceFields: Record<string, unknown>, direction: 'github_to_jira' | 'jira_to_github'): Record<string, unknown> {
    if (!this.config.mappings.fields) {
      return {};
    }

    const mappedFields: Record<string, unknown> = {};

    if (direction === 'github_to_jira') {
      for (const [githubField, jiraField] of Object.entries(this.config.mappings.fields)) {
        if (sourceFields[githubField] !== undefined) {
          mappedFields[jiraField] = sourceFields[githubField];
        }
      }
    } else {
      for (const [githubField, jiraField] of Object.entries(this.config.mappings.fields)) {
        if (sourceFields[jiraField] !== undefined) {
          mappedFields[githubField] = sourceFields[jiraField];
        }
      }
    }

    return mappedFields;
  }

  /**
   * Check if an update should be skipped based on ignore rules
   */
  shouldSkipUpdate(source: 'github' | 'jira', status?: string, labels?: string[]): boolean {
    if (source === 'github' && labels) {
      if (this.config.mappings.ignoreLabels) {
        for (const label of labels) {
          if (this.config.mappings.ignoreLabels.includes(label)) {
            return true;
          }
        }
      }
    }

    if (source === 'jira' && status) {
      if (this.config.mappings.ignoreStatuses?.includes(status)) {
        return true;
      }
    }

    return false;
  }
}




