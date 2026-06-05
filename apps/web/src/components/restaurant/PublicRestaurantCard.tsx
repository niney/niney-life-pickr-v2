import { memo } from 'react';
import { Star } from 'lucide-react';
import type { RestaurantPublicListItemType } from '@repo/api-contract';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { cn } from '~/lib/utils';

interface Props {
  item: RestaurantPublicListItemType;
  selected: boolean;
  // placeId 인자형 — 부모가 안정 콜백(useCallback/dispatcher)을 인라인 클로저
  // 없이 그대로 넘길 수 있어 아래 memo 가 실제로 동작한다.
  onSelect(placeId: string): void;
  // 더블클릭 — 선택(클릭)에 더해 지도를 해당 식당으로 확대.
  onZoom(placeId: string): void;
}

// 좌측 리스트의 한 행. 네이버 지도 결과 카드 톤 — 썸네일 + 이름 + 카테고리/주소
// + 별점 + AI 통계. 통계는 분석된 리뷰가 있을 때만 노출.
//
// memo — 식당 선택이 바뀌면 부모(목록 페이지)가 리렌더되지만, 실제로 바뀌는 카드
// prop 은 선택/해제된 두 카드의 selected 뿐이다. memo 로 나머지를 bail-out 시켜
// 선택 한 번에 80개 카드가 통째로 리렌더되던 것을 막는다 (안정 콜백 전제).
export const PublicRestaurantCard = memo(function PublicRestaurantCard({
  item,
  selected,
  onSelect,
  onZoom,
}: Props) {
  const hasAi = item.analyzedCount > 0;
  const totalSentimented = item.positiveCount + item.negativeCount + item.neutralCount;
  const positivePct = totalSentimented > 0 ? (item.positiveCount / totalSentimented) * 100 : 0;
  const negativePct = totalSentimented > 0 ? (item.negativeCount / totalSentimented) * 100 : 0;
  const neutralPct = Math.max(0, 100 - positivePct - negativePct);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.placeId)}
      onDoubleClick={() => onZoom(item.placeId)}
      className={cn(
        'group flex w-full select-none gap-3 rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-primary/60 bg-primary/5'
          : 'border-border hover:border-foreground/30 hover:bg-muted/40',
      )}
    >
      <div className="size-20 shrink-0 overflow-hidden rounded-md bg-muted">
        {item.thumbnailUrl ? (
          <ImgWithFallback
            src={item.thumbnailUrl}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            no img
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{item.name}</span>
          {item.category && (
            <span className="shrink-0 text-xs text-muted-foreground">{item.category}</span>
          )}
        </div>

        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.roadAddress ?? item.address ?? '주소 정보 없음'}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {item.rating !== null && (
            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
              <Star className="size-3 fill-current" /> {item.rating}
            </span>
          )}
          {item.reviewCount !== null && <span>리뷰 {item.reviewCount}</span>}
          {hasAi && item.avgSatisfactionScore !== null && (
            <span>😊 {item.avgSatisfactionScore.toFixed(1)}/5</span>
          )}
          {item.latitude === null && (
            <span className="text-amber-600 dark:text-amber-400">좌표 없음</span>
          )}
        </div>

        {hasAi && totalSentimented > 0 && (
          <div className="mt-1.5 space-y-0.5">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-emerald-500" style={{ width: `${positivePct}%` }} />
              <div className="bg-zinc-400" style={{ width: `${neutralPct}%` }} />
              <div className="bg-rose-500" style={{ width: `${negativePct}%` }} />
            </div>
            <div className="flex gap-x-2 text-[11px] tabular-nums text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">+{item.positiveCount}</span>
              <span>·</span>
              <span className="text-rose-600 dark:text-rose-400">-{item.negativeCount}</span>
              <span>·</span>
              <span>분석 {item.analyzedCount}</span>
            </div>
          </div>
        )}
      </div>
    </button>
  );
});
