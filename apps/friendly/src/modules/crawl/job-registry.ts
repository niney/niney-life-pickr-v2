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
const MAX_CONCURRENT_PER_ACTOR = 3;
const EVENT_BUFFER_MAX = 1000;

export type JobSubscriber = (event: CrawlEventType) => void;

interface InternalJob {
  id: string;
  url: string;
  placeId: string | null;
  actorId: string;
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

export class MaxConcurrentJobsError extends Error {
  constructor(public readonly cap: number) {
    super(`Too many concurrent crawl jobs (cap=${cap})`);
    this.name = 'MaxConcurrentJobsError';
  }
}

export class JobRegistry {
  private readonly jobs = new Map<string, InternalJob>();
  private gcTimer: NodeJS.Timeout | null = null;

  // Find an in-flight job for the same actor + placeId. Used to dedupe
  // double-clicks and concurrent triggers for the same place.
  findInFlightByPlace(actorId: string, placeId: string): string | null {
    for (const j of this.jobs.values()) {
      if (
        j.status === 'running' &&
        j.actorId === actorId &&
        j.placeId === placeId
      ) {
        return j.id;
      }
    }
    return null;
  }

  countActive(actorId: string): number {
    let n = 0;
    for (const j of this.jobs.values()) {
      if (j.status === 'running' && j.actorId === actorId) n += 1;
    }
    return n;
  }

  create(input: {
    url: string;
    placeId: string | null;
    actorId: string;
  }): { id: string; abortSignal: AbortSignal } {
    if (this.countActive(input.actorId) >= MAX_CONCURRENT_PER_ACTOR) {
      throw new MaxConcurrentJobsError(MAX_CONCURRENT_PER_ACTOR);
    }
    const id = randomUUID();
    const job: InternalJob = {
      id,
      url: input.url,
      placeId: input.placeId,
      actorId: input.actorId,
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
      job.finishedAt = event.at;
      job.finishedAtMs = Date.now();
      job.result = event.result;
    } else if (event.type === 'error') {
      job.status = event.error === 'cancelled' ? 'cancelled' : 'failed';
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

  cancel(jobId: string, actorId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.actorId !== actorId) return false;
    if (job.status !== 'running') return false;
    job.abort.abort();
    return true;
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

  // For graceful shutdown.
  abortAll(): void {
    for (const j of this.jobs.values()) {
      if (j.status === 'running') j.abort.abort();
    }
  }
}

export const jobRegistry = new JobRegistry();
