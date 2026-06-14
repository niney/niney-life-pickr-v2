import { create } from 'zustand';
import type { CrawlModeType } from '@repo/api-contract';

// Multiple in-flight crawl jobs are supported (server-side queue absorbs
// over-cap submissions). Lifting the set to a shared store lets the list
// page and the detail page see the same jobs — kicking one off from detail
// makes the list show its inline progress panel under the matching row,
// and vice versa.
export interface ActiveCrawlJob {
  jobId: string;
  // Known up-front for recrawl/update; null for a fresh "create" until the
  // SSE 'partial' event resolves it.
  placeId: string | null;
  mode: CrawlModeType;
  // Where the list page should anchor the inline panel. Detail-initiated and
  // recrawl/update jobs always have a known placeId so they land as
  // 'list-row'. New-URL jobs start as 'new' and flip to 'list-row' once
  // their placeId resolves.
  source: 'list-row' | 'new';
  // Lifecycle. Starts 'running'; flips to 'done' the moment the job's stream
  // reaches any terminal state (done/error or a transport-level close). A
  // 'done' job intentionally STAYS in the store so its panel can render a
  // completed card (✅ 결과 + 상세 보기 + 닫기) — the user dismisses it
  // explicitly. Only 'running' makes a list row 'busy' (blocks row click /
  // recrawl buttons); a 'done' job leaves the row clickable.
  status: 'running' | 'done';
}

interface ActiveCrawlJobState {
  jobs: Record<string, ActiveCrawlJob>;
  // status is assigned here ('running') — callers don't pass it.
  add: (job: Omit<ActiveCrawlJob, 'status'>) => void;
  remove: (jobId: string) => void;
  // Flip a job to 'done' (kept in the store). Idempotent.
  markDone: (jobId: string) => void;
  resolvePlaceId: (jobId: string, placeId: string) => void;
}

export const useActiveCrawlJobStore = create<ActiveCrawlJobState>((set) => ({
  jobs: {},
  add: (job) =>
    set((s) => {
      const next = { ...s.jobs };
      // Re-crawl/update on a row (or detail) that still shows a finished job's
      // completed card: drop any existing job for the same place so we don't
      // accumulate stale 'done' jobs and the fresh running one wins the panel.
      if (job.placeId) {
        for (const [id, j] of Object.entries(next)) {
          if (j.placeId === job.placeId) delete next[id];
        }
      }
      next[job.jobId] = { ...job, status: 'running' };
      return { jobs: next };
    }),
  markDone: (jobId) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j || j.status === 'done') return s;
      return { jobs: { ...s.jobs, [jobId]: { ...j, status: 'done' } } };
    }),
  remove: (jobId) =>
    set((s) => {
      if (!(jobId in s.jobs)) return s;
      const next = { ...s.jobs };
      delete next[jobId];
      return { jobs: next };
    }),
  resolvePlaceId: (jobId, placeId) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j || j.placeId === placeId) return s;
      return {
        jobs: { ...s.jobs, [jobId]: { ...j, placeId, source: 'list-row' } },
      };
    }),
}));
