import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SyncService } from '../modules/sync/service.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { SyncConfigSchema } from '../types/index.js';
import { appConfig } from '../config/index.js';

const SyncTestSchema = z.object({
  configId: z.string().optional(),
  githubOwner: z.string(),
  githubRepo: z.string(),
  githubIssueNumber: z.number().optional(),
  jiraIssueKey: z.string().optional(),
  direction: z.enum(['github_to_jira', 'jira_to_github']),
});

export async function syncRoutes(fastify: FastifyInstance) {
  // Test sync endpoint
  fastify.post('/sync/test', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = SyncTestSchema.parse(request.body);
      let config;

      if (body.configId) {
        const configRecord = await prisma.syncConfig.findUnique({
          where: { id: body.configId },
        });
        if (!configRecord) {
          return reply.code(404).send({ error: 'Config not found' });
        }
        config = SyncConfigSchema.parse(configRecord.config);
      } else {
        // Use default config from env or create a minimal one
        config = SyncConfigSchema.parse({
          name: 'test',
          github: {
            owner: body.githubOwner,
            repo: body.githubRepo,
          },
          jira: {
            projectKey: 'TEST',
          },
          mappings: {
            status: {
              'To Do': 'todo',
              'In Progress': 'in_progress',
              'Done': 'done',
            },
          },
        });
      }

      const syncService = new SyncService(
        config,
        appConfig.github.oauthToken,
        appConfig.jira.email,
        appConfig.jira.apiToken
      );

      let result;
      if (body.direction === 'github_to_jira') {
        if (!body.githubIssueNumber) {
          return reply.code(400).send({ error: 'githubIssueNumber required for github_to_jira sync' });
        }
        result = await syncService.syncGitHubToJira(
          body.githubOwner,
          body.githubRepo,
          body.githubIssueNumber
        );
      } else {
        if (!body.jiraIssueKey) {
          return reply.code(400).send({ error: 'jiraIssueKey required for jira_to_github sync' });
        }
        result = await syncService.syncJiraToGitHub(body.jiraIssueKey);
      }

      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid request', details: error.errors });
      }
      logger.error({ error }, 'Error in test sync');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get sync status
  fastify.get('/sync/status/:resourceId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { resourceId } = request.params as { resourceId: string };
      const [owner, repo, issueNumber] = resourceId.split('/');

      if (!owner || !repo || !issueNumber) {
        return reply.code(400).send({ error: 'Invalid resource ID format. Use: owner/repo/123' });
      }

      const mapping = await prisma.syncMapping.findUnique({
        where: {
          githubOwner_githubRepo_githubIssueNumber: {
            githubOwner: owner,
            githubRepo: repo,
            githubIssueNumber: parseInt(issueNumber, 10),
          },
        },
      });

      if (!mapping) {
        return reply.code(404).send({ error: 'No mapping found' });
      }

      return reply.code(200).send({
        github: {
          owner: mapping.githubOwner,
          repo: mapping.githubRepo,
          issueNumber: mapping.githubIssueNumber,
        },
        jira: {
          issueKey: mapping.jiraIssueKey,
        },
        createdAt: mapping.createdAt,
        updatedAt: mapping.updatedAt,
      });
    } catch (error) {
      logger.error({ error }, 'Error getting sync status');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}




