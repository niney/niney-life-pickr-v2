import { useEffect, useReducer, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CrawlEventType,
  CrawlNaverPlaceResultType,
  CrawlStageType,
  NaverPlaceDataType,
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
