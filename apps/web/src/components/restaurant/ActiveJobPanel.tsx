import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, Loader2, X } from 'lucide-react';
import {
  useCrawlJobStream,
  useRestaurantByPlaceId,
  useRestaurantSummaryEvents,
} from '@repo/shared';
import type {
  CrawlModeType,
  CrawlNaverPlaceResultType,
  CrawlStageType,
  RestaurantDetailType,
  RestaurantSummaryLogEventType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { ReviewSummarySection, SummaryProgressSection } from './sections';
import { JobLogTab } from './JobLogTab';

const STAGE_LABEL: Record<CrawlStageType, string> = {
  queued: '대기',
  normalizing: 'URL 정규화',
  launching: '브라우저 준비',
  loading_main: '메인 페이지 로드',
  parsing_main: '데이터 파싱',
  loading_visitor: '방문자 페이지 로드',
  paginating_visitor: '리뷰 페이지네이션',
  finalizing: '마무리',
  done: '완료',
};

// 작업 종류 배지 — 상단 트레이에서 한 가게에 여러 작업이 섞여도 무슨 작업인지
// 구분되게.
const MODE_LABEL: Record<CrawlModeType, string> = {
  create: '신규',
  recrawl: '재크롤',
  update: '업데이트',
};

// 단계 순서 — 진행 바의 위치(%) 계산용. STAGE_LABEL 과 같은 집합.
const STAGE_ORDER: CrawlStageType[] = [
  'queued',
  'normalizing',
  'launching',
  'loading_main',
  'parsing_main',
  'loading_visitor',
  'paginating_visitor',
  'finalizing',
  'done',
];
// 리뷰 수집 단계 — 잡 전체에서 가장 긴 구간. 단계만으로 %를 잡으면 여기서 바가
// 멈춰 보이므로(78%), 수집 비율을 섞어 전진시킨다.
const PAGINATING_IDX = STAGE_ORDER.indexOf('paginating_visitor');

const formatDuration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}분` : `${m}분 ${rem}초`;
};

// 크롤 진행 상세 — 단계 진행 바 + 리뷰 수집 분모(가게 총 리뷰수 근사) + 현재
// 페이지 + 최근 로그 한 줄. 진행 중인지 한눈에 들어오게.
const CrawlProgress = ({
  stage,
  isRunning,
  visitorCount,
  visitorPage,
  reviewTarget,
  persistedCount,
  latestLog,
}: {
  stage: CrawlStageType | null;
  isRunning: boolean;
  visitorCount: number;
  visitorPage: number;
  reviewTarget: number | null;
  persistedCount: number;
  latestLog: string | null;
}) => {
  const idx = stage ? STAGE_ORDER.indexOf(stage) : -1;
  // 수집 비율(가게 총 리뷰수 근사 분모). 분모를 모르면 null.
  const collectRatio =
    reviewTarget && reviewTarget > 0
      ? Math.min(1, visitorCount / reviewTarget)
      : null;
  // 단계 기반 + 수집 비율 혼합. 수집 단계는 가장 길어, 단계만으로 두면 78%에
  // 고정돼 멈춘 듯 보인다 → 수집 비율로 68~95% 를 전진시킨다.
  let pct: number;
  if (idx < 0) pct = 0;
  else if (stage === 'done') pct = 100;
  else if (idx < PAGINATING_IDX)
    pct = Math.round(((idx + 1) / (PAGINATING_IDX + 1)) * 65);
  else if (stage === 'paginating_visitor')
    pct = collectRatio === null ? 72 : Math.round(68 + collectRatio * 27);
  else pct = 97; // finalizing
  // 페이지네이션이 사실상 끝났는데(수집≈목표) 아직 running 이면 DB 저장/마무리
  // 구간 — 단계는 그대로라 라벨로 명시해 "멈춤" 오인을 막는다.
  const finalizing =
    stage === 'paginating_visitor' && collectRatio !== null && collectRatio >= 0.99;
  const label = finalizing
    ? '리뷰 저장·마무리 중'
    : stage
      ? STAGE_LABEL[stage]
      : '준비 중';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {(visitorCount > 0 || stage === 'paginating_visitor') && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>
            방문자 리뷰{' '}
            <span className="font-medium text-foreground">{visitorCount}</span>
            {reviewTarget ? <> / 약 {reviewTarget}개</> : <>개 수집</>}
          </span>
          {visitorPage > 0 && <span>· 페이지 {visitorPage}</span>}
          {persistedCount > 0 && <span>· DB {persistedCount}</span>}
        </div>
      )}
      {isRunning && latestLog && (
        <p className="truncate text-[11px] text-muted-foreground">{latestLog}</p>
      )}
    </div>
  );
};

interface ActiveJobPanelProps {
  jobId: string;
  placeId: string | null;
  // Seed label shown in the header until the restaurant detail resolves a
  // (possibly newer) name. Lets a job in the in-progress tray be identifiable
  // even before its restaurant is persisted/queried.
  name?: string;
  // Crawl kind — rendered as a small badge (신규/재크롤/업데이트) so a tray with
  // several jobs is unambiguous.
  mode?: CrawlModeType;
  onPlaceIdResolved: (placeId: string) => void;
  onCancel: () => void;
  // Detail page already shows reviews in its own filter/sort/paginate list,
  // so it hides the panel's compact 50-row preview to avoid duplication.
  showInlineReviewList?: boolean;
  // Dismiss (X) — fired from the completed card. Wired to removeJob so the
  // user explicitly clears a finished panel. Shown only once the job is
  // terminal.
  onDismiss?: () => void;
  // "상세 보기" — list page wires this to navigate to the restaurant detail.
  // Only shown when terminal AND placeId is known. Detail page omits it
  // (already on the detail route).
  onViewDetail?: (placeId: string) => void;
  // 성공 종료 시 짧은 grace 뒤 자동으로 onDismiss 를 호출해 완료 카드를 정리한다
  // (트레이가 완료 카드로 쌓이지 않게). 실패/결과미상은 자동 정리하지 않고
  // 사용자가 직접 확인/닫게 둔다.
  autoDismissOnSuccess?: boolean;
  // Fires exactly once when the job stream reaches ANY terminal state —
  // a domain result (done/error) OR a transport-level close with no result.
  // `result` is null in the latter case. Callers use it to mark the job
  // 'done' in the store (keeping the completed card) and surface errors.
  onFinished?: (result: CrawlNaverPlaceResultType | null) => void;
}

export const ActiveJobPanel = ({
  jobId,
  placeId,
  name,
  mode,
  onPlaceIdResolved,
  onCancel,
  showInlineReviewList = true,
  onDismiss,
  onViewDetail,
  autoDismissOnSuccess = false,
  onFinished,
}: ActiveJobPanelProps) => {
  const stream = useCrawlJobStream(jobId);
  const detailQuery = useRestaurantByPlaceId(placeId);
  // 활성 탭 — 진행도/로그. 로그 탭에선 크롤 SSE 의 'log' 이벤트와 요약 SSE 의
  // 'log' 이벤트를 한 곳에 누적 표시.
  const [activeTab, setActiveTab] = useState<'progress' | 'logs'>('progress');
  // 요약 SSE 로 들어오는 로그를 누적. 크롤 SSE 의 logs (stream.logs) 와 합쳐 표시.
  const [summaryLogs, setSummaryLogs] = useState<RestaurantSummaryLogEventType[]>([]);
  const handleSummaryLog = useCallback((ev: RestaurantSummaryLogEventType) => {
    setSummaryLogs((prev) => [...prev, ev]);
  }, []);
  const summaryStatusQuery = useRestaurantSummaryEvents(placeId, { onLog: handleSummaryLog });
  const qc = useQueryClient();
  // 경과 시간 — 진행 중엔 1초마다 tick, 종료되면 멈춘다. 시작 기준은 첫 연결
  // 시점(startRef). 성공 종료엔 서버가 잰 durationMs 를 우선 사용.
  // 경과 시간 — 마운트 시점을 시작으로 잡고(잡 시작 직후 패널이 뜨는 일반 경로
  // 에선 곧 시작 시각), 진행 중 1초마다 tick. 성공 종료엔 서버 durationMs 우선.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    const fromPartial = stream.partial?.placeId;
    const fromDone = stream.result?.ok ? stream.result.data.placeId : null;
    const resolved = fromPartial ?? fromDone;
    if (resolved && resolved !== placeId) {
      onPlaceIdResolved(resolved);
    }
  }, [stream.partial, stream.result, placeId, onPlaceIdResolved]);

  useEffect(() => {
    if (!placeId || !stream.lastPersistedBatch || stream.lastPersistedBatch.length === 0) return;
    const incoming = stream.lastPersistedBatch;
    qc.setQueryData<RestaurantDetailType | null>(
      ['restaurant', placeId],
      (prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.reviews.map((r) => r.id));
        const merged = [
          ...incoming
            .filter((r) => !seen.has(r.id))
            .map((r) => ({
              authorName: r.authorName,
              rating: r.rating,
              body: r.body,
              visitedAt: r.visitedAt,
              imageUrls: r.imageUrls,
              videos: r.videos,
              id: r.id,
              externalId: r.externalId,
              fetchedAt: r.fetchedAt,
              summary: null,
            })),
          ...prev.reviews,
        ];
        return { ...prev, reviews: merged };
      },
    );
  }, [stream.lastPersistedBatch, placeId, qc]);

  const isRunning = stream.status === 'connecting' || stream.status === 'open';
  // Terminal = a domain result arrived (done/error) OR the stream closed at the
  // transport level without one (server already drained the job, terminal SSE
  // frame missed, etc.). The latter used to leave the panel stuck: neither
  // running nor finished, so it never cleaned up and the row stayed busy.
  const isTerminal =
    stream.result !== null ||
    stream.status === 'closed' ||
    stream.status === 'error';
  const stage = stream.stage;
  // 헤더 식별 라벨 — 영속된 상세의 이름을 우선, 없으면 시작 시 seed, 둘 다
  // 없으면(신규 URL 초기) 기본 라벨.
  const displayName = detailQuery.data?.name ?? name ?? null;
  // 수집 진행 분모 — 가게가 표기한 총 리뷰수(근사). partial 우선, 없으면 done 결과.
  const reviewTarget =
    stream.partial?.reviewCount ??
    (stream.result?.ok ? stream.result.data.reviewCount : null) ??
    null;
  const latestLog =
    stream.logs.length > 0 ? stream.logs[stream.logs.length - 1]!.message : null;
  const elapsedMs = stream.result?.ok
    ? stream.result.durationMs
    : Math.max(0, nowTick - startedAt);

  // Once terminal, refresh the list (counts/summary buckets) and the active
  // detail (snapshotJson, totalReviews, anything not covered by streamed
  // merges), then fire onFinished exactly once — even when result is null.
  const finishedFiredRef = useRef(false);
  useEffect(() => {
    if (!isTerminal) return;
    qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
    // 공개 list 도 함께 — 어드민 발견 페이지나 공개 맛집 페이지가 동일한
    // 데이터를 다른 queryKey 로 캐싱한다.
    qc.invalidateQueries({ queryKey: ['restaurant', 'public', 'list'] });
    if (placeId) {
      qc.invalidateQueries({ queryKey: ['restaurant', placeId] });
    }
    if (!finishedFiredRef.current) {
      finishedFiredRef.current = true;
      onFinished?.(stream.result);
    }
  }, [isTerminal, stream.result, placeId, qc, onFinished]);

  // 진행 중에만 1초마다 tick — 종료되면 멈춰 경과 시간이 고정된다.
  useEffect(() => {
    if (!isRunning) return undefined;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // 성공 종료 자동 정리 — grace 뒤 onDismiss 1회. onDismiss 가 매 렌더 새 함수라
  // ref 로 최신값을 잡고 deps 에서 제외(재스케줄 방지). 실패/결과미상은 미발동.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  const autoDismissedRef = useRef(false);
  useEffect(() => {
    if (!autoDismissOnSuccess) return undefined;
    if (!(isTerminal && stream.result?.ok === true)) return undefined;
    if (autoDismissedRef.current) return undefined;
    autoDismissedRef.current = true;
    const t = setTimeout(() => onDismissRef.current?.(), 4000);
    return () => clearTimeout(t);
  }, [autoDismissOnSuccess, isTerminal, stream.result]);

  return (
    <Card className="border-primary/40">
      <CardHeader className="pt-6 sm:pt-7">
        <CardTitle className="flex items-center gap-2 text-base">
          {isRunning ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : stream.result && !stream.result.ok ? (
            <AlertCircle className="size-4 text-destructive" />
          ) : (
            // result.ok 또는 result 없이 종료(transport close) — 둘 다 완료로 표기.
            <CheckCircle2 className="size-4 text-primary" />
          )}
          <span className="truncate">{displayName ?? '크롤링 작업'}</span>
          {mode && (
            <Badge variant="secondary" className="shrink-0">
              {MODE_LABEL[mode]}
            </Badge>
          )}
          {isTerminal && (onViewDetail || onDismiss) && (
            <div className="ml-auto flex items-center gap-1">
              {onViewDetail && placeId && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onViewDetail(placeId)}
                >
                  상세 보기
                </Button>
              )}
              {onDismiss && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  aria-label="닫기"
                >
                  <X />
                </Button>
              )}
            </div>
          )}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">job: {jobId.slice(0, 8)}…</Badge>
          {stage && <Badge variant="secondary">{STAGE_LABEL[stage]}</Badge>}
          {(isRunning || isTerminal) && (
            <Badge variant="outline" className="gap-1">
              <Clock className="size-3" />
              {formatDuration(elapsedMs)}
            </Badge>
          )}
          {stream.visitorCount > 0 && (
            <span>방문자 리뷰 {stream.visitorCount}개 수집</span>
          )}
          {stream.persistedCount > 0 && (
            <span>· DB 저장 {stream.persistedCount}개</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {/* 탭 — 진행도(기본) / 로그. 로그 탭에서 잡 단계·에러를 사후 확인. */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={activeTab === 'progress' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('progress')}
          >
            진행도
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === 'logs' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('logs')}
          >
            로그
            {stream.logs.length + summaryLogs.length > 0 && (
              <Badge variant="outline" className="ml-1">
                {stream.logs.length + summaryLogs.length}
              </Badge>
            )}
          </Button>
        </div>
        {activeTab === 'progress' ? (
          <>
            {(isRunning || stage) && (
              <CrawlProgress
                stage={stage}
                isRunning={isRunning}
                visitorCount={stream.visitorCount}
                visitorPage={stream.visitorPage}
                reviewTarget={reviewTarget}
                persistedCount={stream.persistedCount}
                latestLog={latestLog}
              />
            )}
            {(isRunning || (stream.result && !stream.result.ok)) && (
              <div className="space-y-3">
                {isRunning && (
                  <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                    취소
                  </Button>
                )}
                {stream.result && !stream.result.ok && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                    <Badge variant="outline" className="mr-2">
                      {stream.result.error}
                    </Badge>
                    {stream.result.message}
                  </div>
                )}
              </div>
            )}
            {/* 결과 프레임 없이 스트림만 닫힌 종료 — 보통 작업은 끝났고 종료
                이벤트만 유실된 경우. 패널이 멈춰 보이지 않도록 명시. */}
            {isTerminal && stream.result === null && (
              <p className="text-xs text-muted-foreground">
                작업이 종료되었습니다. 결과는 상세 페이지에서 확인하세요.
              </p>
            )}
            {summaryStatusQuery.data && (
              <SummaryProgressSection status={summaryStatusQuery.data} />
            )}
            {showInlineReviewList && detailQuery.data && (
              <ReviewSummarySection reviews={detailQuery.data.reviews} />
            )}
          </>
        ) : (
          <JobLogTab
            jobId={jobId}
            streamLogs={stream.logs}
            summaryLogs={summaryLogs}
            isJobFinished={isTerminal}
          />
        )}
      </CardContent>
    </Card>
  );
};
