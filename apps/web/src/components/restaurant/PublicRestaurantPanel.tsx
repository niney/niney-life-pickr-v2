import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Star,
  X,
} from 'lucide-react';
import { ApiError, useRestaurantPublic, useRestaurantPublicInsights } from '@repo/shared';
import type {
  PublicVisitorReviewType,
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { cn } from '~/lib/utils';

interface Props {
  placeId: string;
  onClose(): void;
}

// 좌측 사이드바 위로 슬라이드인하는 식당 상세. 데이터/통계 모두 최대한 활용:
// 이름/카테고리/별점 → 사진 캐러셀 → 퀵 액션 → AI 분석 → 메뉴 → 영업정보 →
// 블로그 리뷰 → 방문자 리뷰. 인사이트(통계) 와 detail(원시) 두 쿼리 병행.
export const PublicRestaurantPanel = ({ placeId, onClose }: Props) => {
  const detail = useRestaurantPublic(placeId);
  const insights = useRestaurantPublicInsights(placeId);

  const isNotFound =
    detail.isError &&
    detail.error instanceof ApiError &&
    detail.error.statusCode === 404;

  return (
    <div
      role="dialog"
      aria-label="식당 상세"
      className="flex h-full flex-col bg-background animate-in slide-in-from-left-4 fade-in duration-200"
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="gap-1"
          aria-label="목록으로"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">목록</span>
        </Button>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold">
          {detail.data?.name ?? '식당 상세'}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="닫기"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {detail.isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : isNotFound ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            요청한 식당을 찾을 수 없습니다.
          </div>
        ) : detail.isError ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-destructive">
            상세 정보를 불러오지 못했습니다.
          </div>
        ) : detail.data ? (
          <PanelContent
            detail={detail.data}
            insights={insights.data}
            insightsLoading={insights.isLoading}
          />
        ) : null}
      </div>
    </div>
  );
};

interface PanelContentProps {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  insightsLoading: boolean;
}

const PanelContent = ({ detail, insights, insightsLoading }: PanelContentProps) => {
  return (
    <div className="space-y-4">
      <PhotoCarousel images={detail.imageUrls} alt={detail.name} />

      <section className="space-y-3 px-4">
        <div>
          <h2 className="text-lg font-semibold">{detail.name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {detail.category && <span>{detail.category}</span>}
            {detail.rating !== null && (
              <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                <Star className="size-3 fill-current" />
                {detail.rating}
              </span>
            )}
            {detail.reviewCount !== null && <span>리뷰 {detail.reviewCount}</span>}
          </div>
        </div>

        <QuickActions detail={detail} />
      </section>

      {insights && (insights.analyzedCount > 0 || insightsLoading) ? (
        <section className="space-y-3 border-t px-4 pt-4">
          <h3 className="text-sm font-semibold">AI 분석</h3>
          <AiSummary insights={insights} />
        </section>
      ) : insights && insights.analyzedCount === 0 ? (
        <section className="border-t px-4 pt-4 text-xs text-muted-foreground">
          아직 분석된 리뷰가 없습니다.
        </section>
      ) : null}

      {detail.menus.length > 0 && (
        <section className="space-y-2 border-t px-4 pt-4">
          <h3 className="text-sm font-semibold">메뉴</h3>
          <MenuGrid menus={detail.menus} insights={insights} />
        </section>
      )}

      <section className="space-y-1.5 border-t px-4 pt-4 text-sm">
        <h3 className="text-sm font-semibold">영업 정보</h3>
        {detail.roadAddress && (
          <div className="flex gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0 mt-0.5" />
            <div>
              <div>{detail.roadAddress}</div>
              {detail.address && detail.address !== detail.roadAddress && (
                <div className="text-xs">{detail.address}</div>
              )}
            </div>
          </div>
        )}
        {detail.businessHours && (
          <div className="text-xs text-muted-foreground whitespace-pre-line pl-6">
            {detail.businessHours}
          </div>
        )}
        {detail.phone && (
          <a
            href={`tel:${detail.phone}`}
            className="flex items-center gap-2 pl-6 text-muted-foreground hover:text-foreground"
          >
            <Phone className="size-3.5" />
            {detail.phone}
          </a>
        )}
      </section>

      {detail.blogReviews.length > 0 && (
        <section className="space-y-2 border-t px-4 pt-4">
          <h3 className="text-sm font-semibold">블로그 리뷰</h3>
          <ul className="space-y-2">
            {detail.blogReviews.slice(0, 6).map((b, idx) => (
              <li key={idx}>
                <a
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-2 rounded-md border p-2 hover:bg-muted/40"
                >
                  {b.thumbnailUrls[0] && (
                    <ImgWithFallback
                      src={b.thumbnailUrls[0]}
                      className="size-14 shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{b.title}</div>
                    {b.excerpt && (
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {b.excerpt}
                      </div>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {b.authorName && <span>{b.authorName}</span>}
                      {b.date && <span>· {b.date}</span>}
                      <ExternalLink className="size-3" />
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 border-t px-4 pt-4 pb-8">
        <h3 className="text-sm font-semibold">방문자 리뷰 ({detail.reviews.length})</h3>
        <VisitorReviews reviews={detail.reviews} />
      </section>
    </div>
  );
};

const QuickActions = ({ detail }: { detail: RestaurantPublicDetailType }) => {
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

const AiSummary = ({ insights }: { insights: RestaurantInsightsType }) => {
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

const MenuGrid = ({
  menus,
  insights,
}: {
  menus: RestaurantPublicDetailType['menus'];
  insights: RestaurantInsightsType | undefined;
}) => {
  // insights.topMenus 와 메뉴 이름 매칭해서 멘션 카운트 표시.
  const mentionByName = new Map<string, { positive: number; negative: number; count: number }>();
  if (insights) {
    for (const m of insights.topMenus) {
      mentionByName.set(m.name, m);
    }
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

const VisitorReviews = ({ reviews }: { reviews: PublicVisitorReviewType[] }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? reviews : reviews.slice(0, 5);
  if (reviews.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">아직 리뷰가 수집되지 않았습니다.</div>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {visible.map((r) => (
          <li
            key={r.id}
            className={cn(
              'rounded-md border p-2.5',
              r.analysis?.sentiment === 'positive' &&
                'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-900/10',
              r.analysis?.sentiment === 'negative' &&
                'border-rose-200 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-900/10',
            )}
          >
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span>{r.authorName ?? '익명'}</span>
              <span>{r.visitedAt ?? r.fetchedAt.slice(0, 10)}</span>
            </div>
            {r.analysis && (
              <div className="mt-1 text-sm font-medium">{r.analysis.text}</div>
            )}
            <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
              {r.body}
            </div>
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
          </li>
        ))}
      </ul>
      {reviews.length > 5 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full gap-1"
        >
          {expanded ? '접기' : `${reviews.length - 5}개 더 보기`}
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </Button>
      )}
    </div>
  );
};

const PhotoCarousel = ({ images, alt }: { images: string[]; alt: string }) => {
  const [idx, setIdx] = useState(0);
  if (images.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center bg-muted text-xs text-muted-foreground">
        사진이 없습니다.
      </div>
    );
  }
  const safe = idx % images.length;
  const current = images[safe];
  return (
    <div className="relative h-56 bg-muted">
      {current && (
        <ImgWithFallback src={current} alt={alt} className="size-full object-cover" />
      )}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIdx((idx - 1 + images.length) % images.length)}
            className="absolute left-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm hover:bg-background"
            aria-label="이전 사진"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setIdx((idx + 1) % images.length)}
            className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm hover:bg-background"
            aria-label="다음 사진"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] tabular-nums">
            {safe + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
};
