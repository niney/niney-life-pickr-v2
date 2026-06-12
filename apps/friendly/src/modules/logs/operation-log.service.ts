import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type {
  CrawlEventType,
  OperationFeatureType,
  OperationLogLevelType,
  OperationRunStatusType,
} from '@repo/api-contract';
import { jobRegistry, type JobRegistry } from '../crawl/job-registry.js';
import {
  summaryEventsBus,
  type SummaryEventsBus,
} from '../summary/summary-events-bus.js';

// 범용 작업 로그의 단일 진입점 — 모든 기능(크롤/요약/정규화/정산 추출 등)의
// 실행(run) 경계와 스텝 로그를 기록한다. 기존 JobLogService(크롤+요약 전용)
// 의 3채널 fan-out 의미론을 그대로 일반화한 후속:
//
//   1) pino 로거 — 운영 콘솔/파일. debug 포함 level 별 분기.
//   2) prisma.operationLog — 영속화. fire-and-forget, 실패해도 흐름 차단 X.
//   3) SSE — channel='crawl' 은 jobRegistry 로, 'summary' 는 summaryEventsBus
//      (placeId 별) 로. **level='debug' 는 SSE 로 절대 내보내지 않는다** —
//      CrawlLogLevel(info|warn|error) SSE 계약을 깨지 않기 위함.
//
// 프로세스당 정확히 1개 (plugins/logs.ts 가 decorate) — seq 카운터가 단일
// 공유여야 클라이언트의 (jobId, seq) dedup 이 로그를 드롭하지 않는다.

const MESSAGE_CAP = 2000;
const META_JSON_CAP = 4096;
const ERROR_MESSAGE_CAP = 2000;

// 자동 LLM 분석에서 제외하는 errorCode — 의도된 중단/설정 부재라 분석할
// 거리가 없는 사유들. 수동 '다시 분석' 은 이 목록과 무관하게 가능.
export const AUTO_ANALYSIS_EXCLUDED_ERROR_CODES: readonly string[] = [
  'cancelled',
  'interrupted',
  'server_restart',
  'no_provider',
  'no_inputs',
  'no_analysis_llm',
  // 사용자 입력 검증 실패 계열 — 잘못된 업로드/토큰은 운영 장애가 아니라서
  // 분석 가치가 없고, 반복 업로드가 LLM 비용으로 직결되는 것을 막는다.
  'invalid_token',
  'image_not_found',
  'invalid_image',
];

export type OperationLogChannel = 'crawl' | 'summary' | 'none';

export interface StartRunInput {
  feature: OperationFeatureType;
  jobId?: string | null;
  subjectId?: string | null;
  parentRunId?: string | null;
  trigger?: string | null;
  meta?: Record<string, unknown>;
}

export interface OperationLogInput {
  runId: string;
  stage: string;
  level: OperationLogLevelType;
  message: string;
  meta?: Record<string, unknown>;
  // 미지정 시 startRun 컨텍스트에서 보충.
  subjectId?: string | null;
  jobId?: string | null;
  // 'crawl' — jobRegistry SSE(+subjectId 있으면 summaryEventsBus 동시 fan-out).
  // 'summary' — summaryEventsBus(placeId=subjectId) 만.
  // 'none'(기본) — DB + pino 만.
  channel?: OperationLogChannel;
}

export interface FinishRunInput {
  status: Exclude<OperationRunStatusType, 'running'>;
  errorCode?: string | null;
  errorMessage?: string | null;
  // startRun meta 와 shallow merge 되어 저장된다.
  meta?: Record<string, unknown>;
}

// finishRun 의 자동 분석 트리거가 필요로 하는 최소 표면 — 순환 의존 없이
// LogAnalysisService 를 주입받기 위한 구조적 타입.
export interface LogAnalysisTrigger {
  analyzeRun(runId: string, opts?: { manual?: boolean }): Promise<unknown>;
}

export interface OperationLogServiceOptions {
  registry?: JobRegistry;
  bus?: SummaryEventsBus;
  logger?: FastifyBaseLogger | null;
  // SSE seq — 기존 JobLogService 패턴 유지. 미주입 시 자체 카운터.
  nextSeqProvider?: () => number;
  // 실패 run 자동 분석 (fire-and-forget). 미주입 시 자동 분석 없음.
  logAnalysis?: LogAnalysisTrigger | null;
}

interface RunContext {
  feature: OperationFeatureType;
  jobId: string | null;
  subjectId: string | null;
  // 자동 분석 게이트용 — trigger='user'(일반 사용자 요청) 실패는 LLM 분석을
  // 띄우지 않는다.
  trigger: string | null;
  meta: Record<string, unknown> | undefined;
}

const capMessage = (message: string): string =>
  message.length > MESSAGE_CAP ? message.slice(0, MESSAGE_CAP) : message;

// DB 저장용 meta 직렬화. JSON 이 캡을 넘으면 부분 절단이 파싱을 깨므로
// 통째로 truncated 마커로 대체한다.
const serializeMeta = (
  meta: Record<string, unknown> | undefined,
): string | null => {
  if (!meta) return null;
  let json: string;
  try {
    json = JSON.stringify(meta);
  } catch {
    return JSON.stringify({ truncated: true });
  }
  if (json.length > META_JSON_CAP) return JSON.stringify({ truncated: true });
  return json;
};

export class OperationLogService {
  private readonly nextSeq: () => number;
  // 진행 중 run 의 기본값(feature/jobId/subjectId) + startRun meta 보관.
  // finishRun 에서 정리된다.
  private readonly contexts = new Map<string, RunContext>();
  // runId 별 미결 fire-and-forget 로그 INSERT 추적 — finishRun 직후 자동
  // 분석이 마지막 error 로그가 커밋되기 전에 로그를 수집하면 핵심 단서가
  // 프롬프트에서 빠지므로, finishRun 이 이들을 먼저 정착시킨다.
  private readonly pendingWrites = new Map<string, Set<Promise<unknown>>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: OperationLogServiceOptions = {},
  ) {
    let n = 1;
    this.nextSeq = opts.nextSeqProvider ?? (() => n++);
  }

  private get registry(): JobRegistry {
    return this.opts.registry ?? jobRegistry;
  }

  private get bus(): SummaryEventsBus {
    return this.opts.bus ?? summaryEventsBus;
  }

  private get logger(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  // run 헤더 생성. id 는 사전 생성 randomUUID — DB 쓰기가 실패해도 id 를
  // 반환해 호출자의 비즈니스 흐름(스텝 log/finishRun)이 계속되게 한다.
  async startRun(input: StartRunInput): Promise<string> {
    const id = randomUUID();
    this.contexts.set(id, {
      feature: input.feature,
      jobId: input.jobId ?? null,
      subjectId: input.subjectId ?? null,
      trigger: input.trigger ?? null,
      meta: input.meta,
    });
    try {
      await this.prisma.operationRun.create({
        data: {
          id,
          feature: input.feature,
          jobId: input.jobId ?? null,
          subjectId: input.subjectId ?? null,
          parentRunId: input.parentRunId ?? null,
          trigger: input.trigger ?? null,
          meta: serializeMeta(input.meta),
        },
      });
    } catch (err) {
      // DB 실패는 콘솔에만 — 무한 루프 방지를 위해 logger 도 거치지 않음.
       
      console.error('[operation-log] startRun persist failed', err);
    }
    return id;
  }

  // 스텝 로그. 동기 시그니처 — DB 쓰기는 fire-and-forget.
  log(input: OperationLogInput): void {
    const at = new Date();
    const atIso = at.toISOString();
    const ctx = this.contexts.get(input.runId);
    const jobId = input.jobId !== undefined ? input.jobId : (ctx?.jobId ?? null);
    const subjectId =
      input.subjectId !== undefined ? input.subjectId : (ctx?.subjectId ?? null);
    const channel = input.channel ?? 'none';
    const message = capMessage(input.message);

    // 1) pino — debug 포함 4종 분기.
    if (this.logger) {
      const payload = {
        runId: input.runId,
        jobId,
        subjectId,
        stage: input.stage,
        ...(input.meta ?? {}),
      };
      if (input.level === 'error') this.logger.error(payload, message);
      else if (input.level === 'warn') this.logger.warn(payload, message);
      else if (input.level === 'debug') this.logger.debug(payload, message);
      else this.logger.info(payload, message);
    }

    // 2) SSE — debug 는 절대 내보내지 않는다 (CrawlLogLevel 3종 계약 보호).
    //    의미론은 기존 JobLogService 와 동일: 'crawl' 은 jobRegistry 로 보내고
    //    subjectId(placeId) 가 있으면 같은 seq 로 summaryEventsBus 에도
    //    fan-out — 클라이언트가 (jobId, seq) 로 dedup 한다.
    const level = input.level;
    if (level !== 'debug') {
      if (channel === 'crawl' && jobId) {
        const seq = this.nextSeq();
        try {
          const event: CrawlEventType = {
            type: 'log',
            level,
            stage: input.stage,
            message,
            ...(input.meta ? { meta: input.meta } : {}),
            seq,
            at: atIso,
          };
          this.registry.addEvent(jobId, event);
        } catch {
          // job 이 이미 사라졌거나 등록 안 됨 — 영속 채널은 계속 진행.
        }
        if (subjectId) {
          try {
            this.bus.publish(subjectId, {
              type: 'log',
              jobId,
              stage: input.stage,
              level,
              message,
              meta: input.meta ?? null,
              seq,
              at: atIso,
            });
          } catch {
            // bus 가 던지지 않게 막혀있지만 방어적으로.
          }
        }
      } else if (channel === 'summary' && subjectId) {
        try {
          this.bus.publish(subjectId, {
            type: 'log',
            jobId,
            stage: input.stage,
            level,
            message,
            meta: input.meta ?? null,
            seq: this.nextSeq(),
            at: atIso,
          });
        } catch {
          // 방어적 — 위와 동일.
        }
      }
    }

    // 3) DB 영속화. fire-and-forget — 실패해도 흐름 차단 X. feature 는
    //    컨텍스트에서 보충하는데, 컨텍스트가 없으면(이미 finishRun 됐거나
    //    잘못된 runId) FK/enum 오염을 피하기 위해 DB 기록만 생략한다 —
    //    pino/SSE 흔적은 위에서 이미 남았다.
    if (!ctx) {
       
      console.error(
        `[operation-log] unknown runId — DB persist skipped: ${input.runId}`,
      );
      return;
    }
    const write = this.prisma.operationLog
      .create({
        data: {
          runId: input.runId,
          feature: ctx.feature,
          jobId,
          subjectId,
          stage: input.stage,
          level: input.level,
          message,
          meta: serializeMeta(input.meta),
          createdAt: at,
        },
      })
      .catch((err) => {

        console.error('[operation-log] persist failed', err);
      });
    this.trackPendingWrite(input.runId, write);
  }

  // 미결 write 등록 — settle 시 자가 제거되어 누수가 없다. finishRun 이
  // 자동 분석을 띄우기 전에 이 집합을 기다린다.
  private trackPendingWrite(runId: string, write: Promise<unknown>): void {
    let set = this.pendingWrites.get(runId);
    if (!set) {
      set = new Set();
      this.pendingWrites.set(runId, set);
    }
    const owned = set;
    owned.add(write);
    const settle = () => {
      owned.delete(write);
      if (owned.size === 0 && this.pendingWrites.get(runId) === owned) {
        this.pendingWrites.delete(runId);
      }
    };
    void write.then(settle, settle);
  }

  // run 종료. 절대 던지지 않는다 — 호출자의 finally 흐름을 막지 않기 위함.
  // status='failed' 이고 errorCode 가 자동분석 제외목록 밖이면 LLM 분석을
  // fire-and-forget 으로 띄운다.
  async finishRun(runId: string, input: FinishRunInput): Promise<void> {
    const ctx = this.contexts.get(runId);
    this.contexts.delete(runId);
    const hasMeta = ctx?.meta !== undefined || input.meta !== undefined;
    const mergedMeta = hasMeta
      ? { ...(ctx?.meta ?? {}), ...(input.meta ?? {}) }
      : undefined;
    try {
      await this.prisma.operationRun.update({
        where: { id: runId },
        data: {
          status: input.status,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage
            ? input.errorMessage.slice(0, ERROR_MESSAGE_CAP)
            : null,
          ...(mergedMeta !== undefined ? { meta: serializeMeta(mergedMeta) } : {}),
          finishedAt: new Date(),
        },
      });
    } catch (err) {

      console.error('[operation-log] finishRun persist failed', err);
    }

    // fire-and-forget INSERT 와의 경합 차단 — 마지막 error 로그가 DB 에
    // 정착되기 전에 자동 분석이 로그를 수집하면 안 된다.
    const pending = this.pendingWrites.get(runId);
    if (pending && pending.size > 0) {
      await Promise.allSettled([...pending]);
    }

    if (
      input.status === 'failed' &&
      // 일반 사용자 트리거 실패(영수증 업로드 등)는 LLM 비용을 유발하지 않게
      // 자동 분석에서 제외 — 수동 '다시 분석' 은 영향 없다.
      (ctx?.trigger ?? null) !== 'user' &&
      !AUTO_ANALYSIS_EXCLUDED_ERROR_CODES.includes(input.errorCode ?? '') &&
      this.opts.logAnalysis
    ) {
      void this.opts.logAnalysis.analyzeRun(runId).catch((err) => {

        console.error('[operation-log] auto analysis failed', err);
      });
    }
  }
}

// 부팅 직후 호출 (plugins/logs.ts). status='running' 인 run 은 직전 인스턴스
// 가 실행 중 비정상 종료되며 남긴 고아 — 단일 인스턴스 가정 하에 부팅 시점엔
// 실행 중 작업이 없으므로 server_restart 로 마감한다. server_restart 는 자동
// 분석 제외 코드라 분석이 따라붙지 않는다.
export const sweepStaleOperationRuns = async (
  prisma: PrismaClient,
  log?: FastifyBaseLogger | null,
): Promise<number> => {
  const res = await prisma.operationRun.updateMany({
    where: { status: 'running' },
    data: {
      status: 'failed',
      errorCode: 'server_restart',
      errorMessage: 'Server restarted while operation was in progress',
      finishedAt: new Date(),
    },
  });
  // 분석 보고서 고아도 함께 마감 — 분석 도중 재시작하면 보고서가
  // pending/running 으로 영원히 남아 웹이 끝나지 않는 폴링을 돈다.
  // 수동 '다시 분석' 으로 복구 가능.
  const reports = await prisma.operationReport.updateMany({
    where: { status: { in: ['pending', 'running'] } },
    data: {
      status: 'failed',
      errorCode: 'server_restart',
      errorMessage: '서버 재시작으로 분석이 중단되었습니다.',
    },
  });
  if (res.count > 0 || reports.count > 0) {
    log?.warn(
      { count: res.count, reports: reports.count },
      '[operation-log] swept stale running runs on boot',
    );
  }
  return res.count;
};

export const DEFAULT_LOG_RETENTION_DAYS = 30;

// 보존 기간(LogConfig, 기본 30일) 경과분 정리. 매일 cron + 부팅 직후 1회.
//  - 스텝 로그: cutoff 이전 전부 삭제.
//  - 보고서: done 이 아닌(분석 본문 없는) 채 cutoff 이전에 멈춘 것 먼저 삭제
//    — 실패 보고서가 run 을 영구 핀해서 보존 정리가 새는 것을 막는다.
//  - run 헤더: cutoff 이전 + 종료됨 + 보고서 없음 만 삭제 (cascade).
//    done 보고서 있는 run 은 영구 보존(헤더+보고서만 남고 스텝 로그는 소멸),
//    running run 은 건드리지 않는다 (부팅 sweep 의 몫).
export const cleanupExpiredOperationLogs = async (
  prisma: PrismaClient,
  log?: FastifyBaseLogger | null,
): Promise<{
  logs: number;
  runs: number;
  reports: number;
  retentionDays: number;
}> => {
  const cfg = await prisma.logConfig.findUnique({ where: { key: 'global' } });
  const retentionDays = cfg?.retentionDays ?? DEFAULT_LOG_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const logs = await prisma.operationLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  // 본문 없는(미완) 보고서를 먼저 비워야 아래 run deleteMany 의
  // report:null 조건에 걸려 run 헤더까지 정리된다. running run 의 보고서는
  // 건드리지 않는다 — 진행 중 분석일 수 있다.
  const reports = await prisma.operationReport.deleteMany({
    where: {
      status: { not: 'done' },
      updatedAt: { lt: cutoff },
      run: { status: { not: 'running' } },
    },
  });
  const runs = await prisma.operationRun.deleteMany({
    where: {
      startedAt: { lt: cutoff },
      status: { not: 'running' },
      report: { is: null },
    },
  });
  if (logs.count > 0 || runs.count > 0 || reports.count > 0) {
    log?.info(
      { logs: logs.count, runs: runs.count, reports: reports.count, retentionDays },
      '[operation-log] retention cleanup done',
    );
  }
  return {
    logs: logs.count,
    runs: runs.count,
    reports: reports.count,
    retentionDays,
  };
};
