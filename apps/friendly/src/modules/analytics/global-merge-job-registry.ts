import { randomUUID } from 'node:crypto';
import type {
  GlobalMergeJobChunkProgressType,
  GlobalMergeJobSnapshotType,
  GlobalMergeJobStateType,
} from '@repo/api-contract';

// 글로벌 머지 잡 — 단일 잡 (식당별이 아니라 시스템 전체 한 번 실행).
// 한 번에 하나만 돌도록 inflight 가드 — 동시 실행 시 충돌 방지.

const FINISHED_TTL_MS = 10 * 60_000;

export type GlobalMergeJobEvent =
  | { type: 'chunk'; progress: GlobalMergeJobChunkProgressType }
  | {
      type: 'done';
      state: GlobalMergeJobStateType;
      finalGroupCount: number;
      finishedAt: string;
    };

export type GlobalMergeJobSubscriber = (event: GlobalMergeJobEvent) => void;

interface InternalJob {
  id: string;
  actorId: string;
  state: GlobalMergeJobStateType;
  inputCount: number;
  finalGroupCount: number;
  totalChunks: number;
  doneChunks: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  finishedAtMs: number | null;
  subscribers: Set<GlobalMergeJobSubscriber>;
}

export class GlobalMergeJobRegistry {
  private readonly jobs = new Map<string, InternalJob>();
  private gcTimer: NodeJS.Timeout | null = null;

  // 한 번에 하나만 — 이미 진행 중인 잡이 있으면 그 id 반환.
  inflightJobId(): string | null {
    for (const j of this.jobs.values()) {
      if (j.state === 'pending' || j.state === 'running') return j.id;
    }
    return null;
  }

  create(input: { actorId: string }): string {
    const id = randomUUID();
    const job: InternalJob = {
      id,
      actorId: input.actorId,
      state: 'pending',
      inputCount: 0,
      finalGroupCount: 0,
      totalChunks: 0,
      doneChunks: 0,
      errorCode: null,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      finishedAtMs: null,
      subscribers: new Set(),
    };
    this.jobs.set(id, job);
    this.ensureGcTimer();
    return id;
  }

  markRunning(jobId: string, inputCount: number, totalChunks: number): void {
    const j = this.jobs.get(jobId);
    if (!j) return;
    j.state = 'running';
    j.inputCount = inputCount;
    j.totalChunks = totalChunks;
  }

  recordChunk(jobId: string, progress: GlobalMergeJobChunkProgressType): void {
    const j = this.jobs.get(jobId);
    if (!j) return;
    j.doneChunks += 1;
    // totalChunks 가 늦게 결정되는 케이스(pass2 가 추가됨) 보정.
    if (j.doneChunks > j.totalChunks) j.totalChunks = j.doneChunks;
    this.publish(jobId, { type: 'chunk', progress });
  }

  markDone(jobId: string, finalGroupCount: number): void {
    const j = this.jobs.get(jobId);
    if (!j) return;
    j.state = 'done';
    j.finalGroupCount = finalGroupCount;
    j.finishedAt = new Date().toISOString();
    j.finishedAtMs = Date.now();
    this.publish(jobId, {
      type: 'done',
      state: 'done',
      finalGroupCount,
      finishedAt: j.finishedAt,
    });
  }

  markFailed(jobId: string, errorCode: string, errorMessage: string): void {
    const j = this.jobs.get(jobId);
    if (!j) return;
    j.state = 'failed';
    j.errorCode = errorCode;
    j.errorMessage = errorMessage;
    j.finishedAt = new Date().toISOString();
    j.finishedAtMs = Date.now();
    this.publish(jobId, {
      type: 'done',
      state: 'failed',
      finalGroupCount: j.finalGroupCount,
      finishedAt: j.finishedAt,
    });
  }

  get(id: string, actorId: string): GlobalMergeJobSnapshotType | null {
    const j = this.jobs.get(id);
    if (!j || j.actorId !== actorId) return null;
    return {
      jobId: j.id,
      state: j.state,
      inputCount: j.inputCount,
      finalGroupCount: j.finalGroupCount,
      totalChunks: j.totalChunks,
      doneChunks: j.doneChunks,
      errorCode: j.errorCode,
      errorMessage: j.errorMessage,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
    };
  }

  subscribe(id: string, actorId: string, fn: GlobalMergeJobSubscriber): () => void {
    const j = this.jobs.get(id);
    if (!j || j.actorId !== actorId) return () => undefined;
    j.subscribers.add(fn);
    return () => {
      j.subscribers.delete(fn);
    };
  }

  private publish(jobId: string, event: GlobalMergeJobEvent): void {
    const j = this.jobs.get(jobId);
    if (!j) return;
    for (const sub of j.subscribers) {
      try {
        sub(event);
      } catch {
        // ignore
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

export const globalMergeJobRegistry = new GlobalMergeJobRegistry();
