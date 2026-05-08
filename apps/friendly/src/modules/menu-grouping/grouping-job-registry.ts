import { randomUUID } from 'node:crypto';
import type {
  MenuGroupingJobItemType,
  MenuGroupingJobSnapshotType,
  MenuGroupingJobStateType,
} from '@repo/api-contract';

// 메뉴 그룹핑 batch 잡의 in-memory 상태. 서버 재시작 시 in-flight 잡은 사라진다
// (사용자가 재실행 가능 — LLM 비용은 다시 들지만 결과는 idempotent).
//
// crawl/job-registry 와 비슷하지만 단순화 — 외부 리소스(Playwright) 없이 Promise
// 들로만 진행되고, cancel 은 AbortController 한 개로 끝나는 batch 단위.

const FINISHED_TTL_MS = 10 * 60_000;
const EVENT_BUFFER_MAX = 1000;

export type GroupingJobEvent =
  | { type: 'item'; item: MenuGroupingJobItemType }
  | { type: 'done'; state: MenuGroupingJobStateType; finishedAt: string };

export type GroupingJobSubscriber = (event: GroupingJobEvent) => void;

interface InternalJob {
  id: string;
  actorId: string;
  state: MenuGroupingJobStateType;
  startedAt: string;
  finishedAt: string | null;
  finishedAtMs: number | null;
  items: MenuGroupingJobItemType[];
  events: GroupingJobEvent[];
  subscribers: Set<GroupingJobSubscriber>;
  abort: AbortController;
}

export class GroupingJobRegistry {
  private readonly jobs = new Map<string, InternalJob>();
  private gcTimer: NodeJS.Timeout | null = null;

  create(input: {
    actorId: string;
    placeIds: string[];
  }): { id: string; abortSignal: AbortSignal } {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    const items: MenuGroupingJobItemType[] = input.placeIds.map((p) => ({
      placeId: p,
      state: 'pending',
      inputCount: null,
      groupCount: null,
      mappedCount: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
    }));
    const job: InternalJob = {
      id,
      actorId: input.actorId,
      state: 'pending',
      startedAt,
      finishedAt: null,
      finishedAtMs: null,
      items,
      events: [],
      subscribers: new Set(),
      abort: new AbortController(),
    };
    this.jobs.set(id, job);
    this.ensureGcTimer();
    return { id, abortSignal: job.abort.signal };
  }

  // batch 시작 — 첫 item 처리 직전.
  markRunning(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.state === 'pending') job.state = 'running';
  }

  // 한 식당 시작 시 호출 — startedAt 만 채우고 state=running 으로.
  markItemStart(jobId: string, placeId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const it = job.items.find((i) => i.placeId === placeId);
    if (!it) return;
    it.state = 'running';
    it.startedAt = new Date().toISOString();
    this.publish(jobId, { type: 'item', item: { ...it } });
  }

  // 식당 처리 완료(성공/실패/skip) — final state 결정.
  finishItem(
    jobId: string,
    placeId: string,
    outcome:
      | { ok: true; inputCount: number; groupCount: number; mappedCount: number }
      | { ok: false; errorCode: string; errorMessage: string }
      | { skipped: true; reason: string },
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const it = job.items.find((i) => i.placeId === placeId);
    if (!it) return;
    it.finishedAt = new Date().toISOString();
    if ('ok' in outcome && outcome.ok) {
      it.state = 'done';
      it.inputCount = outcome.inputCount;
      it.groupCount = outcome.groupCount;
      it.mappedCount = outcome.mappedCount;
    } else if ('skipped' in outcome) {
      it.state = 'skipped';
      it.errorCode = 'skipped';
      it.errorMessage = outcome.reason;
    } else {
      it.state = 'failed';
      it.errorCode = outcome.errorCode;
      it.errorMessage = outcome.errorMessage;
    }
    this.publish(jobId, { type: 'item', item: { ...it } });
  }

  // 모든 식당 처리 끝 — 잡 자체 종료.
  markFinished(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.state === 'done' || job.state === 'failed') return;
    const anyFailed = job.items.some((i) => i.state === 'failed');
    const allDoneOrSkipped = job.items.every(
      (i) => i.state === 'done' || i.state === 'skipped' || i.state === 'failed',
    );
    if (!allDoneOrSkipped) return;
    // 모두 실패면 failed, 일부라도 성공/skip 이면 done.
    const anySuccess = job.items.some((i) => i.state === 'done' || i.state === 'skipped');
    job.state = anySuccess ? 'done' : 'failed';
    job.finishedAt = new Date().toISOString();
    job.finishedAtMs = Date.now();
    this.publish(jobId, { type: 'done', state: job.state, finishedAt: job.finishedAt });
    void anyFailed; // 변수 사용 — 향후 partial 상태 추가 가능.
  }

  get(id: string, actorId: string): MenuGroupingJobSnapshotType | null {
    const job = this.jobs.get(id);
    if (!job || job.actorId !== actorId) return null;
    return this.toPublic(job);
  }

  // SSE 구독 + replay 데이터. route 측이 재접속 시 최근 events 부터 다시 흘려보낼지
  // 결정. 여기서는 단순화: 새 구독자는 라이브 이벤트만 받고, 재접속 시 GET snapshot
  // 으로 현재 상태 복구. (잡 진행 시간이 짧고 item 단위라 충분.)
  subscribe(id: string, actorId: string, fn: GroupingJobSubscriber): () => void {
    const job = this.jobs.get(id);
    if (!job || job.actorId !== actorId) return () => undefined;
    job.subscribers.add(fn);
    return () => {
      job.subscribers.delete(fn);
    };
  }

  // 사용자가 종료 요청. 진행중이던 LLM 호출은 끝까지 기다려야 함(어댑터 abort
  // 미지원) — 이후 큐의 식당들만 skipped 로 마무리.
  cancel(id: string, actorId: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.actorId !== actorId) return false;
    if (job.state === 'done' || job.state === 'failed') return false;
    job.abort.abort();
    return true;
  }

  abortSignal(id: string): AbortSignal | null {
    return this.jobs.get(id)?.abort.signal ?? null;
  }

  private toPublic(job: InternalJob): MenuGroupingJobSnapshotType {
    const doneCount = job.items.filter((i) => i.state === 'done').length;
    const failedCount = job.items.filter((i) => i.state === 'failed').length;
    const skippedCount = job.items.filter((i) => i.state === 'skipped').length;
    return {
      jobId: job.id,
      state: job.state,
      total: job.items.length,
      doneCount,
      failedCount,
      skippedCount,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      items: job.items.map((i) => ({ ...i })),
    };
  }

  private publish(jobId: string, event: GroupingJobEvent): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.events.length >= EVENT_BUFFER_MAX) job.events.shift();
    job.events.push(event);
    for (const sub of job.subscribers) {
      try {
        sub(event);
      } catch {
        // ignore — subscriber's job to handle its own failures
      }
    }
  }

  private ensureGcTimer(): void {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => this.gc(), 60_000);
    this.gcTimer.unref?.();
  }

  private gc(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.finishedAtMs !== null && now - job.finishedAtMs > FINISHED_TTL_MS) {
        this.jobs.delete(id);
      }
    }
    if (this.jobs.size === 0 && this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }
}

export const groupingJobRegistry = new GroupingJobRegistry();
