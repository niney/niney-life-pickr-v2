import { useEffect, useReducer, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CrawlEventType,
  CrawlNaverPlaceResultType,
  CrawlStageType,
  NaverPlaceDataType,
  PersistedVisitorReviewType,
  VisitorReviewType,
} from '@repo/api-contract';
import { buildJobEventsUrl, crawlApi, type StartCrawlArgs } from '../api/crawl.api.js';

export const useStartCrawl = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: StartCrawlArgs) => crawlApi.start(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crawl', 'jobs'] }),
  });
};

export const useCrawlJobs = () =>
  useQuery({
    queryKey: ['crawl', 'jobs'],
    queryFn: crawlApi.list,
  });

export const useCancelCrawl = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => crawlApi.cancel(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crawl', 'jobs'] }),
  });
};

// 네이버 PC 지도 검색 — /admin/discover 페이지 전용. q 가 비면 자동으로 disabled.
// staleTime 을 길게(30s) 두는 건 같은 키워드로 패널을 껐다 켜도 즉시 동일 결과가
// 보이게 하기 위해. 호출자(페이지)는 q 를 디바운스해서 넘기는 책임.
export const useNaverSearch = (q: string, bbox: string | null) =>
  useQuery({
    queryKey: ['crawl', 'search', q, bbox],
    queryFn: () => crawlApi.search({ q, bbox }),
    enabled: q.trim().length > 0,
    staleTime: 30_000,
  });

// 캐치테이블 키워드 검색 — /admin/catchtable-test 페이지 전용. 첫 호출은 어댑터
// 워밍업 비용으로 ~14s, 이후는 ~수백 ms. staleTime 60s — 같은 키워드 재검색이
// 잦을 수 있어 네이버보다 약간 길게.
export interface UseCatchtableSearchArgs {
  q: string;
  offset?: string | null;
  limit?: number | null;
  contractedOnly?: boolean | null;
}
export const useCatchtableSearch = ({
  q,
  offset = null,
  limit = null,
  contractedOnly = null,
}: UseCatchtableSearchArgs) =>
  useQuery({
    queryKey: ['crawl', 'catchtable-search', q, offset, limit, contractedOnly],
    queryFn: () => crawlApi.catchtableSearch({ q, offset, limit, contractedOnly }),
    enabled: q.trim().length > 0,
    staleTime: 60_000,
  });

// ---- Streaming hook ---------------------------------------------------------

export type CrawlStreamStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface CrawlStreamState {
  status: CrawlStreamStatus;
  stage: CrawlStageType | null;
  partial: NaverPlaceDataType | null;
  visitorCount: number;
  // Total reviews persisted across all visitor_batch events for this job.
  // Drives the "AI 요약 진행률" UI alongside the dedicated summary-status
  // poll — this counter increments only when a batch was newly inserted,
  // not when it was deduped.
  persistedCount: number;
  // Newest visitor_batch payload — UI can render the freshly-arrived
  // reviews above the older ones without re-fetching the whole list.
  lastBatch: VisitorReviewType[] | null;
  // The DB rows that this batch actually inserted (post-dedup), with their
  // server-assigned ids. Callers merge these into the restaurant detail
  // cache so a follow-up GET isn't needed.
  lastPersistedBatch: PersistedVisitorReviewType[] | null;
  result: CrawlNaverPlaceResultType | null;
  // Transport-level error (network drop after retries). Domain errors land in
  // result with ok:false. Kept separate so UI can distinguish "server said
  // parse_failed" from "network is down".
  transportError: string | null;
  lastSeq: number;
}

const initialState: CrawlStreamState = {
  status: 'idle',
  stage: null,
  partial: null,
  visitorCount: 0,
  persistedCount: 0,
  lastBatch: null,
  lastPersistedBatch: null,
  result: null,
  transportError: null,
  lastSeq: 0,
};

type Action =
  | { type: 'reset' }
  | { type: 'connecting' }
  | { type: 'open' }
  | { type: 'event'; event: CrawlEventType }
  | { type: 'transport_error'; message: string }
  | { type: 'closed' };

const reducer = (state: CrawlStreamState, action: Action): CrawlStreamState => {
  switch (action.type) {
    case 'reset':
      return initialState;
    case 'connecting':
      return { ...state, status: 'connecting', transportError: null };
    case 'open':
      return { ...state, status: 'open', transportError: null };
    case 'event': {
      const ev = action.event;
      // Drop duplicates that may arrive on EventSource auto-reconnect — the
      // server replays from Last-Event-ID, but if the client's last-applied
      // seq is higher (e.g., stale snapshot), we ignore.
      if (ev.seq <= state.lastSeq) return state;
      const next: CrawlStreamState = { ...state, lastSeq: ev.seq };
      switch (ev.type) {
        case 'progress':
          next.stage = ev.stage;
          break;
        case 'partial':
          next.partial = ev.data;
          break;
        case 'visitor_progress':
          next.visitorCount = ev.count;
          break;
        case 'visitor_batch':
          next.persistedCount = state.persistedCount + ev.addedCount;
          next.lastBatch = ev.reviews;
          next.lastPersistedBatch = ev.persistedReviews;
          break;
        case 'done':
          next.result = ev.result;
          next.stage = 'done';
          next.status = 'closed';
          break;
        case 'error':
          next.result = {
            ok: false,
            error: ev.error,
            message: ev.message,
          };
          next.status = 'closed';
          break;
      }
      return next;
    }
    case 'transport_error':
      return { ...state, status: 'error', transportError: action.message };
    case 'closed':
      // Don't clobber 'closed' set by a terminal event — only flip if we're
      // still connecting/open when the server closes the stream.
      if (state.status === 'connecting' || state.status === 'open') {
        return { ...state, status: 'closed' };
      }
      return state;
    default:
      return state;
  }
};

// Manage an EventSource for the given jobId. Pass null to detach (e.g.,
// when no job is selected). The hook owns the connection lifecycle so
// callers don't have to think about cleanup.
export const useCrawlJobStream = (jobId: string | null): CrawlStreamState => {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Ref so we don't tear down the EventSource on every render.
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) {
      dispatch({ type: 'reset' });
      return undefined;
    }

    let cancelled = false;
    dispatch({ type: 'reset' });
    dispatch({ type: 'connecting' });

    const connect = async () => {
      const url = await buildJobEventsUrl(jobId);
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => dispatch({ type: 'open' });

      // We dispatch on each named event type rather than the generic
      // onmessage so server's `event:` field maps cleanly to our union.
      // On terminal events we close the EventSource ourselves — otherwise
      // the browser would auto-reconnect after the server's EOF and the
      // server would have to keep saying "204" to halt it.
      const onEvent = (e: MessageEvent) => {
        // Built-in 'error' Event (connection-level) has no .data — let it
        // fall through to onerror below. Custom 'event: error' from the
        // server arrives as a MessageEvent with parseable data.
        if (typeof e.data !== 'string' || e.data.length === 0) return;
        try {
          const parsed = JSON.parse(e.data) as CrawlEventType;
          dispatch({ type: 'event', event: parsed });
          if (parsed.type === 'done' || parsed.type === 'error') {
            es.close();
          }
        } catch {
          // ignore malformed
        }
      };
      for (const t of ['progress', 'partial', 'visitor_progress', 'visitor_batch', 'done', 'error']) {
        es.addEventListener(t, onEvent as EventListener);
      }

      es.onerror = () => {
        // Browser will auto-reconnect unless the server explicitly ended
        // the stream (or returned a non-200, e.g. 204 for a finished job
        // we've already drained). Don't surface transient errors mid-job;
        // just flag terminal close.
        if (es.readyState === EventSource.CLOSED) {
          dispatch({ type: 'closed' });
        }
      };
    };

    void connect();

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [jobId]);

  return state;
};
