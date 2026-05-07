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
  useStartCrawl,
} from '@repo/shared';
import type { RestaurantListItemType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { ActiveJobPanel } from '~/components/restaurant/ActiveJobPanel';

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
      className={`flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center ${
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
  const activeJob = useActiveCrawlJobStore((s) => s.active);
  const setActiveJob = useActiveCrawlJobStore((s) => s.setActive);
  const resolveActivePlaceId = useActiveCrawlJobStore((s) => s.resolvePlaceId);
  // placeId currently in the "click again to confirm" state. Only one row
  // can be in confirm mode at a time; clicking another row's trash icon
  // moves the prompt instead of opening a second one.
  const [confirmDeletePlaceId, setConfirmDeletePlaceId] = useState<string | null>(null);

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
    if (activeJob && activeJob.placeId !== placeId) {
      // Once we know the placeId, the row in the list is the canonical
      // anchor — refresh the list so the row appears (for new-URL jobs)
      // before the panel slots in beneath it.
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
    }
    resolveActivePlaceId(placeId);
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
            onFinished={(result) => {
              if (!result.ok) {
                setError(`${result.error}: ${result.message}`);
              }
              setActiveJob(null);
            }}
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
                      deleting={
                        deleteMutation.isPending &&
                        deleteMutation.variables === item.placeId
                      }
                      confirmingDelete={confirmDeletePlaceId === item.placeId}
                      onAction={handleRowAction(item)}
                      onDelete={() => handleDelete(item.placeId)}
                      onCancelDelete={() => setConfirmDeletePlaceId(null)}
                    />
                    {isActive && activeJob && (
                      <ActiveJobPanel
                        jobId={activeJob.jobId}
                        placeId={activeJob.placeId}
                        onPlaceIdResolved={handlePlaceIdResolved}
                        onCancel={handleCancel}
                        onFinished={(result) => {
                          if (!result.ok) {
                            setError(`${result.error}: ${result.message}`);
                          }
                          setActiveJob(null);
                        }}
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
