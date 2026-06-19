import { randomUUID } from 'node:crypto';
import type {
  RandomCrawlCandidateType,
  RandomCrawlDoneEventType,
  RandomCrawlPhaseType,
  RandomCrawlProgressEventType,
  RandomCrawlRunStatusType,
  RandomCrawlRunType,
  RandomCrawlTriggerType,
} from '@repo/api-contract';

// 자동 발굴의 인프로세스 live 상태(SSE용). 진실의 원천은 DB(RandomCrawlRun) 이고
// 이 레지스트리는 어드민 화면 실시간 표시를 위한 부가 채널이다. 그래서 awaiting
// 대기 중 서버가 재시작돼 레지스트리가 비어도 DB 로 흐름은 이어진다.
//
// 동시 1개 — 한 회차(검색→대기→크롤)가 시스템 전체 작업이라 중첩 의미 없음.
// 단, 진짜 overlap 가드는 서비스의 DB 조회가 책임진다(재시작 안전). 레지스트리
// begin 은 같은 프로세스 내 경쟁만 막는 보조 가드.

export type RandomCrawlEvent =
  | RandomCrawlProgressEventType
  | RandomCrawlDoneEventType;
export type RandomCrawlSubscriber = (event: RandomCrawlEvent) => void;

interface ActiveRun {
  runId: string;
  trigger: RandomCrawlTriggerType;
  status: RandomCrawlRunStatusType;
  phase: RandomCrawlPhaseType;
  regionLabel: string | null;
  keyword: string | null;
  candidates: RandomCrawlCandidateType[];
  startedAt: string;
  finishedAt: string | null;
  abort: AbortController;
  subscribers: Set<RandomCrawlSubscriber>;
}

const TERMINAL: RandomCrawlRunStatusType[] = [
  'done',
  'skipped',
  'failed',
  'interrupted',
];

export class RandomCrawlRegistry {
  private active: ActiveRun | null = null;

  // 같은 프로세스에서 이미 진행 중(비종료)이면 true.
  isActive(): boolean {
    return this.active !== null && !TERMINAL.includes(this.active.status);
  }

  // 보조 in-process 가드 — 이미 active 면 null.
  begin(
    trigger: RandomCrawlTriggerType,
  ): { runId: string; signal: AbortSignal } | null {
    if (this.isActive()) return null;
    const runId = randomUUID();
    const abort = new AbortController();
    this.active = {
      runId,
      trigger,
      status: 'running',
      phase: 'selecting_region',
      regionLabel: null,
      keyword: null,
      candidates: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      abort,
      subscribers: new Set(),
    };
    return { runId, signal: abort.signal };
  }

  setPhase(
    phase: RandomCrawlPhaseType,
    opts?: {
      regionLabel?: string | null;
      keyword?: string | null;
      candidates?: RandomCrawlCandidateType[];
    },
  ): void {
    if (!this.active) return;
    this.active.phase = phase;
    if (opts?.regionLabel !== undefined) this.active.regionLabel = opts.regionLabel;
    if (opts?.keyword !== undefined) this.active.keyword = opts.keyword;
    if (opts?.candidates !== undefined) this.active.candidates = opts.candidates;
    this.publishProgress();
  }

  finish(status: RandomCrawlRunStatusType): void {
    if (!this.active) return;
    this.active.status = status;
    this.active.phase = 'done';
    this.active.finishedAt = new Date().toISOString();
    const event: RandomCrawlDoneEventType = {
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

  // 현재 진행 중(비종료) run id — UI 가 SSE 붙을 대상.
  runningRunId(): string | null {
    return this.isActive() ? this.active!.runId : null;
  }

  snapshot(): RandomCrawlRunType | null {
    if (!this.active) return null;
    const a = this.active;
    return {
      runId: a.runId,
      trigger: a.trigger,
      status: a.status,
      phase: a.phase,
      regionLabel: a.regionLabel,
      keyword: a.keyword,
      candidates: a.candidates,
      selectedPlaceId: a.candidates.find((c) => c.selected)?.placeId ?? null,
      crawledRestaurantId: null,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      error: null,
    };
  }

  subscribe(runId: string, fn: RandomCrawlSubscriber): () => void {
    if (!this.active || this.active.runId !== runId) return () => undefined;
    this.active.subscribers.add(fn);
    return () => {
      this.active?.subscribers.delete(fn);
    };
  }

  private publishProgress(): void {
    if (!this.active) return;
    const a = this.active;
    const event: RandomCrawlProgressEventType = {
      type: 'progress',
      runId: a.runId,
      phase: a.phase,
      regionLabel: a.regionLabel,
      candidates: a.candidates,
    };
    this.publish(event);
  }

  private publish(event: RandomCrawlEvent): void {
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

export const randomCrawlRegistry = new RandomCrawlRegistry();
