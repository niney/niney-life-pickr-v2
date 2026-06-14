import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  useCrawlJobStream,
  useRestaurantByPlaceId,
  useRestaurantSummaryEvents,
} from '@repo/shared';
import type {
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

interface ActiveJobPanelProps {
  jobId: string;
  placeId: string | null;
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
  // Fires exactly once when the job stream reaches ANY terminal state —
  // a domain result (done/error) OR a transport-level close with no result.
  // `result` is null in the latter case. Callers use it to mark the job
  // 'done' in the store (keeping the completed card) and surface errors.
  onFinished?: (result: CrawlNaverPlaceResultType | null) => void;
}

export const ActiveJobPanel = ({
  jobId,
  placeId,
  onPlaceIdResolved,
  onCancel,
  showInlineReviewList = true,
  onDismiss,
  onViewDetail,
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
          크롤링 작업
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
