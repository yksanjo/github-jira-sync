import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { handleGitHubWebhook, verifyGitHubSignature } from '../webhooks/github.js';
import { handleJiraWebhook, verifyJiraSignature } from '../webhooks/jira.js';
import { logger } from '../utils/logger.js';
import type { GitHubWebhookPayload, JiraWebhookPayload } from '../types/index.js';

export async function webhookRoutes(fastify: FastifyInstance) {
  // GitHub webhook endpoint
  fastify.post('/webhook/github', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const signature = request.headers['x-hub-signature-256'] as string;
      const payload = JSON.stringify(request.body);

      if (!verifyGitHubSignature(payload, signature)) {
        logger.warn({ signature }, 'Invalid GitHub webhook signature');
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      const webhookPayload = request.body as GitHubWebhookPayload;
      await handleGitHubWebhook(webhookPayload);

      return reply.code(200).send({ status: 'ok' });
    } catch (error) {
      logger.error({ error }, 'Error handling GitHub webhook');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Jira webhook endpoint
  fastify.post('/webhook/jira', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const signature = request.headers['x-jira-webhook-signature'] as string;
      const payload = JSON.stringify(request.body);

      if (!verifyJiraSignature(payload, signature)) {
        logger.warn({ signature }, 'Invalid Jira webhook signature');
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      const webhookPayload = request.body as JiraWebhookPayload;
      await handleJiraWebhook(webhookPayload);

      return reply.code(200).send({ status: 'ok' });
    } catch (error) {
      logger.error({ error }, 'Error handling Jira webhook');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}




