import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ListSettlementDraftsResult,
  Routes,
  SettlementDraft,
  UpsertSettlementDraftInput,
} from '@repo/api-contract';
import {
  SettlementDraftError,
  SettlementDraftService,
} from './settlement-draft.service.js';

const S = Routes.SettlementDraft;

const IdParams = z.object({ id: z.string().min(1) });

const throwAsHttp = (app: FastifyInstance, e: SettlementDraftError): never => {
  switch (e.code) {
    case 'not_found':
      throw app.httpErrors.notFound(e.message);
    case 'forbidden':
      throw app.httpErrors.forbidden(e.message);
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

const settlementDraftRoutes: FastifyPluginAsync = async (app) => {
  const service = new SettlementDraftService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(S.list, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-draft'],
      security: [{ bearerAuth: [] }],
      response: { 200: ListSettlementDraftsResult },
    },
    handler: async (req) => service.list(req.user.userId),
  });

  // upsert — (userId, placeId) 키로. id 는 클라이언트가 모르고도 호출 가능.
  typed.put(S.upsert, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-draft'],
      security: [{ bearerAuth: [] }],
      body: UpsertSettlementDraftInput,
      response: { 200: SettlementDraft },
    },
    handler: async (req) => service.upsert(req.user.userId, req.body),
  });

  typed.delete(S.one(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-draft'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
    },
    handler: async (req, reply) => {
      try {
        await service.deleteById(req.user.userId, req.params.id);
        return reply.code(204).send();
      } catch (e) {
        if (e instanceof SettlementDraftError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });
};

export default settlementDraftRoutes;
