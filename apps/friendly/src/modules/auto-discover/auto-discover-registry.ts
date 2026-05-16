import { randomUUID } from 'node:crypto';
import type {
  AutoDiscoverCandidateType,
  AutoDiscoverJobInputType,
  AutoDiscoverJobSnapshotType,
  AutoDiscoverJobStateType,
  AutoDiscoverKeywordType,
  AutoDiscoverPhaseType,
} from '@repo/api-contract';

// 자동 발견 잡의 in-memory 상태. diningcode-bulk-save-registry / grouping-job-registry
// 와 동형 — 단순 단일 액터 1잡 + AbortController + per-item progress + 종료.
// 다른 점: items 가 두 종류(키워드 8개 + 후보 N개) 라 publish 도 두 갈래.
// 서버 재시작 시 in-flight 잡은 사라진다 (사용자가 재실행 가능 — AI/검색 비용은
// 다시 들지만 등록 자체는 idempotent).

const FINISHED_TTL_MS = 10 * 60_000;
const EVENT_BUFFER_MAX = 2000;

export type AutoDiscoverJobEvent =
  | { type: 'keyword'; keyword: AutoDiscoverKeywordType }
  | { type: 'candidate'; candidate: AutoDiscoverCandidateType }
  | {
      type: 'phase';
      phase: AutoDiscoverPhaseType;
      newlyRegistered: number;
    }
  | {
      type: 'done';
      state: AutoDiscoverJobStateType;
      finishedAt: string;
    };

export type AutoDiscoverJobSubscriber = (event: AutoDiscoverJobEvent) => void;

interface InternalJob {
  id: string;
  actorId: string;
  state: AutoDiscoverJobStateType;
  phase: AutoDiscoverPhaseType;
  input: AutoDiscoverJobInputType;
  startedAt: string;
  finishedAt: string | null;
  finishedAtMs: number | null;
  keywords: Map<string, AutoDiscoverKeywordType>;
  // 안정적인 키워드 표시 순서 (AI 응답 순). Map 은 삽입 순 보존이지만 명시적으로 추적.
  keywordOrder: string[];
  candidates: Map<string, AutoDiscoverCandidateType>;
  // 후보의 안정적인 표시 순서 (그룹 인덱스 → 그 안에서 처음 추가된 순).
  candidateOrder: string[];
  newlyRegistered: number;
  events: AutoDiscoverJobEvent[];
  subscribers: Set<AutoDiscoverJobSubscriber>;
  abort: AbortController;
}

export class AutoDiscoverRegistry {
  private readonly jobs = new Map<string, InternalJob>();
  private gcTimer: NodeJS.Timeout | null = null;

  // 같은 actor 의 진행 중 잡이 있으면 null 반환 — 라우트가 409 로 변환.
  // 자동 발견은 AI/검색/크롤 모두 무거워 동시 여러 잡은 의도적으로 막는다.
  findInFlightByActor(actorId: string): string | null {
    for (const j of this.jobs.values()) {
      if (j.actorId === actorId && (j.state === 'pending' || j.state === 'running')) {
        return j.id;
      }
    }
    return null;
  }

  create(input: {
    actorId: string;
    input: AutoDiscoverJobInputType;
  }): { id: string; abortSignal: AbortSignal } {
    const id = randomUUID();
    const job: InternalJob = {
      id,
      actorId: input.actorId,
      state: 'pending',
      phase: 'queued',
      input: input.input,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      finishedAtMs: null,
      keywords: new Map(),
      keywordOrder: [],
      candidates: new Map(),
      candidateOrder: [],
      newlyRegistered: 0,
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

  setPhase(jobId: string, phase: AutoDiscoverPhaseType): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.phase = phase;
    this.publish(jobId, {
      type: 'phase',
      phase,
      newlyRegistered: job.newlyRegistered,
    });
  }

  // 키워드 한 줄 upsert + publish. AI 응답 순으로 처음 등록되고, 이후 검색 결과로
  // searchedAt/hitCount 가 채워질 때마다 같은 키로 다시 호출.
  upsertKeyword(
    jobId: string,
    keyword: AutoDiscoverKeywordType,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (!job.keywords.has(keyword.keyword)) {
      job.keywordOrder.push(keyword.keyword);
    }
    job.keywords.set(keyword.keyword, keyword);
    this.publish(jobId, { type: 'keyword', keyword });
  }

  // 후보 한 건 upsert + publish. placeId 키.
  upsertCandidate(
    jobId: string,
    candidate: AutoDiscoverCandidateType,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (!job.candidates.has(candidate.placeId)) {
      job.candidateOrder.push(candidate.placeId);
    }
    job.candidates.set(candidate.placeId, candidate);
    this.publish(jobId, { type: 'candidate', candidate });
  }

  // 등록 성공 시 호출 — newlyRegistered 카운트 증가. 동시 호출 안전(단일 노드,
  // 단일 이벤트 루프).
  incrementNewlyRegistered(jobId: string): number {
    const job = this.jobs.get(jobId);
    if (!job) return 0;
    job.newlyRegistered += 1;
    return job.newlyRegistered;
  }

  getNewlyRegistered(jobId: string): number {
    return this.jobs.get(jobId)?.newlyRegistered ?? 0;
  }

  markFinished(jobId: string, finalState: AutoDiscoverJobStateType): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (
      job.state === 'done' ||
      job.state === 'failed' ||
      job.state === 'cancelled'
    ) {
      return;
    }
    job.state = finalState;
    job.phase = 'done';
    job.finishedAt = new Date().toISOString();
    job.finishedAtMs = Date.now();
    this.publish(jobId, {
      type: 'done',
      state: job.state,
      finishedAt: job.finishedAt,
    });
  }

  get(id: string, actorId: string): AutoDiscoverJobSnapshotType | null {
    const job = this.jobs.get(id);
    if (!job || job.actorId !== actorId) return null;
    return this.toPublic(job);
  }

  subscribe(
    id: string,
    actorId: string,
    fn: AutoDiscoverJobSubscriber,
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
    if (
      job.state === 'done' ||
      job.state === 'failed' ||
      job.state === 'cancelled'
    ) {
      return false;
    }
    job.abort.abort();
    return true;
  }

  abortSignal(id: string): AbortSignal | null {
    return this.jobs.get(id)?.abort.signal ?? null;
  }

  // 테스트 용 — 잡 전부 비우기.
  reset(): void {
    this.jobs.clear();
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  private toPublic(job: InternalJob): AutoDiscoverJobSnapshotType {
    return {
      jobId: job.id,
      state: job.state,
      phase: job.phase,
      input: job.input,
      keywords: job.keywordOrder.map((k) => job.keywords.get(k)!),
      candidates: job.candidateOrder.map((p) => job.candidates.get(p)!),
      newlyRegistered: job.newlyRegistered,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }

  private publish(jobId: string, event: AutoDiscoverJobEvent): void {
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

export const autoDiscoverRegistry = new AutoDiscoverRegistry();
