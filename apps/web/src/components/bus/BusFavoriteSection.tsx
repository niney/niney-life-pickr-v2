import { Bus, MapPin } from 'lucide-react';
import type {
  BusFavoriteRouteItemType,
  BusFavoriteStationItemType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { BusFavoriteStar } from './BusFavoriteStar';

// 초기 화면(검색어·주변·선택 정류장이 모두 없을 때)에 노출되는 즐겨찾기 섹션.
// 즐겨찾는 정류장/버스를 각각 리스트로 보여준다. 행 클릭은 해당 정류장/노선
// 선택(BusPage 가 URL 쿼리로 반영), 별은 즐겨찾기 해제.
//
// 호출부(BusPage)가 즐겨찾기 0개면 아예 렌더하지 않으므로, 여기서는 각
// 섹션을 개수로만 조건 렌더한다(둘 중 하나만 있을 수도 있음).
export interface BusFavoriteSectionProps {
  stations: BusFavoriteStationItemType[];
  routes: BusFavoriteRouteItemType[];
  onSelectStation(stId: string): void;
  onSelectRoute(stId: string, busRouteId: string): void;
  onToggleStation(item: BusFavoriteStationItemType): void;
  onToggleRoute(item: BusFavoriteRouteItemType): void;
}

export const BusFavoriteSection = ({
  stations,
  routes,
  onSelectStation,
  onSelectRoute,
  onToggleStation,
  onToggleRoute,
}: BusFavoriteSectionProps) => (
  <div className="space-y-4">
    {stations.length > 0 && (
      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
          <MapPin className="size-3.5" /> 즐겨찾는 정류장
        </h3>
        <ul className="flex flex-col gap-0.5">
          {stations.map((it) => (
            <li key={it.stId} className="flex items-center gap-1">
              {/* 행 버튼과 별을 형제로 둔다 — 버튼 중첩(무효 HTML) 회피. */}
              <button
                type="button"
                onClick={() => onSelectStation(it.stId)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <span className="truncate font-medium">{it.name}</span>
                {/* arsId '0' = 가상정류장(표지판 번호 없음) — 배지 숨김. */}
                {it.arsId !== '0' && (
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {it.arsId}
                  </Badge>
                )}
              </button>
              <BusFavoriteStar
                active
                onToggle={() => onToggleStation(it)}
                label={`${it.name} 즐겨찾기 해제`}
              />
            </li>
          ))}
        </ul>
      </section>
    )}

    {routes.length > 0 && (
      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
          <Bus className="size-3.5" /> 즐겨찾는 버스
        </h3>
        <ul className="flex flex-col gap-0.5">
          {routes.map((it) => (
            <li
              key={`${it.stId}::${it.busRouteId}`}
              className="flex items-center gap-1"
            >
              <button
                type="button"
                onClick={() => onSelectRoute(it.stId, it.busRouteId)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50"
              >
                {/* 노선번호를 앞에 두어 스캔이 쉽도록(도착 패널 표기와 통일). */}
                <span className="shrink-0 font-semibold tabular-nums">
                  {it.routeName}
                </span>
                <span className="truncate text-muted-foreground">
                  {it.stationName}
                </span>
              </button>
              <BusFavoriteStar
                active
                onToggle={() => onToggleRoute(it)}
                label={`${it.routeName} 즐겨찾기 해제`}
              />
            </li>
          ))}
        </ul>
      </section>
    )}
  </div>
);
