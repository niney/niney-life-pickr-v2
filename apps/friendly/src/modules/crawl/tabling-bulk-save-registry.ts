import { randomUUID } from 'node:crypto';
import type {
  TablingBulkSaveJobItemType,
  TablingBulkSaveJobSnapshotType,
  TablingBulkSaveJobStateType,
} from '@repo/api-contract';

// 테이블링 일괄 저장 잡의 in-memory 상태. 다이닝코드 일괄 저장 레지스트리와 동형 —
// 단순 batch + AbortController 1개 + per-item progress + 종료. 키는 idx(number).
// 서버 재시작 시 in-flight 잡은 사라지지만, 어드민이 다시 실행 가능.

const FINISHED_TTL_MS = 10 * 60_000;
const EVENT_BUFFER_MAX = 1000;

export type TablingBulkSaveJobEvent =
  | { type: 'item'; item: TablingBulkSaveJobItemType }
  | { type: 'done'; state: TablingBulkSaveJobStateType; finishedAt: string };

export type TablingBulkSaveJobSubscriber = (event: TablingBulkSaveJobEvent) => void;

interface InternalJob {
  id: string;
  actorId: string;
  state: TablingBulkSaveJobStateType;
  startedAt: string;
  finishedAt: string | null;
  finishedAtMs: number | null;
  items: TablingBulkSaveJobItemType[];
  events: TablingBulkSaveJobEvent[];
  subscribers: Set<TablingBulkSaveJobSubscriber>;
  abort: AbortController;
}

export class TablingBulkSaveRegistry {
  private readonly jobs = new Map<string, InternalJob>();
  private gcTimer: NodeJS.Timeout | null = null;

  create(input: { actorId: string; idxs: number[] }): {
    id: string;
    abortSignal: AbortSignal;
  } {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    const items: TablingBulkSaveJobItemType[] = input.idxs.map((idx) => ({
      idx,
      state: 'pending',
      restaurantId: null,
      fetchedPages: null,
      newReviewCount: null,
      autoMatched: null,
      matchedCanonicalId: null,
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

  markRunning(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.state === 'pending') job.state = 'running';
  }

  markItemStart(jobId: string, idx: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const it = job.items.find((i) => i.idx === idx);
    if (!it) return;
    it.state = 'running';
    it.startedAt = new Date().toISOString();
    this.publish(jobId, { type: 'item', item: { ...it } });
  }

  finishItem(
    jobId: string,
    idx: number,
    outcome:
      | {
          ok: true;
          restaurantId: string;
          fetchedPages: number;
          newReviewCount: number;
          autoMatched: boolean;
          matchedCanonicalId: string | null;
        }
      | { ok: false; errorCode: string; errorMessage: string }
      | { skipped: true; reason: string },
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const it = job.items.find((i) => i.idx === idx);
    if (!it) return;
    it.finishedAt = new Date().toISOString();
    if ('ok' in outcome && outcome.ok) {
      it.state = 'done';
      it.restaurantId = outcome.restaurantId;
      it.fetchedPages = outcome.fetchedPages;
      it.newReviewCount = outcome.newReviewCount;
      it.autoMatched = outcome.autoMatched;
      it.matchedCanonicalId = outcome.matchedCanonicalId;
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

  markFinished(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.state === 'done' || job.state === 'failed') return;
    const terminal = job.items.every(
      (i) => i.state === 'done' || i.state === 'skipped' || i.state === 'failed',
    );
    if (!terminal) return;
    const anySuccess = job.items.some(
      (i) => i.state === 'done' || i.state === 'skipped',
    );
    job.state = anySuccess ? 'done' : 'failed';
    job.finishedAt = new Date().toISOString();
    job.finishedAtMs = Date.now();
    this.publish(jobId, {
      type: 'done',
      state: job.state,
      finishedAt: job.finishedAt,
    });
  }

  get(id: string, actorId: string): TablingBulkSaveJobSnapshotType | null {
    const job = this.jobs.get(id);
    if (!job || job.actorId !== actorId) return null;
    return this.toPublic(job);
  }

  subscribe(
    id: string,
    actorId: string,
    fn: TablingBulkSaveJobSubscriber,
  ): () => void {
    const job = this.jobs.get(id);
    if (!job || job.actorId !== actorId) return () => undefined;
    job.subscribers.add(fn);
    return () => {
      job.subscribers.delete(fn);
    };
  }

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

  private toPublic(job: InternalJob): TablingBulkSaveJobSnapshotType {
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

  private publish(jobId: string, event: TablingBulkSaveJobEvent): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.events.length >= EVENT_BUFFER_MAX) job.events.shift();
    job.events.push(event);
    for (const sub of job.subscribers) {
      try {
        sub(event);
      } catch {
        // ignore — subscriber failure is its own problem
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
}

export const tablingBulkSaveRegistry = new TablingBulkSaveRegistry();
