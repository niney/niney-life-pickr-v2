import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateSettlementInput,
  ListSettlementsQuery,
  ListSettlementsResult,
  Routes,
  SettlementSession,
  SettlementShare,
  SharedSettlementSession,
  UpdateSettlementInput,
} from '@repo/api-contract';
import { SettlementError, SettlementService } from './settlement.service.js';

const S = Routes.Settlement;

const IdParams = z.object({ id: z.string().min(1) });
// base64url 43자 + 안전여유 — 길이 검사로 명백히 잘못된 입력은 zod 단계에서 컷.
const TokenParams = z.object({ token: z.string().min(20).max(64) });

const throwAsHttp = (app: FastifyInstance, e: SettlementError): never => {
  switch (e.code) {
    case 'not_found':
    case 'restaurant_not_found':
      throw app.httpErrors.notFound(e.message);
    case 'forbidden':
      throw app.httpErrors.forbidden(e.message);
    case 'invalid_participant':
    case 'invalid_round':
    case 'invalid_receipt_token':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

const settlementRoutes: FastifyPluginAsync = async (app) => {
  const service = new SettlementService(app.prisma);

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
      try {
        return await service.create(req.user.userId, req.body);
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

  // 저장된 정산 전체 replace. 차수 추가/삭제, 참여자 명단·참석·items 까지 한
  // 번에 교체. 부분 수정 엔드포인트는 없다 — 클라이언트가 전체 draft 를
  // 보내고 서버가 트랜잭션 wipe + rebuild.
  typed.put(S.update(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: UpdateSettlementInput,
      response: { 200: SettlementSession },
    },
    handler: async (req) => {
      try {
        return await service.update(req.user.userId, req.params.id, req.body);
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

  // 공유 토큰 생성 — 멱등. 같은 세션을 두 번 호출해도 동일 토큰 반환.
  typed.post(S.share(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: SettlementShare },
    },
    handler: async (req) => {
      try {
        return await service.createShare(req.user.userId, req.params.id);
      } catch (e) {
        if (e instanceof SettlementError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  // 공유 토큰 회수 — 이미 비공개여도 204. 호출 후 같은 세션을 다시 share 하면
  // 새 토큰이 발급되므로 이전 링크는 영구 무효.
  typed.delete(S.share(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
    },
    handler: async (req, reply) => {
      try {
        await service.revokeShare(req.user.userId, req.params.id);
        return reply.code(204).send();
      } catch (e) {
        if (e instanceof SettlementError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  // 공유 토큰 read-only 조회 — 인증 불필요. 토큰을 안다 = 접근 허용. 응답에서
  // userId/round.receiptPreviewUrl 은 제거되어 영수증 원본 사진은 못 본다.
  typed.get(S.shared(':token'), {
    schema: {
      tags: ['settlement'],
      params: TokenParams,
      response: { 200: SharedSettlementSession },
    },
    handler: async (req) => {
      const out = await service.getBySharedToken(req.params.token);
      if (!out) throw app.httpErrors.notFound('공유된 정산을 찾을 수 없습니다.');
      return out;
    },
  });
};

export default settlementRoutes;
