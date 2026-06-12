import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type {
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMProvider,
} from '../ai/adapters/llm-provider.js';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import logsRoutes from './logs.route.js';
import { LogAnalysisService } from './log-analysis.service.js';
import {
  cleanupExpiredOperationLogs,
  sweepStaleOperationRuns,
} from './operation-log.service.js';

// 테스트 데이터는 전부 feature='auto-discover' 로 격리 — 아직 계측이 없는
// feature 라 공유 dev.db 의 실데이터(레거시 crawl/summary 백필)와 섞이지
// 않는다. 목록/카운트 검증도 feature 필터를 같이 건다.
const TEST_FEATURE = 'auto-discover';

class FakeProvider implements LLMProvider {
  calls: LLMCompleteOptions[] = [];
  next: ((opts: LLMCompleteOptions) => Promise<LLMCompleteResult>) | null = null;

  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    this.calls.push(opts);
    if (this.next) return this.next(opts);
    return { text: '{}', model: opts.model, promptTokens: 1, completionTokens: 1 };
  }
}

const REPORT_JSON = {
  summary: '업스트림 타임아웃으로 실패',
  rootCause: 'LLM 응답 지연',
  details: '## 분석\n타임아웃 로그 확인',
  suggestions: ['타임아웃 상향', '재시도'],
  severity: 'high',
};

describe('Logs routes', () => {
  let app: FastifyInstance;
  let provider: FakeProvider;
  // 테스트별로 갈아끼우는 resolve 결과 — null 이면 no_analysis_llm 경로.
  let resolveResult: { provider: LLMProvider; model: string } | null = null;
  let logAnalysis: LogAnalysisService;
  let prevRetention: number | null = null;

  const adminToken = () =>
    app.jwt.sign({ userId: 'admin-test', email: 'a@x.com', role: 'ADMIN' });
  const userToken = () =>
    app.jwt.sign({ userId: 'user-test', email: 'u@x.com', role: 'USER' });

  const cleanupRows = async () => {
    await app.prisma.operationRun.deleteMany({ where: { feature: TEST_FEATURE } });
  };

  const seedRun = (
    id: string,
    data: Partial<{
      status: string;
      startedAt: Date;
      finishedAt: Date | null;
      errorCode: string | null;
      errorMessage: string | null;
      meta: string | null;
      subjectId: string | null;
      jobId: string | null;
    }> = {},
  ) =>
    app.prisma.operationRun.create({
      data: { id, feature: TEST_FEATURE, status: 'done', ...data },
    });

  beforeAll(async () => {
    app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(sensiblePlugin);
    await app.register(errorHandlerPlugin);
    await app.register(jwtPlugin);
    await app.register(prismaPlugin);

    provider = new FakeProvider();
    const aiConfigStub = { getResolved: vi.fn(async () => null) };
    logAnalysis = new LogAnalysisService(app.prisma, aiConfigStub as never, {
      resolveOverride: async () => resolveResult,
    });
    app.decorate('logAnalysis', logAnalysis);
    await app.register(logsRoutes);
    await app.ready();

    await cleanupRows();
    const cfg = await app.prisma.logConfig.findUnique({ where: { key: 'global' } });
    prevRetention = cfg?.retentionDays ?? null;
    await app.prisma.logConfig.deleteMany({ where: { key: 'global' } });
  });

  afterAll(async () => {
    await cleanupRows();
    if (prevRetention !== null) {
      await app.prisma.logConfig.upsert({
        where: { key: 'global' },
        create: { key: 'global', retentionDays: prevRetention },
        update: { retentionDays: prevRetention },
      });
    } else {
      await app.prisma.logConfig.deleteMany({ where: { key: 'global' } });
    }
    await app.close();
  });

  describe('auth guards', () => {
    it('401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/logs/runs' });
      expect(res.statusCode).toBe(401);
    });

    it('403 with USER role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs/runs',
        headers: { Authorization: `Bearer ${userToken()}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /admin/logs/runs', () => {
    beforeEach(async () => {
      await cleanupRows();
    });

    it('filters by feature/status and paginates with logCount', async () => {
      const base = Date.now();
      await seedRun('test-oplog-r1', {
        status: 'failed',
        errorCode: 'upstream_failed',
        startedAt: new Date(base - 3000),
      });
      await seedRun('test-oplog-r2', {
        status: 'failed',
        startedAt: new Date(base - 2000),
      });
      await seedRun('test-oplog-r3', {
        status: 'done',
        startedAt: new Date(base - 1000),
      });
      await app.prisma.operationLog.create({
        data: {
          runId: 'test-oplog-r1',
          feature: TEST_FEATURE,
          stage: 's',
          level: 'error',
          message: 'boom',
        },
      });

      const all = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/logs/runs?feature=${TEST_FEATURE}`,
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(all.statusCode).toBe(200);
      const allBody = all.json();
      expect(allBody.total).toBe(3);
      // startedAt DESC — 최신 먼저.
      expect(allBody.items.map((r: { id: string }) => r.id)).toEqual([
        'test-oplog-r3',
        'test-oplog-r2',
        'test-oplog-r1',
      ]);
      const r1 = allBody.items.find((r: { id: string }) => r.id === 'test-oplog-r1');
      expect(r1).toMatchObject({
        feature: TEST_FEATURE,
        status: 'failed',
        errorCode: 'upstream_failed',
        logCount: 1,
      });

      const failed = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/logs/runs?feature=${TEST_FEATURE}&status=failed`,
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(failed.json().total).toBe(2);

      const page2 = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/logs/runs?feature=${TEST_FEATURE}&limit=2&page=2`,
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      const page2Body = page2.json();
      expect(page2Body.items).toHaveLength(1);
      expect(page2Body.items[0].id).toBe('test-oplog-r1');
      expect(page2Body.page).toBe(2);
      expect(page2Body.limit).toBe(2);
    });
  });

  describe('GET /admin/logs/runs/:id', () => {
    beforeEach(async () => {
      await cleanupRows();
    });

    it('404 for unknown run', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs/runs/nope',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns run with null report before analysis', async () => {
      await seedRun('test-oplog-detail', {
        status: 'failed',
        errorCode: 'timeout',
        meta: JSON.stringify({ keyword: '국밥' }),
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs/runs/test-oplog-detail',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.run).toMatchObject({
        id: 'test-oplog-detail',
        status: 'failed',
        errorCode: 'timeout',
        meta: JSON.stringify({ keyword: '국밥' }),
        logCount: 0,
      });
      expect(body.report).toBeNull();
    });
  });

  describe('GET /admin/logs/runs/:id/logs', () => {
    beforeAll(async () => {
      await cleanupRows();
      await seedRun('test-oplog-logs', { status: 'done' });
      const base = Date.now() - 60_000;
      const levels = ['info', 'debug', 'warn', 'error', 'info'] as const;
      for (let i = 0; i < levels.length; i += 1) {
        await app.prisma.operationLog.create({
          data: {
            id: `test-oplog-log-${i}`,
            runId: 'test-oplog-logs',
            feature: TEST_FEATURE,
            stage: `stage-${i}`,
            level: levels[i]!,
            message: `m${i}`,
            meta: i === 0 ? JSON.stringify({ tookMs: 10 }) : null,
            createdAt: new Date(base + i * 1000),
          },
        });
      }
    });

    it('pages newest-first via cursor without overlap', async () => {
      const headers = { Authorization: `Bearer ${adminToken()}` };
      const p1 = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs/runs/test-oplog-logs/logs?limit=2',
        headers,
      });
      expect(p1.statusCode).toBe(200);
      const b1 = p1.json();
      expect(b1.logs.map((l: { message: string }) => l.message)).toEqual(['m4', 'm3']);
      expect(b1.nextCursor).toBe('test-oplog-log-3');

      const p2 = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/logs/runs/test-oplog-logs/logs?limit=2&cursor=${b1.nextCursor}`,
        headers,
      });
      const b2 = p2.json();
      expect(b2.logs.map((l: { message: string }) => l.message)).toEqual(['m2', 'm1']);

      const p3 = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/logs/runs/test-oplog-logs/logs?limit=2&cursor=${b2.nextCursor}`,
        headers,
      });
      const b3 = p3.json();
      expect(b3.logs.map((l: { message: string }) => l.message)).toEqual(['m0']);
      expect(b3.nextCursor).toBeNull();
      // meta 는 객체로 파싱되어 반환.
      expect(b3.logs[0].meta).toEqual({ tookMs: 10 });
    });

    it('filters by level including debug', async () => {
      const headers = { Authorization: `Bearer ${adminToken()}` };
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs/runs/test-oplog-logs/logs?level=debug',
        headers,
      });
      const body = res.json();
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0]).toMatchObject({ level: 'debug', message: 'm1' });
    });
  });

  describe('POST /admin/logs/runs/:id/analyze', () => {
    beforeEach(async () => {
      await cleanupRows();
      provider.calls = [];
      provider.next = null;
      resolveResult = { provider, model: 'analysis-model' };
    });

    it('404 for unknown run', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/logs/runs/nope/analyze',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('run_not_failed for non-failed run', async () => {
      await seedRun('test-oplog-done', { status: 'done' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/logs/runs/test-oplog-done/analyze',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: false, error: 'run_not_failed' });
    });

    it('no_analysis_llm when log-analysis provider is not configured (manual)', async () => {
      resolveResult = null;
      await seedRun('test-oplog-nollm', { status: 'failed' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/logs/runs/test-oplog-nollm/analyze',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(res.json()).toMatchObject({ ok: false, error: 'no_analysis_llm' });
      // 보고서 행도 만들지 않는다.
      const report = await app.prisma.operationReport.findUnique({
        where: { runId: 'test-oplog-nollm' },
      });
      expect(report).toBeNull();
    });

    it('auto analysis (manual=false) silently skips without a report row', async () => {
      resolveResult = null;
      await seedRun('test-oplog-auto-skip', { status: 'failed' });
      const out = await logAnalysis.analyzeRun('test-oplog-auto-skip');
      expect(out).toMatchObject({ ok: false, error: 'no_analysis_llm' });
      const report = await app.prisma.operationReport.findUnique({
        where: { runId: 'test-oplog-auto-skip' },
      });
      expect(report).toBeNull();
    });

    it('fires background analysis and returns a running snapshot', async () => {
      await seedRun('test-oplog-ok', {
        status: 'failed',
        errorCode: 'upstream_failed',
        errorMessage: '503 from upstream',
      });
      await app.prisma.operationLog.create({
        data: {
          runId: 'test-oplog-ok',
          feature: TEST_FEATURE,
          stage: 'searching',
          level: 'error',
          message: 'upstream 503',
        },
      });
      provider.next = async () => ({
        text: JSON.stringify(REPORT_JSON),
        model: 'analysis-model',
        promptTokens: 100,
        completionTokens: 50,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/logs/runs/test-oplog-ok/analyze',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.report).toMatchObject({ runId: 'test-oplog-ok', status: 'running' });

      // 백그라운드 완료 대기 — 웹 폴링과 같은 경로.
      await vi.waitFor(async () => {
        const report = await app.prisma.operationReport.findUnique({
          where: { runId: 'test-oplog-ok' },
        });
        expect(report?.status).toBe('done');
      });

      // 프롬프트에 run 헤더 + 로그가 실렸는지.
      expect(provider.calls).toHaveLength(1);
      expect(provider.calls[0]!.prompt).toContain('upstream 503');
      expect(provider.calls[0]!.prompt).toContain('feature: auto-discover');
      expect(provider.calls[0]!.numCtx).toBe(16_384);
      expect(provider.calls[0]!.maxTokens).toBe(2000);

      // run 상세에 보고서가 배열 suggestions 로 합류.
      const detail = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs/runs/test-oplog-ok',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(detail.json().report).toMatchObject({
        status: 'done',
        summary: REPORT_JSON.summary,
        rootCause: REPORT_JSON.rootCause,
        suggestions: REPORT_JSON.suggestions,
        severity: 'high',
        model: 'analysis-model',
        promptTokens: 100,
        completionTokens: 50,
      });
    });

    it('rejects a duplicate request while analysis is in flight', async () => {
      await seedRun('test-oplog-inflight', { status: 'failed' });
      let release!: () => void;
      provider.next = () =>
        new Promise<LLMCompleteResult>((res) => {
          release = () =>
            res({
              text: JSON.stringify(REPORT_JSON),
              model: 'analysis-model',
              promptTokens: 1,
              completionTokens: 1,
            });
        });

      const headers = { Authorization: `Bearer ${adminToken()}` };
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/logs/runs/test-oplog-inflight/analyze',
        headers,
      });
      expect(first.json().ok).toBe(true);

      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/logs/runs/test-oplog-inflight/analyze',
        headers,
      });
      expect(second.json()).toMatchObject({ ok: false, error: 'analysis_in_flight' });

      release();
      await vi.waitFor(async () => {
        const report = await app.prisma.operationReport.findUnique({
          where: { runId: 'test-oplog-inflight' },
        });
        expect(report?.status).toBe('done');
      });
    });

    it('analyzeRun retries parse_failed and records a failed report after exhaustion', async () => {
      await seedRun('test-oplog-retry', { status: 'failed' });
      provider.next = async () => ({
        text: 'json 이 아님',
        model: 'analysis-model',
        promptTokens: 1,
        completionTokens: 1,
      });
      const out = await logAnalysis.analyzeRun('test-oplog-retry', { manual: true });
      expect(out).toMatchObject({ ok: false, error: 'parse_failed' });
      // 첫 시도 + 재시도 2회.
      expect(provider.calls).toHaveLength(3);
      const report = await app.prisma.operationReport.findUnique({
        where: { runId: 'test-oplog-retry' },
      });
      expect(report).toMatchObject({ status: 'failed', errorCode: 'parse_failed' });
    });
  });

  describe('GET/PUT /admin/logs/config', () => {
    it('returns the default before any row exists', async () => {
      await app.prisma.logConfig.deleteMany({ where: { key: 'global' } });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs/config',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ retentionDays: 30 });
    });

    it('PUT upserts and GET round-trips', async () => {
      const put = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/logs/config',
        headers: { Authorization: `Bearer ${adminToken()}` },
        payload: { retentionDays: 60 },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toEqual({ retentionDays: 60 });

      const get = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs/config',
        headers: { Authorization: `Bearer ${adminToken()}` },
      });
      expect(get.json()).toEqual({ retentionDays: 60 });
    });

    it('rejects out-of-range retentionDays', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/logs/config',
        headers: { Authorization: `Bearer ${adminToken()}` },
        payload: { retentionDays: 0 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('boot sweep + retention cleanup', () => {
    beforeEach(async () => {
      await cleanupRows();
    });

    it('sweeps stale running runs to failed/server_restart on boot', async () => {
      await seedRun('test-oplog-stale', { status: 'running' });
      const count = await sweepStaleOperationRuns(app.prisma);
      expect(count).toBeGreaterThanOrEqual(1);
      const run = await app.prisma.operationRun.findUnique({
        where: { id: 'test-oplog-stale' },
      });
      expect(run).toMatchObject({ status: 'failed', errorCode: 'server_restart' });
      expect(run!.finishedAt).toBeInstanceOf(Date);
    });

    it('sweeps stale pending/running reports to failed/server_restart on boot', async () => {
      // 분석 도중 재시작하면 보고서가 running 으로 영원히 남는 고아 —
      // sweep 이 failed 로 마감해야 웹 폴링이 끝난다.
      await seedRun('test-oplog-stale-report', { status: 'failed' });
      await app.prisma.operationReport.create({
        data: { runId: 'test-oplog-stale-report', status: 'running' },
      });
      await sweepStaleOperationRuns(app.prisma);
      const report = await app.prisma.operationReport.findUnique({
        where: { runId: 'test-oplog-stale-report' },
      });
      expect(report).toMatchObject({
        status: 'failed',
        errorCode: 'server_restart',
        errorMessage: '서버 재시작으로 분석이 중단되었습니다.',
      });
    });

    it('deletes expired logs/runs but keeps reported and running runs', async () => {
      // 최대 보존 기간(365일)으로 설정 — 공유 dev.db 의 실데이터(전부 1년
      // 이내)는 cutoff 에 걸리지 않고 시드만 걸린다.
      await app.prisma.logConfig.upsert({
        where: { key: 'global' },
        create: { key: 'global', retentionDays: 365 },
        update: { retentionDays: 365 },
      });
      const old = new Date(Date.now() - 400 * 86_400_000);
      const seedOldLog = (runId: string) =>
        app.prisma.operationLog.create({
          data: {
            runId,
            feature: TEST_FEATURE,
            stage: 's',
            level: 'info',
            message: 'old',
            createdAt: old,
          },
        });

      await seedRun('test-oplog-old-done', { status: 'done', startedAt: old });
      await seedOldLog('test-oplog-old-done');
      await seedRun('test-oplog-old-reported', { status: 'failed', startedAt: old });
      await seedOldLog('test-oplog-old-reported');
      await app.prisma.operationReport.create({
        data: { runId: 'test-oplog-old-reported', status: 'done', summary: '보고서' },
      });
      // 본문 없는 실패 보고서 — run 을 영구 핀하면 안 된다 (보존 누수).
      await seedRun('test-oplog-old-failed-report', {
        status: 'failed',
        startedAt: old,
      });
      await app.prisma.operationReport.create({
        data: {
          runId: 'test-oplog-old-failed-report',
          status: 'failed',
          errorCode: 'timeout',
          createdAt: old,
          updatedAt: old,
        },
      });
      await seedRun('test-oplog-old-running', { status: 'running', startedAt: old });
      // running run 의 미완 보고서는 진행 중 분석일 수 있어 정리하지 않는다.
      await app.prisma.operationReport.create({
        data: {
          runId: 'test-oplog-old-running',
          status: 'running',
          createdAt: old,
          updatedAt: old,
        },
      });
      await seedRun('test-oplog-recent', { status: 'done' });

      const out = await cleanupExpiredOperationLogs(app.prisma);
      expect(out.retentionDays).toBe(365);

      // 보고서 없는 오래된 run — 헤더+로그 삭제.
      expect(
        await app.prisma.operationRun.findUnique({ where: { id: 'test-oplog-old-done' } }),
      ).toBeNull();
      // 보고서 있는 run — 헤더+보고서 보존, 스텝 로그만 소멸.
      expect(
        await app.prisma.operationRun.findUnique({
          where: { id: 'test-oplog-old-reported' },
        }),
      ).not.toBeNull();
      expect(
        await app.prisma.operationReport.findUnique({
          where: { runId: 'test-oplog-old-reported' },
        }),
      ).not.toBeNull();
      expect(
        await app.prisma.operationLog.count({
          where: { runId: 'test-oplog-old-reported' },
        }),
      ).toBe(0);
      // done 아닌 오래된 보고서 — 보고서와 run 헤더 모두 삭제 (영구 핀 해제).
      expect(
        await app.prisma.operationReport.findUnique({
          where: { runId: 'test-oplog-old-failed-report' },
        }),
      ).toBeNull();
      expect(
        await app.prisma.operationRun.findUnique({
          where: { id: 'test-oplog-old-failed-report' },
        }),
      ).toBeNull();
      // running run 은 건드리지 않는다 (부팅 sweep 의 몫) — 보고서도 보존.
      expect(
        await app.prisma.operationRun.findUnique({
          where: { id: 'test-oplog-old-running' },
        }),
      ).not.toBeNull();
      expect(
        await app.prisma.operationReport.findUnique({
          where: { runId: 'test-oplog-old-running' },
        }),
      ).not.toBeNull();
      // 보존 기간 안쪽 run 은 그대로.
      expect(
        await app.prisma.operationRun.findUnique({ where: { id: 'test-oplog-recent' } }),
      ).not.toBeNull();
    });
  });
});
