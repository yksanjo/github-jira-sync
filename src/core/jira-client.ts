/**
 * Jira API Client
 * Handles all Jira API interactions
 */

import { getConfig } from '../config';
import { JiraIssue, JiraComment } from '../types';
import { logger } from '../logger';

// Simple Jira REST API client using axios
import axios, { AxiosInstance } from 'axios';

export class JiraClient {
  private client: AxiosInstance;
  private config = getConfig();

  constructor() {
    this.client = axios.create({
      baseURL: `https://${this.config.jira.host}/rest/api/3`,
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${this.config.jira.email}:${this.config.jira.apiToken}`
        ).toString('base64')}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Gets an issue by key
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    try {
      const response = await this.client.get(`/issue/${issueKey}`);
      return response.data as JiraIssue;
    } catch (error) {
      logger.error('Error fetching Jira issue', { issueKey, error });
      throw error;
    }
  }

  /**
   * Creates a new issue
   */
  async createIssue(data: {
    projectKey: string;
    summary: string;
    description?: string;
    issueType?: string;
    labels?: string[];
    priority?: string;
  }): Promise<{ key: string; id: string }> {
    try {
      const payload = {
        fields: {
          project: {
            key: data.projectKey,
          },
          summary: data.summary,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: data.description || '',
                  },
                ],
              },
            ],
          },
          issuetype: {
            name: data.issueType || 'Task',
          },
          labels: data.labels || [],
          priority: data.priority ? { name: data.priority } : undefined,
        },
      };

      const response = await this.client.post('/issue', payload);
      logger.info('Created Jira issue', { key: response.data.key });
      return response.data;
    } catch (error) {
      logger.error('Error creating Jira issue', { error });
      throw error;
    }
  }

  /**
   * Updates an existing issue
   */
  async updateIssue(
    issueKey: string,
    data: {
      summary?: string;
      description?: string;
      labels?: string[];
      priority?: string;
    }
  ): Promise<void> {
    try {
      const payload: Record<string, unknown> = {
        fields: {},
      };

      if (data.summary) {
        (payload.fields as Record<string, unknown>).summary = data.summary;
      }

      if (data.description) {
        (payload.fields as Record<string, unknown>).description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: data.description,
                },
              ],
            },
          ],
        };
      }

      if (data.labels) {
        (payload.fields as Record<string, unknown>).labels = data.labels;
      }

      if (data.priority) {
        (payload.fields as Record<string, unknown>).priority = { name: data.priority };
      }

      await this.client.put(`/issue/${issueKey}`, payload);
      logger.info('Updated Jira issue', { issueKey });
    } catch (error) {
      logger.error('Error updating Jira issue', { issueKey, error });
      throw error;
    }
  }

  /**
   * Transitions an issue to a new status
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    try {
      await this.client.post(`/issue/${issueKey}/transitions`, {
        transition: {
          id: transitionId,
        },
      });
      logger.info('Transitioned Jira issue', { issueKey, transitionId });
    } catch (error) {
      logger.error('Error transitioning Jira issue', { issueKey, transitionId, error });
      throw error;
    }
  }

  /**
   * Gets transitions for an issue
   */
  async getTransitions(issueKey: string): Promise<Array<{
    id: string;
    name: string;
    to: { name: string };
  }>> {
    try {
      const response = await this.client.get(`/issue/${issueKey}/transitions`);
      return response.data.transitions;
    } catch (error) {
      logger.error('Error fetching Jira transitions', { issueKey, error });
      throw error;
    }
  }

  /**
   * Gets comments for an issue
   */
  async getComments(issueKey: string): Promise<JiraComment[]> {
    try {
      const response = await this.client.get(`/issue/${issueKey}/comment`);
      return response.data.values as JiraComment[];
    } catch (error) {
      logger.error('Error fetching Jira comments', { issueKey, error });
      throw error;
    }
  }

  /**
   * Creates a comment on an issue
   */
  async createComment(issueKey: string, body: string): Promise<JiraComment> {
    try {
      const payload = {
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
      };

      const response = await this.client.post(`/issue/${issueKey}/comment`, payload);
      logger.info('Created Jira comment', { issueKey });
      return response.data as JiraComment;
    } catch (error) {
      logger.error('Error creating Jira comment', { issueKey, error });
      throw error;
    }
  }

  /**
   * Updates a comment
   */
  async updateComment(issueKey: string, commentId: string, body: string): Promise<void> {
    try {
      const payload = {
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
      };

      await this.client.put(`/issue/${issueKey}/comment/${commentId}`, payload);
      logger.info('Updated Jira comment', { issueKey, commentId });
    } catch (error) {
      logger.error('Error updating Jira comment', { issueKey, commentId, error });
      throw error;
    }
  }

  /**
   * Searches for issues using JQL
   */
  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraIssue[]> {
    try {
      const response = await this.client.get('/search', {
        params: {
          jql,
          maxResults,
        },
      });
      return response.data.issues as JiraIssue[];
    } catch (error) {
      logger.error('Error searching Jira issues', { jql, error });
      throw error;
    }
  }

  /**
   * Gets project information
   */
  async getProject(projectKey: string): Promise<{
    id: string;
    key: string;
    name: string;
  }> {
    try {
      const response = await this.client.get(`/project/${projectKey}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching Jira project', { projectKey, error });
      throw error;
    }
  }
}

// Export singleton instance
export const jiraClient = new JiraClient();
