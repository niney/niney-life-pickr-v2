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
}

interface ActiveCrawlJobState {
  jobs: Record<string, ActiveCrawlJob>;
  add: (job: ActiveCrawlJob) => void;
  remove: (jobId: string) => void;
  resolvePlaceId: (jobId: string, placeId: string) => void;
}

export const useActiveCrawlJobStore = create<ActiveCrawlJobState>((set) => ({
  jobs: {},
  add: (job) => set((s) => ({ jobs: { ...s.jobs, [job.jobId]: job } })),
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
