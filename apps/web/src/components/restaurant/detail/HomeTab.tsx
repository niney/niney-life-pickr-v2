import { ArrowRight, MapPin, Star } from 'lucide-react';
import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { AiSummary, MenuGrid, QuickActions, ReviewCard } from './shared';
import type { TabKey } from './tabs';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  insightsLoading: boolean;
  onChangeTab(tab: TabKey): void;
}

const HOME_MENU_PREVIEW = 4;
const HOME_REVIEW_PREVIEW = 3;

export const HomeTab = ({ detail, insights, insightsLoading, onChangeTab }: Props) => {
  const hero = detail.imageUrls[0] ?? null;
  const previewMenus = detail.menus.slice(0, HOME_MENU_PREVIEW);
  // 분석된 리뷰 우선 — 사용자에게 가장 정보량 큰 미리보기.
  const previewReviews = [...detail.reviews]
    .sort((a, b) => Number(!!b.analysis) - Number(!!a.analysis))
    .slice(0, HOME_REVIEW_PREVIEW);

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

      {insights && insights.analyzedCount > 0 ? (
        <section className="space-y-3 border-t px-4 pt-4">
          <SectionHead
            title="AI 분석"
            actionLabel="분석 전체 보기"
            onAction={() => onChangeTab('insights')}
          />
          <AiSummary insights={insights} />
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
          <MenuGrid menus={previewMenus} insights={insights} />
        </section>
      )}

      {previewReviews.length > 0 && (
        <section className="space-y-2 border-t px-4 pt-4">
          <SectionHead
            title="대표 리뷰"
            actionLabel={`리뷰 전체 보기 (${detail.reviews.length})`}
            onAction={() => onChangeTab('reviews')}
            disabled={detail.reviews.length <= HOME_REVIEW_PREVIEW}
          />
          <ul className="space-y-2">
            {previewReviews.map((r) => (
              <li key={r.id}>
                <ReviewCard r={r} />
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
