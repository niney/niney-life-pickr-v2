import { useMemo, useState } from 'react';
import type {
  PublicVisitorReviewType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { cn } from '~/lib/utils';
import { ReviewCard } from './shared';

type SentimentFilter = 'all' | 'positive' | 'negative';
type SortMode = 'recent' | 'rating';
type SourceFilter = 'all' | 'naver' | 'diningcode';

const FILTERS: Array<{ value: SentimentFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'positive', label: '긍정' },
  { value: 'negative', label: '부정' },
];

const SOURCE_FILTERS: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'naver', label: '네이버' },
  { value: 'diningcode', label: '다이닝코드' },
];

interface Props {
  detail: RestaurantPublicDetailType;
}

export const ReviewsTab = ({ detail }: Props) => {
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sort, setSort] = useState<SortMode>('recent');

  const visible = useMemo(() => {
    let list = detail.reviews;
    if (sentimentFilter !== 'all') {
      list = list.filter((r) => r.analysis?.sentiment === sentimentFilter);
    }
    if (sourceFilter !== 'all') {
      list = list.filter((r) => r.source === sourceFilter);
    }
    return [...list].sort(comparator(sort));
  }, [detail.reviews, sentimentFilter, sourceFilter, sort]);

  const sentimentCounts = useMemo(
    () => countBySentiment(detail.reviews),
    [detail.reviews],
  );
  const sourceCounts = useMemo(() => countBySource(detail.reviews), [detail.reviews]);
  // 두 출처가 모두 리뷰를 가질 때만 출처 칩 라인 + 카드 출처 배지 노출.
  const bothSources = sourceCounts.naver > 0 && sourceCounts.diningcode > 0;

  if (detail.reviews.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        아직 수집된 리뷰가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {bothSources && (
        <div className="flex gap-1">
          {SOURCE_FILTERS.map((f) => {
            const active = sourceFilter === f.value;
            const c = sourceCounts[f.value];
            // 'all' 은 항상 노출. 출처별 칩은 카운트가 0 이면 숨김(병합 직후 한
            // 쪽 출처에 아직 리뷰가 없는 케이스).
            if (f.value !== 'all' && c === 0) return null;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setSourceFilter(f.value)}
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
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => {
            const active = sentimentFilter === f.value;
            const c = sentimentCounts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setSentimentFilter(f.value)}
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
              <ReviewCard r={r} showSource={bothSources} />
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

const countBySource = (
  reviews: PublicVisitorReviewType[],
): Record<SourceFilter, number> => {
  const out: Record<SourceFilter, number> = { all: reviews.length, naver: 0, diningcode: 0 };
  for (const r of reviews) {
    if (r.source === 'naver') out.naver += 1;
    else if (r.source === 'diningcode') out.diningcode += 1;
  }
  return out;
};

const comparator = (mode: SortMode) => {
  if (mode === 'rating') {
    return (a: PublicVisitorReviewType, b: PublicVisitorReviewType) =>
      (b.rating ?? 0) - (a.rating ?? 0);
  }
  // recent — 서버가 두 출처 합쳐서 fetchedAt desc 로 내려보내므로 동일 방향
  // (최근 수집순)을 유지. 어드민 detail 의 fetchedAt asc 와는 의미가 반대.
  return (a: PublicVisitorReviewType, b: PublicVisitorReviewType) =>
    +new Date(b.fetchedAt) - +new Date(a.fetchedAt);
};
