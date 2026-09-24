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
  SajuAskInput,
  SajuAskResult,
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
import { OPTIONAL_BEARER } from '../../plugins/swagger.js';

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
    schema: {
      tags: ['saju'],
      summary: '사주(C) 전체 풀이 생성 — 정적 본문 즉시 + LLM 4섹션 병렬 비동기 잡(jobId), 한도 1회',
      description:
        'jobId 가 있으면 GET /api/v1/saju-c/readings/jobs/{jobId}?after={version} 을 done 이 될 때까지 long-poll 해 섹션을 받는다' +
        '(전부 캐시·한도 초과·LLM 미설정이면 jobId null 로 즉시 완결). 선택 인증 — 회원은 개인 한도 없이 자동 저장(readingId 는 잡 완료 후 poll 결과에), ' +
        '게스트는 x-guest-key 기기 키(없으면 IP) 단위 일일 한도.',
      security: OPTIONAL_BEARER,
      body: CreateSajuReadingInput,
      response: { 200: SajuReadingResult },
    },
    handler: async (req) => run(async () => service.createReading(req.body, await actorOf(req))),
  });

  // 섹션 long-poll — 서버가 최대 wait ms 대기. 폭주 방지로 공개 조회 한도.
  typed.get(S.job(':jobId'), {
    config: { rateLimit: RATE.publicShare },
    schema: {
      tags: ['saju'],
      summary: '사주(C) 풀이 잡 long-poll — after 이후 버전이 생기거나 wait(최대 25초) 만료 시 응답',
      description:
        '섹션이 확정될 때마다 version 이 오르고, 전부 끝나면 done=true(회원은 저장 후 readingId 동봉). ' +
        '잡은 서버 메모리에만 있어 완료 5분 뒤나 서버 재시작 후엔 사라질 수 있고, 그때는 410 Gone.',
      params: JobParams,
      querystring: SajuJobPollQuery,
      response: { 200: SajuJobPollResult },
    },
    handler: async (req) => run(() => service.pollJob(req.params.jobId, req.query.after, req.query.wait)),
  });

  // 테마(인연·재물·직업, 8차) — 3개 병렬 job. 한도 1건.
  typed.post(S.themes, {
    config: quotaRate,
    schema: {
      tags: ['saju'],
      summary: '사주(C) 테마 풀이(인연·재물·직업) 생성 — LLM 3개 병렬 비동기 잡(jobId), 한도 1회',
      security: OPTIONAL_BEARER,
      body: CreateSajuThemesInput,
      response: { 200: SajuThemesResult },
    },
    handler: async (req) => run(async () => service.createThemes(req.body, await actorOf(req))),
  });
  typed.get(S.themeJob(':jobId'), {
    config: { rateLimit: RATE.publicShare },
    schema: {
      tags: ['saju'],
      summary: '사주(C) 테마 잡 long-poll — after 이후 버전이 생기거나 wait 만료 시 응답, 잡 없으면 410',
      params: JobParams,
      querystring: SajuJobPollQuery,
      response: { 200: SajuThemesJobPollResult },
    },
    handler: async (req) => run(() => service.pollThemeJob(req.params.jobId, req.query.after, req.query.wait)),
  });

  // 사주에 묻기(9차) — 단일 호출, 한도 1건(답하지 않는 주제는 소비 없음).
  typed.post(S.ask, {
    config: quotaRate,
    schema: {
      tags: ['saju'],
      summary: '사주에 묻기 — 주제·시기 질문에 사주 근거 답변(LLM 1콜, 한도 1회), 회원 자동 저장',
      security: OPTIONAL_BEARER,
      body: SajuAskInput,
      response: { 200: SajuAskResult },
    },
    handler: async (req) => run(async () => service.ask(req.body, await actorOf(req))),
  });

  typed.post(S.daily, {
    config: quotaRate,
    schema: {
      tags: ['saju'],
      summary: '사주 오늘의 운세(오늘 ±7일) — LLM 1콜·한도 1회, 회원의 오늘 운세는 하루 1회 고정',
      security: OPTIONAL_BEARER,
      body: SajuDailyInput,
      response: { 200: SajuDailyResult },
    },
    handler: async (req) => run(async () => service.daily(req.body, await actorOf(req))),
  });

  typed.post(S.match, {
    config: quotaRate,
    schema: {
      tags: ['saju'],
      summary: '사주 궁합 — 두 사람 점수·항목별 분석 + LLM 풀이 1콜, 한도 1회',
      security: OPTIONAL_BEARER,
      body: SajuMatchInput,
      response: { 200: SajuMatchResult },
    },
    handler: async (req) => run(async () => service.match(req.body, await actorOf(req))),
  });

  typed.post(S.datePick, {
    config: quotaRate,
    schema: {
      tags: ['saju'],
      summary: '사주 택일 — 목적별 날짜 점수(최대 60일)와 상위 날 이유, LLM 1콜·한도 1회',
      security: OPTIONAL_BEARER,
      body: SajuDatePickInput,
      response: { 200: SajuDatePickResult },
    },
    handler: async (req) => run(async () => service.datePick(req.body, await actorOf(req))),
  });

  typed.post(S.food, {
    config: quotaRate,
    schema: {
      tags: ['saju'],
      summary: '사주 오행 음식 추천 — 원국·오늘 일진 기반 메뉴와 이유·칼로리, LLM 1콜·한도 1회',
      security: OPTIONAL_BEARER,
      body: SajuFoodInput,
      response: { 200: SajuFoodResult },
    },
    handler: async (req) => run(async () => service.food(req.body, await actorOf(req))),
  });

  // ── 공유 ─────────────────────────────────────────────────────────────
  typed.post(S.shares, {
    config: { rateLimit: RATE.tarotShare },
    schema: {
      tags: ['saju'],
      summary: '사주(C) 공유 링크 발급 — 회원은 readingId, 게스트는 생년월일 재전송(LLM·한도 소비 없음)',
      security: OPTIONAL_BEARER,
      body: CreateSajuShareInput,
      response: { 200: SajuShareResult },
    },
    handler: async (req) => run(async () => records.createShare(req.body, await actorOf(req))),
  });
  typed.get(S.shared(':token'), {
    config: { rateLimit: RATE.publicShare },
    schema: {
      tags: ['saju'],
      summary: '공유된 사주(C) 풀이 조회 — 생년월일시는 공유 시 포함을 고른 경우만',
      params: TokenParams,
      response: { 200: SharedSajuReading },
    },
    handler: async (req) => run(() => records.getShared(req.params.token)),
  });

  // ── 회원 프로필 ──────────────────────────────────────────────────────
  typed.get(S.profiles, {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], summary: '내 사주(C) 프로필 목록 — 대표(primary) 먼저', security: [{ bearerAuth: [] }], response: { 200: SajuProfileList } },
    handler: async (req) => ({ items: await records.listProfiles(req.user.userId) }),
  });
  typed.post(S.profiles, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju'],
      summary: '사주(C) 프로필 추가 — 최대 10명, 같은 생년월일시·성별이면 기존 프로필 갱신',
      security: [{ bearerAuth: [] }],
      body: SajuProfileInput,
      response: { 200: SajuProfile },
    },
    handler: async (req) => run(() => records.createProfile(req.user.userId, req.body)),
  });
  typed.put(S.profile(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], summary: '사주(C) 프로필 수정', security: [{ bearerAuth: [] }], params: IdParams, body: SajuProfileInput, response: { 200: SajuProfile } },
    handler: async (req) => run(() => records.updateProfile(req.user.userId, req.params.id, req.body)),
  });
  typed.delete(S.profile(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], summary: '사주(C) 프로필 삭제 — 대표였으면 가장 오래된 프로필이 대표, 204', security: [{ bearerAuth: [] }], params: IdParams },
    handler: async (req, reply) => {
      await run(() => records.deleteProfile(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });

  // ── 회원 기록 ────────────────────────────────────────────────────────
  typed.get(S.myReadings, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['saju'],
      summary: '내 사주(C) 기록 목록 — 전체 풀이(full)·사주에 묻기(question), 최신순 커서 페이지네이션',
      security: [{ bearerAuth: [] }],
      querystring: ListSajuReadingsQuery,
      response: { 200: ListSajuReadingsResult },
    },
    handler: async (req) => records.listMine(req.user.userId, req.query),
  });
  typed.get(S.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], summary: '내 사주(C) 전체 풀이 기록 상세 조회', security: [{ bearerAuth: [] }], params: IdParams, response: { 200: SajuReadingResult } },
    handler: async (req) => run(() => records.getMine(req.user.userId, req.params.id)),
  });
  typed.delete(S.myReading(':id'), {
    onRequest: [app.authenticate],
    schema: { tags: ['saju'], summary: '내 사주(C) 기록 삭제 — 204', security: [{ bearerAuth: [] }], params: IdParams },
    handler: async (req, reply) => {
      await run(() => records.deleteMine(req.user.userId, req.params.id));
      return reply.code(204).send();
    },
  });
};

export default sajuRoutes;
