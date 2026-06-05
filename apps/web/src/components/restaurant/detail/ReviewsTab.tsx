import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useRestaurantPublicReviews } from '@repo/shared';
import type {
  PublicVisitorReviewType,
  RestaurantPublicDetailType,
  RestaurantPublicReviewSentimentType,
  RestaurantPublicReviewSortType,
} from '@repo/api-contract';
import { cn } from '~/lib/utils';
import { ReviewCard } from './shared';

const FILTERS: Array<{ value: RestaurantPublicReviewSentimentType; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'positive', label: '긍정' },
  { value: 'negative', label: '부정' },
];

interface Props {
  placeId: string;
  detail: RestaurantPublicDetailType;
  // 홈 탭 방문 팁 클릭으로 넘어온 필터. null 이면 미적용.
  tip?: string | null;
  onClearTip?(): void;
  // 메뉴 클릭으로 넘어온 필터. null 이면 미적용. tip 과 동시 1개만 활성.
  menu?: string | null;
  onClearMenu?(): void;
}

export const ReviewsTab = ({
  placeId,
  detail,
  tip,
  onClearTip,
  menu,
  onClearMenu,
}: Props) => {
  const [sentiment, setSentiment] =
    useState<RestaurantPublicReviewSentimentType>('all');
  const [sort, setSort] = useState<RestaurantPublicReviewSortType>('recent');

  const seed = useMemo(
    () => ({
      items: detail.reviewsFirstPage,
      total: detail.reviewCounts.all,
    }),
    [detail.reviewsFirstPage, detail.reviewCounts.all],
  );

  const reviewsQuery = useRestaurantPublicReviews(
    placeId,
    { sentiment, sort, tip: tip ?? undefined, menu: menu ?? undefined },
    seed,
  );

  // tip/menu 는 동시 1개만 — 활성 칩 하나로 표현. total 은 현재 필터 적용 결과 수.
  const activeChip = tip
    ? { label: '방문 팁', value: tip, onClear: onClearTip }
    : menu
      ? { label: '메뉴', value: menu, onClear: onClearMenu }
      : null;
  const filterTotal = reviewsQuery.data?.pages[0]?.total ?? 0;

  const flat: PublicVisitorReviewType[] = useMemo(
    () =>
      reviewsQuery.data ? reviewsQuery.data.pages.flatMap((p) => p.items) : [],
    [reviewsQuery.data],
  );

  // 두 출처가 모두 리뷰를 가질 때만 카드에 출처 배지를 노출.
  const bothSources =
    detail.storedReviewCount.naver > 0 && detail.storedReviewCount.diningcode > 0;

  if (detail.reviewCounts.all === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        아직 수집된 리뷰가 없습니다.
      </div>
    );
  }

  const hasMore = reviewsQuery.hasNextPage ?? false;
  const isLoadingMore = reviewsQuery.isFetchingNextPage;

  return (
    <div className="space-y-3 p-4">
      {activeChip && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">{activeChip.label} · </span>
            <span className="font-medium">{activeChip.value}</span>
            <span className="ml-1 tabular-nums text-muted-foreground">
              ({filterTotal})
            </span>
          </span>
          {activeChip.onClear && (
            <button
              type="button"
              onClick={activeChip.onClear}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`${activeChip.label} 필터 해제`}
            >
              <X className="size-3" />
              해제
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => {
            const active = sentiment === f.value;
            const c = detail.reviewCounts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setSentiment(f.value)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                )}
              >
                {f.label} <span className="tabular-nums opacity-80">{c}</span>
              </button>
            );
          })}
        </div>

        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          정렬
          <select
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as RestaurantPublicReviewSortType)
            }
            className="h-7 rounded border bg-background px-1.5 text-xs"
          >
            <option value="recent">최근 수집순</option>
            <option value="rating">별점 높은순</option>
          </select>
        </label>
      </div>

      {reviewsQuery.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          불러오는 중…
        </div>
      ) : flat.length === 0 ? (
        <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          조건에 맞는 리뷰가 없습니다.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {flat.map((r) => (
              <li key={r.id}>
                <ReviewCard r={r} showSource={bothSources} />
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => reviewsQuery.fetchNextPage()}
              disabled={isLoadingMore}
              className="w-full rounded-md border bg-background py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
            >
              {isLoadingMore ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </>
      )}
    </div>
  );
};
