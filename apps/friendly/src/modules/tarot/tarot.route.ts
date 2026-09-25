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
  TarotCardId,
  TarotReadingResult,
  TarotShareResult,
} from '@repo/api-contract';
import { RATE, clientKey } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { renderTarotCardTexture } from './tarot-card-texture.js';
import { TAROT_QUOTA_FEATURE, TarotError, TarotService, type TarotActor } from './tarot.service.js';
import { OPTIONAL_BEARER } from '../../plugins/swagger.js';

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
      summary: '타로 리딩 생성 — LLM 해석, 선택 인증(회원 자동 저장), 한도 초과 시 정적 해석',
      description:
        'Authorization Bearer 가 유효하면 회원(개인 일일 한도 없음·자동 저장·오늘의 카드 하루 1장 고정), 없거나 무효면 게스트다. ' +
        '게스트는 x-guest-key(영숫자·_·- 8~64자) 기기 키로 일일 한도를 세고(없으면 IP), 한도 초과·LLM 실패여도 200 에 source "static" 해석을 돌려준다.',
      security: OPTIONAL_BEARER,
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
      summary: '타로 공유 링크 발급 — 회원은 readingId, 게스트는 리딩 입력 재전송(서버가 본문 확보)',
      security: OPTIONAL_BEARER,
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
      summary: '공유된 타로 리딩 조회 — 질문은 공유 시 포함을 고른 경우만',
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

  // 카드 앞면 텍스처 — 앱 3D 무대(expo-gl 은 WebP 를 못 읽는다)용 JPEG. 그림은 바뀌지 않으니 오래 캐시.
  typed.get(T.cardTexture(':cardId'), {
    schema: {
      tags: ['tarot'],
      summary: '타로 카드 앞면 텍스처 JPEG(384px) — 앱 3D 무대용',
      description: '웹 정적 자산의 카드 그림(webp)을 JPEG 로 바꿔 준다. 그림이 아직 없는 카드는 404.',
      params: z.object({ cardId: TarotCardId }),
    },
    handler: async (req, reply) => {
      const jpg = await renderTarotCardTexture(req.params.cardId);
      if (!jpg) throw app.httpErrors.notFound('카드 그림이 없습니다.');
      return reply.type('image/jpeg').header('cache-control', 'public, max-age=604800').send(jpg);
    },
  });

  typed.get(T.myReadings, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['tarot'],
      summary: '내 타로 기록 목록 — 최신순 커서 페이지네이션',
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
      summary: '내 타로 기록 상세 조회',
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
      summary: '내 타로 기록 삭제 — 성공 시 204',
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
