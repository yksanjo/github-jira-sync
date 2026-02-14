/**
 * Core type definitions for GitHub-Jira Sync
 * Production-ready type-safe sync between GitHub & Jira
 */

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum SyncDirection {
  GITHUB_TO_JIRA = 'GITHUB_TO_JIRA',
  JIRA_TO_GITHUB = 'JIRA_TO_GITHUB',
}

export enum SyncEventType {
  ISSUE_CREATED = 'ISSUE_CREATED',
  ISSUE_UPDATED = 'ISSUE_UPDATED',
  ISSUE_DELETED = 'ISSUE_DELETED',
  COMMENT_CREATED = 'COMMENT_CREATED',
  COMMENT_UPDATED = 'COMMENT_UPDATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  ASSIGNEE_CHANGED = 'ASSIGNEE_CHANGED',
  LABEL_CHANGED = 'LABEL_CHANGED',
}

export enum SyncStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRY = 'RETRY',
}

export enum ConflictResolutionStrategy {
  GITHUB_WINS = 'GITHUB_WINS',
  JIRA_WINS = 'JIRA_WINS',
  MANUAL = 'MANUAL',
  LAST_WRITE_WINS = 'LAST_WRITE_WINS',
}

export enum IssueStatus {
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  IN_REVIEW = 'In Review',
  DONE = 'Done',
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

// GitHub Issue Schema
export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string().min(1).max(255),
  body: z.string().optional(),
  state: z.enum(['open', 'closed']),
  html_url: z.string().url(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
  labels: z.array(z.object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
  })),
  assignees: z.array(z.object({
    id: z.number(),
    login: z.string(),
    avatar_url: z.string().url(),
  })),
  user: z.object({
    id: z.number(),
    login: z.string(),
    avatar_url: z.string().url(),
  }),
});

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

// GitHub Comment Schema
export const GitHubCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  html_url: z.string().url(),
  user: z.object({
    id: z.number(),
    login: z.string(),
    avatar_url: z.string().url(),
  }),
});

export type GitHubComment = z.infer<typeof GitHubCommentSchema>;

// GitHub Webhook Payload Schema
export const GitHubWebhookPayloadSchema = z.object({
  action: z.string().optional(),
  issue: GitHubIssueSchema.optional(),
  comment: GitHubCommentSchema.optional(),
  changes: z.record(z.unknown()).optional(),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    html_url: z.string().url(),
  }).optional(),
  sender: z.object({
    id: z.number(),
    login: z.string(),
    type: z.string(),
  }),
});

export type GitHubWebhookPayload = z.infer<typeof GitHubWebhookPayloadSchema>;

// Jira Issue Schema
export const JiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string().min(1).max(255),
    description: z.string().optional(),
    status: z.object({
      id: z.string(),
      name: z.string(),
      statusCategory: z.object({
        key: z.string(),
        name: z.string(),
      }),
    }),
    priority: z.object({
      id: z.string(),
      name: z.string(),
    }).optional(),
    issuetype: z.object({
      id: z.string(),
      name: z.string(),
    }),
    created: z.string().datetime(),
    updated: z.string().datetime(),
    resolutiondate: z.string().datetime().nullable(),
    assignee: z.object({
      accountId: z.string(),
      displayName: z.string(),
      emailAddress: z.string().email().optional(),
      avatarUrls: z.record(z.string().url()),
    }).nullable(),
    reporter: z.object({
      accountId: z.string(),
      displayName: z.string(),
      emailAddress: z.string().email().optional(),
    }),
    labels: z.array(z.string()),
    project: z.object({
      id: z.string(),
      key: z.string(),
      name: z.string(),
    }),
  }),
  self: z.string().url(),
});

export type JiraIssue = z.infer<typeof JiraIssueSchema>;

// Jira Comment Schema
export const JiraCommentSchema = z.object({
  id: z.string(),
  body: z.object({
    content: z.array(z.object({
      content: z.array(z.object({
        text: z.string(),
        type: z.string(),
      })),
      type: z.string(),
    })),
    type: z.string(),
    version: z.number(),
  }),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  author: z.object({
    accountId: z.string(),
    displayName: z.string(),
  }),
  self: z.string().url(),
});

export type JiraComment = z.infer<typeof JiraCommentSchema>;

// Jira Webhook Payload Schema
export const JiraWebhookPayloadSchema = z.object({
  webhookEvent: z.string(),
  issue: JiraIssueSchema.optional(),
  comment: JiraCommentSchema.optional(),
  user: z.object({
    accountId: z.string(),
    displayName: z.string(),
  }).optional(),
  issueKey: z.string().optional(),
});

export type JiraWebhookPayload = z.infer<typeof JiraWebhookPayloadSchema>;

// ============================================================================
// SYNC JOB & STATE SCHEMAS
// ============================================================================

export const SyncJobSchema = z.object({
  id: z.string().uuid(),
  direction: z.nativeEnum(SyncDirection),
  eventType: z.nativeEnum(SyncEventType),
  sourceId: z.string(),
  sourceData: z.record(z.unknown()),
  targetId: z.string().optional(),
  status: z.nativeEnum(SyncStatus),
  retryCount: z.number().min(0).max(10),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SyncJob = z.infer<typeof SyncJobSchema>;

export const SyncStateSchema = z.object({
  entityType: z.enum(['issue', 'comment', 'label']),
  entityId: z.string(),
  githubUpdatedAt: z.string().datetime().nullable(),
  jiraUpdatedAt: z.string().datetime().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  syncVersion: z.number().min(1),
  conflictDetected: z.boolean().default(false),
  conflictData: z.record(z.unknown()).optional(),
});

export type SyncState = z.infer<typeof SyncStateSchema>;

export const DeduplicationEntrySchema = z.object({
  hash: z.string(),
  sourceEvent: z.string(),
  entityType: z.enum(['issue', 'comment']),
  entityId: z.string(),
  timestamp: z.string().datetime(),
  processed: z.boolean().default(false),
  ttl: z.number().min(60).max(86400), // 1 minute to 24 hours
});

export type DeduplicationEntry = z.infer<typeof DeduplicationEntrySchema>;

// ============================================================================
// CONFIGURATION SCHEMAS
// ============================================================================

export const AppConfigSchema = z.object({
  github: z.object({
    webhookSecret: z.string().min(1),
    token: z.string().min(1),
    org: z.string().min(1),
    repo: z.string().min(1),
  }),
  jira: z.object({
    host: z.string().min(1),
    email: z.string().email(),
    apiToken: z.string().min(1),
    projectKey: z.string().min(1).max(10),
  }),
  redis: z.object({
    host: z.string().min(1),
    port: z.number().min(1).max(65535),
    password: z.string().optional(),
  }),
  queue: z.object({
    concurrency: z.number().min(1).max(100),
    maxRetries: z.number().min(0).max(10),
    retryDelay: z.number().min(1000),
  }),
  app: z.object({
    port: z.number().min(1).max(65535),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
    nodeEnv: z.enum(['development', 'staging', 'production']),
  }),
  sync: z.object({
    conflictResolution: z.nativeEnum(ConflictResolutionStrategy),
    labelMapping: z.record(z.string()).optional(),
    statusMapping: z.record(z.string()).optional(),
    autoSync: z.boolean().default(true),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ============================================================================
// METRICS SCHEMAS
// ============================================================================

export const SyncMetricsSchema = z.object({
  totalJobs: z.number().default(0),
  successfulJobs: z.number().default(0),
  failedJobs: z.number().default(0),
  retryJobs: z.number().default(0),
  conflictsDetected: z.number().default(0),
  conflictsResolved: z.number().default(0),
  deduplicationHits: z.number().default(0),
  averageProcessingTimeMs: z.number().default(0),
  queueWaitingJobs: z.number().default(0),
  queueActiveJobs: z.number().default(0),
  lastSyncTimestamp: z.string().datetime().nullable(),
});

export type SyncMetrics = z.infer<typeof SyncMetricsSchema>;
