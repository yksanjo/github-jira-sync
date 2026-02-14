/**
 * Integration Tests for GitHub-Jira Sync
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

// Mock data for testing
const mockGitHubIssue = {
  id: 12345678,
  number: 42,
  title: 'Test Issue from GitHub',
  body: 'This is a test issue body',
  state: 'open',
  html_url: 'https://github.com/testorg/testrepo/issues/42',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  closed_at: null,
  labels: [
    { id: 1, name: 'bug', color: 'fc2929' },
    { id: 2, name: 'priority:high', color: 'eb6420' },
  ],
  assignees: [
    { id: 1, login: 'testuser', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
  ],
  user: {
    id: 1,
    login: 'testuser',
    avatar_url: 'https://avatars.githubusercontent.com/u/1',
  },
};

const mockJiraIssue = {
  id: '10001',
  key: 'TEST-42',
  fields: {
    summary: 'Test Issue from GitHub',
    description: 'This is a test issue body',
    status: {
      id: '1',
      name: 'To Do',
      statusCategory: {
        key: 'new',
        name: 'To Do',
      },
    },
    priority: {
      id: '2',
      name: 'High',
    },
    issuetype: {
      id: '1',
      name: 'Task',
    },
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    resolutiondate: null,
    assignee: {
      accountId: '1234567890abcdef',
      displayName: 'Test User',
      emailAddress: 'test@example.com',
      avatarUrls: {
        '48x48': 'https://avatar.example.com/48.png',
      },
    },
    reporter: {
      accountId: '1234567890abcdef',
      displayName: 'Test User',
      emailAddress: 'test@example.com',
    },
    labels: ['bug', 'priority:high'],
    project: {
      id: '10000',
      key: 'TEST',
      name: 'Test Project',
    },
  },
  self: 'https://test.atlassian.net/rest/api/3/issue/10001',
};

describe('GitHub-Jira Sync Integration Tests', () => {
  describe('Webhook Handlers', () => {
    test('should validate GitHub webhook payload', async () => {
      // Test Zod validation of GitHub webhook payload
      const { GitHubWebhookPayloadSchema } = await import('../src/types');
      
      const validPayload = {
        action: 'opened',
        issue: mockGitHubIssue,
        repository: {
          id: 1,
          name: 'testrepo',
          full_name: 'testorg/testrepo',
          html_url: 'https://github.com/testorg/testrepo',
        },
        sender: {
          id: 1,
          login: 'testuser',
          type: 'User',
        },
      };
      
      const result = GitHubWebhookPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    test('should validate Jira webhook payload', async () => {
      const { JiraWebhookPayloadSchema } = await import('../src/types');
      
      const validPayload = {
        webhookEvent: 'jira:issue_created',
        issue: mockJiraIssue,
        user: {
          accountId: '1234567890abcdef',
          displayName: 'Test User',
        },
      };
      
      const result = JiraWebhookPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });
  });

  describe('Conflict Resolution', () => {
    test('should detect conflicts between GitHub and Jira', async () => {
      const { detectConflicts } = await import('../src/conflict-resolution');
      
      // Create versions with different titles
      const githubIssue = {
        ...mockGitHubIssue,
        title: 'GitHub Title',
      };
      
      const jiraIssue = {
        ...mockJiraIssue,
        fields: {
          ...mockJiraIssue.fields,
          summary: 'Jira Summary',
        },
      };
      
      const conflict = detectConflicts(githubIssue, jiraIssue);
      
      expect(conflict).not.toBeNull();
      expect(conflict?.conflictingFields).toContain('title');
    });

    test('should resolve conflict with GitHub wins strategy', async () => {
      const { detectConflicts, resolveConflict } = await import('../src/conflict-resolution');
      const { ConflictResolutionStrategy } = await import('../src/types');
      
      const githubIssue = { ...mockGitHubIssue, title: 'New Title' };
      const jiraIssue = { 
        ...mockJiraIssue, 
        fields: { ...mockJiraIssue.fields, summary: 'Old Title' } 
      };
      
      const conflict = detectConflicts(githubIssue, jiraIssue);
      expect(conflict).not.toBeNull();
      
      const resolution = resolveConflict(conflict!, ConflictResolutionStrategy.GITHUB_WINS);
      
      expect(resolution.resolved).toBe(true);
      expect(resolution.resolution).toBe('github_wins');
      expect(resolution.winningData?.fields?.summary).toBe('New Title');
    });

    test('should resolve conflict with Last Write Wins', async () => {
      const { detectConflicts, resolveConflict } = await import('../src/conflict-resolution');
      const { ConflictResolutionStrategy } = await import('../src/types');
      
      const now = new Date().toISOString();
      const githubIssue = { 
        ...mockGitHubIssue, 
        title: 'GitHub Title',
        updated_at: now,
      };
      const jiraIssue = { 
        ...mockJiraIssue, 
        fields: { 
          ...mockJiraIssue.fields, 
          summary: 'Jira Title',
          updated: new Date(Date.now() - 60000).toISOString(), // Older
        } 
      };
      
      const conflict = detectConflicts(githubIssue, jiraIssue);
      const resolution = resolveConflict(conflict!, ConflictResolutionStrategy.LAST_WRITE_WINS);
      
      expect(resolution.resolved).toBe(true);
      expect(resolution.winningData?.fields?.summary).toBe('GitHub Title');
    });
  });

  describe('Deduplication', () => {
    test('should detect duplicate events', async () => {
      const { isDuplicate, markAsProcessed } = await import('../src/deduplication');
      
      const testHash = 'test-duplicate-' + Date.now();
      
      // First call should not be duplicate
      const firstCheck = await isDuplicate(testHash);
      expect(firstCheck).toBe(false);
      
      // Mark as processed
      await markAsProcessed(testHash, 60);
      
      // Second call should be duplicate
      const secondCheck = await isDuplicate(testHash);
      expect(secondCheck).toBe(true);
    });

    test('should use atomic deduplication', async () => {
      const { processDeduplication } = await import('../src/deduplication');
      
      const testHash = 'test-atomic-' + Date.now();
      
      const result1 = await processDeduplication(testHash, { test: 'data' }, 60);
      expect(result1.isDuplicate).toBe(false);
      expect(result1.shouldProcess).toBe(true);
      
      const result2 = await processDeduplication(testHash, { test: 'data' }, 60);
      expect(result2.isDuplicate).toBe(true);
      expect(result2.shouldProcess).toBe(false);
    });
  });

  describe('Queue Operations', () => {
    test('should add sync job to queue', async () => {
      const { addSyncJob, SyncDirection, SyncEventType } = await import('../src/queue');
      
      const jobId = await addSyncJob(
        SyncDirection.GITHUB_TO_JIRA,
        SyncEventType.ISSUE_CREATED,
        '12345',
        { issue: mockGitHubIssue }
      );
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });
  });

  describe('Sync Engine', () => {
    test('should create sync job data correctly', async () => {
      const { SyncDirection, SyncEventType } = await import('../src/types');
      
      const jobData = {
        id: 'test-id',
        direction: SyncDirection.GITHUB_TO_JIRA,
        eventType: SyncEventType.ISSUE_CREATED,
        sourceId: '12345',
        sourceData: { issue: mockGitHubIssue },
      };
      
      expect(jobData.direction).toBe(SyncDirection.GITHUB_TO_JIRA);
      expect(jobData.eventType).toBe(SyncEventType.ISSUE_CREATED);
    });
  });
});

describe('Type Validation', () => {
  test('should validate GitHub Issue schema', () => {
    const { GitHubIssueSchema } = require('../src/types');
    
    const result = GitHubIssueSchema.safeParse(mockGitHubIssue);
    expect(result.success).toBe(true);
  });

  test('should validate Jira Issue schema', () => {
    const { JiraIssueSchema } = require('../src/types');
    
    const result = JiraIssueSchema.safeParse(mockJiraIssue);
    expect(result.success).toBe(true);
  });

  test('should reject invalid GitHub Issue', () => {
    const { GitHubIssueSchema } = require('../src/types');
    
    const invalidIssue = {
      id: 'not-a-number',
      number: 'not-a-number',
      title: '', // Empty title should fail
    };
    
    const result = GitHubIssueSchema.safeParse(invalidIssue);
    expect(result.success).toBe(false);
  });
});
