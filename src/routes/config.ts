import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { SyncConfigSchema } from '../types/index.js';

const CreateConfigSchema = SyncConfigSchema;
const UpdateConfigSchema = SyncConfigSchema.partial();

export async function configRoutes(fastify: FastifyInstance) {
  // List all configs
  fastify.get('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const configs = await prisma.syncConfig.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return reply.code(200).send(
        configs.map((config) => ({
          id: config.id,
          name: config.name,
          active: config.active,
          config: config.config,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        }))
      );
    } catch (error) {
      logger.error({ error }, 'Error listing configs');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get config by ID
  fastify.get('/config/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const config = await prisma.syncConfig.findUnique({
        where: { id },
      });

      if (!config) {
        return reply.code(404).send({ error: 'Config not found' });
      }

      return reply.code(200).send({
        id: config.id,
        name: config.name,
        active: config.active,
        config: config.config,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      logger.error({ error }, 'Error getting config');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Create config
  fastify.post('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = CreateConfigSchema.parse(request.body);
      const config = await prisma.syncConfig.create({
        data: {
          name: body.name,
          config: body,
          active: true,
        },
      });

      logger.info({ configId: config.id, name: config.name }, 'Created sync config');
      return reply.code(201).send({
        id: config.id,
        name: config.name,
        active: config.active,
        config: config.config,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid config', details: error.errors });
      }
      logger.error({ error }, 'Error creating config');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Update config
  fastify.put('/config/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = UpdateConfigSchema.parse(request.body);

      const existing = await prisma.syncConfig.findUnique({
        where: { id },
      });

      if (!existing) {
        return reply.code(404).send({ error: 'Config not found' });
      }

      const updatedConfig = {
        ...(existing.config as object),
        ...body,
      };

      const config = await prisma.syncConfig.update({
        where: { id },
        data: {
          name: body.name || existing.name,
          config: updatedConfig,
          active: body.active !== undefined ? body.active : existing.active,
        },
      });

      logger.info({ configId: config.id }, 'Updated sync config');
      return reply.code(200).send({
        id: config.id,
        name: config.name,
        active: config.active,
        config: config.config,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid config', details: error.errors });
      }
      logger.error({ error }, 'Error updating config');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Delete config
  fastify.delete('/config/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.syncConfig.delete({
        where: { id },
      });

      logger.info({ configId: id }, 'Deleted sync config');
      return reply.code(200).send({ status: 'deleted' });
    } catch (error) {
      logger.error({ error }, 'Error deleting config');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}

