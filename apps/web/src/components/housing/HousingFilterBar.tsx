import {
  HOUSING_AREA_BANDS,
  HOUSING_AREA_BAND_LABEL,
  HOUSING_DEAL_COLOR,
  HOUSING_DEAL_TYPES,
  HOUSING_DEAL_TYPE_LABEL,
  type HousingAreaBand,
  type HousingDealType,
} from '@repo/utils';
import { cn } from '~/lib/utils';

// 집값 축 선택 — 거래 유형 세그먼트(매매/전세/월세, 한 번에 하나) + 전용면적 구간 칩(하나). 지도
// 배지·주변 목록·상세 통계가 같은 축을 본다. section 으로 일부만 그릴 수 있다 — 모바일은 유형
// 세그먼트를 상단바(subBar)에, 면적 칩 행은 시트 안(주변 목록 머리 아래)에 나눠 둔다. 데스크톱 패널은 'all'.

const chipClass = (active: boolean): string =>
  cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border text-muted-foreground hover:text-foreground',
  );

interface Props {
  dealType: HousingDealType;
  band: HousingAreaBand;
  onDealType: (dealType: HousingDealType) => void;
  onBand: (band: HousingAreaBand) => void;
  section?: 'all' | 'axis' | 'bands';
  className?: string;
}

export const HousingFilterBar = ({ dealType, band, onDealType, onBand, section = 'all', className }: Props) => {
  const showAxis = section !== 'bands';
  const showBands = section !== 'axis';
  return (
    <div className={cn('flex flex-col gap-2 border-b px-3 py-2', className)}>
      {showAxis && (
        <div className="inline-flex self-start rounded-md border p-0.5" role="tablist" aria-label="거래 유형" data-testid="housing-deal-tabs">
          {HOUSING_DEAL_TYPES.map((t) => {
            const active = dealType === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onDealType(t)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors',
                  active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span aria-hidden className="size-2 rounded-full ring-1 ring-white/70" style={{ backgroundColor: HOUSING_DEAL_COLOR[t] }} />
                {HOUSING_DEAL_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      )}
      {showBands && (
        <div className="flex items-start gap-2" data-testid="housing-band-filters">
          <span className="mt-1 shrink-0 text-[11px] text-muted-foreground">면적</span>
          <div className="-mr-3 flex gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none] xl:flex-wrap xl:overflow-visible">
            {HOUSING_AREA_BANDS.map((b) => {
              const active = band === b;
              return (
                <button key={b} type="button" aria-pressed={active} onClick={() => onBand(b)} className={chipClass(active)}>
                  {HOUSING_AREA_BAND_LABEL[b]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
