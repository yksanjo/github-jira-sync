/**
 * Conflict Resolution Service
 * Handles conflicts between GitHub and Jira data
 */

import { 
  ConflictResolutionStrategy,
  SyncState,
  GitHubIssue,
  JiraIssue,
} from '../types';
import { logger } from '../logger';

// ============================================================================
// CONFLICT TYPES
// ============================================================================

export interface ConflictData {
  githubData: Record<string, unknown>;
  jiraData: Record<string, unknown>;
  githubUpdatedAt: string;
  jiraUpdatedAt: string;
  conflictingFields: string[];
}

export interface ConflictResolutionResult {
  resolved: boolean;
  resolution: 'github_wins' | 'jira_wins' | 'manual' | 'merged';
  winningData?: Record<string, unknown>;
  mergedData?: Record<string, unknown>;
  requiresManualReview?: boolean;
  conflicts?: string[];
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Detects conflicts between GitHub and Jira data
 */
export function detectConflicts(
  githubIssue: GitHubIssue,
  jiraIssue: JiraIssue,
  syncState?: SyncState
): ConflictData | null {
  const conflicts: string[] = [];
  
  // Check title/summary
  if (githubIssue.title !== jiraIssue.fields.summary) {
    conflicts.push('title');
  }
  
  // Check description
  const githubBody = githubIssue.body || '';
  const jiraDescription = jiraIssue.fields.description || '';
  
  if (githubBody !== jiraDescription) {
    conflicts.push('description');
  }
  
  // Check status
  const githubStatus = githubIssue.state === 'open' ? 'open' : 'closed';
  const jiraStatus = jiraIssue.fields.status.statusCategory.key;
  
  if (githubStatus !== jiraStatus) {
    conflicts.push('status');
  }
  
  // Check labels
  const githubLabels = githubIssue.labels.map(l => l.name).sort();
  const jiraLabels = jiraIssue.fields.labels.sort();
  
  const labelsMatch = githubLabels.length === jiraLabels.length &&
    githubLabels.every((l, i) => l === jiraLabels[i]);
  
  if (!labelsMatch) {
    conflicts.push('labels');
  }
  
  // Check assignees
  const githubAssignees = githubIssue.assignees.map(a => a.login).sort();
  const jiraAssignees = jiraIssue.fields.assignee ? [jiraIssue.fields.assignee.displayName] : [];
  
  const assigneesMatch = githubAssignees.length === jiraAssignees.length &&
    githubAssignees.every((a, i) => a.toLowerCase() === jiraAssignees[i]?.toLowerCase());
  
  if (!assigneesMatch) {
    conflicts.push('assignees');
  }
  
  if (conflicts.length === 0) {
    return null;
  }
  
  return {
    githubData: {
      title: githubIssue.title,
      body: githubIssue.body,
      state: githubIssue.state,
      labels: githubIssue.labels.map(l => l.name),
      assignees: githubIssue.assignees.map(a => a.login),
      updatedAt: githubIssue.updated_at,
    },
    jiraData: {
      summary: jiraIssue.fields.summary,
      description: jiraIssue.fields.description,
      status: jiraIssue.fields.status.name,
      labels: jiraIssue.fields.labels,
      assignee: jiraIssue.fields.assignee?.displayName,
      updatedAt: jiraIssue.fields.updated,
    },
    githubUpdatedAt: githubIssue.updated_at,
    jiraUpdatedAt: jiraIssue.fields.updated,
    conflictingFields: conflicts,
  };
}

// ============================================================================
// CONFLICT RESOLUTION STRATEGIES
// ============================================================================

/**
 * Resolves conflicts based on configured strategy
 */
export function resolveConflict(
  conflictData: ConflictData,
  strategy: ConflictResolutionStrategy,
  customMapping?: {
    labelMapping?: Record<string, string>;
    statusMapping?: Record<string, string>;
  }
): ConflictResolutionResult {
  switch (strategy) {
    case ConflictResolutionStrategy.GITHUB_WINS:
      return resolveGitHubWins(conflictData, customMapping);
    
    case ConflictResolutionStrategy.JIRA_WINS:
      return resolveJiraWins(conflictData, customMapping);
    
    case ConflictResolutionStrategy.LAST_WRITE_WINS:
      return resolveLastWriteWins(conflictData, customMapping);
    
    case ConflictResolutionStrategy.MANUAL:
      return resolveManual(conflictData);
    
    default:
      return resolveLastWriteWins(conflictData, customMapping);
  }
}

/**
 * GitHub wins strategy - GitHub data takes precedence
 */
function resolveGitHubWins(
  conflictData: ConflictData,
  customMapping?: {
    labelMapping?: Record<string, string>;
    statusMapping?: Record<string, string>;
  }
): ConflictResolutionResult {
  const winningData = transformGitHubToJiraFormat(
    conflictData.githubData,
    customMapping
  );
  
  return {
    resolved: true,
    resolution: 'github_wins',
    winningData,
    conflicts: conflictData.conflictingFields,
  };
}

/**
 * Jira wins strategy - Jira data takes precedence
 */
function resolveJiraWins(
  conflictData: ConflictData,
  customMapping?: {
    labelMapping?: Record<string, string>;
    statusMapping?: Record<string, string>;
  }
): ConflictResolutionResult {
  const winningData = transformJiraToGitHubFormat(
    conflictData.jiraData,
    customMapping
  );
  
  return {
    resolved: true,
    resolution: 'jira_wins',
    winningData,
    conflicts: conflictData.conflictingFields,
  };
}

/**
 * Last write wins - Most recent update takes precedence
 */
function resolveLastWriteWins(
  conflictData: ConflictData,
  customMapping?: {
    labelMapping?: Record<string, string>;
    statusMapping?: Record<string, string>;
  }
): ConflictResolutionResult {
  const githubTime = new Date(conflictData.githubUpdatedAt).getTime();
  const jiraTime = new Date(conflictData.jiraUpdatedAt).getTime();
  
  if (githubTime > jiraTime) {
    return resolveGitHubWins(conflictData, customMapping);
  } else {
    return resolveJiraWins(conflictData, customMapping);
  }
}

/**
 * Manual resolution required
 */
function resolveManual(
  conflictData: ConflictData
): ConflictResolutionResult {
  return {
    resolved: false,
    resolution: 'manual',
    requiresManualReview: true,
    conflicts: conflictData.conflictingFields,
  };
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transforms GitHub data to Jira format
 */
function transformGitHubToJiraFormat(
  githubData: Record<string, unknown>,
  customMapping?: {
    labelMapping?: Record<string, string>;
    statusMapping?: Record<string, string>;
  }
): Record<string, unknown> {
  const labels = (githubData.labels as string[] || []).map(
    label => customMapping?.labelMapping?.[label] || label
  );
  
  const statusMap = customMapping?.statusMapping || getDefaultStatusMapping();
  const githubState = githubData.state as string;
  const jiraStatus = statusMap[githubState] || 'To Do';
  
  return {
    fields: {
      summary: githubData.title,
      description: githubData.body || '',
      labels,
      priority: {
        name: 'Medium', // Default priority
      },
    },
    transitions: [
      { 
        transition: { 
          name: jiraStatus 
        } 
      }
    ],
  };
}

/**
 * Transforms Jira data to GitHub format
 */
function transformJiraToGitHubFormat(
  jiraData: Record<string, unknown>,
  customMapping?: {
    labelMapping?: Record<string, string>;
    statusMapping?: Record<string, string>;
  }
): Record<string, unknown> {
  const labels = (jiraData.labels as string[] || []).map(
    label => {
      // Reverse mapping
      const reverseMap = customMapping?.labelMapping 
        ? Object.entries(customMapping.labelMapping).find(([_, v]) => v === label)?.[0]
        : null;
      return reverseMap || label;
    }
  );
  
  const jiraStatus = jiraData.status as string;
  const statusMap = customMapping?.statusMapping || getDefaultStatusMapping();
  
  // Find GitHub state from Jira status
  let state = 'open';
  for (const [ghState, jState] of Object.entries(statusMap)) {
    if (jState === jiraStatus) {
      state = ghState;
      break;
    }
  }
  
  return {
    title: jiraData.summary,
    body: jiraData.description || '',
    state,
    labels,
    assignees: jiraData.assignee ? [{ login: jiraData.assignee }] : [],
  };
}

/**
 * Default status mapping between GitHub and Jira
 */
function getDefaultStatusMapping(): Record<string, string> {
  return {
    open: 'To Do',
    closed: 'Done',
  };
}

// ============================================================================
// CONFLICT STATE MANAGEMENT
// ============================================================================

/**
 * Stores conflict data for manual review
 */
export async function storeConflictForReview(
  entityId: string,
  conflictData: ConflictData
): Promise<void> {
  // In a real implementation, this would store to a database
  logger.info('Conflict stored for manual review', {
    entityId,
    conflicts: conflictData.conflictingFields,
  });
}

/**
 * Resolves a manual conflict
 */
export async function resolveManualConflict(
  entityId: string,
  resolution: 'github_wins' | 'jira_wins' | 'merged',
  resolvedData?: Record<string, unknown>
): Promise<ConflictResolutionResult> {
  logger.info('Manual conflict resolved', {
    entityId,
    resolution,
    resolvedData,
  });
  
  return {
    resolved: true,
    resolution,
    winningData: resolvedData,
  };
}

/**
 * Gets pending conflicts for review
 */
export async function getPendingConflicts(): Promise<Array<{
  entityId: string;
  conflictData: ConflictData;
  createdAt: string;
}>> {
  // In a real implementation, this would fetch from a database
  return [];
}
