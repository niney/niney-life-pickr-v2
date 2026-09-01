import { Loader2 } from 'lucide-react';
import type { HousingNearbyItemType, HousingNearbyResultType } from '@repo/api-contract';
import {
  HOUSING_DEAL_COLOR,
  HOUSING_DEAL_TYPE_LABEL,
  HOUSING_EMPTY_COLOR,
  HOUSING_FALLBACK_COLOR,
  formatDistanceM,
  formatHousingArea,
  formatHousingDateShort,
  formatHousingDealPrice,
  formatHousingPrice,
  type HousingDealType,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { isHousingRental } from './housingMarkers';

// 지도 중심 기준 주변 단지 목록 — 행 클릭 = 선택(URL sel) + 지도 이동. 왼쪽은 단지명(임대단지 태그)·세대·
// 사용승인·주소, 오른쪽은 이 축(유형×구간)의 최근 거래가(크게) + 면적·층·계약일. 축에 거래가 없으면
// 지도 배지와 같은 순서로 대신 보여 준다: 다른 조건의 마지막 거래(회색, 유형 라벨) → 공시가격 중위(회색)
// → '거래 없음'. filters 슬롯: 머리 행(반경·건수) 바로 아래 — 모바일 시트에선 peek 에 머리 행만 보이고
// half 부터 면적 칩 행이 따라오도록 여기 끼운다.

interface Props {
  data: HousingNearbyResultType | undefined;
  isLoading: boolean;
  radiusM: number;
  dealType: HousingDealType;
  selectedId: string | null;
  onSelect: (item: HousingNearbyItemType) => void;
  filters?: React.ReactNode;
}

// 지번 주소에서 읍면동 이하만('서울특별시 종로구 청운동 56-45' → '청운동 56-45').
const shortHousingAddr = (addr: string): string => {
  const tokens = addr.trim().split(/\s+/);
  return tokens.length > 2 ? tokens.slice(-2).join(' ') : addr;
};

const approvedYear = (date: string | null): string | null => (date ? date.slice(0, 4) : null);

// 행 왼쪽 점 — 축 거래는 유형색, 폴백은 회색, 공시가격은 점선 테두리, 없음은 연회색.
const Dot = ({ item, dealType }: { item: HousingNearbyItemType; dealType: HousingDealType }) => {
  if (item.latest) {
    return <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: HOUSING_DEAL_COLOR[dealType] }} />;
  }
  if (item.fallback) {
    return <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: HOUSING_FALLBACK_COLOR }} />;
  }
  if (item.official) {
    return (
      <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full border border-dashed" style={{ borderColor: HOUSING_FALLBACK_COLOR }} />
    );
  }
  return <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: HOUSING_EMPTY_COLOR }} />;
};

const PriceCell = ({ item, dealType }: { item: HousingNearbyItemType; dealType: HousingDealType }) => {
  if (item.latest) {
    return (
      <>
        <span className="block text-sm font-semibold tabular-nums">{formatHousingDealPrice(dealType, item.latest.price, item.latest.rent)}</span>
        <span className="block text-[11px] tabular-nums text-muted-foreground">
          {formatHousingArea(item.latest.area, false)}
          {item.latest.floor !== null ? ` · ${item.latest.floor}층` : ''} · {formatHousingDateShort(item.latest.dealDate)}
        </span>
      </>
    );
  }
  if (item.fallback) {
    const f = item.fallback;
    return (
      <>
        <span className="block text-sm font-semibold tabular-nums text-muted-foreground">
          {HOUSING_DEAL_TYPE_LABEL[f.dealType]} {formatHousingDealPrice(f.dealType, f.price, f.rent)}
        </span>
        <span className="block text-[11px] tabular-nums text-muted-foreground">
          {formatHousingArea(f.area, false)}
          {f.floor !== null ? ` · ${f.floor}층` : ''} · {formatHousingDateShort(f.dealDate)} · 선택 조건 거래 없음
        </span>
      </>
    );
  }
  if (item.official) {
    return (
      <>
        <span className="block text-sm font-semibold tabular-nums text-muted-foreground">공시 {formatHousingPrice(item.official.median)}</span>
        <span className="block text-[11px] tabular-nums text-muted-foreground">{item.official.year} 공시가격 중위 · 거래 없음</span>
      </>
    );
  }
  return <span className="block text-xs text-muted-foreground">거래 없음</span>;
};

export const HousingNearbyList = ({ data, isLoading, radiusM, dealType, selectedId, onSelect, filters }: Props) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center gap-2 px-3 pt-2">
      <span className="text-sm font-medium">주변 아파트</span>
      <span className="ml-auto text-[11px] text-muted-foreground">
        지도 중심 {formatDistanceM(radiusM)} 안{data ? ` · ${data.total.toLocaleString('ko-KR')}단지` : ''}
      </span>
    </div>
    {filters}

    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="housing-nearby-list">
      {isLoading && !data ? (
        <Empty>
          <Loader2 className="size-4 animate-spin" /> 주변 단지를 찾는 중…
        </Empty>
      ) : !data || data.items.length === 0 ? (
        <Empty>지도 중심 {formatDistanceM(radiusM)} 안에 아파트 단지가 없습니다. 지도를 옮겨 보세요.</Empty>
      ) : (
        <ul className="divide-y">
          {data.items.map((item) => {
            const meta: string[] = [];
            if (item.households !== null) meta.push(`${item.households.toLocaleString('ko-KR')}세대`);
            const year = approvedYear(item.approvedDate);
            if (year) meta.push(`${year}년`);
            meta.push(shortHousingAddr(item.addr));
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-current={selectedId === item.id ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent/60',
                    selectedId === item.id && 'bg-accent',
                  )}
                >
                  <Dot item={item} dealType={dealType} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-sm font-medium">{item.name}</span>
                      {isHousingRental(item.saleType) && (
                        <span className="shrink-0 rounded border px-1 py-px text-[10px] font-normal text-muted-foreground">임대</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{meta.join(' · ')}</span>
                    {item.count12 > 0 && (
                      <span className="block text-[11px] text-muted-foreground">12개월 {item.count12.toLocaleString('ko-KR')}건</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <PriceCell item={item} dealType={dealType} />
                    <span className="block text-[11px] tabular-nums text-muted-foreground">{formatDistanceM(item.dist)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>
);
