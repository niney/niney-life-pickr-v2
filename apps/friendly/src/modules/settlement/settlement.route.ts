import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateSettlementInput,
  CreateSettlementShareInput,
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
// 공유 토큰은 7바이트 base64url = 10자. 구버전(43자)도 max 안에 들어와 그대로
// 조회되므로 하한만 넉넉히 낮춘다. 길이 밖 입력은 zod 단계에서 컷.
const TokenParams = z.object({ token: z.string().min(8).max(64) });

const throwAsHttp = (app: FastifyInstance, e: SettlementError): never => {
  switch (e.code) {
    case 'not_found':
    case 'restaurant_not_found':
      throw app.httpErrors.notFound(e.message);
    case 'forbidden':
      throw app.httpErrors.forbidden(e.message);
    case 'expired':
      // 410 Gone — 링크 자체는 유효했으나 만료됨. FE 가 404(잘못된 주소)와 구분.
      throw app.httpErrors.gone(e.message);
    case 'invalid_participant':
    case 'invalid_round':
    case 'invalid_receipt_token':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

// 공개 공유 조회(GET /share/settlements/:token)용 경량 IP rate limiter. 토큰이
// 56bit 라 brute-force 는 비현실적이지만, 방어적으로 분당 한도를 둔다. 단일
// 인스턴스 전제(CLAUDE.md) 라 in-memory 고정 윈도우로 충분 — Redis 불필요.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120; // IP 당 분당 120회
const rateHits = new Map<string, { count: number; resetAt: number }>();
const isRateLimited = (ip: string, now: number): boolean => {
  // 메모리 무한 증가 방지 — 윈도우 만료분은 접근 시 정리, 과도하면 통째 비움.
  if (rateHits.size > 10_000) rateHits.clear();
  const cur = rateHits.get(ip);
  if (!cur || cur.resetAt <= now) {
    rateHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > RATE_MAX;
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

  // 공유 토큰 생성 — 토큰은 멱등(같은 세션 두 번 호출해도 동일 토큰)이되,
  // 호출마다 ttl 기준으로 만료를 갱신한다. body 미지정이면 7일.
  typed.post(S.share(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: CreateSettlementShareInput,
      response: { 200: SettlementShare },
    },
    handler: async (req) => {
      try {
        return await service.createShare(
          req.user.userId,
          req.params.id,
          req.body.ttl,
        );
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
  // 만료된 링크는 410, 없는 토큰은 404. IP rate limit 으로 추측 시도 방어.
  typed.get(S.shared(':token'), {
    schema: {
      tags: ['settlement'],
      params: TokenParams,
      response: { 200: SharedSettlementSession },
    },
    handler: async (req) => {
      if (isRateLimited(req.ip, Date.now())) {
        throw app.httpErrors.tooManyRequests('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      }
      try {
        return await service.getBySharedToken(req.params.token);
      } catch (e) {
        if (e instanceof SettlementError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });
};

export default settlementRoutes;
