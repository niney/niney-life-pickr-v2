import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateSettlementInput,
  ListSettlementsQuery,
  ListSettlementsResult,
  Routes,
  SettlementSession,
} from '@repo/api-contract';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { SettlementError, SettlementService } from './settlement.service.js';

const S = Routes.Settlement;

const IdParams = z.object({ id: z.string().min(1) });

const throwAsHttp = (app: FastifyInstance, e: SettlementError): never => {
  switch (e.code) {
    case 'not_found':
      throw app.httpErrors.notFound(e.message);
    case 'forbidden':
      throw app.httpErrors.forbidden(e.message);
    case 'invalid_participant':
    case 'invalid_receipt_token':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

const settlementRoutes: FastifyPluginAsync = async (app) => {
  const service = new SettlementService(app.prisma);
  const restaurantService = new RestaurantService(app.prisma);

  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(S.create, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      body: CreateSettlementInput,
      response: { 200: SettlementSession },
    },
    handler: async (req) => {
      // restaurantName 스냅샷은 현재 시점의 식당 이름을 사용 — 이후 변경되어도
      // 이력에서 정확한 그 시점의 이름이 남는다.
      const detail = await restaurantService.getPublicDetail(req.body.restaurantPlaceId);
      if (!detail) {
        throw app.httpErrors.notFound('식당을 찾을 수 없습니다.');
      }
      try {
        return await service.create(req.user.userId, req.body, detail.name);
      } catch (e) {
        if (e instanceof SettlementError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.get(S.list, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      querystring: ListSettlementsQuery,
      response: { 200: ListSettlementsResult },
    },
    handler: async (req) => service.list(req.user.userId, req.query),
  });

  typed.get(S.one(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: SettlementSession },
    },
    handler: async (req) => {
      try {
        const out = await service.getById(req.user.userId, req.params.id);
        if (!out) throw app.httpErrors.notFound('세션을 찾을 수 없습니다.');
        return out;
      } catch (e) {
        if (e instanceof SettlementError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(S.one(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
    },
    handler: async (req, reply) => {
      try {
        await service.deleteById(req.user.userId, req.params.id);
        return reply.code(204).send();
      } catch (e) {
        if (e instanceof SettlementError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });
};

export default settlementRoutes;
