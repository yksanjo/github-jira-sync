import { describe, it, expect } from 'vitest';
import { MappingEngine } from './engine.js';
import type { SyncConfig } from '../../types/index.js';

describe('MappingEngine', () => {
  const baseConfig: SyncConfig = {
    name: 'test',
    github: { owner: 'test', repo: 'test' },
    jira: { projectKey: 'TEST' },
    mappings: {
      status: {
        'To Do': 'todo',
        'In Progress': 'in_progress',
        'Done': 'done',
        'bug': 'Bug',
        'feature': 'Feature',
      },
      ignoreStatuses: ['Won\'t Fix'],
      ignoreLabels: ['wontfix'],
    },
    syncPriority: 'timestamp',
    syncComments: true,
    syncLabels: true,
    syncAssignees: true,
  };

  it('should map GitHub status to Jira status', () => {
    const engine = new MappingEngine(baseConfig);

    expect(engine.githubStatusToJira('open', ['To Do'])).toBe('todo');
    expect(engine.githubStatusToJira('open', ['In Progress'])).toBe('in_progress');
    expect(engine.githubStatusToJira('closed', [])).toBe('done');
  });

  it('should map Jira status to GitHub labels', () => {
    const engine = new MappingEngine(baseConfig);

    const labels = engine.jiraStatusToGitHubLabels('todo');
    expect(labels).toContain('To Do');
  });

  it('should ignore labels based on ignore rules', () => {
    const engine = new MappingEngine(baseConfig);

    const result = engine.githubStatusToJira('open', ['wontfix']);
    expect(result).toBeNull();
  });

  it('should ignore statuses based on ignore rules', () => {
    const engine = new MappingEngine(baseConfig);

    const shouldSkip = engine.shouldSkipUpdate('jira', 'Won\'t Fix');
    expect(shouldSkip).toBe(true);
  });

  it('should map custom fields', () => {
    const configWithFields: SyncConfig = {
      ...baseConfig,
      mappings: {
        ...baseConfig.mappings,
        fields: {
          'github-custom': 'jira-custom',
        },
      },
    };

    const engine = new MappingEngine(configWithFields);

    const mapped = engine.mapFields({ 'github-custom': 'value' }, 'github_to_jira');
    expect(mapped).toEqual({ 'jira-custom': 'value' });
  });
});

