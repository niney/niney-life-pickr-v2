import { useEffect, useReducer, useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CrawlEventType,
  CrawlJobLogEntryType,
  CrawlLogLevelType,
  CrawlNaverPlaceResultType,
  CrawlStageType,
  DiningcodeBulkSaveJobInputType,
  DiningcodeBulkSaveJobItemType,
  DiningcodeBulkSaveJobSnapshotType,
  DiningcodeBulkSaveJobStateType,
  NaverPlaceDataType,
  PersistedVisitorReviewType,
  TablingSearchSortType,
  VisitorReviewType,
} from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import {
  buildDiningcodeBulkSaveEventsUrl,
  buildJobEventsUrl,
  crawlApi,
  type StartCrawlArgs,
} from '../api/crawl.api.js';
import { useActiveDiningcodeBulkSaveJobStore } from '../stores/activeDiningcodeBulkSaveJobStore.js';

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

// 다이닝코드 키워드 검색 — /admin/diningcode-test 페이지 전용. HTTP 직접 호출이라
// 첫 호출도 ~수백 ms. staleTime 60s — 같은 키워드 재검색 시 즉시 표시.
export interface UseDiningcodeSearchArgs {
  q: string;
  from?: number | null;
  size?: number | null;
  order?: 'r_score' | 'score' | 'review' | 'distance' | null;
  lat?: number | null;
  lng?: number | null;
  distance?: number | null;
}
export const useDiningcodeSearch = ({
  q,
  from = null,
  size = null,
  order = null,
  lat = null,
  lng = null,
  distance = null,
}: UseDiningcodeSearchArgs) =>
  useQuery({
    queryKey: ['crawl', 'diningcode-search', q, from, size, order, lat, lng, distance],
    queryFn: () =>
      crawlApi.diningcodeSearch({ q, from, size, order, lat, lng, distance }),
    enabled: q.trim().length > 0,
    staleTime: 60_000,
  });

// 다이닝코드 가게 상세 — vRid null/undefined 면 disabled. /API/profile/ 한 방에
// 메뉴·사진·리뷰·블로그 모두 옴. 5분 staleTime (검증 도구).
export const useDiningcodeShop = (vRid: string | null) =>
  useQuery({
    queryKey: ['crawl', 'diningcode-shop', vRid],
    queryFn: () => crawlApi.diningcodeShop(vRid!),
    enabled: Boolean(vRid),
    staleTime: 5 * 60_000,
  });

// 다이닝코드 리뷰 페이지네이션. 페이지 단위 lazy fetch — 같은 page 재진입은
// 캐시 hit. 본 디테일 응답의 reviewsFirstPage 와 별개 query key 라 호출자가
// page=1 호출하면 (이미 본 페이지일 수 있어도) 추가 wire 호출 발생.
export const useDiningcodeShopReviews = (
  vRid: string | null,
  page: number,
  enabled = true,
) =>
  useQuery({
    queryKey: ['crawl', 'diningcode-shop-reviews', vRid, page],
    queryFn: () => crawlApi.diningcodeShopReviews(vRid!, page),
    enabled: Boolean(vRid) && enabled,
    staleTime: 5 * 60_000,
  });

// 다이닝코드 가게 DB 저장 + AI 분석 큐잉 mutation. 어드민 상세 페이지의
// "DB 에 저장" 버튼이 호출. 응답은 동기 (모든 리뷰 페이지 fetch 후 200) —
// 평균 가게당 수 초.
export const useSaveDiningcodeShop = () =>
  useMutation({
    mutationFn: (vRid: string) => crawlApi.diningcodeShopSave(vRid),
  });

// ── 테이블링 — /admin/tabling-test 페이지 ────────────────────────────────
// 키워드 검색 — 사이트맵 전수열거와 별개로 키워드로 partner idx 를 바로 찾는다.
// q 가 비면 disabled. 무인증 REST 직접 호출이라 빠름. staleTime 60s.
export interface UseTablingSearchArgs {
  q: string;
  cursor?: string | null;
  pageSize?: number | null;
  sort?: TablingSearchSortType | null;
}
export const useTablingSearch = ({
  q,
  cursor = null,
  pageSize = null,
  sort = null,
}: UseTablingSearchArgs) =>
  useQuery({
    queryKey: ['crawl', 'tabling-search', q, cursor, pageSize, sort],
    queryFn: () => crawlApi.tablingSearch({ q, cursor, pageSize, sort }),
    enabled: q.trim().length > 0,
    staleTime: 60_000,
  });

// 가게 상세(상세+메뉴+리뷰 첫 페이지 합본). idx null/0 이면 disabled. 무인증
// REST 직접 호출이라 첫 호출도 빠름. 5분 staleTime(검증 도구).
export const useTablingShop = (idx: number | null) =>
  useQuery({
    queryKey: ['crawl', 'tabling-shop', idx],
    queryFn: () => crawlApi.tablingShop(idx!),
    enabled: idx != null && idx > 0,
    staleTime: 5 * 60_000,
  });

// 가게 DB 저장 + 좌표 기반 자동매칭 mutation. 성공 시 등록 배지/리스트/제안
// 캐시 무효화 — 새 가게가 cross-source 제안에 잡힐 수 있어서.
export const useSaveTablingShop = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idx: number) => crawlApi.tablingShopSave(idx),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crawl', 'tabling-registered'] });
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['canonical', 'proposals'] });
    },
  });
};

// 미입점 place(JSON-LD) 저장 mutation.
export const useSaveTablingPlace = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (objectId: string) => crawlApi.tablingPlaceSave(objectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['canonical', 'proposals'] });
    },
  });
};

// 사이트맵 기반 발견 — 검색 API 가 없어 전수 발견 백본. enabled 로 lazy 호출.
export const useTablingDiscover = (
  tier: 'shop' | 'place',
  page: number,
  enabled = true,
) =>
  useQuery({
    queryKey: ['crawl', 'tabling-discover', tier, page],
    queryFn: () => crawlApi.tablingDiscover({ tier, page }),
    enabled,
    staleTime: 10 * 60_000,
  });

// 등록됨 배지 — idx 다수 일괄 조회. 비면 disabled.
export const useTablingRegistered = (idxs: number[]) => {
  const key = idxs.join(',');
  return useQuery({
    queryKey: ['crawl', 'tabling-registered', key],
    queryFn: () => crawlApi.tablingRegistered(idxs),
    enabled: idxs.length > 0,
    staleTime: 30_000,
  });
};

// 캐치테이블 가게 상세 — shopRef 가 null/undefined 면 disabled. 한 가게당
// 한 번 가져오면 staleTime 5분 유지 (검증 도구라 자주 invalidate 안 함).
export const useCatchtableShop = (shopRef: string | null) =>
  useQuery({
    queryKey: ['crawl', 'catchtable-shop', shopRef],
    queryFn: () => crawlApi.catchtableShop(shopRef!),
    enabled: Boolean(shopRef),
    staleTime: 5 * 60_000,
  });

// 가게 메뉴 — lazy fetch. UI 버튼 클릭 시점에 enabled true 가 되도록 설계.
// 한 번 가져오면 10분 신선 유지 (메뉴는 자주 안 바뀜).
export const useCatchtableShopMenus = (shopRef: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ['crawl', 'catchtable-shop-menus', shopRef],
    queryFn: () => crawlApi.catchtableShopMenus(shopRef!),
    enabled: Boolean(shopRef) && enabled,
    staleTime: 10 * 60_000,
  });

// AI 리뷰 종합 — 상세 페이지 진입 시 자동 fetch (간단한 정보라 비용 적음).
export const useCatchtableShopReviewOverview = (shopRef: string | null) =>
  useQuery({
    queryKey: ['crawl', 'catchtable-shop-review-overview', shopRef],
    queryFn: () => crawlApi.catchtableShopReviewOverview(shopRef!),
    enabled: Boolean(shopRef),
    staleTime: 10 * 60_000,
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
  // 'log' 이벤트 누적 — 잡 시작부터 종료까지 전 단계의 디버그/관찰용 메시지.
  // UI 의 "로그" 탭이 이 배열을 시간 오름차순으로 표시. 잡 종료 후엔 DB 조회
  // (useCrawlJobLogs) 와 합쳐 더 과거 페이지를 더 불러올 수 있다.
  logs: StreamLogEntry[];
}

// SSE 가 흘려보내는 단계별 로그 한 행. 잡 영속 로그(CrawlJobLogEntryType) 와
// 같은 모양이지만 id 가 없다 — 실시간 스트림에는 DB id 가 없어서. UI 는
// (seq + at) 또는 (jobId + seq) 로 키를 잡아 렌더.
export interface StreamLogEntry {
  seq: number;
  jobId: string;
  level: CrawlLogLevelType;
  stage: string;
  message: string;
  meta: Record<string, unknown> | null;
  at: string;
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
  logs: [],
};

type Action =
  | { type: 'reset' }
  | { type: 'connecting' }
  | { type: 'open' }
  | { type: 'event'; event: CrawlEventType; jobId: string }
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
        case 'log':
          // 누적. 잡 종료 후에도 보관되어 패널 재오픈 시 그대로 보임.
          next.logs = [
            ...state.logs,
            {
              seq: ev.seq,
              jobId: action.jobId,
              level: ev.level,
              stage: ev.stage,
              message: ev.message,
              meta: ev.meta ?? null,
              at: ev.at,
            },
          ];
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

// ---- 다이닝코드 정식 페이지: 등록 배지 + 일괄 저장 잡 ─────────────────────

// 검색 결과 vRid 들의 등록 여부 일괄 조회. 30s staleTime — 같은 페이지에서
// 카드 hover 하다가 다시 검색해도 즉시 표시. vRids 비면 disabled.
export const useDiningcodeRegistered = (vRids: string[]) => {
  const key = vRids.join(',');
  return useQuery({
    queryKey: ['crawl', 'diningcode-registered', key],
    queryFn: () => crawlApi.diningcodeRegistered(vRids),
    enabled: vRids.length > 0,
    staleTime: 30_000,
  });
};

// 일괄 저장 잡 시작 — 성공 시 activeStore 에 jobId 박고, 진행 카드가 자동
// 마운트되도록 setQueryData 로 초기 스냅샷 캐싱.
export const useStartDiningcodeBulkSave = () => {
  const qc = useQueryClient();
  const setActive = useActiveDiningcodeBulkSaveJobStore((s) => s.setJobId);
  return useMutation({
    mutationFn: (input: DiningcodeBulkSaveJobInputType) =>
      crawlApi.diningcodeBulkSaveStart(input),
    onSuccess: (snap) => {
      qc.setQueryData(['crawl', 'diningcode-bulk-save', snap.jobId], snap);
      setActive(snap.jobId);
    },
  });
};

// 잡 취소 (DELETE). 응답 없음.
export const useCancelDiningcodeBulkSave = () =>
  useMutation({
    mutationFn: (jobId: string) => crawlApi.diningcodeBulkSaveCancel(jobId),
  });

// 잡 상태 + 라이브 SSE 구독. menu-grouping 의 useGroupingJob 과 동일 구조.
// 끝나면 EventSource 닫고 재연결 막음 + registered 캐시 무효화.
export const useDiningcodeBulkSaveJob = (
  jobId: string | null,
): {
  data: DiningcodeBulkSaveJobSnapshotType | null;
  isLoading: boolean;
  error: unknown;
} => {
  const qc = useQueryClient();
  const clearActive = useActiveDiningcodeBulkSaveJobStore((s) => s.clear);
  const queryKey = ['crawl', 'diningcode-bulk-save', jobId];

  const queryRes = useQuery({
    queryKey,
    queryFn: async () => {
      if (!jobId) return null;
      try {
        return await crawlApi.diningcodeBulkSaveGet(jobId);
      } catch (e) {
        if (e instanceof ApiError && e.statusCode === 404) {
          clearActive();
          return null;
        }
        throw e;
      }
    },
    enabled: !!jobId,
  });

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<number>(0);
  const closedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!jobId) return undefined;
    closedRef.current = false;

    let cancelled = false;
    const reconnectTimer: { id: ReturnType<typeof setTimeout> | null } = {
      id: null,
    };

    const updateSnapshot = (
      patcher: (
        prev: DiningcodeBulkSaveJobSnapshotType | null,
      ) => DiningcodeBulkSaveJobSnapshotType | null,
    ): void => {
      qc.setQueryData<DiningcodeBulkSaveJobSnapshotType | null>(queryKey, (prev) =>
        patcher(prev ?? null),
      );
    };

    const connect = async (): Promise<void> => {
      if (cancelled || closedRef.current) return;
      const url = await buildDiningcodeBulkSaveEventsUrl(jobId);
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse(
            (e as MessageEvent).data,
          ) as DiningcodeBulkSaveJobSnapshotType;
          updateSnapshot(() => snap);
          retryRef.current = 0;
        } catch {
          // ignore malformed
        }
      });

      es.addEventListener('item', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            item: DiningcodeBulkSaveJobItemType;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            const items = prev.items.map((it) =>
              it.vRid === payload.item.vRid ? payload.item : it,
            );
            const doneCount = items.filter((i) => i.state === 'done').length;
            const failedCount = items.filter((i) => i.state === 'failed').length;
            const skippedCount = items.filter((i) => i.state === 'skipped').length;
            return { ...prev, items, doneCount, failedCount, skippedCount };
          });
        } catch {
          // ignore
        }
      });

      es.addEventListener('done', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            state: DiningcodeBulkSaveJobStateType;
            finishedAt: string;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              state: payload.state,
              finishedAt: payload.finishedAt,
            };
          });
          closedRef.current = true;
          es.close();
          // 새로 등록된 가게가 생겼으니 등록 배지/리스트 캐시 무효화.
          qc.invalidateQueries({ queryKey: ['crawl', 'diningcode-registered'] });
          qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
          qc.invalidateQueries({ queryKey: ['canonical', 'proposals'] });
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es.close();
        if (cancelled || closedRef.current) return;
        const backoff = Math.min(30_000, 1000 * 2 ** retryRef.current);
        retryRef.current += 1;
        reconnectTimer.id = setTimeout(() => {
          void connect();
        }, backoff);
      };
    };

    void connect();

    return () => {
      cancelled = true;
      closedRef.current = true;
      if (reconnectTimer.id) clearTimeout(reconnectTimer.id);
      esRef.current?.close();
      esRef.current = null;
      retryRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return {
    data:
      (queryRes.data as DiningcodeBulkSaveJobSnapshotType | null | undefined) ??
      null,
    isLoading: queryRes.isLoading,
    error: queryRes.error,
  };
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
          dispatch({ type: 'event', event: parsed, jobId });
          if (parsed.type === 'done' || parsed.type === 'error') {
            es.close();
          }
        } catch {
          // ignore malformed
        }
      };
      for (const t of ['progress', 'partial', 'visitor_progress', 'visitor_batch', 'log', 'done', 'error']) {
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

// 잡 단위 영속 로그 조회 — DB 에 누적된 로그를 cursor pagination 으로. SSE 의
// 실시간 누적분(state.logs) 위에 과거 페이지를 더 얹거나, 잡 종료 후 패널을
// 다시 열 때 fallback. 응답은 최신순(createdAt DESC). UI 는 표시 시 다시
// 뒤집어 시간 오름차순으로 보여줄 수 있음.
//
// jobId 가 null/빈 문자열이면 disabled — 패널이 닫혔거나 아직 잡이 없는 상태.
export interface UseCrawlJobLogsArgs {
  jobId: string | null;
  level?: CrawlLogLevelType | null;
  stage?: string | null;
  // 한 페이지 크기. 서버 max 500.
  pageSize?: number;
  // false 면 fetch 안 함 — 실시간 SSE 누적분만으로 충분할 때 (실행 중인 잡).
  enabled?: boolean;
}

export const useCrawlJobLogs = ({
  jobId,
  level = null,
  stage = null,
  pageSize = 100,
  enabled = true,
}: UseCrawlJobLogsArgs) =>
  useInfiniteQuery({
    queryKey: ['crawl', 'job-logs', jobId, level, stage, pageSize],
    enabled: enabled && !!jobId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      crawlApi.jobLogs({
        jobId: jobId as string,
        cursor: pageParam ?? null,
        limit: pageSize,
        level: level ?? null,
        stage: stage ?? null,
      }),
    getNextPageParam: (last) => last.nextCursor,
  });

// 무한 페이지 결과를 평탄한 entry 배열로. UI 표시용 헬퍼.
export const flattenJobLogPages = (
  data:
    | {
        pages: Array<{ items: CrawlJobLogEntryType[] }>;
      }
    | undefined,
): CrawlJobLogEntryType[] => {
  if (!data) return [];
  return data.pages.flatMap((p) => p.items);
};
