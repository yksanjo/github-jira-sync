import { Octokit } from '@octokit/rest';
import { appConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { GitHubIssue, GitHubComment } from '../../types/index.js';

export class GitHubClient {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || appConfig.github.oauthToken,
      request: {
        retries: 3,
        retryAfter: 1,
      },
    });
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    try {
      const { data } = await this.octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });
      return data as GitHubIssue;
    } catch (error) {
      logger.error({ owner, repo, issueNumber, error }, 'Failed to get GitHub issue');
      throw error;
    }
  }

  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[],
    assignees?: string[]
  ): Promise<GitHubIssue> {
    try {
      const { data } = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
        assignees,
      });
      logger.info({ owner, repo, issueNumber: data.number }, 'Created GitHub issue');
      return data as GitHubIssue;
    } catch (error) {
      logger.error({ owner, repo, error }, 'Failed to create GitHub issue');
      throw error;
    }
  }

  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<GitHubIssue> {
    try {
      const { data } = await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        ...updates,
      });
      logger.info({ owner, repo, issueNumber }, 'Updated GitHub issue');
      return data as GitHubIssue;
    } catch (error) {
      logger.error({ owner, repo, issueNumber, error }, 'Failed to update GitHub issue');
      throw error;
    }
  }

  async getComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubComment[]> {
    try {
      const { data } = await this.octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
      });
      return data as GitHubComment[];
    } catch (error) {
      logger.error({ owner, repo, issueNumber, error }, 'Failed to get GitHub comments');
      throw error;
    }
  }

  async createComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<GitHubComment> {
    try {
      const { data } = await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      logger.info({ owner, repo, issueNumber }, 'Created GitHub comment');
      return data as GitHubComment;
    } catch (error) {
      logger.error({ owner, repo, issueNumber, error }, 'Failed to create GitHub comment');
      throw error;
    }
  }

  async addLabels(owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void> {
    try {
      await this.octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels,
      });
      logger.info({ owner, repo, issueNumber, labels }, 'Added GitHub labels');
    } catch (error) {
      logger.error({ owner, repo, issueNumber, error }, 'Failed to add GitHub labels');
      throw error;
    }
  }

  async removeLabel(owner: string, repo: string, issueNumber: number, label: string): Promise<void> {
    try {
      await this.octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label,
      });
      logger.info({ owner, repo, issueNumber, label }, 'Removed GitHub label');
    } catch (error) {
      logger.error({ owner, repo, issueNumber, error }, 'Failed to remove GitHub label');
      throw error;
    }
  }
}




