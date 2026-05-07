import type {
  RestaurantSummaryProgressType,
  RestaurantSummaryReviewEventType,
  RestaurantSummarySnapshotEventType,
} from '@repo/api-contract';
import { buildSummaryEventsUrl } from '../api/restaurant.api.js';

// Process-wide manager for the multiplexed /summary-events SSE. One open
// EventSource serves every component that wants to listen — keeps the
// browser well under its HTTP/1.1 6-per-origin connection cap even when
// several crawls are running. When the set of subscribed placeIds changes,
// the manager reconnects with the new union; brief replay is fine since the
// server re-sends an initial snapshot on connect.

type SnapshotHandler = (snap: RestaurantSummaryProgressType) => void;
type ReviewHandler = (ev: RestaurantSummaryReviewEventType) => void;

interface PlaceSubscribers {
  snapshots: Set<SnapshotHandler>;
  reviews: Set<ReviewHandler>;
}

class SummarySseManager {
  private es: EventSource | null = null;
  private connectedPlaceIds: string[] = [];
  // Latest snapshot we've seen per placeId. Replayed to new subscribers
  // immediately so they don't have to wait for the next progress tick to
  // render anything.
  private lastSnapshot = new Map<string, RestaurantSummaryProgressType>();
  private subs = new Map<string, PlaceSubscribers>();
  // Coalesce reconnects across React render bursts: many subscribe/unsubscribe
  // calls in the same tick collapse to one reconnect.
  private reconnectScheduled = false;
  private connectGen = 0;

  subscribe(
    placeId: string,
    handlers: { onSnapshot: SnapshotHandler; onReview: ReviewHandler },
  ): () => void {
    let entry = this.subs.get(placeId);
    let needsReconnect = false;
    if (!entry) {
      entry = { snapshots: new Set(), reviews: new Set() };
      this.subs.set(placeId, entry);
      needsReconnect = true;
    }
    entry.snapshots.add(handlers.onSnapshot);
    entry.reviews.add(handlers.onReview);

    // Replay last snapshot synchronously so the caller can render right away.
    const last = this.lastSnapshot.get(placeId);
    if (last) handlers.onSnapshot(last);

    if (needsReconnect) this.scheduleReconnect();

    return () => {
      const e = this.subs.get(placeId);
      if (!e) return;
      e.snapshots.delete(handlers.onSnapshot);
      e.reviews.delete(handlers.onReview);
      if (e.snapshots.size === 0 && e.reviews.size === 0) {
        this.subs.delete(placeId);
        this.lastSnapshot.delete(placeId);
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectScheduled) return;
    this.reconnectScheduled = true;
    queueMicrotask(() => {
      this.reconnectScheduled = false;
      this.maybeReconnect();
    });
  }

  // Avoid tearing down a healthy connection when the subscribed set hasn't
  // actually changed (e.g., StrictMode double-invocation that re-adds the
  // same placeId before unsubscribe runs).
  private maybeReconnect(): void {
    const desired = [...this.subs.keys()].sort();
    const current = [...this.connectedPlaceIds].sort();
    if (
      desired.length === current.length &&
      desired.every((pid, i) => pid === current[i])
    ) {
      return;
    }
    if (desired.length === 0) {
      this.es?.close();
      this.es = null;
      this.connectedPlaceIds = [];
      return;
    }
    this.connect(desired);
  }

  private connect(placeIds: string[]): void {
    const gen = ++this.connectGen;
    this.es?.close();
    this.es = null;
    this.connectedPlaceIds = placeIds;

    void buildSummaryEventsUrl(placeIds).then((url) => {
      // A newer connect raced ahead — drop this one.
      if (gen !== this.connectGen) return;
      const es = new EventSource(url);
      this.es = es;

      es.addEventListener('snapshot', (e: MessageEvent) => {
        if (typeof e.data !== 'string' || e.data.length === 0) return;
        let parsed: RestaurantSummarySnapshotEventType;
        try {
          parsed = JSON.parse(e.data) as RestaurantSummarySnapshotEventType;
        } catch {
          return;
        }
        const { placeId, ...rest } = parsed;
        const snap = rest as RestaurantSummaryProgressType;
        this.lastSnapshot.set(placeId, snap);
        const entry = this.subs.get(placeId);
        if (!entry) return;
        for (const h of entry.snapshots) h(snap);
      });

      es.addEventListener('review', (e: MessageEvent) => {
        if (typeof e.data !== 'string' || e.data.length === 0) return;
        let parsed: RestaurantSummaryReviewEventType;
        try {
          parsed = JSON.parse(e.data) as RestaurantSummaryReviewEventType;
        } catch {
          return;
        }
        const entry = this.subs.get(parsed.placeId);
        if (!entry) return;
        for (const h of entry.reviews) h(parsed);
      });
      // EventSource auto-reconnects on transient drops. The server replays
      // the initial snapshot on connect, so consumers stay in sync.
    });
  }
}

export const summarySseManager = new SummarySseManager();
