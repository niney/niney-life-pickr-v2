import { useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useRestaurantReviewMatch, useResummarizeReview } from '@repo/shared';
import { compareReviewRecencyDesc } from '@repo/utils';
import type { AdminVisitorReviewType, ReviewSummaryStatusType } from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { ModelPickerPopup } from '~/components/restaurant/detail/ModelPickerPopup';
import { AdminReviewItem } from './AdminReviewItem';

// 어드민 상세 "리뷰" 탭 — 같은 가게(canonical)의 모든 출처 리뷰. 예전 상세의 운영 필터(별점·요약
// 상태·정렬)를 그대로 두고 출처·감정·본문 검색과, 홈·분석·메뉴 탭에서 팁/메뉴를 눌러 넘어온
// 필터를 더한다. 리뷰는 상세 응답에 전부 실려 오므로 팁/메뉴 외에는 모두 클라이언트에서 거른다
// (팁/메뉴는 서버가 공개 리뷰 목록과 같은 규칙으로 매칭한 id 집합).

const PAGE_SIZE = 20;

export type ReviewFilter = { kind: 'tip' | 'menu'; value: string };

type SourceFilter = 'all' | string;
type SentimentFilter = 'all' | 'positive' | 'negative' | 'mixed' | 'neutral';
type SummaryFilter = 'all' | 'done' | 'running' | 'waiting' | 'failed' | 'cancelled' | 'none';
type RatingFilter = 'all' | 1 | 2 | 3 | 4 | 5;
type SortMode = 'visitedAt-desc' | 'fetchedAt-desc' | 'rating-desc' | 'rating-asc';

const SOURCE_LABEL: Record<string, string> = {
  naver: '네이버',
  diningcode: '다이닝코드',
  tabling: '테이블링',
};

const SENTIMENT_OPTIONS: { value: SentimentFilter; label: string }[] = [
  { value: 'all', label: '감정 전체' },
  { value: 'positive', label: '긍정' },
  { value: 'negative', label: '부정' },
  { value: 'mixed', label: '혼합' },
  { value: 'neutral', label: '중립' },
];

const SUMMARY_OPTIONS: { value: SummaryFilter; label: string }[] = [
  { value: 'all', label: '요약 전체' },
  { value: 'done', label: '요약 완료' },
  { value: 'running', label: '요약 진행' },
  { value: 'waiting', label: '요약 대기' },
  { value: 'failed', label: '요약 실패' },
  { value: 'cancelled', label: '요약 중지' },
  { value: 'none', label: '요약 없음' },
];

const RATING_OPTIONS: { value: RatingFilter; label: string }[] = [
  { value: 'all', label: '별점 전체' },
  { value: 5, label: '★ 5' },
  { value: 4, label: '★ 4' },
  { value: 3, label: '★ 3' },
  { value: 2, label: '★ 2' },
  { value: 1, label: '★ 1' },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'visitedAt-desc', label: '방문일 최신순' },
  { value: 'fetchedAt-desc', label: '최근 수집순' },
  { value: 'rating-desc', label: '별점 높은순' },
  { value: 'rating-asc', label: '별점 낮은순' },
];

const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-background px-2 text-xs ' +
  'shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1';

const summaryBucket = (status: ReviewSummaryStatusType | undefined): SummaryFilter => {
  if (!status) return 'none';
  if (status === 'queued' || status === 'pending') return 'waiting';
  return status;
};

const sentimentOf = (r: AdminVisitorReviewType): SentimentFilter | null =>
  r.summary?.status === 'done' ? (r.summary.sentiment ?? null) : null;

const sortReviews = (list: AdminVisitorReviewType[], mode: SortMode): AdminVisitorReviewType[] => {
  const arr = [...list];
  switch (mode) {
    case 'visitedAt-desc':
      arr.sort(compareReviewRecencyDesc);
      break;
    case 'fetchedAt-desc':
      arr.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
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

// 옵션 라벨 뒤에 전체 기준 건수를 붙인다 — 어느 상태가 몇 건인지 필터를 열자마자 보이게.
const withCount = (label: string, count: number | undefined): string =>
  count === undefined ? label : `${label} (${count.toLocaleString()})`;

interface Props {
  placeId: string;
  canonicalId: string;
  reviews: AdminVisitorReviewType[];
  // 홈·분석·메뉴 탭에서 팁/메뉴를 눌러 넘어온 필터. null 이면 미적용.
  filter: ReviewFilter | null;
  onClearFilter(): void;
}

export const AdminReviewsTab = ({ placeId, canonicalId, reviews, filter, onClearFilter }: Props) => {
  const [source, setSource] = useState<SourceFilter>('all');
  const [sentiment, setSentiment] = useState<SentimentFilter>('all');
  const [summary, setSummary] = useState<SummaryFilter>('all');
  const [rating, setRating] = useState<RatingFilter>('all');
  const [sort, setSort] = useState<SortMode>('visitedAt-desc');
  const [query, setQuery] = useState('');
  const q = query.trim();

  const match = useRestaurantReviewMatch(placeId, {
    tip: filter?.kind === 'tip' ? filter.value : null,
    menu: filter?.kind === 'menu' ? filter.value : null,
  });
  const { resummarize, pending } = useResummarizeReview(placeId, canonicalId);
  const [pickerReviewId, setPickerReviewId] = useState<string | null>(null);

  // 필터 옵션 옆 건수 — 다른 필터와 무관한 전체 기준.
  const counts = useMemo(() => {
    const bySource = new Map<string, number>();
    const bySentiment = new Map<SentimentFilter, number>();
    const bySummary = new Map<SummaryFilter, number>();
    for (const r of reviews) {
      bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
      const sent = sentimentOf(r);
      if (sent) bySentiment.set(sent, (bySentiment.get(sent) ?? 0) + 1);
      const bucket = summaryBucket(r.summary?.status);
      bySummary.set(bucket, (bySummary.get(bucket) ?? 0) + 1);
    }
    return { bySource, bySentiment, bySummary };
  }, [reviews]);
  const sources = [...counts.bySource.keys()];
  const showSource = sources.length >= 2;

  const matchIds = useMemo(
    () => (match.data ? new Set(match.data.reviewIds) : null),
    [match.data],
  );

  const filtered = useMemo(() => {
    let list = reviews;
    if (filter) list = matchIds ? list.filter((r) => matchIds.has(r.id)) : [];
    if (source !== 'all') list = list.filter((r) => r.source === source);
    if (sentiment !== 'all') list = list.filter((r) => sentimentOf(r) === sentiment);
    if (summary !== 'all') list = list.filter((r) => summaryBucket(r.summary?.status) === summary);
    if (rating !== 'all') list = list.filter((r) => r.rating === rating);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.body.toLowerCase().includes(needle) ||
          (r.summary?.text?.toLowerCase().includes(needle) ?? false) ||
          (r.authorName?.toLowerCase().includes(needle) ?? false),
      );
    }
    return sortReviews(list, sort);
  }, [reviews, filter, matchIds, source, sentiment, summary, rating, q, sort]);

  // 필터가 바뀌면 첫 페이지부터 — 필터 조합을 서명으로 들고 렌더 중에 비교한다.
  const signature = [filter?.kind, filter?.value, source, sentiment, summary, rating, sort, q].join('|');
  const [pageState, setPageState] = useState({ signature, page: 1 });
  const page = pageState.signature === signature ? pageState.page : 1;
  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > visible.length;

  if (reviews.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        아직 수집된 리뷰가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {filter && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">
              {filter.kind === 'tip' ? '방문 팁' : '메뉴'} ·{' '}
            </span>
            <span className="font-medium">{filter.value}</span>
            {matchIds && (
              <span className="ml-1 tabular-nums text-muted-foreground">({matchIds.size})</span>
            )}
          </span>
          <button
            type="button"
            onClick={onClearFilter}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`${filter.kind === 'tip' ? '방문 팁' : '메뉴'} 필터 해제`}
          >
            <X className="size-3" />
            해제
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {showSource && (
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={SELECT_CLASS}
            aria-label="출처 필터"
          >
            <option value="all">{withCount('출처 전체', reviews.length)}</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {withCount(SOURCE_LABEL[s] ?? s, counts.bySource.get(s))}
              </option>
            ))}
          </select>
        )}
        <select
          value={sentiment}
          onChange={(e) => setSentiment(e.target.value as SentimentFilter)}
          className={SELECT_CLASS}
          aria-label="감정 필터"
        >
          {SENTIMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === 'all' ? o.label : withCount(o.label, counts.bySentiment.get(o.value) ?? 0)}
            </option>
          ))}
        </select>
        <select
          value={summary}
          onChange={(e) => setSummary(e.target.value as SummaryFilter)}
          className={SELECT_CLASS}
          aria-label="요약 상태 필터"
        >
          {SUMMARY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === 'all' ? o.label : withCount(o.label, counts.bySummary.get(o.value) ?? 0)}
            </option>
          ))}
        </select>
        <select
          value={String(rating)}
          onChange={(e) => {
            const v = e.target.value;
            setRating(v === 'all' ? 'all' : (Number(v) as RatingFilter));
          }}
          className={SELECT_CLASS}
          aria-label="별점 필터"
        >
          {RATING_OPTIONS.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className={SELECT_CLASS}
          aria-label="정렬"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="본문·요약·작성자 검색"
            aria-label="리뷰 검색"
            className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </label>
      </div>

      <div className="text-xs text-muted-foreground tabular-nums">
        {filtered.length.toLocaleString()} / {reviews.length.toLocaleString()}건
      </div>

      {filter && match.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 필터에 맞는 리뷰를 찾는 중…
        </div>
      ) : filter && match.isError ? (
        <p className="py-6 text-center text-sm text-destructive">
          필터 결과를 불러오지 못했습니다.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          조건에 해당하는 리뷰가 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((r) => (
            <li key={r.id}>
              <AdminReviewItem
                r={r}
                showSource={showSource}
                isResummarizing={pending.has(r.id)}
                onResummarize={() => setPickerReviewId(r.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPageState({ signature, page: page + 1 })}
        >
          {(filtered.length - visible.length).toLocaleString()}개 더 보기
        </Button>
      )}

      <ModelPickerPopup
        open={pickerReviewId !== null}
        onClose={() => setPickerReviewId(null)}
        onSelect={(model) => {
          if (!pickerReviewId) return;
          // 재분류 전 sentiment 를 같이 넘김 → 완료 토스트의 "부정→긍정" 델타용.
          const target = reviews.find((r) => r.id === pickerReviewId);
          resummarize(pickerReviewId, model, target ? sentimentOf(target) : null);
        }}
      />
    </div>
  );
};
