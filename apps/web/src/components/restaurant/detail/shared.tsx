import { useState } from 'react';
import type {
  PublicVisitorReviewType,
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import {
  ExternalLink,
  Navigation,
  Phone,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { cn } from '~/lib/utils';
import { Lightbox } from './Lightbox';

// 패널 탭들에서 공유하는 시각 요소. 데이터 fetch 는 root 에서, 여기는 순수
// 표시용.

export const QuickActions = ({ detail }: { detail: RestaurantPublicDetailType }) => {
  const naverLink = `https://map.naver.com/p/search/${encodeURIComponent(detail.name)}`;
  const dirLink =
    detail.latitude !== null && detail.longitude !== null
      ? `https://map.naver.com/p/directions/-/${detail.longitude},${detail.latitude},${encodeURIComponent(detail.name)}/-/transit?c=15`
      : naverLink;
  return (
    <div className="flex flex-wrap gap-2">
      <a href={dirLink} target="_blank" rel="noreferrer">
        <Button type="button" size="sm" className="gap-1">
          <Navigation className="size-3.5" />
          길찾기
        </Button>
      </a>
      <a href={detail.rawSourceUrl} target="_blank" rel="noreferrer">
        <Button type="button" size="sm" variant="outline" className="gap-1">
          <ExternalLink className="size-3.5" />
          네이버 지도
        </Button>
      </a>
      {detail.phone && (
        <a href={`tel:${detail.phone}`}>
          <Button type="button" size="sm" variant="outline" className="gap-1">
            <Phone className="size-3.5" />
            전화
          </Button>
        </a>
      )}
    </div>
  );
};

export const AiSummary = ({ insights }: { insights: RestaurantInsightsType }) => {
  const dist = insights.sentimentDistribution;
  const total = dist.positive + dist.negative + dist.neutral + dist.mixed;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="평균 만족도"
          value={
            insights.avgSatisfactionScore !== null
              ? `${insights.avgSatisfactionScore.toFixed(1)} / 5`
              : '—'
          }
        />
        <Stat
          label="평균 감정 점수"
          value={
            insights.avgSentimentScore !== null
              ? insights.avgSentimentScore.toFixed(2)
              : '—'
          }
          hint="-1(부정) ~ +1(긍정)"
        />
      </div>

      {total > 0 && (
        <div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${pct(dist.positive)}%` }} />
            <div className="bg-zinc-400" style={{ width: `${pct(dist.neutral)}%` }} />
            <div className="bg-amber-400" style={{ width: `${pct(dist.mixed)}%` }} />
            <div className="bg-rose-500" style={{ width: `${pct(dist.negative)}%` }} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400">긍정 {dist.positive}</span>
            <span>중립 {dist.neutral}</span>
            <span className="text-amber-600 dark:text-amber-400">혼합 {dist.mixed}</span>
            <span className="text-rose-600 dark:text-rose-400">부정 {dist.negative}</span>
            <span>· 총 {total}</span>
          </div>
        </div>
      )}

      {insights.topKeywords.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">자주 언급되는 키워드</div>
          <div className="flex flex-wrap gap-1.5">
            {insights.topKeywords.slice(0, 12).map((k) => (
              <Badge key={k.term} variant="secondary" className="text-[11px]">
                {k.term} ·{k.count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {insights.topTips.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">방문 팁</div>
          <ul className="space-y-0.5 text-xs">
            {insights.topTips.slice(0, 8).map((t) => (
              <li key={t.term}>· {t.term}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-md border bg-muted/30 p-2.5">
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
  </div>
);

export const MenuGrid = ({
  menus,
  insights,
}: {
  menus: RestaurantPublicDetailType['menus'];
  insights: RestaurantInsightsType | undefined;
}) => {
  const mentionByName = new Map<string, { positive: number; negative: number; count: number }>();
  if (insights) {
    for (const m of insights.topMenus) mentionByName.set(m.name, m);
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {menus.map((m, idx) => {
        const stats = mentionByName.get(m.name);
        return (
          <li key={`${m.name}-${idx}`} className="flex gap-2 rounded-md border p-2">
            {m.imageUrls[0] && (
              <ImgWithFallback
                src={m.imageUrls[0]}
                className="size-14 shrink-0 rounded object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{m.name}</span>
                {m.recommend && (
                  <Badge variant="secondary" className="text-[10px]">
                    추천
                  </Badge>
                )}
              </div>
              {m.price && (
                <div className="text-xs tabular-nums text-muted-foreground">{m.price}</div>
              )}
              {m.description && (
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {m.description}
                </div>
              )}
              {stats && (
                <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{stats.positive}
                  </span>
                  <span className="mx-1">/</span>
                  <span className="text-rose-600 dark:text-rose-400">-{stats.negative}</span>
                  <span className="ml-1">· {stats.count}회 언급</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export const ReviewCard = ({ r }: { r: PublicVisitorReviewType }) => {
  // 이미지 lightbox 인덱스. null 이면 닫힘. 카드별 독립 상태라 다른 리뷰
  // 카드의 lightbox 와 간섭하지 않는다.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const authorLabel = r.authorName ?? '익명';
  return (
    <div
      className={cn(
        'rounded-md border p-2.5',
        r.analysis?.sentiment === 'positive' &&
          'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-900/10',
        r.analysis?.sentiment === 'negative' &&
          'border-rose-200 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-900/10',
      )}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{authorLabel}</span>
        <span>{r.visitedAt ?? r.fetchedAt.slice(0, 10)}</span>
      </div>
      {r.analysis && <div className="mt-1 text-sm font-medium">{r.analysis.text}</div>}
      <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{r.body}</div>
      {r.imageUrls.length > 0 && (
        // 카드 패딩(p-2.5) 만큼 음수 마진 — 첫·마지막 이미지가 카드 가장자리에
        // 붙어 "더 콘텐츠가 있다" 신호. snap-x + snap-start 로 한 장씩 깔끔히
        // 정렬. iOS pull-to-refresh 와 가로 스크롤 충돌 방지: overscroll-x-contain.
        <div
          className={cn(
            '-mx-2.5 mt-2 flex gap-1.5 overflow-x-auto overscroll-x-contain px-2.5',
            'snap-x snap-mandatory',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {r.imageUrls.map((u, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`${authorLabel} 리뷰 ${i + 1}번 사진 크게 보기`}
              className="shrink-0 snap-start overflow-hidden rounded bg-muted"
            >
              <ImgWithFallback
                src={u}
                className="h-56 w-auto object-cover transition-transform active:scale-95 sm:h-64"
              />
            </button>
          ))}
        </div>
      )}
      {r.analysis && r.analysis.keywords.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {r.analysis.keywords.slice(0, 8).map((k) => (
            <span
              key={k}
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {k}
            </span>
          ))}
        </div>
      )}
      {lightboxIndex !== null && r.imageUrls.length > 0 && (
        <Lightbox
          images={r.imageUrls}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
};
