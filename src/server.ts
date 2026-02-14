/**
 * Main Express Server
 * Handles webhook endpoints and API
 */

import express, { Request, Response, NextFunction } from 'express';
import { getConfig } from './config';
import { handleGitHubWebhook } from './webhooks/github';
import { handleJiraWebhook } from './webhooks/jira';
import { getAllQueueStats } from './queue';
import { performHealthCheck } from './monitoring';
import { logger } from './logger';
import { verifyGitHubSignature } from './webhooks/github';

const app = express();

// Middleware
app.use(express.json({
  verify: (req: express.Request, _res: express.Response, buf: Buffer) => {
    // Store raw body for signature verification
    (req as any).rawBody = buf.toString();
  }
}));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await performHealthCheck();
    res.status(health.healthy ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({ healthy: false, error: 'Health check failed' });
  }
});

// Queue stats endpoint
app.get('/api/queues', async (_req: Request, res: Response) => {
  try {
    const stats = await getAllQueueStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get queue stats', { error });
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// GitHub webhook endpoint
app.post('/webhooks/github', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody = (req as any).rawBody as string;
    
    // Verify webhook signature
    if (signature) {
      const isValid = verifyGitHubSignature(
        rawBody,
        signature,
        config.github.webhookSecret
      );
      
      if (!isValid) {
        logger.warn('Invalid GitHub webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const result = await handleGitHubWebhook(req.body, signature || '');
    
    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('GitHub webhook handler error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Jira webhook endpoint
app.post('/webhooks/jira', async (req: Request, res: Response) => {
  try {
    const result = await handleJiraWebhook(req.body);
    
    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('Jira webhook handler error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoints for manual sync
app.post('/api/sync/github/:issueNumber', async (req: Request, res: Response) => {
  try {
    const { issueNumber } = req.params;
    const { addSyncJob, SyncDirection, SyncEventType } = await import('./queue');
    const { githubClient } = await import('./core/github-client');
    
    const config = getConfig();
    const issue = await githubClient.getIssue(
      config.github.org,
      config.github.repo,
      parseInt(issueNumber)
    );

    const jobId = await addSyncJob(
      SyncDirection.GITHUB_TO_JIRA,
      SyncEventType.ISSUE_UPDATED,
      issue.id.toString(),
      { issue }
    );

    res.json({ success: true, jobId });
  } catch (error) {
    logger.error('Manual sync error', { error });
    res.status(500).json({ error: 'Sync failed' });
  }
});

app.post('/api/sync/jira/:issueKey', async (req: Request, res: Response) => {
  try {
    const { issueKey } = req.params;
    const { addSyncJob, SyncDirection, SyncEventType } = await import('./queue');
    const { jiraClient } = await import('./core/jira-client');
    
    const issue = await jiraClient.getIssue(issueKey);

    const jobId = await addSyncJob(
      SyncDirection.JIRA_TO_GITHUB,
      SyncEventType.ISSUE_UPDATED,
      issue.key,
      { issue }
    );

    res.json({ success: true, jobId });
  } catch (error) {
    logger.error('Manual sync error', { error });
    res.status(500).json({ error: 'Sync failed' });
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
export function startServer(): void {
  const config = getConfig();
  
  app.listen(config.app.port, () => {
    logger.info(`Server started on port ${config.app.port}`);
    logger.info(`GitHub webhook: POST /webhooks/github`);
    logger.info(`Jira webhook: POST /webhooks/jira`);
    logger.info(`Health check: GET /health`);
  });
}

// Export app for testing
export { app };
