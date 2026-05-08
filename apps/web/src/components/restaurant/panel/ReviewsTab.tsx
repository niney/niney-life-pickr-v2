import { useMemo, useState } from 'react';
import type {
  PublicVisitorReviewType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { cn } from '~/lib/utils';
import { ReviewCard } from './panelShared';

type SentimentFilter = 'all' | 'positive' | 'negative';
type SortMode = 'recent' | 'rating';

const FILTERS: Array<{ value: SentimentFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'positive', label: '긍정' },
  { value: 'negative', label: '부정' },
];

interface Props {
  detail: RestaurantPublicDetailType;
}

export const ReviewsTab = ({ detail }: Props) => {
  const [filter, setFilter] = useState<SentimentFilter>('all');
  const [sort, setSort] = useState<SortMode>('recent');

  const visible = useMemo(() => {
    let list = detail.reviews;
    if (filter !== 'all') {
      list = list.filter((r) => r.analysis?.sentiment === filter);
    }
    return [...list].sort(comparator(sort));
  }, [detail.reviews, filter, sort]);

  const counts = useMemo(() => countBySentiment(detail.reviews), [detail.reviews]);

  if (detail.reviews.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        아직 수집된 리뷰가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const c = counts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
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
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="h-7 rounded border bg-background px-1.5 text-xs"
          >
            <option value="recent">최근 수집순</option>
            <option value="rating">별점 높은순</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          조건에 맞는 리뷰가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li key={r.id}>
              <ReviewCard r={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const countBySentiment = (
  reviews: PublicVisitorReviewType[],
): Record<SentimentFilter, number> => {
  const out: Record<SentimentFilter, number> = { all: reviews.length, positive: 0, negative: 0 };
  for (const r of reviews) {
    if (r.analysis?.sentiment === 'positive') out.positive += 1;
    else if (r.analysis?.sentiment === 'negative') out.negative += 1;
  }
  return out;
};

const comparator = (mode: SortMode) => {
  if (mode === 'rating') {
    return (a: PublicVisitorReviewType, b: PublicVisitorReviewType) =>
      (b.rating ?? 0) - (a.rating ?? 0);
  }
  // recent — fetchedAt desc (최근에 수집된 게 위로)
  return (a: PublicVisitorReviewType, b: PublicVisitorReviewType) =>
    +new Date(b.fetchedAt) - +new Date(a.fetchedAt);
};
