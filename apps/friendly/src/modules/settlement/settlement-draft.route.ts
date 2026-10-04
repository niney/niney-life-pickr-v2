import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  GetSettlementDraftQuery,
  GetSettlementDraftResult,
  ListSettlementDraftsResult,
  Routes,
  UpsertSettlementDraftInput,
  UpsertSettlementDraftResult,
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
    case 'too_many':
    case 'too_large':
      throw app.httpErrors.conflict(e.message);
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
      summary: '내 정산 임시저장 목록 — 최근 수정순, 메타만(payload 제외)',
      description:
        '각 항목은 id·placeId·placeNameHint·byteSize(저장된 payload 의 UTF-8 바이트)·시각만 담는다. ' +
        '이어 입력할 payload 는 GET /api/v1/settlement-drafts/by-place 로 받는다.',
      security: [{ bearerAuth: [] }],
      response: { 200: ListSettlementDraftsResult },
    },
    handler: async (req) => service.list(req.user.userId),
  });

  typed.get(S.byPlace, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-draft'],
      summary: '정산 임시저장 단건(이어쓰기) — placeId 슬롯의 payload 포함, 없으면 draft null',
      description: 'placeId 를 생략하면 식당 미지정 슬롯(/me/settlements/new 흐름)을 조회한다.',
      security: [{ bearerAuth: [] }],
      querystring: GetSettlementDraftQuery,
      response: { 200: GetSettlementDraftResult },
    },
    handler: async (req) => service.getByPlace(req.user.userId, req.query.placeId ?? null),
  });

  // upsert — (userId, placeId) 키로. id 는 클라이언트가 모르고도 호출 가능.
  typed.put(S.upsert, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-draft'],
      summary: '정산 임시저장 upsert — 사용자·placeId 당 1개, 사용자당 최대 50개·합계 2MB',
      description:
        'payload 는 서버가 형태 검증 없이 보관만 하는 자유 JSON 이다(직렬화 UTF-8 200KB 이하, 넘으면 400). ' +
        'placeId 가 null 이면 식당 미지정 슬롯이며, 새로 만들 때 50개를 넘거나 사용자 합계가 2MB 를 넘으면 409. ' +
        '응답은 id·updatedAt 만 돌려준다.',
      security: [{ bearerAuth: [] }],
      body: UpsertSettlementDraftInput,
      response: { 200: UpsertSettlementDraftResult },
    },
    handler: async (req) => {
      try {
        return await service.upsert(req.user.userId, req.body);
      } catch (e) {
        if (e instanceof SettlementDraftError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(S.one(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement-draft'],
      summary: '정산 임시저장 삭제',
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
