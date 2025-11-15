import { z } from 'zod';

// Configuration Types
export const StatusMapSchema = z.record(z.string(), z.string());
export const UserMapSchema = z.record(z.string(), z.string());
export const FieldMapSchema = z.record(z.string(), z.string());

export const SyncConfigSchema = z.object({
  name: z.string(),
  github: z.object({
    owner: z.string(),
    repo: z.string(),
  }),
  jira: z.object({
    projectKey: z.string(),
  }),
  mappings: z.object({
    status: StatusMapSchema,
    users: UserMapSchema.optional(),
    fields: FieldMapSchema.optional(),
    ignoreStatuses: z.array(z.string()).optional(),
    ignoreLabels: z.array(z.string()).optional(),
  }),
  syncPriority: z.enum(['github_first', 'jira_first', 'timestamp']).default('timestamp'),
  syncComments: z.boolean().default(true),
  syncLabels: z.boolean().default(true),
  syncAssignees: z.boolean().default(true),
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type StatusMap = z.infer<typeof StatusMapSchema>;
export type UserMap = z.infer<typeof UserMapSchema>;
export type FieldMap = z.infer<typeof FieldMapSchema>;

// GitHub Types
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string; color?: string }>;
  assignees: Array<{ login: string; id: number }>;
  user: { login: string; id: number };
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: { login: string; id: number };
  created_at: string;
  updated_at: string;
}

export interface GitHubWebhookPayload {
  action: string;
  issue?: GitHubIssue;
  pull_request?: GitHubIssue;
  comment?: GitHubComment;
  repository: {
    name: string;
    full_name: string;
    owner: { login: string };
  };
  sender: { login: string };
}

// Jira Types
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string | null;
    status: { name: string; id: string };
    assignee: { accountId: string; displayName: string; emailAddress?: string } | null;
    priority: { name: string; id: string } | null;
    created: string;
    updated: string;
    resolution?: { name: string } | null;
    [key: string]: unknown;
  };
  self: string;
}

export interface JiraComment {
  id: string;
  body: string;
  author: { accountId: string; displayName: string; emailAddress?: string };
  created: string;
  updated: string;
}

export interface JiraWebhookPayload {
  webhookEvent: string;
  issue?: JiraIssue;
  comment?: JiraComment;
  user?: { accountId: string; displayName: string };
  timestamp: number;
}

// Sync Types
export type SyncDirection = 'github_to_jira' | 'jira_to_github';
export type SyncEventType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.closed'
  | 'issue.reopened'
  | 'comment.created'
  | 'comment.updated'
  | 'assignee.changed'
  | 'label.changed'
  | 'status.changed';

export interface SyncJob {
  id: string;
  direction: SyncDirection;
  eventType: SyncEventType;
  githubIssueNumber?: number;
  githubRepo?: string;
  githubOwner?: string;
  jiraIssueKey?: string;
  payload: unknown;
  configId: string;
  timestamp: number;
}

export interface SyncResult {
  success: boolean;
  direction: SyncDirection;
  githubIssueNumber?: number;
  jiraIssueKey?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

