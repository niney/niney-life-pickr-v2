import { useMemo, useState } from 'react';
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
}

export const ReviewsTab = ({ placeId, detail }: Props) => {
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
    { sentiment, sort },
    seed,
  );

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
          <ul className="space-y-2">
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
