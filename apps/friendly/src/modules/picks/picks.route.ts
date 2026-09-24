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
      summary: '내 픽(고민 선택지 묶음) 전체 목록 — 최신순',
      security: [{ bearerAuth: [] }],
      response: { 200: z.array(PickSchema) },
    },
    handler: async (req) => service.list(req.user.userId),
  });

  typed.post(Routes.Picks.create, {
    schema: {
      tags: ['picks'],
      summary: '픽 생성 — 제목·선택지 2~20개·카테고리',
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
      summary: '내 픽 단건 조회',
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: PickSchema },
    },
    handler: async (req) => service.getById(req.user.userId, req.params.id),
  });

  typed.patch('/api/v1/picks/:id', {
    schema: {
      tags: ['picks'],
      summary: '픽 수정 — 보낸 필드만 갱신(options 는 통째 교체)',
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
      summary: '픽 삭제',
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
      summary: '픽 선택지 중 하나 무작위 추첨 — 결과는 추첨 이력으로 저장',
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: PickResultSchema },
    },
    handler: async (req) => service.random(req.user.userId, req.params.id),
  });
};

export default picksRoutes;
