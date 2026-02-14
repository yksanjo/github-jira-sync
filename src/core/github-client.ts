/**
 * GitHub API Client
 * Handles all GitHub API interactions
 */

import axios, { AxiosInstance } from 'axios';
import { getConfig } from '../config';
import { GitHubIssue, GitHubComment } from '../types';
import { logger } from '../logger';

export class GitHubClient {
  private client: AxiosInstance;
  private config = getConfig();

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${this.config.github.token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
  }

  /**
   * Gets an issue by number
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues/${issueNumber}`);
      return response.data as GitHubIssue;
    } catch (error) {
      logger.error('Error fetching GitHub issue', { owner, repo, issueNumber, error });
      throw error;
    }
  }

  /**
   * Creates a new issue
   */
  async createIssue(
    owner: string, 
    repo: string, 
    data: { title: string; body?: string; labels?: string[]; assignees?: string[] }
  ): Promise<GitHubIssue> {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/issues`, data);
      logger.info('Created GitHub issue', { owner, repo, issueNumber: response.data.number });
      return response.data as GitHubIssue;
    } catch (error) {
      logger.error('Error creating GitHub issue', { owner, repo, error });
      throw error;
    }
  }

  /**
   * Updates an existing issue
   */
  async updateIssue(
    owner: string, 
    repo: string, 
    issueNumber: number,
    data: { title?: string; body?: string; state?: string; labels?: string[]; assignees?: string[] }
  ): Promise<GitHubIssue> {
    try {
      const response = await this.client.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, data);
      logger.info('Updated GitHub issue', { owner, repo, issueNumber });
      return response.data as GitHubIssue;
    } catch (error) {
      logger.error('Error updating GitHub issue', { owner, repo, issueNumber, error });
      throw error;
    }
  }

  /**
   * Gets comments for an issue
   */
  async getComments(owner: string, repo: string, issueNumber: number): Promise<GitHubComment[]> {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
      return response.data as GitHubComment[];
    } catch (error) {
      logger.error('Error fetching GitHub comments', { owner, repo, issueNumber, error });
      throw error;
    }
  }

  /**
   * Creates a comment on an issue
   */
  async createComment(
    owner: string, 
    repo: string, 
    issueNumber: number, 
    body: string
  ): Promise<GitHubComment> {
    try {
      const response = await this.client.post(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
      logger.info('Created GitHub comment', { owner, repo, issueNumber });
      return response.data as GitHubComment;
    } catch (error) {
      logger.error('Error creating GitHub comment', { owner, repo, issueNumber, error });
      throw error;
    }
  }

  /**
   * Updates a comment
   */
  async updateComment(
    owner: string, 
    repo: string, 
    commentId: number, 
    body: string
  ): Promise<GitHubComment> {
    try {
      const response = await this.client.patch(`/repos/${owner}/${repo}/issues/comments/${commentId}`, { body });
      logger.info('Updated GitHub comment', { owner, repo, commentId });
      return response.data as GitHubComment;
    } catch (error) {
      logger.error('Error updating GitHub comment', { owner, repo, commentId, error });
      throw error;
    }
  }

  /**
   * Searches for issues
   */
  async searchIssues(query: string): Promise<{ items: GitHubIssue[]; total_count: number }> {
    try {
      const response = await this.client.get('/search/issues', { params: { q: query } });
      return response.data;
    } catch (error) {
      logger.error('Error searching GitHub issues', { query, error });
      throw error;
    }
  }

  /**
   * Gets repository information
   */
  async getRepository(owner: string, repo: string): Promise<{
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    owner: { login: string; avatar_url: string };
  }> {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching repository', { owner, repo, error });
      throw error;
    }
  }
}

// Export singleton instance
export const githubClient = new GitHubClient();
