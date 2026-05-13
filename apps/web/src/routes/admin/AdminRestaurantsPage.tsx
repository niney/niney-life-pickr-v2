import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Link as LinkIcon,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  useActiveCrawlJobStore,
  useCancelCrawl,
  useDeleteRestaurant,
  useRestaurantList,
  useRestaurantListSummaryEvents,
  useStartCrawl,
  type ActiveCrawlJob,
} from '@repo/shared';
import type { RestaurantListItemType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { ActiveJobPanel } from '~/components/restaurant/ActiveJobPanel';
import { ReanalyzeFailedBadge } from '~/components/restaurant/ReanalyzeFailedBadge';

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

const summaryInFlight = (item: RestaurantListItemType): number =>
  item.summaryPending + item.summaryRunning;

const RestaurantRow = ({
  item,
  busy,
  deleting,
  confirmingDelete,
  onAction,
  onDelete,
  onCancelDelete,
}: {
  item: RestaurantListItemType;
  busy: boolean;
  deleting: boolean;
  confirmingDelete: boolean;
  onAction: (mode: 'recrawl' | 'update') => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) => {
  const navigate = useNavigate();
  const inFlight = summaryInFlight(item);
  // Whole row navigates to the detail page. Buttons stop propagation so
  // their own actions don't trigger the row click. While a job is active
  // for this row the inline panel is mounted underneath, so we suppress
  // the navigation to avoid yanking the panel away.
  const handleRowClick = () => {
    if (busy || deleting || confirmingDelete) return;
    navigate(`/admin/restaurants/${item.placeId}`);
  };
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
      className={`flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:p-4 ${
        busy || deleting || confirmingDelete
          ? 'cursor-default'
          : 'cursor-pointer hover:bg-muted/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{item.name}</span>
          {item.category && (
            <span className="text-xs text-muted-foreground">{item.category}</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {item.rating !== null && <Badge variant="secondary">★ {item.rating}</Badge>}
          <Badge variant="outline">리뷰 {item.totalReviews}개</Badge>
          <Badge variant="outline">요약 {item.summaryDone}/{item.totalReviews}</Badge>
          {inFlight > 0 && (
            <Badge variant="secondary" className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> {inFlight}건 진행
            </Badge>
          )}
          {item.summaryFailed > 0 && (
            <ReanalyzeFailedBadge placeId={item.placeId} count={item.summaryFailed} />
          )}
          {item.avgSatisfactionScore !== null && (
            <Badge variant="outline">😊 {item.avgSatisfactionScore.toFixed(1)}/5</Badge>
          )}
          {item.positiveCount + item.negativeCount + item.neutralCount + item.mixedCount > 0 && (
            <span className="text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400">+{item.positiveCount}</span>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="text-rose-600 dark:text-rose-400">-{item.negativeCount}</span>
            </span>
          )}
          <span>· 마지막: {new Date(item.lastCrawledAt).toLocaleString('ko-KR')}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={stop(() => onAction('update'))}
          disabled={busy}
        >
          <ChevronRight />
          업데이트
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={stop(() => onAction('recrawl'))}
          disabled={busy}
        >
          <RefreshCw />
          재크롤링
        </Button>
        {confirmingDelete ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={stop(onDelete)}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              정말 삭제
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={stop(onCancelDelete)}
              disabled={deleting}
            >
              취소
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={stop(onDelete)}
            disabled={busy}
            aria-label="삭제"
            title="삭제"
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
};

export const AdminRestaurantsPage = () => {
  const qc = useQueryClient();
  const listQuery = useRestaurantList();
  const startMutation = useStartCrawl();
  const cancelMutation = useCancelCrawl();
  const deleteMutation = useDeleteRestaurant();

  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const jobs = useActiveCrawlJobStore((s) => s.jobs);
  const addJob = useActiveCrawlJobStore((s) => s.add);
  const removeJob = useActiveCrawlJobStore((s) => s.remove);
  const resolveJobPlaceId = useActiveCrawlJobStore((s) => s.resolvePlaceId);
  // placeId currently in the "click again to confirm" state. Only one row
  // can be in confirm mode at a time; clicking another row's trash icon
  // moves the prompt instead of opening a second one.
  const [confirmDeletePlaceId, setConfirmDeletePlaceId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'satisfaction' | 'positive' | 'negativeRatio'>(
    'recent',
  );

  const handleDelete = async (placeId: string) => {
    if (confirmDeletePlaceId !== placeId) {
      setConfirmDeletePlaceId(placeId);
      return;
    }
    setError(null);
    try {
      await deleteMutation.mutateAsync(placeId);
      setConfirmDeletePlaceId(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to delete');
    }
  };

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
        addJob({
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
          addJob({
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

  const handlePlaceIdResolved = (jobId: string, placeId: string) => {
    const existing = jobs[jobId];
    if (existing && existing.placeId !== placeId) {
      // Once we know the placeId, the row in the list is the canonical
      // anchor — refresh the list so the row appears (for new-URL jobs)
      // before the panel slots in beneath it.
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['restaurant', 'public', 'list'] });
    }
    resolveJobPlaceId(jobId, placeId);
  };

  const handleFinished =
    (jobId: string) =>
    (result: { ok: boolean; error?: string; message?: string }) => {
      if (!result.ok && result.error) {
        setError(`${result.error}: ${result.message ?? ''}`);
      }
      removeJob(jobId);
    };

  const rawItems = listQuery.data?.items ?? [];
  // 정렬은 클라이언트에서. 분석 안 된 식당은 항상 가장 뒤로 (점수 null)
  // — 정렬 기준이 분석 점수일 때 빈 줄이 위로 올라오는 걸 방지한다.
  const items = (() => {
    if (sortBy === 'recent') return rawItems;
    const withNullsLast = (
      cmp: (a: RestaurantListItemType, b: RestaurantListItemType) => number,
      keyOf: (it: RestaurantListItemType) => number | null,
    ) =>
      [...rawItems].sort((a, b) => {
        const av = keyOf(a);
        const bv = keyOf(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return cmp(a, b);
      });
    if (sortBy === 'satisfaction') {
      return withNullsLast(
        (a, b) => (b.avgSatisfactionScore ?? 0) - (a.avgSatisfactionScore ?? 0),
        (it) => it.avgSatisfactionScore,
      );
    }
    if (sortBy === 'positive') {
      return withNullsLast(
        (a, b) => (b.avgSentimentScore ?? 0) - (a.avgSentimentScore ?? 0),
        (it) => it.avgSentimentScore,
      );
    }
    // negativeRatio — 분모가 0이면 null 취급(분석 없음). 비율 낮은 순.
    return withNullsLast(
      (a, b) => {
        const ra = a.negativeCount / Math.max(a.summaryDone, 1);
        const rb = b.negativeCount / Math.max(b.summaryDone, 1);
        return ra - rb;
      },
      (it) => (it.summaryDone === 0 ? null : it.summaryDone),
    );
  })();
  // Subscribe to summary events for every visible row so trailing summaries
  // (the ones still finishing after a crawl `done`) keep the badges fresh
  // even when no panel is mounted for that row. The singleton SSE manager
  // multiplexes these into a single connection.
  // SSE 구독은 정렬 결과가 아닌 원 목록 기준 — 정렬만 바뀌어도
  // EventSource가 끊겼다 다시 붙는 걸 막는다.
  useRestaurantListSummaryEvents(rawItems.map((it) => it.placeId));
  // Index jobs by placeId so each row can render its own anchored panel
  // without scanning the full set on every render.
  // placeId 가 list 에 아직 없는 잡(어드민 발견에서 시작 → row 미생성 상태)
  // 도 newJobs 로 분류해 상단에 ActiveJobPanel 을 마운트한다. 그래야 SSE 가
  // 열려 partial 시점에 list invalidation 이 트리거되고, 행이 등장하면 다음
  // 렌더에서 jobByPlaceId 로 재분류돼 자연스럽게 행 밑으로 이동.
  const itemPlaceIds = new Set(rawItems.map((it) => it.placeId));
  const jobByPlaceId = new Map<string, ActiveCrawlJob>();
  const newJobs: ActiveCrawlJob[] = [];
  for (const j of Object.values(jobs)) {
    if (j.placeId === null || !itemPlaceIds.has(j.placeId)) newJobs.push(j);
    else jobByPlaceId.set(j.placeId, j);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
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

      {/* Active "new" jobs — shown until each one's placeId resolves, at
          which point the panel slots underneath the matching list row. */}
      {newJobs.length > 0 && (
        <div className="mb-6 space-y-3">
          {newJobs.map((j) => (
            <ActiveJobPanel
              key={j.jobId}
              jobId={j.jobId}
              placeId={j.placeId}
              onPlaceIdResolved={(placeId) => handlePlaceIdResolved(j.jobId, placeId)}
              onCancel={() => cancelMutation.mutate(j.jobId)}
              onFinished={handleFinished(j.jobId)}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>등록된 맛집 ({items.length})</CardTitle>
              <CardDescription>
                업데이트는 새 리뷰만 추가하고, 재크롤링은 리뷰 전체를 다시 수집·요약합니다.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              정렬
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-8 rounded border bg-background px-2 text-xs"
              >
                <option value="recent">최근 크롤링순</option>
                <option value="satisfaction">만족도 높은 순</option>
                <option value="positive">긍정 점수 높은 순</option>
                <option value="negativeRatio">부정 비율 낮은 순</option>
              </select>
            </label>
          </div>
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
                const rowJob = jobByPlaceId.get(item.placeId) ?? null;
                return (
                  <li key={item.id} className="space-y-3">
                    <RestaurantRow
                      item={item}
                      busy={!!rowJob}
                      deleting={
                        deleteMutation.isPending &&
                        deleteMutation.variables === item.placeId
                      }
                      confirmingDelete={confirmDeletePlaceId === item.placeId}
                      onAction={handleRowAction(item)}
                      onDelete={() => handleDelete(item.placeId)}
                      onCancelDelete={() => setConfirmDeletePlaceId(null)}
                    />
                    {rowJob && (
                      <ActiveJobPanel
                        jobId={rowJob.jobId}
                        placeId={rowJob.placeId}
                        onPlaceIdResolved={(placeId) =>
                          handlePlaceIdResolved(rowJob.jobId, placeId)
                        }
                        onCancel={() => cancelMutation.mutate(rowJob.jobId)}
                        onFinished={handleFinished(rowJob.jobId)}
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
