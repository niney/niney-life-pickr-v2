// Module-singleton fan-out for summary status changes, keyed by placeId.
// Two flavors of signal:
//
//   - 'progress'  — counts changed (pending/running/done/failed). Subscribers
//                   should refetch the snapshot. Coalesced server-side.
//   - 'review'    — a specific row finished (status=done/failed) with the
//                   text + model + error info. Lets the SSE handler push a
//                   per-review patch the client can merge into its detail
//                   cache without refetching the whole restaurant detail.
//
// Both flavors flow through the same bus so subscribers can sequence them
// (the per-review patch should always arrive paired with a counts bump).

export interface SummaryProgressSignal {
  type: 'progress';
}

export interface SummaryReviewSignal {
  type: 'review';
  reviewId: string;
  status: 'done' | 'failed';
  text: string | null;
  model: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  finishedAt: string;
  // 구조화 분석 — done 일 때만 채워진다. failed 행은 모두 null.
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
  sentimentScore: number | null;
  satisfactionScore: number | null;
  menus: Array<{ name: string; sentiment?: 'positive' | 'negative' | 'neutral' | null }> | null;
  tips: string[] | null;
  keywords: string[] | null;
}

export type SummarySignal = SummaryProgressSignal | SummaryReviewSignal;

export type SummaryEventListener = (signal: SummarySignal) => void;

export class SummaryEventsBus {
  private readonly listeners = new Map<string, Set<SummaryEventListener>>();

  subscribe(placeId: string, listener: SummaryEventListener): () => void {
    let set = this.listeners.get(placeId);
    if (!set) {
      set = new Set();
      this.listeners.set(placeId, set);
    }
    set.add(listener);
    return () => {
      const s = this.listeners.get(placeId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this.listeners.delete(placeId);
    };
  }

  publish(placeId: string, signal: SummarySignal = { type: 'progress' }): void {
    const set = this.listeners.get(placeId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(signal);
      } catch {
        // listeners must not throw; swallow so other subscribers still fire
      }
    }
  }

  hasSubscribers(placeId: string): boolean {
    const set = this.listeners.get(placeId);
    return !!set && set.size > 0;
  }
}

export const summaryEventsBus = new SummaryEventsBus();
