import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreatePickInput,
  PickResultSchema,
  PickSchema,
  Routes,
  UpdatePickInput,
} from '@repo/api-contract';
import { PicksService } from './picks.service.js';

const IdParams = z.object({ id: z.string() });

const picksRoutes: FastifyPluginAsync = async (app) => {
  const service = new PicksService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  app.addHook('onRequest', app.authenticate);

  typed.get(Routes.Picks.list, {
    schema: {
      tags: ['picks'],
      security: [{ bearerAuth: [] }],
      response: { 200: z.array(PickSchema) },
    },
    handler: async (req) => service.list(req.user.userId),
  });

  typed.post(Routes.Picks.create, {
    schema: {
      tags: ['picks'],
      security: [{ bearerAuth: [] }],
      body: CreatePickInput,
      response: { 201: PickSchema },
    },
    handler: async (req, reply) => {
      const pick = await service.create(req.user.userId, req.body);
      return reply.code(201).send(pick);
    },
  });

  typed.get('/api/v1/picks/:id', {
    schema: {
      tags: ['picks'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: PickSchema },
    },
    handler: async (req) => service.getById(req.user.userId, req.params.id),
  });

  typed.patch('/api/v1/picks/:id', {
    schema: {
      tags: ['picks'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: UpdatePickInput,
      response: { 200: PickSchema },
    },
    handler: async (req) => service.update(req.user.userId, req.params.id, req.body),
  });

  typed.delete('/api/v1/picks/:id', {
    schema: {
      tags: ['picks'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
    },
    handler: async (req, reply) => {
      await service.remove(req.user.userId, req.params.id);
      return reply.code(204).send();
    },
  });

  typed.post('/api/v1/picks/:id/random', {
    schema: {
      tags: ['picks'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: PickResultSchema },
    },
    handler: async (req) => service.random(req.user.userId, req.params.id),
  });
};

export default picksRoutes;
