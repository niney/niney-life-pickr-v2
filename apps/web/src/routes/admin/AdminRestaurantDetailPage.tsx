import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Loader2,
  Maximize2,
  MapPin,
  RefreshCw,
  X,
  Star,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import {
  ApiError,
  useActiveCrawlJobStore,
  useCancelCrawl,
  useDeleteRestaurant,
  useRestaurantByPlaceId,
  useRestaurantSummaryEvents,
  useStartCrawl,
} from '@repo/shared';
import type {
  BlogReviewType,
  CrawlModeType,
  MenuItemType,
  RestaurantDetailType,
  ReviewSummaryStatusType,
  VisitorReviewWithSummaryType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { ActiveJobPanel } from '~/components/restaurant/ActiveJobPanel';
import { MenuRankingSection } from '~/components/restaurant/MenuRankingSection';
import { VWorldMap } from '~/components/restaurant/VWorldMap';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import {
  ReviewSummaryItem,
  SectionHeader,
  SummaryProgressSection,
} from '~/components/restaurant/sections';

const PAGE_SIZE = 20;

type RatingFilter = 'all' | 1 | 2 | 3 | 4 | 5;
type SortMode = 'fetchedAt-asc' | 'rating-desc' | 'rating-asc' | 'visitedAt-desc';
type SummaryFilter = 'all' | ReviewSummaryStatusType | 'none';

const RATING_OPTIONS: { value: RatingFilter; label: string }[] = [
  { value: 'all', label: '별점 전체' },
  { value: 5, label: '★ 5' },
  { value: 4, label: '★ 4' },
  { value: 3, label: '★ 3' },
  { value: 2, label: '★ 2' },
  { value: 1, label: '★ 1' },
];

const SUMMARY_OPTIONS: { value: SummaryFilter; label: string }[] = [
  { value: 'all', label: '요약 전체' },
  { value: 'done', label: '요약 완료' },
  { value: 'running', label: '요약 진행' },
  { value: 'pending', label: '요약 대기' },
  { value: 'failed', label: '요약 실패' },
  { value: 'none', label: '요약 없음' },
];

const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-background px-2 text-xs ' +
  'shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'fetchedAt-asc', label: '최근 수집순' },
  { value: 'visitedAt-desc', label: '방문일 최신순' },
  { value: 'rating-desc', label: '별점 높은순' },
  { value: 'rating-asc', label: '별점 낮은순' },
];

const matchSummaryFilter = (
  r: VisitorReviewWithSummaryType,
  filter: SummaryFilter,
): boolean => {
  if (filter === 'all') return true;
  if (filter === 'none') return !r.summary;
  return r.summary?.status === filter;
};

// "YY.M.D.요일" → "YYYY-MM-DD" 정렬 키. 월/일이 zero-pad가 안 돼 있어 원문 그대로
// 비교하면 "25.8" > "25.12" 로 오판되므로 정규화 필수.
const visitedSortKey = (v: string | null): string => {
  if (!v) return '';
  const m = v.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `20${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
};

const sortReviews = (
  list: VisitorReviewWithSummaryType[],
  mode: SortMode,
): VisitorReviewWithSummaryType[] => {
  const arr = [...list];
  switch (mode) {
    case 'fetchedAt-asc':
      // 어댑터가 SSR 초기(최신 방문) → 페이지 더보기(옛날) 순으로 즉시 저장하므로
      // fetchedAt asc 가 곧 "Naver가 최신순으로 내려준 수집 순서".
      arr.sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
      break;
    case 'visitedAt-desc':
      arr.sort((a, b) =>
        visitedSortKey(b.visitedAt).localeCompare(visitedSortKey(a.visitedAt)),
      );
      break;
    case 'rating-desc':
      arr.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      break;
    case 'rating-asc':
      arr.sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99));
      break;
  }
  return arr;
};

const InfoSection = ({ detail }: { detail: RestaurantDetailType }) => {
  const s = detail.snapshot;
  const items: { label: string; value: string }[] = [];
  if (detail.address) items.push({ label: '주소', value: detail.address });
  if (s.roadAddress) items.push({ label: '도로명', value: s.roadAddress });
  if (detail.phone) items.push({ label: '전화', value: detail.phone });
  if (s.latitude !== null && s.longitude !== null) {
    items.push({ label: '좌표', value: `${s.latitude}, ${s.longitude}` });
  }
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHeader icon={<Info className="size-4" />} label="정보" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {items.map((it) => (
          <div key={it.label} className="contents">
            <dt className="text-muted-foreground">{it.label}</dt>
            <dd>{it.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const BusinessHoursSection = ({ hours }: { hours: string | null }) => {
  if (!hours || hours.trim().length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHeader icon={<Clock className="size-4" />} label="영업시간" />
      <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
        {hours}
      </pre>
    </section>
  );
};

const MenuSection = ({ menus }: { menus: MenuItemType[] }) => {
  if (menus.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<UtensilsCrossed className="size-4" />}
        label={`메뉴 (${menus.length})`}
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {menus.map((m, i) => {
          const thumb = m.imageUrls[0] ?? null;
          return (
            <li
              key={`${m.name}-${i}`}
              className="flex items-start gap-3 rounded-md border p-3"
            >
              {thumb && (
                <ImgWithFallback
                  src={thumb}
                  alt={m.name}
                  className="size-16 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  {m.recommend && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      추천
                    </Badge>
                  )}
                </div>
                {m.price && (
                  <div className="text-sm font-medium tabular-nums text-foreground/80">
                    {m.price}
                  </div>
                )}
                {m.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {m.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const ImageGallerySection = ({ urls }: { urls: string[] }) => {
  if (urls.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<ImageIcon className="size-4" />}
        label={`사진 (${urls.length})`}
      />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {urls.map((u) => (
          <li key={u}>
            <a href={u} target="_blank" rel="noreferrer" className="block">
              <ImgWithFallback
                src={u}
                className="aspect-square w-full rounded object-cover transition-opacity hover:opacity-80"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};

const BlogReviewsSection = ({ reviews }: { reviews: BlogReviewType[] }) => {
  const [expanded, setExpanded] = useState(false);
  if (reviews.length === 0) return null;
  const visible = expanded ? reviews : reviews.slice(0, 12);
  return (
    <section className="space-y-3">
      <SectionHeader label={`블로그 리뷰 (${reviews.length})`} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((b) => {
          const thumb = b.thumbnailUrls[0] ?? null;
          return (
            <li key={b.url} className="rounded-md border transition-colors hover:bg-muted/40">
              <a
                href={b.url}
                target="_blank"
                rel="noreferrer"
                className="block space-y-2 p-3"
              >
                {thumb && (
                  <ImgWithFallback
                    src={thumb}
                    className="aspect-video w-full rounded object-cover"
                  />
                )}
                <div className="line-clamp-2 text-sm font-medium">{b.title}</div>
                {b.excerpt && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{b.excerpt}</p>
                )}
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {b.authorName && <span>{b.authorName}</span>}
                  {b.date && <span>· {b.date}</span>}
                  <ExternalLink className="ml-auto size-3" />
                </div>
              </a>
            </li>
          );
        })}
      </ul>
      {reviews.length > 12 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '접기' : `${reviews.length - 12}개 더 보기`}
        </Button>
      )}
    </section>
  );
};

const VisitorReviewsSection = ({
  reviews,
}: {
  reviews: VisitorReviewWithSummaryType[];
}) => {
  const [rating, setRating] = useState<RatingFilter>('all');
  const [summary, setSummary] = useState<SummaryFilter>('all');
  const [sort, setSort] = useState<SortMode>('fetchedAt-asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = reviews;
    if (rating !== 'all') list = list.filter((r) => r.rating === rating);
    if (summary !== 'all') list = list.filter((r) => matchSummaryFilter(r, summary));
    return sortReviews(list, sort);
  }, [reviews, rating, summary, sort]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > visible.length;

  return (
    <section className="space-y-3">
      <SectionHeader
        label={`방문자 리뷰 (${filtered.length}/${reviews.length})`}
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <select
          value={String(rating)}
          onChange={(e) => {
            const v = e.target.value;
            setRating(v === 'all' ? 'all' : (Number(v) as RatingFilter));
            setPage(1);
          }}
          className={SELECT_CLASS}
        >
          {RATING_OPTIONS.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value as SummaryFilter);
            setPage(1);
          }}
          className={SELECT_CLASS}
        >
          {SUMMARY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className={SELECT_CLASS}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          조건에 해당하는 리뷰가 없습니다.
        </p>
      ) : (
        <ul className="divide-y">
          {visible.map((r) => (
            <ReviewSummaryItem key={r.id} r={r} />
          ))}
        </ul>
      )}
      {hasMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => p + 1)}
        >
          {filtered.length - visible.length}개 더 보기
        </Button>
      )}
    </section>
  );
};

export const AdminRestaurantDetailPage = () => {
  const { placeId } = useParams<{ placeId: string }>();
  const navigate = useNavigate();
  const detailQuery = useRestaurantByPlaceId(placeId ?? null);
  // Subscribe to summary events so the detail cache + summary card stay
  // live during/after a recrawl initiated elsewhere (or a fresh re-summarize
  // we kick off from this page).
  const summaryStatusQuery = useRestaurantSummaryEvents(placeId ?? null);

  const startMutation = useStartCrawl();
  const cancelMutation = useCancelCrawl();
  const deleteMutation = useDeleteRestaurant();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  // Pull only the job whose placeId matches this page. Multiple jobs can be
  // running globally (different restaurants), but the detail page only cares
  // about its own. Returning the matched object directly keeps zustand's
  // default reference equality stable across unrelated job updates.
  const activeJob = useActiveCrawlJobStore((s) => {
    for (const j of Object.values(s.jobs)) {
      if (j.placeId === placeId) return j;
    }
    return null;
  });
  const addJob = useActiveCrawlJobStore((s) => s.add);
  const removeJob = useActiveCrawlJobStore((s) => s.remove);

  if (!placeId) return <Navigate to="/admin/restaurants" replace />;

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
        </div>
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          to="/admin/restaurants"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 목록
        </Link>
        <Card>
          <CardContent className="flex h-32 items-center justify-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            맛집을 찾을 수 없습니다.
          </CardContent>
        </Card>
      </div>
    );
  }

  const detail = detailQuery.data;
  const s = detail.snapshot;

  const handleAction = async (mode: CrawlModeType) => {
    setError(null);
    try {
      const result = await startMutation.mutateAsync({ url: detail.rawSourceUrl, mode });
      if (result.ok) {
        // Recrawl cascade-deletes existing reviews server-side, so the cached
        // detail's review ids will all become stale. Wipe them now so the
        // streamed batches don't end up interleaved with about-to-vanish rows.
        if (mode === 'recrawl') {
          qc.setQueryData<RestaurantDetailType | null>(
            ['restaurant', detail.placeId],
            (prev) => (prev ? { ...prev, reviews: [] } : prev),
          );
        }
        addJob({
          jobId: result.jobId,
          placeId: detail.placeId,
          mode,
          source: 'list-row',
        });
      } else {
        setError(`${result.error}: ${result.message}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to start');
    }
  };

  const handleCancelJob = () => {
    if (activeJob) cancelMutation.mutate(activeJob.jobId);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    try {
      await deleteMutation.mutateAsync(detail.placeId);
      navigate('/admin/restaurants');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to delete');
      setConfirmDelete(false);
    }
  };

  const summaryInFlight =
    (summaryStatusQuery.data?.pending ?? 0) +
    (summaryStatusQuery.data?.running ?? 0);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 sm:py-10 xl:max-w-7xl xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
      {/* 진행 중 크롤 / 크롤 후에도 도는 AI 요약은 본문 정보(제목·별점·메타)
          보다 위로 — 들어오자마자 현재 상태가 가장 먼저 보이게.
          activeJob 이 있으면 ActiveJobPanel 내부에서 요약 진행도 함께 표시,
          크롤은 끝났는데 요약이 trailing 으로 도는 동안은 SummaryProgress 가
          이어받는다 (조건이 상호 배타라 둘이 동시에 뜨지 않음). */}
      {activeJob && (
        <ActiveJobPanel
          jobId={activeJob.jobId}
          placeId={detail.placeId}
          onPlaceIdResolved={() => {}}
          onCancel={handleCancelJob}
          showInlineReviewList={false}
          onFinished={(result) => {
            if (!result.ok) {
              setError(`${result.error}: ${result.message}`);
            }
            removeJob(activeJob.jobId);
          }}
        />
      )}
      {!activeJob && summaryStatusQuery.data && summaryInFlight > 0 && (
        <Card>
          <CardContent className="py-4">
            <SummaryProgressSection status={summaryStatusQuery.data} />
          </CardContent>
        </Card>
      )}
      <div>
        <Link
          to="/admin/restaurants"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 목록
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{detail.name}</h1>
              {detail.category && (
                <span className="text-sm text-muted-foreground">{detail.category}</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              {detail.rating !== null && (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                  <Star className="size-3.5 fill-current text-amber-500" />
                  {detail.rating}
                </span>
              )}
              {detail.reviewCount !== null && (
                <span className="text-sm text-foreground/80">
                  리뷰 <span className="font-medium">{detail.reviewCount}</span>
                </span>
              )}
              <span className="text-sm text-foreground/80">
                DB <span className="font-medium">{detail.reviews.length}</span>
              </span>
              <span className="ml-2 text-muted-foreground">
                마지막 크롤 {new Date(detail.lastCrawledAt).toLocaleString('ko-KR')}
              </span>
              <a
                href={detail.rawSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" /> 원본
              </a>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAction('update')}
              disabled={startMutation.isPending || !!activeJob}
            >
              업데이트
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleAction('recrawl')}
              disabled={startMutation.isPending || !!activeJob}
            >
              <RefreshCw />
              재크롤링
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  정말 삭제
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteMutation.isPending}
                >
                  취소
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                aria-label="삭제"
                title="삭제"
              >
                <Trash2 />
              </Button>
            )}
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      <Card>
        <CardContent className="divide-y [&>*]:py-4">
          <InfoSection detail={detail} />
          <BusinessHoursSection hours={s.businessHours} />
          <MenuSection menus={s.menus} />
          <ImageGallerySection urls={s.imageUrls} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <MenuRankingSection placeId={detail.placeId} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <VisitorReviewsSection reviews={detail.reviews} />
        </CardContent>
      </Card>

      {s.blogReviews.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <BlogReviewsSection reviews={s.blogReviews} />
          </CardContent>
        </Card>
      )}
      </div>

      {/*
        우측 사이드바 — xl 이상에서만 노출. 모바일/태블릿은 좌측 본문에
        InfoSection 으로 좌표 정보가 이미 들어있어 지도가 없어도 정보 부재
        문제는 없다.
      */}
      <aside className="hidden xl:block">
        <div className="sticky top-4 space-y-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <SectionHeader icon={<MapPin className="size-4" />} label="위치" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMapExpanded(true)}
                  aria-label="지도 크게 보기"
                  title="지도 크게 보기"
                  className="h-7 px-2"
                >
                  <Maximize2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3">
                <VWorldMap
                  lat={s.latitude}
                  lng={s.longitude}
                  name={detail.name}
                />
              </div>
              {detail.address && (
                <p className="mt-3 text-sm text-foreground/80">{detail.address}</p>
              )}
              {s.roadAddress && (
                <p className="text-xs text-muted-foreground">{s.roadAddress}</p>
              )}
              {detail.phone && (
                <p className="mt-1 text-xs text-muted-foreground">전화 {detail.phone}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </aside>

      {/*
        풀 높이 우측 슬라이드오버. 사이드바의 컴팩트 카드와 별개의 VWorldMap
        인스턴스를 렌더링한다 — 같은 ol Map 을 두 컨테이너에 옮겨 다는 건
        ol API 가 정식 지원하지 않고 (setTarget 으로 가능하긴 하나 view·layer
        상태가 어색해진다), 두 인스턴스 비용은 무시할 만하다.
      */}
      <Dialog.Root open={mapExpanded} onOpenChange={setMapExpanded}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
          <Dialog.Content
            // 우측에서 슬라이드 인. 모바일은 화면 거의 전체, 데스크톱은
            // 740px 정도로 제한.
            className="fixed inset-y-0 right-0 z-50 flex h-screen w-full flex-col border-l bg-background shadow-xl outline-none sm:max-w-[740px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          >
            <header className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <div className="min-w-0">
                <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="size-4" />
                  <span className="truncate">{detail.name}</span>
                </Dialog.Title>
                {detail.address && (
                  <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                    {detail.address}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="닫기"
                  className="h-8 w-8 shrink-0 p-0"
                >
                  <X className="size-4" />
                </Button>
              </Dialog.Close>
            </header>

            <div className="flex-1 p-4">
              <VWorldMap
                lat={s.latitude}
                lng={s.longitude}
                name={detail.name}
                className="h-full w-full"
              />
            </div>

            {(s.roadAddress || detail.phone) && (
              <div className="border-t px-5 py-3 text-xs text-muted-foreground">
                {s.roadAddress && <div>도로명 · {s.roadAddress}</div>}
                {detail.phone && <div>전화 · {detail.phone}</div>}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
