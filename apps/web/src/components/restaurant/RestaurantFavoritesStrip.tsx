import { Link } from 'react-router-dom';
import type { RestaurantFavoriteItemType } from '@repo/api-contract';
import { reviewThumbnailUrl } from '@repo/utils';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { BusFavoriteStar } from '~/components/bus/BusFavoriteStar';

// 홈 "내 즐겨찾기" 가로 스크롤 스트립 — 프레젠테이션 전용. 데이터/토글은
// HomePage 가 소유한 useRestaurantFavorites 를 props 로 받는다(훅 직접 호출
// 금지 — 페이지당 1회 원칙). 렌더는 저장 시점 스냅샷만으로 충분해 추가 조회
// 없음. 0개면 섹션 자체를 숨긴다.
export const RestaurantFavoritesStrip = ({
  items,
  onToggle,
}: {
  items: RestaurantFavoriteItemType[];
  onToggle(item: RestaurantFavoriteItemType): void;
}) => {
  if (items.length === 0) return null;
  return (
    <section className="mb-10">
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="text-lg font-bold tracking-tight">내 즐겨찾기</h2>
        <span className="text-xs text-muted-foreground">{items.length}곳</span>
      </header>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <li key={item.placeId} className="relative w-32 shrink-0">
            <BusFavoriteStar
              active
              label="즐겨찾기에서 제거"
              onToggle={() => onToggle(item)}
              className="absolute right-1 top-1 z-10 bg-background/70"
            />
            <Link
              to={`/restaurants-v2/${item.placeId}`}
              className="block overflow-hidden rounded-lg border transition-colors hover:border-primary/40"
            >
              <div className="h-20 w-full bg-muted">
                {item.thumbnailUrl ? (
                  <ImgWithFallback
                    src={reviewThumbnailUrl(item.thumbnailUrl, 160)}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-lg">🍜</div>
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-xs font-semibold">{item.name}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {item.category ?? item.address ?? ''}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
