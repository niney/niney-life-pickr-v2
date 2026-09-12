import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateSajuReadingInput,
  CreateSajuShareInput,
  CreateSajuThemesInput,
  ListSajuReadingsQuery,
  ListSajuReadingsResult,
  Routes,
  SAJU_GUEST_KEY_HEADER,
  SajuDailyInput,
  SajuDailyResult,
  SajuDatePickInput,
  SajuDatePickResult,
  SajuFoodInput,
  SajuFoodResult,
  SajuJobPollQuery,
  SajuJobPollResult,
  SajuMatchInput,
  SajuMatchResult,
  SajuProfile,
  SajuProfileInput,
  SajuProfileList,
  SajuReadingResult,
  SajuShareResult,
  SajuThemesJobPollResult,
  SajuThemesResult,
  SharedSajuReading,
} from '@repo/api-contract';
import { RATE, clientKey } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { SajuRecordsService } from './saju-records.service.js';
import { SAJU_QUOTA_FEATURE, SajuError, SajuService, type SajuActor } from './saju.service.js';

// 사주 — 풀이·오늘·궁합·택일·음식은 무인증 공개(옵셔널 인증이면 회원: 한도 면제 + 자동 저장).
// 분당 IP 버스트는 어드민 설정(ipPerMinute)을 읽는 함수 max 로, 일일 한도는 서비스가 usageQuota 로.
// 회원 프로필·기록·공유 라우트는 4차.

const S = Routes.Saju;

const JobParams = z.object({ jobId: z.string().min(8).max(64) });
const IdParams = z.object({ id: z.string().min(1).max(64) });
const TokenParams = z.object({ token: z.string().min(8).max(64) });
const GUEST_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

const throwAsHttp = (app: FastifyInstance, e: SajuError): never => {
  switch (e.code) {
    case 'not_found':
      throw app.httpErrors.notFound(e.message);
    case 'job_gone':
      throw app.httpErrors.gone(e.message);
    case 'invalid_input':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

const sajuRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const service = new SajuService(app.prisma, aiConfig, { quota: app.usageQuota, logger: app.log });
  const records = new SajuRecordsService(app.prisma, service);
  app.addHook('onClose', async () => {
    service.jobs.clear();
    service.themeJobs.clear();
  });

  const actorOf = async (req: FastifyRequest): Promise<SajuActor> => {
    const user = await app.resolveOptionalUser(req);
    const raw = req.headers[SAJU_GUEST_KEY_HEADER];
    const guestKey = typeof raw === 'string' && GUEST_KEY_RE.test(raw) ? raw : null;
    return { userId: user?.userId ?? null, guestKey, ip: clientKey(req) };
  };
  const quotaRate = {
    rateLimit: {
      max: async () => (await app.usageQuota.getSetting(SAJU_QUOTA_FEATURE)).ipPerMinute,
      timeWindow: '1 minute',
    },
  };
  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SajuError) return throwAsHttp(app, e);
      throw e;
    }
  };

  typed.post(S.readings, {
    config: quotaRate,
    schema: { tags: ['saju'], body: CreateSajuReadingInput, response: { 200: SajuReadingResult } },
    handler: async (req) => run(async () => service.createReading(req.body, await actorOf(req))),
  });

  // 섹션 long-poll — 서버가 최대 wait ms 대기. 폭주 방지로 공개 조회 한도.
  typed.get(S.job(':jobId'), {
    config: { rateLimit: RATE.publicShare },
    schema: { tags: ['saju'], params: JobParams, querystring: SajuJobPollQuery, response: { 200: SajuJobPollResult } },
    handler: async (req) => run(() => service.pollJob(req.params.jobId, req.query.after, req.query.wait)),
  });

  // 테마(인연·재물·직업, 8차) — 3개 병렬 job. 한도 1건.
  typed.post(S.themes, {
    config: quotaRate,
    schema: { tags: ['saju'], body: CreateSajuThemesInput, response: { 200: SajuThemesResult } },
    handler: async (req) => run(async () => service.createThemes(req.body, await actorOf(req))),
  });
  typed.get(S.themeJob(':jobId'), {
    config: { rateLimit: RATE.publicShare },
    schema: { tags: ['saju'], params: JobParams, querystring: SajuJobPollQuery, response: { 200: SajuThemesJobPollResult } },
    handler: async (req) => run(() => service.pollThemeJob(req.params.jobId, req.query.after, req.query.wait)),
  });

  typed.post(S.daily, {
    config: quotaRate,
    schema: { tags: ['saju'], body: SajuDailyInput, response: { 200: SajuDailyResult } },
    handler: async (req) => run(async () => service.daily(req.body, await actorOf(req))),
  });

  typed.post(S.match, {
    config: quotaRate,
    schema: { tags: ['saju'], body: SajuMatchInput, response: { 200: SajuMatchResult } },
    handler: async (req) => run(async () => service.match(req.body, await actorOf(req))),
  });

  typed.post(S.datePick, {
    config: quotaRate,
    schema: { tags: ['saju'], body: SajuDatePickInput, response: { 200: SajuDatePickResult } },
    handler: async (req) => run(async () => service.datePick(req.body, await actorOf(req))),
  });

  typed.post(S.food, {
    config: quotaRate,
    schema: { tags: ['saju'], body: SajuFoodInput, response: { 200: SajuFoodResult } },
    handler: async (req) => run(async () => service.food(req.body, await actorOf(req))),
  });

  // ── 공유 ─────────────────────────────────────────────────────────────
  typed.post(S.shares, {
    config: { rateLimit: RATE.tarotShare },
    schema: { tags: ['saju'], body: CreateSajuShareInput, response: { 200: SajuShareResult } },
    handler: async (req) => run(async () => records.createShare(req.body, await actorOf(req))),
  });
  typed.get(S.shared(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: { tags: ['saju'], params: TokenParams, response: { 200: SharedSajuReading } },
    handler: async (req) => run(() => records.getShared(req.params.token)),
  });

  // ── 회원 프로필 ──────────────────────────────────────────────────────
  typed.get(S.profiles, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], security: [{ bearerAuth: [] }], response: { 200: SajuProfileList } },
    handler: async (req) => ({ items: await records.listProfiles(req.user.userId) }),
  });
  typed.post(S.profiles, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], security: [{ bearerAuth: [] }], body: SajuProfileInput, response: { 200: SajuProfile } },
    handler: async (req) => run(() => records.createProfile(req.user.userId, req.body)),
  });
  typed.put(S.profile(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], security: [{ bearerAuth: [] }], params: IdParams, body: SajuProfileInput, response: { 200: SajuProfile } },
    handler: async (req) => run(() => records.updateProfile(req.user.userId, req.params.id, req.body)),
  });
  typed.delete(S.profile(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], security: [{ bearerAuth: [] }], params: IdParams },
    handler: async (req, reply) => {
      await run(() => records.deleteProfile(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });

  // ── 회원 기록 ────────────────────────────────────────────────────────
  typed.get(S.myReadings, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], security: [{ bearerAuth: [] }], querystring: ListSajuReadingsQuery, response: { 200: ListSajuReadingsResult } },
    handler: async (req) => records.listMine(req.user.userId, req.query),
  });
  typed.get(S.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], security: [{ bearerAuth: [] }], params: IdParams, response: { 200: SajuReadingResult } },
    handler: async (req) => run(() => records.getMine(req.user.userId, req.params.id)),
  });
  typed.delete(S.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], security: [{ bearerAuth: [] }], params: IdParams },
    handler: async (req, reply) => {
      await run(() => records.deleteMine(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });
};

export default sajuRoutes;
