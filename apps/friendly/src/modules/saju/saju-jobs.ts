import type { SajuReadingSourceType, SajuSectionIdType, SajuSectionsType } from '@repo/api-contract';

// 섹션 병렬 작업 레지스트리 — POST /saju/readings 가 섹션 4개를 동시에 LLM 에 보내고 즉시 응답한 뒤,
// 클라이언트가 GET /saju/readings/jobs/:id?after=n&wait=ms 로 도착한 섹션을 long-poll 한다.
// 메모리 Map(단일 인스턴스). 완료 후 TTL 이 지나면 지우고, 서버 재시작으로 job 이 없으면 라우트가 410 —
// 클라이언트는 이미 받은 정적 본문을 유지하고 "AI 풀이 다시 시도" 를 보인다(docs/PLAN-saju.md).

export interface SajuJob {
  id: string;
  sections: SajuSectionsType;
  /** 섹션이 확정될 때마다 +1. after 와 비교한다. */
  version: number;
  done: boolean;
  readingId: string | null;
  source: SajuReadingSourceType;
  createdAt: number;
  finishedAt: number | null;
}

export interface SajuJobPollSnapshot {
  jobId: string;
  version: number;
  sections: SajuSectionsType;
  done: boolean;
  readingId: string | null;
  source: SajuReadingSourceType;
}

interface JobEntry extends SajuJob {
  waiters: Set<() => void>;
  pending: Set<SajuSectionIdType>;
  /** 회원 저장이 남아 있으면 true — done 이어도 readingId 가 붙을 때까지 poll 이 기다린다. */
  persistPending: boolean;
}

export interface SajuJobRegistryOptions {
  /** 완료 후 보관(ms). 기본 5분. */
  ttlMs?: number;
  /** 최대 보관 수 — 넘치면 오래된 것부터. 기본 200. */
  max?: number;
  now?: () => number;
}

export class SajuJobRegistry {
  private readonly jobs = new Map<string, JobEntry>();
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly now: () => number;

  constructor(opts: SajuJobRegistryOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 5 * 60_000;
    this.max = opts.max ?? 200;
    this.now = opts.now ?? (() => Date.now());
  }

  get size(): number {
    return this.jobs.size;
  }

  /** 정적 본문(status pending)으로 job 을 만든다. pending 섹션이 하나도 없으면 바로 done.
   *  expectReading 이면 섹션 완료 뒤 저장(attachReading/abandonReading)까지 poll 이 기다린다. */
  create(id: string, sections: SajuSectionsType, pending: readonly SajuSectionIdType[], opts: { expectReading?: boolean } = {}): SajuJob {
    this.evict();
    const entry: JobEntry = {
      id,
      sections,
      version: 0,
      done: pending.length === 0,
      readingId: null,
      source: 'static',
      createdAt: this.now(),
      finishedAt: pending.length === 0 ? this.now() : null,
      waiters: new Set(),
      pending: new Set(pending),
      persistPending: !!opts.expectReading,
    };
    this.jobs.set(id, entry);
    return entry;
  }

  get(id: string): SajuJob | null {
    const e = this.jobs.get(id);
    return e ?? null;
  }

  /** 섹션 확정(LLM 성공 → ready, 실패 → static). 마지막 섹션이면 done. */
  settle<K extends SajuSectionIdType>(id: string, section: K, value: SajuSectionsType[K]): void {
    const e = this.jobs.get(id);
    if (!e) return;
    e.sections = { ...e.sections, [section]: value };
    e.pending.delete(section);
    e.version += 1;
    if (e.pending.size === 0) {
      e.done = true;
      e.finishedAt = this.now();
      e.source = sourceOf(e.sections);
    }
    this.notify(e);
  }

  /** 저장이 끝난 뒤 readingId 를 붙인다(poll 결과에 실린다). */
  attachReading(id: string, readingId: string): void {
    const e = this.jobs.get(id);
    if (!e) return;
    e.readingId = readingId;
    e.persistPending = false;
    e.version += 1;
    this.notify(e);
  }

  /** 저장 실패 — readingId 없이 마무리(poll 이 더 기다리지 않게). */
  abandonReading(id: string): void {
    const e = this.jobs.get(id);
    if (!e) return;
    e.persistPending = false;
    e.version += 1;
    this.notify(e);
  }

  /** after 보다 큰 버전이 생기거나 waitMs 가 지나면 스냅샷. 없는 job 이면 null.
   *  섹션·저장이 전부 끝난(finalized) job 은 기다리지 않는다. */
  async wait(id: string, after: number, waitMs: number): Promise<SajuJobPollSnapshot | null> {
    const e = this.jobs.get(id);
    if (!e) return null;
    const finalized = e.done && !e.persistPending;
    if (e.version > after || finalized || waitMs <= 0) return snapshot(e);
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const wake = (): void => {
        if (timer) clearTimeout(timer);
        e.waiters.delete(wake);
        resolve();
      };
      timer = setTimeout(wake, waitMs);
      e.waiters.add(wake);
    });
    const again = this.jobs.get(id);
    return again ? snapshot(again) : null;
  }

  /** 테스트·종료용. */
  clear(): void {
    for (const e of this.jobs.values()) this.notify(e);
    this.jobs.clear();
  }

  private notify(e: JobEntry): void {
    for (const w of [...e.waiters]) w();
  }

  private evict(): void {
    const now = this.now();
    for (const [id, e] of this.jobs) {
      if (e.finishedAt !== null && now - e.finishedAt > this.ttlMs) this.jobs.delete(id);
      // 끝나지 않은 채 30분이 지난 job 은 유령 — 지운다.
      else if (e.finishedAt === null && now - e.createdAt > 30 * 60_000) this.jobs.delete(id);
    }
    while (this.jobs.size >= this.max) {
      const oldest = this.jobs.keys().next().value;
      if (oldest === undefined) break;
      this.jobs.delete(oldest);
    }
  }
}

export const sourceOf = (sections: SajuSectionsType): SajuReadingSourceType => {
  const list = Object.values(sections).map((s) => s.source);
  if (list.every((s) => s === 'llm')) return 'llm';
  if (list.every((s) => s === 'static')) return 'static';
  return 'mixed';
};

const snapshot = (e: JobEntry): SajuJobPollSnapshot => ({
  jobId: e.id,
  version: e.version,
  sections: e.sections,
  done: e.done,
  readingId: e.readingId,
  source: e.done ? e.source : sourceOf(e.sections),
});
