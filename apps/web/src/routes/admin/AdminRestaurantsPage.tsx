import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Link as LinkIcon,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useCancelCrawl,
  useCrawlJobStream,
  useRestaurantByPlaceId,
  useRestaurantList,
  useRestaurantSummaryStatus,
  useStartCrawl,
} from '@repo/shared';
import type {
  CrawlModeType,
  CrawlStageType,
  RestaurantListItemType,
  RestaurantSummaryProgressType,
  VisitorReviewWithSummaryType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

const NAVER_PLACE_HOSTS = ['naver.com', 'naver.me'];

const isValidNaverPlaceUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return NAVER_PLACE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

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

interface ActiveJob {
  jobId: string;
  // The placeId the job is targeting. Known for recrawl/update right away;
  // for new URLs we discover it from the SSE 'partial' event.
  placeId: string | null;
  // Where to anchor the inline progress UI: a known list item, or the
  // sticky "new" panel at the top.
  source: 'list-row' | 'new';
  mode: CrawlModeType;
}

const summaryInFlight = (item: RestaurantListItemType): number =>
  item.summaryPending + item.summaryRunning;

const SummaryProgressCard = ({
  status,
}: {
  status: RestaurantSummaryProgressType;
}) => {
  const inFlight = status.pending + status.running;
  const total = inFlight + status.done + status.failed;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> AI 요약 진행률
        </CardTitle>
        <CardDescription>
          저장된 리뷰 {status.totalReviews}개 · 요약 {status.done}/{total} 완료
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">대기 {status.pending}</Badge>
          <Badge variant="secondary">진행 {status.running}</Badge>
          <Badge variant="secondary">완료 {status.done}</Badge>
          {status.failed > 0 && <Badge variant="destructive">실패 {status.failed}</Badge>}
        </div>
        {status.recentDone.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {status.recentDone.map((s) => (
              <li key={s.reviewId} className="rounded border bg-muted/40 p-2">
                <div className="line-clamp-3 leading-relaxed">{s.text}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

const ReviewSummaryList = ({
  reviews,
}: {
  reviews: VisitorReviewWithSummaryType[];
}) => {
  if (reviews.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>저장된 리뷰 + 요약 ({reviews.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {reviews.slice(0, 50).map((r) => (
            <li key={r.id} className="space-y-1.5 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {r.authorName && <span className="font-medium">{r.authorName}</span>}
                {r.rating !== null && <Badge variant="secondary">★ {r.rating}</Badge>}
                {r.visitedAt && <span>· {r.visitedAt}</span>}
              </div>
              <p className="line-clamp-3 text-sm">{r.body}</p>
              <div className="rounded border-l-2 border-primary/40 bg-muted/40 p-2 text-xs">
                {!r.summary && <span className="text-muted-foreground">요약 없음</span>}
                {r.summary?.status === 'pending' && (
                  <span className="text-muted-foreground">요약 대기 중…</span>
                )}
                {r.summary?.status === 'running' && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> 요약 중…
                  </span>
                )}
                {r.summary?.status === 'done' && <span>{r.summary.text}</span>}
                {r.summary?.status === 'failed' && (
                  <span className="text-destructive">
                    실패: {r.summary.errorMessage ?? r.summary.errorCode ?? 'unknown'}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

// Inline progress panel — rendered either at the top (for new-URL jobs,
// before we know the placeId) or stretched under a list row once placeId
// is known. Covers SSE state, summary progress, and the persisted reviews.
const ActiveJobPanel = ({
  jobId,
  placeId,
  onPlaceIdResolved,
  onCancel,
}: {
  jobId: string;
  placeId: string | null;
  onPlaceIdResolved: (placeId: string) => void;
  onCancel: () => void;
}) => {
  const stream = useCrawlJobStream(jobId);
  const detailQuery = useRestaurantByPlaceId(placeId);
  const summaryStatusQuery = useRestaurantSummaryStatus(placeId);
  const qc = useQueryClient();

  // The first 'partial' or 'done' event tells us the placeId. Lift it up so
  // the parent can attach the panel to the right list row.
  useEffect(() => {
    const fromPartial = stream.partial?.placeId;
    const fromDone = stream.result?.ok ? stream.result.data.placeId : null;
    const resolved = fromPartial ?? fromDone;
    if (resolved && resolved !== placeId) {
      onPlaceIdResolved(resolved);
    }
  }, [stream.partial, stream.result, placeId, onPlaceIdResolved]);

  // Refresh detail / list whenever a new batch lands or the job ends, so
  // newly-saved rows appear without a manual reload.
  useEffect(() => {
    if (placeId && stream.persistedCount > 0) {
      qc.invalidateQueries({ queryKey: ['restaurant', placeId] });
    }
  }, [stream.persistedCount, placeId, qc]);
  useEffect(() => {
    if (stream.result !== null) {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      if (placeId) qc.invalidateQueries({ queryKey: ['restaurant', placeId] });
    }
  }, [stream.result, placeId, qc]);

  const isRunning = stream.status === 'connecting' || stream.status === 'open';
  const stage = stream.stage;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {isRunning ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : stream.result?.ok ? (
            <CheckCircle2 className="size-4 text-primary" />
          ) : (
            <AlertCircle className="size-4 text-destructive" />
          )}
          크롤링 작업
        </CardTitle>
        <CardDescription className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">job: {jobId.slice(0, 8)}…</Badge>
            {stage && <Badge variant="secondary">{STAGE_LABEL[stage]}</Badge>}
            {stream.visitorCount > 0 && (
              <span>방문자 리뷰 {stream.visitorCount}개 수집</span>
            )}
            {stream.persistedCount > 0 && (
              <span>· DB 저장 {stream.persistedCount}개</span>
            )}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
        {summaryStatusQuery.data && (
          <SummaryProgressCard status={summaryStatusQuery.data} />
        )}
        {detailQuery.data && (
          <ReviewSummaryList reviews={detailQuery.data.reviews} />
        )}
      </CardContent>
    </Card>
  );
};

const RestaurantRow = ({
  item,
  busy,
  onAction,
}: {
  item: RestaurantListItemType;
  busy: boolean;
  onAction: (mode: 'recrawl' | 'update') => void;
}) => {
  const inFlight = summaryInFlight(item);
  return (
    <li className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{item.name}</span>
          {item.category && (
            <span className="text-xs text-muted-foreground">{item.category}</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {item.rating !== null && <Badge variant="secondary">★ {item.rating}</Badge>}
          <Badge variant="outline">리뷰 {item.totalReviews}개</Badge>
          <Badge variant="outline">요약 {item.summaryDone}/{item.totalReviews}</Badge>
          {inFlight > 0 && (
            <Badge variant="secondary" className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> {inFlight}건 진행
            </Badge>
          )}
          {item.summaryFailed > 0 && (
            <Badge variant="destructive">실패 {item.summaryFailed}</Badge>
          )}
          <span>· 마지막: {new Date(item.lastCrawledAt).toLocaleString('ko-KR')}</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAction('update')}
          disabled={busy}
        >
          <ChevronRight />
          업데이트
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onAction('recrawl')}
          disabled={busy}
        >
          <RefreshCw />
          재크롤링
        </Button>
      </div>
    </li>
  );
};

export const AdminRestaurantsPage = () => {
  const qc = useQueryClient();
  const listQuery = useRestaurantList();
  const startMutation = useStartCrawl();
  const cancelMutation = useCancelCrawl();

  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);

  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('URL을 입력해 주세요.');
      return;
    }
    if (!isValidNaverPlaceUrl(trimmed)) {
      setError('네이버 플레이스 URL 형식이 아닙니다 (naver.com / naver.me).');
      return;
    }
    setError(null);
    try {
      const result = await startMutation.mutateAsync({ url: trimmed, mode: 'create' });
      if (result.ok) {
        setActiveJob({
          jobId: result.jobId,
          placeId: null,
          source: 'new',
          mode: 'create',
        });
        setUrl('');
      } else {
        setError(`${result.error}: ${result.message}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to start');
    }
  };

  const handleRowAction =
    (item: RestaurantListItemType) => async (mode: 'recrawl' | 'update') => {
      setError(null);
      try {
        const result = await startMutation.mutateAsync({ url: item.rawSourceUrl, mode });
        if (result.ok) {
          setActiveJob({
            jobId: result.jobId,
            placeId: item.placeId,
            source: 'list-row',
            mode,
          });
        } else {
          setError(`${result.error}: ${result.message}`);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'failed to start');
      }
    };

  const handlePlaceIdResolved = (placeId: string) => {
    setActiveJob((prev) => {
      if (!prev) return prev;
      if (prev.placeId === placeId) return prev;
      // Once we know the placeId, the row in the list is the canonical
      // anchor — refresh the list so the row appears (for new-URL jobs)
      // before the panel slots in beneath it.
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      return { ...prev, placeId, source: 'list-row' };
    });
  };

  const handleCancel = () => {
    if (activeJob) cancelMutation.mutate(activeJob.jobId);
  };

  const items = listQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <UtensilsCrossed className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">맛집</h1>
          <p className="text-sm text-muted-foreground">
            네이버 플레이스 URL로 맛집을 등록하고, 등록된 가게를 재크롤링/업데이트합니다.
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>URL 추가</CardTitle>
          <CardDescription>
            네이버 지도에서 가게 페이지를 열고 공유 URL을 붙여넣으세요. 추가하면 즉시 크롤링이
            시작되고, 진행 상황이 아래에 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <div className="relative">
                <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="https://naver.me/..."
                  className="pl-9"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (error) setError(null);
                  }}
                  aria-invalid={!!error || undefined}
                  disabled={startMutation.isPending}
                />
              </div>
              {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            </div>
            <Button type="submit" disabled={!url.trim() || startMutation.isPending}>
              {startMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
              추가 + 크롤링
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Active "new" job — shown until we know its placeId, after which it
          slots underneath the matching list row. */}
      {activeJob && activeJob.source === 'new' && (
        <div className="mb-6">
          <ActiveJobPanel
            jobId={activeJob.jobId}
            placeId={activeJob.placeId}
            onPlaceIdResolved={handlePlaceIdResolved}
            onCancel={handleCancel}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>등록된 맛집 ({items.length})</CardTitle>
          <CardDescription>
            업데이트는 새 리뷰만 추가하고, 재크롤링은 리뷰 전체를 다시 수집·요약합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
            </div>
          ) : listQuery.isError ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-destructive">
              <XCircle className="size-4" /> 목록을 불러올 수 없습니다.
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              아직 등록된 맛집이 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const isActive =
                  activeJob?.placeId === item.placeId && activeJob.source === 'list-row';
                const busy = !!activeJob && !isActive;
                return (
                  <li key={item.id} className="space-y-3">
                    <RestaurantRow
                      item={item}
                      busy={busy || (isActive && startMutation.isPending)}
                      onAction={handleRowAction(item)}
                    />
                    {isActive && activeJob && (
                      <ActiveJobPanel
                        jobId={activeJob.jobId}
                        placeId={activeJob.placeId}
                        onPlaceIdResolved={handlePlaceIdResolved}
                        onCancel={handleCancel}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
