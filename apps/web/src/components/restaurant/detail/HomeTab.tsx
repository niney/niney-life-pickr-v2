import { ArrowRight, MapPin, Star } from 'lucide-react';
import type { RestaurantInsightsType, RestaurantPublicDetailType } from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import {
  AiSummary,
  MenuGrid,
  QuickActions,
  ReviewCard,
  ScoreDistributionBars,
  TablingScoreBars,
  TablingServiceBadges,
} from './shared';
import type { TabKey } from './tabs';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  insightsLoading: boolean;
  onChangeTab(tab: TabKey): void;
  onSelectTip(term: string): void;
  onSelectMenu(name: string): void;
}

const HOME_MENU_PREVIEW = 4;
const HOME_REVIEW_PREVIEW = 3;

export const HomeTab = ({
  detail,
  insights,
  insightsLoading,
  onChangeTab,
  onSelectTip,
  onSelectMenu,
}: Props) => {
  const hero = detail.imageUrls[0] ?? null;
  const representativeMenus =
    detail.menuGroups?.find((group) => group.name === '대표메뉴')?.menus ?? [];
  const previewMenuSource = representativeMenus.length > 0 ? representativeMenus : detail.menus;
  const previewMenus = previewMenuSource.slice(0, HOME_MENU_PREVIEW);
  // 분석된 리뷰 우선 — 사용자에게 가장 정보량 큰 미리보기.
  // detail.reviewsFirstPage 는 fetchedAt desc 정렬된 첫 페이지 (10개) — 그 안에서
  // 분석된 리뷰를 위로 한 번 더 stable sort.
  const previewReviews = [...detail.reviewsFirstPage]
    .sort((a, b) => Number(!!b.analysis) - Number(!!a.analysis))
    .slice(0, HOME_REVIEW_PREVIEW);
  // 둘 이상의 출처가 리뷰를 가질 때만 카드에 출처 배지를 노출 — 한 출처만
  // 있는 화면에서는 시각적 노이즈.
  const src = detail.storedReviewCount;
  const showSourceBadges =
    [src.naver, src.diningcode, src.tabling].filter((c) => c > 0).length >= 2;

  return (
    <div className="space-y-4">
      {hero ? (
        <button
          type="button"
          onClick={() => onChangeTab('photos')}
          className="relative block h-56 w-full overflow-hidden bg-muted"
          aria-label="사진 전체 보기"
        >
          <ImgWithFallback src={hero} className="size-full object-cover" />
          {detail.imageUrls.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-background/80 px-2 py-0.5 text-[11px] tabular-nums">
              사진 {detail.imageUrls.length}장
            </span>
          )}
        </button>
      ) : (
        <div className="flex h-32 items-center justify-center bg-muted text-xs text-muted-foreground">
          사진이 없습니다.
        </div>
      )}

      <section className="space-y-3 px-4">
        <div>
          <h2 className="text-lg font-semibold">{detail.name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {detail.category && <span>{detail.category}</span>}
          </div>
          <SourceRatingLine detail={detail} />
          <ReviewCountLine detail={detail} />
          {detail.tabling && (
            <div className="mt-1.5">
              <TablingServiceBadges flags={detail.tabling.flags} />
            </div>
          )}
        </div>
        <QuickActions detail={detail} />
      </section>

      {detail.diningcode?.scoreDetail && (
        <section className="space-y-2 border-t px-4 pt-4">
          <ScoreDistributionBars detail={detail.diningcode.scoreDetail} />
          {detail.diningcode.descTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {detail.diningcode.descTags.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {detail.tabling && detail.tabling.ratings.some((r) => r.points > 0) && (
        <section className="space-y-2 border-t px-4 pt-4">
          <TablingScoreBars addon={detail.tabling} />
        </section>
      )}

      {insights && insights.analyzedCount > 0 ? (
        <section className="space-y-3 border-t px-4 pt-4">
          <SectionHead
            title="AI 분석"
            actionLabel="분석 전체 보기"
            onAction={() => onChangeTab('insights')}
          />
          <AiSummary insights={insights} onSelectTip={onSelectTip} />
        </section>
      ) : insightsLoading ? (
        <section className="border-t px-4 pt-4 text-xs text-muted-foreground">
          분석 정보 불러오는 중…
        </section>
      ) : (
        <section className="border-t px-4 pt-4 text-xs text-muted-foreground">
          아직 분석된 리뷰가 없습니다.
        </section>
      )}

      {previewMenus.length > 0 && (
        <section className="space-y-2 border-t px-4 pt-4">
          <SectionHead
            title="대표 메뉴"
            actionLabel={`메뉴 전체 보기 (${detail.menus.length})`}
            onAction={() => onChangeTab('menu')}
            disabled={detail.menus.length <= HOME_MENU_PREVIEW}
          />
          <MenuGrid menus={previewMenus} insights={insights} onSelectMenu={onSelectMenu} />
        </section>
      )}

      {previewReviews.length > 0 && (
        <section className="space-y-2 border-t px-4 pt-4">
          <SectionHead
            title="대표 리뷰"
            actionLabel={`리뷰 전체 보기 (${detail.reviewCounts.all})`}
            onAction={() => onChangeTab('reviews')}
            disabled={detail.reviewCounts.all <= HOME_REVIEW_PREVIEW}
          />
          <ul className="divide-y divide-border">
            {previewReviews.map((r) => (
              <li key={r.id}>
                <ReviewCard r={r} showSource={showSourceBadges} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 border-t px-4 pt-4 pb-6">
        <SectionHead
          title="영업 정보"
          actionLabel="정보 전체 보기"
          onAction={() => onChangeTab('info')}
        />
        <div className="space-y-1 text-sm text-muted-foreground">
          {(detail.roadAddress || detail.address) && (
            <div className="flex gap-2">
              <MapPin className="size-4 shrink-0 mt-0.5" />
              <span className="truncate">{detail.roadAddress ?? detail.address}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

// 별점 라인 — 출처가 둘 이상이면 "★ 4.4 (네이버 4.2 · 다이닝코드 4.6 ·
// 테이블링 4.8)" 처럼 대표값 + 출처별 분리값을 함께 표시. 하나면 그 값 단독.
const SourceRatingLine = ({ detail }: { detail: RestaurantPublicDetailType }) => {
  const entries = [
    { label: '네이버', rating: detail.sources.naver?.rating ?? null },
    { label: '다이닝코드', rating: detail.sources.diningcode?.rating ?? null },
    { label: '테이블링', rating: detail.sources.tabling?.rating ?? null },
  ].filter((e): e is { label: string; rating: number } => e.rating !== null);
  if (entries.length === 0) return null;
  const main = detail.rating ?? entries[0]!.rating;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
        <Star className="size-3 fill-current" />
        <span className="font-medium tabular-nums">{main.toFixed(1)}</span>
      </span>
      {entries.length >= 2 && (
        <span className="text-muted-foreground">
          {entries.map((e) => `${e.label} ${e.rating.toFixed(1)}`).join(' · ')}
        </span>
      )}
    </div>
  );
};

// 리뷰수 라인 — 사이트가 보고한 카운트를 출처별로 분리해서 표시. 둘 이상이면
// "리뷰 102 · 네이버 60 · 다이닝코드 42". 하나면 그 카운트 단독.
const ReviewCountLine = ({ detail }: { detail: RestaurantPublicDetailType }) => {
  const entries = [
    { label: '네이버', count: detail.sources.naver?.siteReviewCount ?? null },
    { label: '다이닝코드', count: detail.sources.diningcode?.siteReviewCount ?? null },
    { label: '테이블링', count: detail.sources.tabling?.siteReviewCount ?? null },
  ].filter((e): e is { label: string; count: number } => e.count !== null);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  return (
    <div className="mt-0.5 text-xs text-muted-foreground">
      <span>리뷰 {total.toLocaleString()}</span>
      {entries.length >= 2 && (
        <span>
          {' · '}
          {entries.map((e) => `${e.label} ${e.count.toLocaleString()}`).join(' · ')}
        </span>
      )}
    </div>
  );
};

const SectionHead = ({
  title,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  actionLabel: string;
  onAction(): void;
  disabled?: boolean;
}) => (
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold">{title}</h3>
    {!disabled && (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAction}
        className="-mr-2 gap-1 text-xs"
      >
        {actionLabel}
        <ArrowRight className="size-3" />
      </Button>
    )}
  </div>
);
