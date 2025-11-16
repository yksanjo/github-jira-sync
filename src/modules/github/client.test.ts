import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubClient } from './client.js';

// Mock Octokit
vi.mock('@octokit/rest', () => {
  return {
    Octokit: vi.fn().mockImplementation(() => ({
      rest: {
        issues: {
          get: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          listComments: vi.fn(),
          createComment: vi.fn(),
          addLabels: vi.fn(),
          removeLabel: vi.fn(),
        },
      },
    })),
  };
});

describe('GitHubClient', () => {
  let client: GitHubClient;
  let mockOctokit: any;

  beforeEach(() => {
    client = new GitHubClient('test-token');
    // @ts-ignore
    mockOctokit = client.octokit;
  });

  it('should get an issue', async () => {
    const mockIssue = {
      id: 1,
      number: 123,
      title: 'Test Issue',
      body: 'Test body',
      state: 'open',
      labels: [],
      assignees: [],
      user: { login: 'testuser', id: 1 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      closed_at: null,
      html_url: 'https://github.com/test/repo/issues/123',
    };

    mockOctokit.rest.issues.get.mockResolvedValue({ data: mockIssue });

    const result = await client.getIssue('test', 'repo', 123);

    expect(result).toEqual(mockIssue);
    expect(mockOctokit.rest.issues.get).toHaveBeenCalledWith({
      owner: 'test',
      repo: 'repo',
      issue_number: 123,
    });
  });

  it('should create an issue', async () => {
    const mockIssue = {
      id: 1,
      number: 123,
      title: 'New Issue',
      body: 'New body',
      state: 'open',
      labels: [],
      assignees: [],
      user: { login: 'testuser', id: 1 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      closed_at: null,
      html_url: 'https://github.com/test/repo/issues/123',
    };

    mockOctokit.rest.issues.create.mockResolvedValue({ data: mockIssue });

    const result = await client.createIssue('test', 'repo', 'New Issue', 'New body', ['bug'], ['user1']);

    expect(result).toEqual(mockIssue);
    expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
      owner: 'test',
      repo: 'repo',
      title: 'New Issue',
      body: 'New body',
      labels: ['bug'],
      assignees: ['user1'],
    });
  });

  it('should update an issue', async () => {
    const mockIssue = {
      id: 1,
      number: 123,
      title: 'Updated Issue',
      body: 'Updated body',
      state: 'closed',
      labels: [],
      assignees: [],
      user: { login: 'testuser', id: 1 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      closed_at: '2024-01-02T00:00:00Z',
      html_url: 'https://github.com/test/repo/issues/123',
    };

    mockOctokit.rest.issues.update.mockResolvedValue({ data: mockIssue });

    const result = await client.updateIssue('test', 'repo', 123, {
      title: 'Updated Issue',
      state: 'closed',
    });

    expect(result).toEqual(mockIssue);
    expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
      owner: 'test',
      repo: 'repo',
      issue_number: 123,
      title: 'Updated Issue',
      state: 'closed',
    });
  });
});




