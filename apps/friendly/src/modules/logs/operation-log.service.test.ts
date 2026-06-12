import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrawlEventType } from '@repo/api-contract';
import type { JobRegistry } from '../crawl/job-registry.js';
import type {
  SummaryEventsBus,
  SummarySignal,
} from '../summary/summary-events-bus.js';
import {
  AUTO_ANALYSIS_EXCLUDED_ERROR_CODES,
  OperationLogService,
} from './operation-log.service.js';

// fire-and-forget DB 쓰기(void promise)를 테스트에서 관찰하기 위한 flush.
const flush = () => new Promise((res) => setTimeout(res, 0));

const buildPrismaStub = () => {
  const runCreates: Array<Record<string, unknown>> = [];
  const runUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const logCreates: Array<Record<string, unknown>> = [];
  return {
    runCreates,
    runUpdates,
    logCreates,
    operationRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        runCreates.push(data);
        return data;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          runUpdates.push({ where, data });
          return data;
        },
      ),
    },
    operationLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        logCreates.push(data);
        return data;
      }),
    },
  };
};

const buildRegistryStub = () => {
  const events: Array<{ jobId: string; event: CrawlEventType }> = [];
  return {
    events,
    addEvent: vi.fn((jobId: string, event: CrawlEventType) => {
      events.push({ jobId, event });
    }),
  };
};

const buildBusStub = () => {
  const published: Array<{ placeId: string; signal: SummarySignal }> = [];
  return {
    published,
    publish: vi.fn((placeId: string, signal: SummarySignal = { type: 'progress' }) => {
      published.push({ placeId, signal });
    }),
  };
};

describe('OperationLogService', () => {
  let prisma: ReturnType<typeof buildPrismaStub>;
  let registry: ReturnType<typeof buildRegistryStub>;
  let bus: ReturnType<typeof buildBusStub>;
  let service: OperationLogService;

  const build = (extra: { logAnalysis?: { analyzeRun: ReturnType<typeof vi.fn> } } = {}) =>
    new OperationLogService(prisma as never, {
      registry: registry as unknown as JobRegistry,
      bus: bus as unknown as SummaryEventsBus,
      ...extra,
    });

  beforeEach(() => {
    prisma = buildPrismaStub();
    registry = buildRegistryStub();
    bus = buildBusStub();
    service = build();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startRun', () => {
    it('persists a run row and returns the pre-generated id', async () => {
      const id = await service.startRun({
        feature: 'crawl',
        jobId: 'job-1',
        subjectId: 'place-1',
        trigger: 'manual',
        meta: { url: 'https://x' },
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(prisma.runCreates).toHaveLength(1);
      expect(prisma.runCreates[0]).toMatchObject({
        id,
        feature: 'crawl',
        jobId: 'job-1',
        subjectId: 'place-1',
        trigger: 'manual',
        meta: JSON.stringify({ url: 'https://x' }),
      });
    });

    it('returns an id even when the DB write fails', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      prisma.operationRun.create.mockRejectedValueOnce(new Error('db down'));
      const id = await service.startRun({ feature: 'summary' });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(errSpy).toHaveBeenCalled();
      // DB 실패에도 컨텍스트는 등록 — 후속 log 가 feature 를 보충받는다.
      service.log({ runId: id, stage: 's', level: 'info', message: 'm' });
      await flush();
      expect(prisma.logCreates[0]).toMatchObject({ feature: 'summary' });
    });
  });

  describe('log fan-out', () => {
    it("channel 'crawl': registry + bus receive the same seq, DB persists", async () => {
      const runId = await service.startRun({
        feature: 'crawl',
        jobId: 'job-1',
        subjectId: 'place-1',
      });
      service.log({
        runId,
        stage: 'detail',
        level: 'info',
        message: 'hello',
        meta: { a: 1 },
        channel: 'crawl',
      });
      await flush();

      expect(registry.events).toHaveLength(1);
      const ev = registry.events[0]!;
      expect(ev.jobId).toBe('job-1');
      expect(ev.event).toMatchObject({
        type: 'log',
        level: 'info',
        stage: 'detail',
        message: 'hello',
        meta: { a: 1 },
      });

      expect(bus.published).toHaveLength(1);
      const sig = bus.published[0]!;
      expect(sig.placeId).toBe('place-1');
      expect(sig.signal).toMatchObject({
        type: 'log',
        jobId: 'job-1',
        level: 'info',
        message: 'hello',
      });
      // 같은 seq 로 fan-out — 클라이언트 (jobId, seq) dedup 계약.
      expect((sig.signal as { seq: number }).seq).toBe(
        (ev.event as { seq: number }).seq,
      );

      expect(prisma.logCreates[0]).toMatchObject({
        runId,
        feature: 'crawl',
        jobId: 'job-1',
        subjectId: 'place-1',
        stage: 'detail',
        level: 'info',
        message: 'hello',
        meta: JSON.stringify({ a: 1 }),
      });
    });

    it("channel 'crawl' without jobId: SSE skipped entirely, DB still persists", async () => {
      const runId = await service.startRun({ feature: 'summary', subjectId: 'place-1' });
      service.log({ runId, stage: 's', level: 'info', message: 'm', channel: 'crawl' });
      await flush();
      expect(registry.addEvent).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
      expect(prisma.logCreates).toHaveLength(1);
    });

    it("channel 'summary': bus only, registry untouched", async () => {
      const runId = await service.startRun({
        feature: 'summary',
        jobId: 'job-2',
        subjectId: 'place-2',
      });
      service.log({ runId, stage: 'summary_run', level: 'warn', message: 'w', channel: 'summary' });
      await flush();
      expect(registry.addEvent).not.toHaveBeenCalled();
      expect(bus.published).toHaveLength(1);
      expect(bus.published[0]!.placeId).toBe('place-2');
      expect(bus.published[0]!.signal).toMatchObject({ type: 'log', level: 'warn' });
    });

    it("channel 'none' (default): DB + pino only", async () => {
      const runId = await service.startRun({
        feature: 'menu-grouping',
        jobId: 'job-3',
        subjectId: 'rest-3',
      });
      service.log({ runId, stage: 'chunk', level: 'info', message: 'm' });
      await flush();
      expect(registry.addEvent).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
      expect(prisma.logCreates).toHaveLength(1);
    });

    it('level=debug never reaches SSE on any channel, but persists to DB', async () => {
      const runId = await service.startRun({
        feature: 'crawl',
        jobId: 'job-4',
        subjectId: 'place-4',
      });
      service.log({ runId, stage: 's', level: 'debug', message: 'd1', channel: 'crawl' });
      service.log({ runId, stage: 's', level: 'debug', message: 'd2', channel: 'summary' });
      await flush();
      expect(registry.addEvent).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
      expect(prisma.logCreates).toHaveLength(2);
      expect(prisma.logCreates.map((l) => l.level)).toEqual(['debug', 'debug']);
    });

    it('unknown runId: DB persist skipped (no feature context)', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      service.log({ runId: 'nope', stage: 's', level: 'info', message: 'm' });
      await flush();
      expect(prisma.operationLog.create).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('caps', () => {
    it('truncates message beyond 2000 chars', async () => {
      const runId = await service.startRun({ feature: 'crawl', jobId: 'j', subjectId: 'p' });
      service.log({
        runId,
        stage: 's',
        level: 'info',
        message: 'x'.repeat(2500),
        channel: 'crawl',
      });
      await flush();
      expect((prisma.logCreates[0]!.message as string).length).toBe(2000);
      // SSE 페이로드도 같은 캡 적용.
      expect((registry.events[0]!.event as { message: string }).message.length).toBe(2000);
    });

    it('replaces oversized meta JSON with a truncated marker', async () => {
      const runId = await service.startRun({ feature: 'crawl' });
      service.log({
        runId,
        stage: 's',
        level: 'info',
        message: 'm',
        meta: { big: 'y'.repeat(5000) },
      });
      await flush();
      expect(prisma.logCreates[0]!.meta).toBe(JSON.stringify({ truncated: true }));
    });
  });

  describe('finishRun', () => {
    it('marks status/finishedAt and shallow-merges meta over startRun meta', async () => {
      const runId = await service.startRun({
        feature: 'crawl',
        meta: { a: 1, b: 1 },
      });
      await service.finishRun(runId, { status: 'done', meta: { b: 2, c: 3 } });
      expect(prisma.runUpdates).toHaveLength(1);
      const { where, data } = prisma.runUpdates[0]!;
      expect(where.id).toBe(runId);
      expect(data.status).toBe('done');
      expect(data.finishedAt).toBeInstanceOf(Date);
      expect(data.meta).toBe(JSON.stringify({ a: 1, b: 2, c: 3 }));
    });

    it('does not throw when the DB update fails', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      prisma.operationRun.update.mockRejectedValueOnce(new Error('locked'));
      const runId = await service.startRun({ feature: 'crawl' });
      await expect(service.finishRun(runId, { status: 'done' })).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalled();
    });

    it('triggers auto analysis for failed runs with analyzable errorCode', async () => {
      const analyzeRun = vi.fn(async () => ({ ok: false }));
      service = build({ logAnalysis: { analyzeRun } });
      const runId = await service.startRun({ feature: 'crawl' });
      await service.finishRun(runId, {
        status: 'failed',
        errorCode: 'upstream_failed',
        errorMessage: 'boom',
      });
      await flush();
      expect(analyzeRun).toHaveBeenCalledWith(runId);
    });

    it('triggers auto analysis when errorCode is missing', async () => {
      const analyzeRun = vi.fn(async () => ({ ok: false }));
      service = build({ logAnalysis: { analyzeRun } });
      const runId = await service.startRun({ feature: 'global-merge' });
      await service.finishRun(runId, { status: 'failed' });
      await flush();
      expect(analyzeRun).toHaveBeenCalledWith(runId);
    });

    it.each(AUTO_ANALYSIS_EXCLUDED_ERROR_CODES)(
      'skips auto analysis for excluded errorCode %s',
      async (code) => {
        const analyzeRun = vi.fn(async () => ({ ok: false }));
        service = build({ logAnalysis: { analyzeRun } });
        const runId = await service.startRun({ feature: 'crawl' });
        await service.finishRun(runId, { status: 'failed', errorCode: code });
        await flush();
        expect(analyzeRun).not.toHaveBeenCalled();
      },
    );

    it("skips auto analysis when run trigger is 'user'", async () => {
      const analyzeRun = vi.fn(async () => ({ ok: false }));
      service = build({ logAnalysis: { analyzeRun } });
      // 일반 사용자 트리거(영수증 업로드 등) 실패는 LLM 비용을 유발하면 안 된다.
      const runId = await service.startRun({
        feature: 'settlement-extraction',
        trigger: 'user',
      });
      await service.finishRun(runId, {
        status: 'failed',
        errorCode: 'upstream_failed',
      });
      await flush();
      expect(analyzeRun).not.toHaveBeenCalled();
    });

    it('awaits pending fire-and-forget log writes before firing auto analysis', async () => {
      let logSettled = false;
      let release!: () => void;
      prisma.operationLog.create.mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>((res) => {
            release = () => {
              logSettled = true;
              res({});
            };
          }),
      );
      // fire-and-forget 호출 내부 단언은 finishRun 의 catch 에 삼켜지므로
      // 호출 시점의 정착 여부를 밖에서 기록해 검증한다.
      const settledAtCall: boolean[] = [];
      const analyzeRun = vi.fn(async () => {
        settledAtCall.push(logSettled);
        return { ok: false };
      });
      service = build({ logAnalysis: { analyzeRun } });
      const runId = await service.startRun({ feature: 'crawl' });
      service.log({ runId, stage: 's', level: 'error', message: 'boom' });

      const finishing = service.finishRun(runId, {
        status: 'failed',
        errorCode: 'upstream_failed',
      });
      await flush();
      expect(analyzeRun).not.toHaveBeenCalled();

      release();
      await finishing;
      await flush();
      expect(analyzeRun).toHaveBeenCalledWith(runId);
      // 분석이 뜨는 시점엔 마지막 error 로그 INSERT 가 이미 정착돼 있다.
      expect(settledAtCall).toEqual([true]);
    });

    it('skips auto analysis for non-failed terminal statuses', async () => {
      const analyzeRun = vi.fn(async () => ({ ok: false }));
      service = build({ logAnalysis: { analyzeRun } });
      const doneId = await service.startRun({ feature: 'crawl' });
      await service.finishRun(doneId, { status: 'done' });
      const cancelledId = await service.startRun({ feature: 'crawl' });
      await service.finishRun(cancelledId, { status: 'cancelled' });
      await flush();
      expect(analyzeRun).not.toHaveBeenCalled();
    });

    it('caps errorMessage at 2000 chars and clears run context', async () => {
      const runId = await service.startRun({ feature: 'crawl' });
      await service.finishRun(runId, {
        status: 'failed',
        errorCode: 'cancelled',
        errorMessage: 'e'.repeat(3000),
      });
      expect((prisma.runUpdates[0]!.data.errorMessage as string).length).toBe(2000);
      // 컨텍스트 정리됨 — 이후 log 는 DB 기록을 생략한다.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      service.log({ runId, stage: 's', level: 'info', message: 'late' });
      await flush();
      expect(prisma.operationLog.create).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
    });
  });

  it('shares one monotonic seq counter across channels', async () => {
    const runId = await service.startRun({
      feature: 'crawl',
      jobId: 'job-seq',
      subjectId: 'place-seq',
    });
    service.log({ runId, stage: 'a', level: 'info', message: '1', channel: 'crawl' });
    service.log({ runId, stage: 'b', level: 'info', message: '2', channel: 'summary' });
    service.log({ runId, stage: 'c', level: 'info', message: '3', channel: 'crawl' });
    const seqs: number[] = [];
    for (const { signal } of bus.published) {
      seqs.push((signal as { seq: number }).seq);
    }
    // crawl(1) → summary(2) → crawl(3) — 단일 카운터로 단조 증가.
    expect(seqs).toEqual([1, 2, 3]);
    expect((registry.events[0]!.event as { seq: number }).seq).toBe(1);
    expect((registry.events[1]!.event as { seq: number }).seq).toBe(3);
  });
});
