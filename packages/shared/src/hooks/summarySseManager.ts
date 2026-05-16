import type {
  RestaurantSummaryProgressType,
  RestaurantSummaryReviewEventType,
  RestaurantSummarySnapshotEventType,
} from '@repo/api-contract';
import { buildSummaryEventsUrl } from '../api/restaurant.api.js';

// Process-wide manager for the multiplexed /summary-events SSE. One open
// EventSource serves every component that wants to listen — keeps the
// browser well under its HTTP/1.1 6-per-origin connection cap even when
// several crawls are running. When the set of subscribed keys changes, the
// manager reconnects with the new union; brief replay is fine since the
// server re-sends an initial snapshot on connect.
//
// 키 종류:
//   - 'place:<placeId>'    — Naver 단일 행 (디테일 페이지에서 사용)
//   - 'canonical:<canonicalId>' — 한 가게의 모든 source (리스트에서 사용)
// 서버는 한 connection 에 두 종류 모두 받아 풀어 구독. 이벤트는 canonicalId,
// restaurantId, source, sourceId, placeId 를 모두 태그해서 보내므로 클라이언
// 트는 들어온 이벤트를 양쪽 키 모두로 라우팅한다 (canonicalId 키 구독자와
// matching placeId 키 구독자 양쪽 다 통지).

export type SubscriptionKey =
  | { kind: 'place'; placeId: string }
  | { kind: 'canonical'; canonicalId: string };

const keyId = (k: SubscriptionKey): string =>
  k.kind === 'place' ? `place:${k.placeId}` : `canonical:${k.canonicalId}`;

// `prev` 는 같은 키(place 또는 canonical) 직전 snapshot. 첫 catch-up 시 null.
// 공개 list 처럼 행 1개가 두 source 의 합산 카운트를 들고 있는 캐시는, 한
// source 의 새 카운트로 통째 덮어쓰면 다른 source 의 카운트가 0 으로 빠진다.
// prev 와 비교해 delta 만 합산 행에 반영하기 위해 같이 전달한다.
type SnapshotHandler = (
  snap: RestaurantSummarySnapshotEventType,
  prev: RestaurantSummarySnapshotEventType | null,
) => void;
type ReviewHandler = (ev: RestaurantSummaryReviewEventType) => void;

interface Subscribers {
  snapshots: Set<SnapshotHandler>;
  reviews: Set<ReviewHandler>;
}

// Heartbeat/idle-timeout 파라미터.
// 서버는 5s 마다 'heartbeat' named event 를 보낸다. 어떤 event 든 받으면
// lastEventAt 을 갱신. watchdog 이 3s 마다 비교해 15s 이상 침묵이면 죽음으로
// 간주하고 강제 close + backoff 재연결. backoff 는 1.5s 부터 시작해 두 배씩
// 늘리되 60s 로 cap, 무한 재시도 — 어드민이 페이지를 떠나면 unsubscribe 가
// 알아서 timer 를 정리한다.
const IDLE_TIMEOUT_MS = 15_000;
const WATCHDOG_INTERVAL_MS = 3_000;
const BACKOFF_MIN_MS = 1_500;
const BACKOFF_MAX_MS = 60_000;

class SummarySseManager {
  private es: EventSource | null = null;
  private connectedKeyIds: string[] = [];
  // 마지막 snapshot 캐시 — 동일 키로 새로 구독하는 컴포넌트가 다음 tick 까지
  // 안 기다리고 즉시 렌더 가능. 키는 canonicalId 또는 placeId.
  private lastSnapshotByCanonical = new Map<string, RestaurantSummarySnapshotEventType>();
  private lastSnapshotByPlace = new Map<string, RestaurantSummarySnapshotEventType>();
  private subs = new Map<string, Subscribers>();
  private reconnectScheduled = false;
  private connectGen = 0;
  // Idle 감지 + 재연결 상태. lastEventAt 은 onopen 또는 어떤 event 도착 시
  // 갱신. errorReconnect 는 onerror 또는 idle timeout 양쪽에서 진입.
  private lastEventAt = 0;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private errorReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private errorReconnectAttempts = 0;

  subscribe(
    key: SubscriptionKey,
    handlers: { onSnapshot: SnapshotHandler; onReview: ReviewHandler },
  ): () => void {
    const id = keyId(key);
    let entry = this.subs.get(id);
    let needsReconnect = false;
    if (!entry) {
      entry = { snapshots: new Set(), reviews: new Set() };
      this.subs.set(id, entry);
      needsReconnect = true;
    }
    entry.snapshots.add(handlers.onSnapshot);
    entry.reviews.add(handlers.onReview);

    // Replay 마지막 snapshot — 키 종류에 맞는 캐시에서 꺼낸다. 새 구독자에게
    // 는 첫 dispatch 라 prev=null. delta-aware patch 는 첫 replay 가 합산 행을
    // 덮어쓰지 않게 자연스럽게 처리한다.
    const last =
      key.kind === 'place'
        ? this.lastSnapshotByPlace.get(key.placeId)
        : this.lastSnapshotByCanonical.get(key.canonicalId);
    if (last) handlers.onSnapshot(last, null);

    if (needsReconnect) this.scheduleReconnect();

    return () => {
      const e = this.subs.get(id);
      if (!e) return;
      e.snapshots.delete(handlers.onSnapshot);
      e.reviews.delete(handlers.onReview);
      if (e.snapshots.size === 0 && e.reviews.size === 0) {
        this.subs.delete(id);
        if (key.kind === 'place') this.lastSnapshotByPlace.delete(key.placeId);
        else this.lastSnapshotByCanonical.delete(key.canonicalId);
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

  private maybeReconnect(): void {
    const desired = [...this.subs.keys()].sort();
    const current = [...this.connectedKeyIds].sort();
    if (
      desired.length === current.length &&
      desired.every((id, i) => id === current[i])
    ) {
      return;
    }
    if (desired.length === 0) {
      this.es?.close();
      this.es = null;
      this.connectedKeyIds = [];
      this.stopWatchdog();
      this.clearErrorReconnect();
      return;
    }
    this.connect(desired);
  }

  private touch(): void {
    this.lastEventAt = Date.now();
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (Date.now() - this.lastEventAt < IDLE_TIMEOUT_MS) return;
      this.handleConnectionLost();
    }, WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private handleConnectionLost(): void {
    // 죽음 단정. 현재 EventSource 강제 close → backoff 재연결 예약.
    this.stopWatchdog();
    this.es?.close();
    this.es = null;
    this.connectedKeyIds = [];
    this.scheduleErrorReconnect();
  }

  private scheduleErrorReconnect(): void {
    if (this.errorReconnectTimer) return;
    if (this.subs.size === 0) return;
    const attempt = this.errorReconnectAttempts;
    this.errorReconnectAttempts += 1;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
    this.errorReconnectTimer = setTimeout(() => {
      this.errorReconnectTimer = null;
      if (this.subs.size === 0) return;
      this.connect([...this.subs.keys()].sort());
    }, delay);
  }

  private clearErrorReconnect(): void {
    if (this.errorReconnectTimer) {
      clearTimeout(this.errorReconnectTimer);
      this.errorReconnectTimer = null;
    }
    this.errorReconnectAttempts = 0;
  }

  private connect(keyIds: string[]): void {
    const gen = ++this.connectGen;
    this.es?.close();
    this.es = null;
    this.connectedKeyIds = keyIds;
    // 새 connect 시작 — 진행 중이던 watchdog/error reconnect 정리. 그쪽이
    // 또 connect 를 호출해 중복 EventSource 가 떠다닐 위험 차단.
    this.stopWatchdog();
    if (this.errorReconnectTimer) {
      clearTimeout(this.errorReconnectTimer);
      this.errorReconnectTimer = null;
    }

    const placeIds: string[] = [];
    const canonicalIds: string[] = [];
    for (const id of keyIds) {
      if (id.startsWith('place:')) placeIds.push(id.slice(6));
      else if (id.startsWith('canonical:')) canonicalIds.push(id.slice(10));
    }

    void buildSummaryEventsUrl({ placeIds, canonicalIds }).then((url) => {
      if (gen !== this.connectGen) return;
      const es = new EventSource(url);
      this.es = es;

      es.onopen = () => {
        // 정상 연결 — backoff attempts 리셋, lastEventAt 초기화, watchdog 시작.
        this.errorReconnectAttempts = 0;
        this.touch();
        this.startWatchdog();
      };

      es.onerror = () => {
        // 브라우저 자동 재연결은 readyState 를 CONNECTING 으로 두기만 하고
        // 침묵하는 경우가 있어 신뢰 못 한다. 명시 close 후 backoff 재연결로
        // 우리가 직접 관리. (idle watchdog 도 같은 handleConnectionLost 로 수렴)
        if (gen !== this.connectGen) return;
        this.handleConnectionLost();
      };

      es.addEventListener('heartbeat', () => {
        // backend 가 5초마다 보내는 명시적 keepalive. payload 는 무시 — 도착
        // 했다는 사실 자체가 신호.
        this.touch();
      });

      es.addEventListener('snapshot', (e: MessageEvent) => {
        if (typeof e.data !== 'string' || e.data.length === 0) return;
        let parsed: RestaurantSummarySnapshotEventType;
        try {
          parsed = JSON.parse(e.data) as RestaurantSummarySnapshotEventType;
        } catch {
          return;
        }
        this.touch();
        // prev 는 같은 키 직전 snapshot — dispatch 전에 캡처해 핸들러에 함께
        // 넘긴다 (delta 계산용). 그런 다음에야 캐시를 새 값으로 교체.
        const prevByCanon = this.lastSnapshotByCanonical.get(parsed.canonicalId) ?? null;
        const prevByPlace = parsed.placeId
          ? this.lastSnapshotByPlace.get(parsed.placeId) ?? null
          : null;
        // canonicalId 캐시 무조건 갱신. placeId 가 있으면(=Naver) place 캐시도.
        this.lastSnapshotByCanonical.set(parsed.canonicalId, parsed);
        if (parsed.placeId) this.lastSnapshotByPlace.set(parsed.placeId, parsed);
        // 양쪽 키 구독자 모두에게 dispatch.
        const canonEntry = this.subs.get(`canonical:${parsed.canonicalId}`);
        if (canonEntry) for (const h of canonEntry.snapshots) h(parsed, prevByCanon);
        if (parsed.placeId) {
          const placeEntry = this.subs.get(`place:${parsed.placeId}`);
          if (placeEntry) for (const h of placeEntry.snapshots) h(parsed, prevByPlace);
        }
      });

      es.addEventListener('review', (e: MessageEvent) => {
        if (typeof e.data !== 'string' || e.data.length === 0) return;
        let parsed: RestaurantSummaryReviewEventType;
        try {
          parsed = JSON.parse(e.data) as RestaurantSummaryReviewEventType;
        } catch {
          return;
        }
        this.touch();
        const canonEntry = this.subs.get(`canonical:${parsed.canonicalId}`);
        if (canonEntry) for (const h of canonEntry.reviews) h(parsed);
        if (parsed.placeId) {
          const placeEntry = this.subs.get(`place:${parsed.placeId}`);
          if (placeEntry) for (const h of placeEntry.reviews) h(parsed);
        }
      });
    });
  }
}

export const summarySseManager = new SummarySseManager();
