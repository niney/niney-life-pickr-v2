import { create } from 'zustand';
import type { CrawlModeType } from '@repo/api-contract';

// One in-flight crawl job is supported at a time (HANDOFF). Lifting the state
// to a shared store lets the list page and the detail page see the same job —
// kicking it off from detail makes the list show its inline progress panel
// under the matching row, and vice versa.
export interface ActiveCrawlJob {
  jobId: string;
  // Known up-front for recrawl/update; null for a fresh "create" until the
  // SSE 'partial' event resolves it.
  placeId: string | null;
  mode: CrawlModeType;
  // Where the list page should anchor the inline panel. Detail-initiated
  // jobs always have a known placeId so they land as 'list-row'.
  source: 'list-row' | 'new';
}

interface ActiveCrawlJobState {
  active: ActiveCrawlJob | null;
  setActive: (job: ActiveCrawlJob | null) => void;
  resolvePlaceId: (placeId: string) => void;
  clear: () => void;
}

export const useActiveCrawlJobStore = create<ActiveCrawlJobState>((set) => ({
  active: null,
  setActive: (job) => set({ active: job }),
  resolvePlaceId: (placeId) =>
    set((state) => {
      if (!state.active) return state;
      if (state.active.placeId === placeId) return state;
      return { active: { ...state.active, placeId, source: 'list-row' } };
    }),
  clear: () => set({ active: null }),
}));
