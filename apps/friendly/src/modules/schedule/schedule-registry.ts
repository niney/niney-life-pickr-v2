import { randomUUID } from 'node:crypto';
import { Cron } from 'croner';
import type {
  ScheduleDoneEventType,
  ScheduleJobTypeType,
  SchedulePhaseType,
  ScheduleProgressEventType,
  ScheduleRunStatusType,
  ScheduleRunType,
  ScheduleTriggerType,
} from '@repo/api-contract';

// 인프로세스 스케줄러의 메모리 상태. 단일 Fastify 인스턴스(CLAUDE.md no-Redis)
// 안에서 두 가지를 관리한다:
//  1) cron 타이머 — jobType 당 croner Cron 하나. 부팅/설정변경 시 (재)등록.
//  2) 진행 중 run — 시스템 전체 동시 1개 (global-merge-job-registry 와 같은
//     단일 모델). overlap 가드 + live 진행 + SSE + graceful abort 를 담당.
//
// 실제 파이프라인 로직은 ScheduleService 가 갖고, registry 는 상태/타이머만.

export type ScheduleEvent = ScheduleProgressEventType | ScheduleDoneEventType;
export type ScheduleSubscriber = (event: ScheduleEvent) => void;

interface ActiveRun {
  runId: string;
  jobType: ScheduleJobTypeType;
  trigger: ScheduleTriggerType;
  status: ScheduleRunStatusType; // 진행 중엔 'running', 끝나면 terminal
  phase: SchedulePhaseType;
  total: number | null;
  processed: number;
  skipped: number;
  currentName: string | null;
  startedAt: string;
  finishedAt: string | null;
  abort: AbortController;
  subscribers: Set<ScheduleSubscriber>;
}

export class ScheduleRegistry {
  private readonly crons = new Map<string, Cron>();
  // 동시 1개만 — 정규화→머지 파이프라인은 시스템 전체 작업이라 중첩 의미 없음.
  private active: ActiveRun | null = null;

  // ── cron 타이머 ────────────────────────────────────────────────────

  // jobType 에 cron 을 (재)등록. croner 는 패턴 in-place 변경을 지원하지 않으므로
  // 기존 인스턴스를 stop 한 뒤 새로 만든다. onTick 은 fire-and-forget —
  // 콜백은 즉시 반환하고 실제 작업은 ScheduleService 가 백그라운드로 돌린다
  // (overlap 가드는 beginRun 이 책임). unref 로 cron 타이머 혼자서는 프로세스를
  // 붙잡지 않게 한다.
  setCron(
    jobType: string,
    cronExpr: string,
    timezone: string,
    onTick: () => void,
  ): void {
    this.clearCron(jobType);
    const cron = new Cron(
      cronExpr,
      { timezone, name: jobType, unref: true, catch: true },
      () => onTick(),
    );
    this.crons.set(jobType, cron);
  }

  clearCron(jobType: string): void {
    const c = this.crons.get(jobType);
    if (c) {
      c.stop();
      this.crons.delete(jobType);
    }
  }

  hasCron(jobType: string): boolean {
    return this.crons.has(jobType);
  }

  // 다음 실행 시각 — 등록된 cron 이 있을 때만. enabled=false 면 cron 미등록 → null.
  nextRun(jobType: string): Date | null {
    return this.crons.get(jobType)?.nextRun() ?? null;
  }

  // graceful shutdown — 모든 cron 타이머 정지. (진행 중 run 의 abort 는 별도.)
  stopAllCrons(): void {
    for (const c of this.crons.values()) c.stop();
    this.crons.clear();
  }

  // ── 진행 중 run (overlap 가드 + live + SSE + abort) ─────────────────

  isRunning(): boolean {
    return this.active !== null && this.active.status === 'running';
  }

  // run 시작. 이미 진행 중이면 null — 호출자가 'skipped' 로 처리(overlap 방지).
  beginRun(
    jobType: ScheduleJobTypeType,
    trigger: ScheduleTriggerType,
  ): { runId: string; signal: AbortSignal } | null {
    if (this.isRunning()) return null;
    const runId = randomUUID();
    const abort = new AbortController();
    this.active = {
      runId,
      jobType,
      trigger,
      status: 'running',
      phase: 'collecting',
      total: null,
      processed: 0,
      skipped: 0,
      currentName: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      abort,
      subscribers: new Set(),
    };
    return { runId, signal: abort.signal };
  }

  setTotal(total: number): void {
    if (this.active) this.active.total = total;
  }

  setPhase(phase: SchedulePhaseType): void {
    if (!this.active) return;
    this.active.phase = phase;
    this.publishProgress();
  }

  // 현재 처리 중인 식당명 갱신 + progress push.
  markProcessing(name: string | null): void {
    if (!this.active) return;
    this.active.currentName = name;
    this.publishProgress();
  }

  incProcessed(): void {
    if (!this.active) return;
    this.active.processed += 1;
    this.publishProgress();
  }

  incSkipped(): void {
    if (!this.active) return;
    this.active.skipped += 1;
  }

  finishRun(status: ScheduleRunStatusType): void {
    if (!this.active) return;
    this.active.status = status;
    this.active.phase = 'done';
    this.active.finishedAt = new Date().toISOString();
    const event: ScheduleDoneEventType = {
      type: 'done',
      runId: this.active.runId,
      status,
      finishedAt: this.active.finishedAt,
    };
    this.publish(event);
    // active 는 의도적으로 유지 — 직후 조회/SSE 가 마지막 스냅샷을 볼 수 있게.
    // 다음 beginRun 이 교체하고, 단일 슬롯이라 별도 GC 불필요.
  }

  // graceful shutdown 에서 진행 중 작업에 취소 신호.
  abortInflight(): void {
    this.active?.abort.abort();
  }

  // 현재 진행 중 run id — running 일 때만. UI 가 SSE 붙을 대상.
  runningRunId(): string | null {
    return this.isRunning() ? this.active!.runId : null;
  }

  inflightSnapshot(): ScheduleRunType | null {
    if (!this.active) return null;
    const a = this.active;
    return {
      runId: a.runId,
      jobType: a.jobType,
      trigger: a.trigger,
      status: a.status,
      phase: a.phase,
      totalTargets: a.total,
      processedCount: a.processed,
      skippedCount: a.skipped,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      error: null,
    };
  }

  subscribe(runId: string, fn: ScheduleSubscriber): () => void {
    if (!this.active || this.active.runId !== runId) return () => undefined;
    this.active.subscribers.add(fn);
    return () => {
      this.active?.subscribers.delete(fn);
    };
  }

  private publishProgress(): void {
    if (!this.active) return;
    const a = this.active;
    const event: ScheduleProgressEventType = {
      type: 'progress',
      runId: a.runId,
      phase: a.phase,
      processed: a.processed,
      total: a.total ?? 0,
      skipped: a.skipped,
      currentName: a.currentName,
    };
    this.publish(event);
  }

  private publish(event: ScheduleEvent): void {
    if (!this.active) return;
    for (const sub of this.active.subscribers) {
      try {
        sub(event);
      } catch {
        // 구독자 실패는 무시 — 자기 책임.
      }
    }
  }
}

export const scheduleRegistry = new ScheduleRegistry();
