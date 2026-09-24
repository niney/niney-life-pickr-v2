import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { LRUCache } from 'lru-cache';
import {
  CreateSajuGPairInput,
  SajuGPairChart,
  SajuGPairResult,
  SajuGProfileInput,
  UpdateSajuGProfileInput,
  SajuGProfile,
  SajuGProfileList,
  CreateSajuGReadingInput,
  CreateSajuGShareInput,
  ListSajuGReadingsQuery,
  ListSajuGReadingsResult,
  PublicSajuGShare,
  RevokeSajuGShareInput,
  Routes,
  SAJU_G_GUEST_KEY_HEADER,
  SajuGChart,
  SajuGReadingResult,
  SajuGReceiptInput,
  SajuGShareResult,
  SajuGShareToken,
  SajuGShareError,
} from '@repo/api-contract';
import { RATE, clientKey } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { calculateSajuG, SajuGInputError } from './saju-g.engine.js';
import { SajuGNotFound, SajuGService, SajuGShareUnavailable } from './saju-g.service.js';
import { renderSajuGSharePng } from './saju-g-share-card.js';
import { calculateSajuGPair } from './saju-g-pair.engine.js';
import { SajuGPairService } from './saju-g-pair.service.js';
import { SajuGProfileService, SajuGProfileConflict } from './saju-g-profile.service.js';
import { OPTIONAL_BEARER } from '../../plugins/swagger.js';

const sajuGRoutes: FastifyPluginAsync = async (app) => {
  const api = app.withTypeProvider<ZodTypeProvider>();
  const service = new SajuGService(
    app.prisma,
    new AiConfigService(app.prisma, buildLlmProviderEnv()),
    { quota: app.usageQuota },
  );
  const images = new LRUCache<string, Buffer>({ max: 50 });
  const profiles = new SajuGProfileService(app.prisma);
  const pairs = new SajuGPairService(new AiConfigService(app.prisma, buildLlmProviderEnv()), {
    quota: app.usageQuota,
  });
  const actorOf = async (req: FastifyRequest) => {
    const user = await app.resolveOptionalUser(req);
    const key = req.headers[SAJU_G_GUEST_KEY_HEADER];
    return {
      userId: user?.userId ?? null,
      guestKey: typeof key === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(key) ? key : null,
      ip: clientKey(req),
    };
  };
  const run = async <T>(action: () => Promise<T> | T): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (error instanceof SajuGInputError) throw app.httpErrors.badRequest(error.message);
      if (error instanceof SajuGNotFound) throw app.httpErrors.notFound(error.message);
      if (error instanceof SajuGProfileConflict) throw app.httpErrors.conflict(error.message);
      throw error;
    }
  };
  const T = Routes.SajuG;
  const ids = z.object({ id: z.string().min(1).max(64) });
  const tokens = z.object({ token: SajuGShareToken });
  api.get(T.profiles, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju-g'],
      summary: '내 사주(G) 프로필 목록 — 등록순, 최대 20명',
      response: { 200: SajuGProfileList },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return profiles.list(req.user.userId);
    },
  });
  api.post(T.profiles, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 프로필 추가 — 최대 20명, 존재하지 않는 날짜·미래일 등은 400',
      body: SajuGProfileInput,
      response: { 200: SajuGProfile },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => profiles.save(req.user.userId, req.body));
    },
  });
  api.put(T.profile(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 프로필 수정 — revision 낙관적 잠금(다른 창에서 먼저 수정했으면 409)',
      params: ids,
      body: UpdateSajuGProfileInput,
      response: { 200: SajuGProfile },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => profiles.save(req.user.userId, req.body, req.params.id, req.body.revision));
    },
  });
  api.delete(T.profile(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju-g'], summary: '사주(G) 프로필 삭제 — 204', params: ids },
    handler: async (req, reply) => {
      await run(() => profiles.remove(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });
  api.post(T.pairChart, {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 두 사람 명식·일간 오행 관계 계산 — LLM 없음, 분당 30회',
      body: CreateSajuGPairInput,
      response: { 200: SajuGPairChart },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => calculateSajuGPair(req.body));
    },
  });
  api.post(T.pairReading, {
    config: {
      rateLimit: {
        max: async () => (await app.usageQuota.getSetting('saju-g-reading')).ipPerMinute,
        timeWindow: '1 minute',
      },
    },
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 두 사람 관계 풀이 생성 — LLM 1콜, 선택 인증, 한도 초과·실패 시 기본 풀이',
      security: OPTIONAL_BEARER,
      body: CreateSajuGPairInput,
      response: { 200: SajuGPairResult },
    },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      return run(() => pairs.create(req.body, actor));
    },
  });
  api.post(T.chart, {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 명식 계산 — 네 기둥·오행 분포·기간(원국/올해/오늘) 흐름, LLM 없음, 분당 30회',
      body: CreateSajuGReadingInput,
      response: { 200: SajuGChart },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => calculateSajuG(req.body));
    },
  });
  api.post(T.readings, {
    config: {
      rateLimit: {
        max: async () => (await app.usageQuota.getSetting('saju-g-reading')).ipPerMinute,
        timeWindow: '1 minute',
      },
    },
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 풀이 생성(원국·올해·오늘) — LLM 1콜, 선택 인증, 한도 초과·실패 시 기본 풀이',
      description:
        'Authorization Bearer 가 유효하면 회원(개인 일일 한도 없음), 없거나 무효면 게스트(x-guest-key 기기 키, 없으면 IP 단위 일일 한도). ' +
        '자동 저장은 없고 응답의 receipt(발급자 본인·서버 메모리 최대 24시간)로 POST /api/v1/saju-g/me/readings 보관·POST /api/v1/saju-g/shares 공유를 한다. ' +
        '한도 초과·LLM 실패여도 200 에 source "basic" 과 fallbackReason 을 돌려준다.',
      security: OPTIONAL_BEARER,
      body: CreateSajuGReadingInput,
      response: { 200: SajuGReadingResult },
    },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      return run(() => service.createReading(req.body, actor));
    },
  });
  api.post(T.myReadings, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 풀이 보관 — 풀이 응답의 receipt 로 내 기록에 저장(같은 요청은 덮어씀)',
      body: SajuGReceiptInput,
      response: { 200: SajuGReadingResult },
    },
    handler: async (req) => {
      const actor = await actorOf(req);
      return run(() => service.save(req.body.receipt, actor));
    },
  });
  api.get(T.myReadings, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju-g'],
      summary: '내 사주(G) 보관 기록 목록 — 최신순 커서 페이지네이션',
      querystring: ListSajuGReadingsQuery,
      response: { 200: ListSajuGReadingsResult },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.listMine(req.user.userId, req.query.limit, req.query.cursor));
    },
  });
  api.get(T.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju-g'],
      summary: '내 사주(G) 보관 기록 상세 조회',
      params: ids,
      response: { 200: SajuGReadingResult },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.getMine(req.user.userId, req.params.id));
    },
  });
  api.delete(T.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju-g'], summary: '내 사주(G) 보관 기록 삭제 — 204', params: ids },
    handler: async (req, reply) => {
      await run(() => service.deleteMine(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });
  api.post(T.shares, {
    config: { rateLimit: RATE.tarotShare },
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 공유 링크 발급 — receipt·readingId·birth·pair 중 하나, 취소용 revokeToken 반환',
      security: OPTIONAL_BEARER,
      body: CreateSajuGShareInput,
      response: { 200: SajuGShareResult, 503: SajuGShareError },
    },
    handler: async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const actor = await actorOf(req);
      try {
        return await run(() => service.createShare(req.body, actor));
      } catch (error) {
        if (error instanceof SajuGShareUnavailable) {
          return reply
            .code(503)
            .send({ statusCode: 503, error: 'Service Unavailable', message: error.message });
        }
        throw error;
      }
    },
  });
  api.get(T.shared(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: {
      tags: ['saju-g'],
      summary: '공유된 사주(G) 요약 조회 — 원본 날짜·명식·AI 문장 미포함',
      params: tokens,
      response: { 200: PublicSajuGShare },
    },
    handler: (req, reply) => {
      reply.header('cache-control', 'no-store');
      return run(() => service.getShared(req.params.token));
    },
  });
  api.delete(T.shared(':token'), {
    config: { rateLimit: RATE.tarotShare },
    schema: {
      tags: ['saju-g'],
      summary: '사주(G) 공유 취소 — 발급 때 받은 revokeToken 필요, 204',
      params: tokens,
      body: RevokeSajuGShareInput,
    },
    handler: async (req, reply) => {
      await run(() => service.revokeShare(req.params.token, req.body.revokeToken));
      images.delete(req.params.token);
      return reply.code(204).send();
    },
  });
  api.get(T.shareImage(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: { tags: ['saju-g'], summary: '사주(G) 공유 카드 PNG 이미지', params: tokens },
    handler: async (req, reply) => {
      const shared = await run(() => service.getShared(req.params.token)); // 캐시보다 먼저 삭제 여부 확인
      let png = images.get(req.params.token);
      if (!png) {
        png = await renderSajuGSharePng(shared);
        images.set(req.params.token, png);
      }
      return reply
        .type('image/png')
        .header('cache-control', 'no-store')
        .header('cross-origin-resource-policy', 'cross-origin')
        .send(png);
    },
  });
};
export default sajuGRoutes;
