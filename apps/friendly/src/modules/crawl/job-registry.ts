import { randomUUID } from 'node:crypto';
import type {
  CrawlEventType,
  CrawlJobStatusType,
  CrawlJobType,
  CrawlNaverPlaceResultType,
  CrawlStageType,
} from '@repo/api-contract';

// In-memory job state. Single Fastify instance per CLAUDE.md — no external
// queue/Redis. Server restart drops all in-flight jobs (Playwright browser
// dies anyway, so persistence wouldn't help).
//
// Events are kept in full so SSE reconnects can replay from any seq. With
// ~30-40 events per crawl, memory cost is trivial; we still cap per job at
// EVENT_BUFFER_MAX as a safety belt against runaway adapters.

const FINISHED_TTL_MS = 5 * 60_000;
export const MAX_CONCURRENT_PER_ACTOR = 5;
const EVENT_BUFFER_MAX = 1000;

export type JobSubscriber = (event: CrawlEventType) => void;

// Internal lifecycle. Public `status` stays as the existing 4-value enum
// (running/done/failed/cancelled) so the API surface doesn't change — both
// 'queued' and 'active' phases publicly look like 'running', distinguished
// by the `stage` field.
type JobPhase = 'queued' | 'active' | 'finished';

interface InternalJob {
  id: string;
  url: string;
  placeId: string | null;
  actorId: string;
  phase: JobPhase;
  status: CrawlJobStatusType;
  stage: CrawlStageType;
  startedAt: string;
  finishedAt: string | null;
  visitorCount: number;
  events: CrawlEventType[];
  subscribers: Set<JobSubscriber>;
  abort: AbortController;
  result: CrawlNaverPlaceResultType | null;
  // For TTL GC. Set when status moves out of 'running'.
  finishedAtMs: number | null;
}

export type CancelOutcome = 'aborted' | 'queued-cancelled' | 'noop';

// 슬롯을 기다리는 잡의 시작 함수(actor 별 FIFO). 슬롯 집계(countActive)와 같은 곳에 둬야
// 어떤 CrawlService 인스턴스의 잡이 끝나든 다음 대기 잡이 시작된다 — 예전엔 인스턴스
// 필드라 다른 인스턴스가 슬롯을 비워도 큐에 든 잡이 영영 시작되지 않았다.
interface PendingStart {
  jobId: string;
  actorId: string;
  start: () => void;
}

export type WaitOutcome = 'terminal' | 'timeout' | 'missing';

// Kept exported for backward-compat with callers that imported it; never
// thrown anymore — the queue absorbs over-cap requests instead.
export class MaxConcurrentJobsError extends Error {
  constructor(public readonly cap: number) {
    super(`Too many concurrent crawl jobs (cap=${cap})`);
    this.name = 'MaxConcurrentJobsError';
  }
}

export class JobRegistry {
  private readonly jobs = new Map<string, InternalJob>();
  private readonly pending: PendingStart[] = [];
  private gcTimer: NodeJS.Timeout | null = null;

  // Find an in-flight job for the same actor + placeId — dedup double-clicks
  // and concurrent triggers. Includes both queued and active phases, so a
  // user that clicks while the first request is still queued doesn't end up
  // with two duplicate queue entries.
  findInFlightByPlace(actorId: string, placeId: string): string | null {
    for (const j of this.jobs.values()) {
      if (
        j.phase !== 'finished' &&
        j.actorId === actorId &&
        j.placeId === placeId
      ) {
        return j.id;
      }
    }
    return null;
  }

  // Actor-agnostic check: is *anyone* currently crawling this place? The
  // periodic scheduler is a system job (no single actor), so it must skip a
  // restaurant whose crawl is in flight regardless of who triggered it —
  // re-grouping mid-crawl would race against reviews still being persisted.
  isPlaceCrawling(placeId: string): boolean {
    for (const j of this.jobs.values()) {
      if (j.phase !== 'finished' && j.placeId === placeId) return true;
    }
    return false;
  }

  // Counts only jobs that are *actually consuming a slot* (Playwright running).
  // Queued jobs do not count toward the cap — that's the whole point of the
  // queue.
  countActive(actorId: string): number {
    let n = 0;
    for (const j of this.jobs.values()) {
      if (j.phase === 'active' && j.actorId === actorId) n += 1;
    }
    return n;
  }

  hasSlotForActor(actorId: string): boolean {
    return this.countActive(actorId) < MAX_CONCURRENT_PER_ACTOR;
  }

  // Always succeeds. Caller (CrawlService) decides whether to immediately
  // promote the job to 'active' (via markActive) or leave it queued. The
  // initial stage is 'queued' so a subscriber that connects right away sees
  // the waiting state without us having to emit an extra event.
  create(input: {
    url: string;
    placeId: string | null;
    actorId: string;
  }): { id: string; abortSignal: AbortSignal } {
    const id = randomUUID();
    const job: InternalJob = {
      id,
      url: input.url,
      placeId: input.placeId,
      actorId: input.actorId,
      phase: 'queued',
      status: 'running',
      stage: 'queued',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      visitorCount: 0,
      events: [],
      subscribers: new Set(),
      abort: new AbortController(),
      result: null,
      finishedAtMs: null,
    };
    this.jobs.set(id, job);
    this.ensureGcTimer();
    return { id, abortSignal: job.abort.signal };
  }

  markActive(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.phase === 'queued') job.phase = 'active';
  }

  // 슬롯이 없어 대기열에 올린다. 시작은 takeQueued 를 부른 쪽(슬롯을 비운 잡)이 한다.
  enqueue(jobId: string, actorId: string, start: () => void): void {
    this.pending.push({ jobId, actorId, start });
  }

  // 그 actor 의 다음 대기 잡 시작 함수(FIFO). 취소·종료된 잡의 항목은 건너뛰며 버린다.
  takeQueued(actorId: string): (() => void) | null {
    for (let i = 0; i < this.pending.length; ) {
      const p = this.pending[i]!;
      if (p.actorId !== actorId) {
        i += 1;
        continue;
      }
      this.pending.splice(i, 1);
      if (this.jobs.get(p.jobId)?.phase === 'queued') return p.start;
    }
    return null;
  }

  pendingCount(actorId?: string): number {
    return actorId === undefined
      ? this.pending.length
      : this.pending.filter((p) => p.actorId === actorId).length;
  }

  // 잡이 끝날 때(done/error)까지 대기. 상한을 넘기면 'timeout' — 호출자(자동 발견·랜덤 크롤)가
  // 무한 대기하지 않게 하는 안전망. 이미 끝났거나(캐시 히트 등) 레지스트리에서 사라졌으면 즉시.
  waitForTerminal(jobId: string, timeoutMs: number): Promise<WaitOutcome> {
    const job = this.jobs.get(jobId);
    if (!job) return Promise.resolve('missing');
    if (job.status !== 'running') return Promise.resolve('terminal');
    return new Promise<WaitOutcome>((resolve) => {
      // finish 는 구독 콜백·타이머에서만 불린다(둘 다 아래 선언이 끝난 뒤 비동기로 발생).
      const finish = (outcome: WaitOutcome): void => {
        clearTimeout(timer);
        unsubscribe();
        resolve(outcome);
      };
      const unsubscribe = this.subscribe(jobId, (ev) => {
        if (ev.type === 'done' || ev.type === 'error') finish('terminal');
      });
      const timer = setTimeout(() => finish('timeout'), timeoutMs);
      timer.unref?.();
    });
  }

  get(id: string): InternalJob | null {
    return this.jobs.get(id) ?? null;
  }

  toPublic(job: InternalJob): CrawlJobType {
    return {
      id: job.id,
      url: job.url,
      placeId: job.placeId,
      status: job.status,
      stage: job.stage,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      visitorCount: job.visitorCount,
      result: job.result,
    };
  }

  list(actorId: string): CrawlJobType[] {
    const out: CrawlJobType[] = [];
    for (const j of this.jobs.values()) {
      if (j.actorId === actorId) out.push(this.toPublic(j));
    }
    out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return out;
  }

  // Append an event, fan out to live subscribers, and update the job's
  // denormalized snapshot fields (stage / visitorCount / status / result).
  // Subscribers are wrapped in try/catch so one slow consumer can't break
  // the others — but adapters should not depend on event delivery success.
  addEvent(jobId: string, event: CrawlEventType): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.events.length >= EVENT_BUFFER_MAX) {
      // Drop the oldest non-terminal event. Terminal events (done/error) are
      // load-bearing for late subscribers and must be preserved — but we
      // shouldn't reach the cap with our current adapter, so this is a
      // backstop only.
      job.events.shift();
    }
    job.events.push(event);

    if (event.type === 'progress') {
      job.stage = event.stage;
    } else if (event.type === 'visitor_progress') {
      job.visitorCount = event.count;
    } else if (event.type === 'visitor_batch') {
      // visitor_progress already tracks the cumulative *fetched* count from
      // the wire; visitor_batch is about persisted-and-queued reviews. We
      // intentionally don't overwrite visitorCount here so the wire-side
      // counter keeps showing real-time pagination progress.
    } else if (event.type === 'partial') {
      job.stage = 'paginating_visitor';
    } else if (event.type === 'done') {
      job.stage = 'done';
      job.status = event.result.ok ? 'done' : 'failed';
      job.phase = 'finished';
      job.finishedAt = event.at;
      job.finishedAtMs = Date.now();
      job.result = event.result;
    } else if (event.type === 'error') {
      job.status = event.error === 'cancelled' ? 'cancelled' : 'failed';
      job.phase = 'finished';
      job.finishedAt = event.at;
      job.finishedAtMs = Date.now();
      job.result = {
        ok: false,
        error: event.error,
        message: event.message,
        triedUrl: job.url,
      };
    }

    for (const sub of job.subscribers) {
      try {
        sub(event);
      } catch {
        // ignore — subscriber's job to handle its own failures
      }
    }
  }

  // Subscribe to live events. Returns past events too — the route handler
  // is responsible for filtering by Last-Event-ID/afterSeq before invoking
  // the live subscription. This split keeps replay logic in the route.
  subscribe(jobId: string, fn: JobSubscriber): () => void {
    const job = this.jobs.get(jobId);
    if (!job) return () => undefined;
    job.subscribers.add(fn);
    return () => {
      job.subscribers.delete(fn);
    };
  }

  // Cancel either an active job (abort the Playwright run) or a queued one
  // (caller is responsible for emitting the 'cancelled' error event so seq
  // numbering stays under the service's control). 대기 잡은 대기열에서 빼고
  // abort 도 건다 — 시작 준비 중(startRun await)인 startCrawl 이 취소를 알아채게.
  cancel(jobId: string, actorId: string): CancelOutcome {
    const job = this.jobs.get(jobId);
    if (!job) return 'noop';
    if (job.actorId !== actorId) return 'noop';
    if (job.phase === 'finished') return 'noop';
    job.abort.abort();
    if (job.phase === 'active') return 'aborted';
    this.dropPending(jobId);
    return 'queued-cancelled';
  }

  private dropPending(jobId: string): void {
    const idx = this.pending.findIndex((p) => p.jobId === jobId);
    if (idx >= 0) this.pending.splice(idx, 1);
  }

  // Sweep finished jobs after TTL. Runs every minute while jobs exist.
  private ensureGcTimer(): void {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => this.gc(), 60_000);
    // Don't keep the event loop alive for cleanup alone.
    this.gcTimer.unref?.();
  }

  private gc(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (
        job.finishedAtMs !== null &&
        now - job.finishedAtMs > FINISHED_TTL_MS
      ) {
        this.jobs.delete(id);
      }
    }
    if (this.jobs.size === 0 && this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  // For graceful shutdown. 대기열도 비운다 — 진행 중 잡이 abort 로 끝나며 슬롯이 나도
  // 종료 중에 대기 잡이 새로 시작(브라우저 launch)되지 않게.
  abortAll(): void {
    this.pending.length = 0;
    for (const j of this.jobs.values()) {
      if (j.phase !== 'finished') j.abort.abort();
    }
  }
}

export const jobRegistry = new JobRegistry();
