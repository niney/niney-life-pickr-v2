import { randomUUID } from 'node:crypto';
import type {
  FoodImportDoneEventType,
  FoodImportPhaseType,
  FoodImportProgressEventType,
  FoodImportRunStatusType,
  FoodImportRunType,
  FoodImportSourceStatType,
  FoodImportSourceType,
  FoodImportTriggerType,
} from '@repo/api-contract';

// 음식 카탈로그 적재 잡의 인프로세스 live 상태(SSE용) — random-crawl-registry 와 같은 골격.
// 진실의 원천은 DB(FoodImportRun)이고 레지스트리는 어드민 화면 실시간 표시 + abort 채널.
// 동시 1개(전체 카탈로그 작업이라 중첩 의미 없음). 진짜 overlap 가드는 서비스의 DB 조회가
// 책임지고(재시작 안전), begin 은 같은 프로세스 내 경쟁만 막는 보조 가드.

export type FoodImportEvent = FoodImportProgressEventType | FoodImportDoneEventType;
export type FoodImportSubscriber = (event: FoodImportEvent) => void;

interface ActiveRun {
  runId: string;
  trigger: FoodImportTriggerType;
  status: FoodImportRunStatusType;
  phase: FoodImportPhaseType;
  sources: FoodImportSourceType[];
  stats: FoodImportSourceStatType[];
  classifiedCount: number;
  currentSource: FoodImportSourceType | null;
  processed: number;
  total: number | null;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  abort: AbortController;
  subscribers: Set<FoodImportSubscriber>;
}

const TERMINAL: FoodImportRunStatusType[] = ['done', 'failed', 'skipped', 'interrupted'];

export class FoodImportRegistry {
  private active: ActiveRun | null = null;

  isActive(): boolean {
    return this.active !== null && !TERMINAL.includes(this.active.status);
  }

  begin(
    trigger: FoodImportTriggerType,
    sources: FoodImportSourceType[],
  ): { runId: string; signal: AbortSignal } | null {
    if (this.isActive()) return null;
    const runId = randomUUID();
    const abort = new AbortController();
    this.active = {
      runId,
      trigger,
      status: 'running',
      phase: 'fetching',
      sources,
      stats: [],
      classifiedCount: 0,
      currentSource: null,
      processed: 0,
      total: null,
      message: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      abort,
      subscribers: new Set(),
    };
    return { runId, signal: abort.signal };
  }

  // 단계 전환 — 진행 카운터는 리셋(단계마다 total 이 다르다).
  setPhase(
    phase: FoodImportPhaseType,
    opts?: { source?: FoodImportSourceType | null; total?: number | null; message?: string | null },
  ): void {
    if (!this.active) return;
    this.active.phase = phase;
    this.active.processed = 0;
    this.active.total = opts?.total ?? null;
    if (opts?.source !== undefined) this.active.currentSource = opts.source;
    this.active.message = opts?.message ?? null;
    this.publishProgress();
  }

  setProgress(processed: number, total?: number | null, message?: string | null): void {
    if (!this.active) return;
    this.active.processed = processed;
    if (total !== undefined) this.active.total = total;
    if (message !== undefined) this.active.message = message;
    this.publishProgress();
  }

  upsertStat(stat: FoodImportSourceStatType): void {
    if (!this.active) return;
    const idx = this.active.stats.findIndex((s) => s.source === stat.source);
    if (idx >= 0) this.active.stats[idx] = stat;
    else this.active.stats.push(stat);
  }

  setClassifiedCount(n: number): void {
    if (!this.active) return;
    this.active.classifiedCount = n;
  }

  finish(status: FoodImportRunStatusType, error: string | null = null): void {
    if (!this.active) return;
    this.active.status = status;
    this.active.phase = 'done';
    this.active.error = error;
    this.active.finishedAt = new Date().toISOString();
    const event: FoodImportDoneEventType = {
      type: 'done',
      runId: this.active.runId,
      status,
      finishedAt: this.active.finishedAt,
    };
    this.publish(event);
    // active 유지 — 직후 SSE 가 마지막 스냅샷을 볼 수 있게. 다음 begin 이 교체.
  }

  abortInflight(): void {
    this.active?.abort.abort();
  }

  runningRunId(): string | null {
    return this.isActive() ? this.active!.runId : null;
  }

  snapshot(): FoodImportRunType | null {
    if (!this.active) return null;
    const a = this.active;
    return {
      runId: a.runId,
      trigger: a.trigger,
      status: a.status,
      phase: TERMINAL.includes(a.status) ? null : a.phase,
      sources: a.sources,
      stats: a.stats,
      classifiedCount: a.classifiedCount,
      progress: TERMINAL.includes(a.status) ? null : { processed: a.processed, total: a.total },
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      error: a.error,
    };
  }

  subscribe(runId: string, fn: FoodImportSubscriber): () => void {
    if (!this.active || this.active.runId !== runId) return () => undefined;
    this.active.subscribers.add(fn);
    return () => {
      this.active?.subscribers.delete(fn);
    };
  }

  private publishProgress(): void {
    if (!this.active) return;
    const a = this.active;
    const event: FoodImportProgressEventType = {
      type: 'progress',
      runId: a.runId,
      phase: a.phase,
      source: a.currentSource,
      processed: a.processed,
      total: a.total,
      message: a.message,
    };
    this.publish(event);
  }

  private publish(event: FoodImportEvent): void {
    if (!this.active) return;
    for (const sub of this.active.subscribers) {
      try {
        sub(event);
      } catch {
        // 구독자 실패는 무시.
      }
    }
  }
}

export const foodImportRegistry = new FoodImportRegistry();
