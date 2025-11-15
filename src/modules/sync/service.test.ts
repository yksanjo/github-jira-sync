import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './service.js';
import type { SyncConfig } from '../../types/index.js';

// Mock dependencies
vi.mock('../github/client.js');
vi.mock('../jira/client.js');
vi.mock('../../db/client.js', () => ({
  prisma: {
    syncMapping: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    syncLock: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('SyncService', () => {
  const mockConfig: SyncConfig = {
    name: 'test',
    github: { owner: 'test', repo: 'test' },
    jira: { projectKey: 'TEST' },
    mappings: {
      status: {
        'To Do': 'todo',
        'In Progress': 'in_progress',
        'Done': 'done',
      },
    },
    syncPriority: 'timestamp',
    syncComments: true,
    syncLabels: true,
    syncAssignees: true,
  };

  it('should be instantiated with config', () => {
    const service = new SyncService(mockConfig);
    expect(service).toBeInstanceOf(SyncService);
  });

  // Additional tests would require more complex mocking
  // This is a placeholder to show the test structure
});

