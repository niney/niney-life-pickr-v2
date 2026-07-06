import { MapPin, TrainFront } from 'lucide-react';
import type {
  SubwayFavoriteLineItemType,
  SubwayFavoriteStationItemType,
} from '@repo/api-contract';
import { subwayLineName } from '@repo/utils';
import { BusFavoriteStar } from '~/components/bus/BusFavoriteStar';
import { SubwayLineBadge } from './SubwayLineBadge';

// 초기 화면(검색어·주변·선택 역이 모두 없을 때)에 노출되는 즐겨찾기 섹션. 즐겨찾는
// 역/노선(역×호선)을 각각 리스트로. 행 클릭은 해당 역 선택(SubwayPage 가 stn 으로
// 반영 → 도착 패널 + 지도 이동), 별은 즐겨찾기 해제. 호출부가 0개면 렌더하지 않아
// 여기서는 각 섹션을 개수로만 조건 렌더한다(둘 중 하나만 있을 수도 있음).
export interface SubwayFavoriteSectionProps {
  stations: SubwayFavoriteStationItemType[];
  lines: SubwayFavoriteLineItemType[];
  onSelectStation(stationId: string): void;
  onSelectLine(stationId: string): void;
  onToggleStation(item: SubwayFavoriteStationItemType): void;
  onToggleLine(item: SubwayFavoriteLineItemType): void;
}

export const SubwayFavoriteSection = ({
  stations,
  lines,
  onSelectStation,
  onSelectLine,
  onToggleStation,
  onToggleLine,
}: SubwayFavoriteSectionProps) => (
  <div className="space-y-4">
    {stations.length > 0 && (
      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
          <MapPin className="size-3.5" /> 즐겨찾는 역
        </h3>
        <ul className="flex flex-col gap-0.5">
          {stations.map((it) => (
            <li key={it.stationId} className="flex items-center gap-1">
              {/* 행 버튼과 별을 형제로 둔다 — 버튼 중첩(무효 HTML) 회피. */}
              <button
                type="button"
                onClick={() => onSelectStation(it.stationId)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <span className="truncate font-medium">{it.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {it.lines.map((lineId) => (
                    <SubwayLineBadge key={lineId} lineId={lineId} />
                  ))}
                </span>
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

    {lines.length > 0 && (
      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
          <TrainFront className="size-3.5" /> 즐겨찾는 노선
        </h3>
        <ul className="flex flex-col gap-0.5">
          {lines.map((it) => (
            <li key={`${it.stationId}::${it.lineId}`} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectLine(it.stationId)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <span className="truncate font-medium">{it.stationName}</span>
                <SubwayLineBadge lineId={it.lineId} />
              </button>
              <BusFavoriteStar
                active
                onToggle={() => onToggleLine(it)}
                label={`${it.stationName} ${subwayLineName(it.lineId)} 즐겨찾기 해제`}
              />
            </li>
          ))}
        </ul>
      </section>
    )}
  </div>
);
