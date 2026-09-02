import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateTarotReadingInput,
  CreateTarotShareInput,
  ListTarotReadingsQuery,
  ListTarotReadingsResult,
  Routes,
  SharedTarotReading,
  TAROT_GUEST_KEY_HEADER,
  TarotReadingResult,
  TarotShareResult,
} from '@repo/api-contract';
import { RATE, clientKey } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { TAROT_QUOTA_FEATURE, TarotError, TarotService, type TarotActor } from './tarot.service.js';

// 타로 — 리딩은 무인증 공개(옵셔널 인증이면 회원: 한도 면제 + 자동 저장), 기록은 회원 전용.
// 분당 IP 버스트는 어드민 설정(ipPerMinute)을 읽는 함수 max 로, 일일 한도는 서비스가 usageQuota 로.

const T = Routes.Tarot;

const IdParams = z.object({ id: z.string().min(1).max(64) });
// 공유 토큰 7바이트 base64url = 10자(정산과 동일). 길이 밖은 zod 단계에서 컷.
const TokenParams = z.object({ token: z.string().min(8).max(64) });
// 기기 영속 UUID(shared guestKeyStore). 형식 밖이면 없는 것으로 — IP 로 대체된다.
const GUEST_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

const throwAsHttp = (app: FastifyInstance, e: TarotError): never => {
  switch (e.code) {
    case 'not_found':
      throw app.httpErrors.notFound(e.message);
    case 'member_only':
      throw app.httpErrors.forbidden(e.message);
    case 'spread_unavailable':
    case 'invalid_cards':
    case 'choices_required':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

const tarotRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const service = new TarotService(app.prisma, aiConfig, { quota: app.usageQuota, logger: app.log });

  const actorOf = async (req: FastifyRequest): Promise<TarotActor> => {
    const user = await app.resolveOptionalUser(req);
    const raw = req.headers[TAROT_GUEST_KEY_HEADER];
    const guestKey = typeof raw === 'string' && GUEST_KEY_RE.test(raw) ? raw : null;
    return { userId: user?.userId ?? null, guestKey, ip: clientKey(req) };
  };

  typed.post(T.readings, {
    config: {
      rateLimit: {
        max: async () => (await app.usageQuota.getSetting(TAROT_QUOTA_FEATURE)).ipPerMinute,
        timeWindow: '1 minute',
      },
    },
    schema: {
      tags: ['tarot'],
      body: CreateTarotReadingInput,
      response: { 200: TarotReadingResult },
    },
    handler: async (req) => {
      const actor = await actorOf(req);
      try {
        return await service.createReading(req.body, actor);
      } catch (e) {
        if (e instanceof TarotError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  // 공유 토큰 발급 — 무인증 쓰기. 게스트는 리딩 입력을 다시 보내 서버가 본문을 확보(캐시 히트면
  // 한도 소비 없음), 회원은 readingId 로 저장된 행에 토큰만 단다.
  typed.post(T.shares, {
    config: { rateLimit: RATE.tarotShare },
    schema: {
      tags: ['tarot'],
      body: CreateTarotShareInput,
      response: { 200: TarotShareResult },
    },
    handler: async (req) => {
      const actor = await actorOf(req);
      try {
        return await service.createShare(req.body, actor);
      } catch (e) {
        if (e instanceof TarotError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.get(T.shared(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: {
      tags: ['tarot'],
      params: TokenParams,
      response: { 200: SharedTarotReading },
    },
    handler: async (req) => {
      try {
        return await service.getShared(req.params.token);
      } catch (e) {
        if (e instanceof TarotError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.get(T.myReadings, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['tarot'],
      security: [{ bearerAuth: [] }],
      querystring: ListTarotReadingsQuery,
      response: { 200: ListTarotReadingsResult },
    },
    handler: async (req) => service.listMine(req.user.userId, req.query),
  });

  typed.get(T.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['tarot'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: TarotReadingResult },
    },
    handler: async (req) => {
      try {
        return await service.getMine(req.user.userId, req.params.id);
      } catch (e) {
        if (e instanceof TarotError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(T.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['tarot'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
    },
    handler: async (req, reply) => {
      try {
        await service.deleteMine(req.user.userId, req.params.id);
      } catch (e) {
        if (e instanceof TarotError) return throwAsHttp(app, e);
        throw e;
      }
      return reply.code(204).send();
    },
  });
};

export default tarotRoutes;
