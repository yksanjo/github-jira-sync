import { appConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { JiraIssue, JiraComment } from '../../types/index.js';

interface JiraApiOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}

export class JiraClient {
  private baseUrl: string;
  private auth: string;

  constructor(baseUrl?: string, email?: string, apiToken?: string) {
    this.baseUrl = (baseUrl || appConfig.jira.baseUrl).replace(/\/$/, '');
    const authEmail = email || appConfig.jira.email || '';
    const authToken = apiToken || appConfig.jira.apiToken || '';

    if (!authEmail || !authToken) {
      throw new Error('Jira email and API token are required');
    }

    this.auth = Buffer.from(`${authEmail}:${authToken}`).toString('base64');
  }

  private async request<T>(options: JiraApiOptions): Promise<T> {
    const url = `${this.baseUrl}/rest/api/3${options.path}`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${this.auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const fetchOptions: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    let retries = 3;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;
        retries--;
        if (retries > 0) {
          const delay = (4 - retries) * 1000; // Exponential backoff: 1s, 2s, 3s
          logger.warn({ url, retries, delay, error }, 'Jira API request failed, retrying');
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.error({ url, error: lastError }, 'Jira API request failed after retries');
    throw lastError;
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    try {
      const issue = await this.request<JiraIssue>({
        method: 'GET',
        path: `/issue/${issueKey}`,
      });
      return issue;
    } catch (error) {
      logger.error({ issueKey, error }, 'Failed to get Jira issue');
      throw error;
    }
  }

  async createIssue(
    projectKey: string,
    summary: string,
    description: string,
    issueType: string = 'Task',
    additionalFields?: Record<string, unknown>
  ): Promise<JiraIssue> {
    try {
      const body = {
        fields: {
          project: { key: projectKey },
          summary,
          description: description
            ? {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: description,
                      },
                    ],
                  },
                ],
              }
            : undefined,
          issuetype: { name: issueType },
          ...additionalFields,
        },
      };

      const issue = await this.request<JiraIssue>({
        method: 'POST',
        path: '/issue',
        body,
      });

      logger.info({ issueKey: issue.key }, 'Created Jira issue');
      return issue;
    } catch (error) {
      logger.error({ projectKey, error }, 'Failed to create Jira issue');
      throw error;
    }
  }

  async updateIssue(
    issueKey: string,
    updates: {
      summary?: string;
      description?: string;
      status?: string;
      assignee?: string | null;
      priority?: string;
      [key: string]: unknown;
    }
  ): Promise<void> {
    try {
      const fields: Record<string, unknown> = {};

      if (updates.summary) {
        fields.summary = updates.summary;
      }

      if (updates.description !== undefined) {
        fields.description = updates.description
          ? {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: updates.description,
                    },
                  ],
                },
              ],
            }
          : null;
      }

      if (updates.status) {
        // Get available transitions first
        const transitions = await this.getTransitions(issueKey);
        const transition = transitions.find((t) => t.to.name === updates.status);
        if (transition) {
          await this.transitionIssue(issueKey, transition.id);
        }
      }

      if (updates.assignee !== undefined) {
        fields.assignee = updates.assignee ? { accountId: updates.assignee } : null;
      }

      if (updates.priority) {
        fields.priority = { name: updates.priority };
      }

      // Add any additional fields
      Object.keys(updates).forEach((key) => {
        if (!['summary', 'description', 'status', 'assignee', 'priority'].includes(key)) {
          fields[key] = updates[key];
        }
      });

      if (Object.keys(fields).length > 0) {
        await this.request<void>({
          method: 'PUT',
          path: `/issue/${issueKey}`,
          body: { fields },
        });
        logger.info({ issueKey }, 'Updated Jira issue');
      }
    } catch (error) {
      logger.error({ issueKey, error }, 'Failed to update Jira issue');
      throw error;
    }
  }

  async getComments(issueKey: string): Promise<JiraComment[]> {
    try {
      const response = await this.request<{ comments: JiraComment[] }>({
        method: 'GET',
        path: `/issue/${issueKey}/comment`,
      });
      return response.comments || [];
    } catch (error) {
      logger.error({ issueKey, error }, 'Failed to get Jira comments');
      throw error;
    }
  }

  async createComment(issueKey: string, body: string): Promise<JiraComment> {
    try {
      const comment = await this.request<JiraComment>({
        method: 'POST',
        path: `/issue/${issueKey}/comment`,
        body: {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: body,
                  },
                ],
              },
            ],
          },
        },
      });
      logger.info({ issueKey }, 'Created Jira comment');
      return comment;
    } catch (error) {
      logger.error({ issueKey, error }, 'Failed to create Jira comment');
      throw error;
    }
  }

  async getTransitions(issueKey: string): Promise<Array<{ id: string; name: string; to: { name: string } }>> {
    try {
      const response = await this.request<{ transitions: Array<{ id: string; name: string; to: { name: string } }> }>({
        method: 'GET',
        path: `/issue/${issueKey}/transitions`,
      });
      return response.transitions || [];
    } catch (error) {
      logger.error({ issueKey, error }, 'Failed to get Jira transitions');
      throw error;
    }
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    try {
      await this.request<void>({
        method: 'POST',
        path: `/issue/${issueKey}/transitions`,
        body: {
          transition: { id: transitionId },
        },
      });
      logger.info({ issueKey, transitionId }, 'Transitioned Jira issue');
    } catch (error) {
      logger.error({ issueKey, transitionId, error }, 'Failed to transition Jira issue');
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<{ accountId: string; displayName: string } | null> {
    try {
      const users = await this.request<Array<{ accountId: string; displayName: string }>>({
        method: 'GET',
        path: `/user/search?query=${encodeURIComponent(email)}`,
      });
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error({ email, error }, 'Failed to find Jira user by email');
      return null;
    }
  }
}

