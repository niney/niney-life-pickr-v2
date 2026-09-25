import { Plane, SquareParking, Zap } from 'lucide-react';
import { PARKING_TABS, PARKING_TAB_LABEL, type ParkingTab } from '@repo/utils';
import { cn } from '~/lib/utils';
import type { EvFilterState, ParkingLotFilterState } from '~/stores/parkingPrefsStore';

// 주차 탭(주차장·충전소·공항) + 탭별 필터 칩. section 으로 일부만 — 모바일은 탭을 상단바(subBar)에, 필터 칩은 시트 안
// (목록 머리 아래)에 나눠 둔다. 데스크톱 패널은 'all'. 공항 탭은 필터가 없다.

const TAB_ICON = { lot: SquareParking, ev: Zap, airport: Plane } as const;

const LOT_CHIPS: { key: keyof ParkingLotFilterState; label: string }[] = [
  { key: 'freeOnly', label: '무료만' },
  { key: 'publicOnly', label: '공영만' },
  { key: 'liveOnly', label: '실시간 여석' },
];
const EV_CHIPS: { key: keyof EvFilterState; label: string }[] = [
  { key: 'availableOnly', label: '지금 사용 가능' },
  { key: 'fastOnly', label: '급속' },
  { key: 'freeParkingOnly', label: '주차료 무료' },
  { key: 'openOnly', label: '누구나 이용' },
];

const chipClass = (active: boolean): string =>
  cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
  );

interface Props {
  tab: ParkingTab;
  onTab: (tab: ParkingTab) => void;
  lotFilters: ParkingLotFilterState;
  evFilters: EvFilterState;
  onToggleLot: (key: keyof ParkingLotFilterState) => void;
  onToggleEv: (key: keyof EvFilterState) => void;
  section?: 'all' | 'tabs' | 'filters';
  className?: string;
}

export const ParkingTabBar = ({ tab, onTab, lotFilters, evFilters, onToggleLot, onToggleEv, section = 'all', className }: Props) => {
  const showTabs = section !== 'filters';
  const showFilters = section !== 'tabs' && tab !== 'airport';
  if (!showTabs && !showFilters) return null;
  return (
    <div className={cn('flex flex-col gap-2 border-b px-3 py-2', className)}>
      {showTabs && (
        <div className="inline-flex self-start rounded-md border p-0.5" role="tablist" aria-label="주차 정보" data-testid="parking-tabs">
          {PARKING_TABS.map((t) => {
            const Icon = TAB_ICON[t];
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTab(t)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors',
                  active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {PARKING_TAB_LABEL[t]}
              </button>
            );
          })}
        </div>
      )}
      {showFilters && (
        <div className="-mr-3 flex gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none] xl:flex-wrap xl:overflow-visible" data-testid="parking-filters">
          {tab === 'lot'
            ? LOT_CHIPS.map((c) => (
                <button key={c.key} type="button" aria-pressed={lotFilters[c.key]} onClick={() => onToggleLot(c.key)} className={chipClass(lotFilters[c.key])}>
                  {c.label}
                </button>
              ))
            : EV_CHIPS.map((c) => (
                <button key={c.key} type="button" aria-pressed={evFilters[c.key]} onClick={() => onToggleEv(c.key)} className={chipClass(evFilters[c.key])}>
                  {c.label}
                </button>
              ))}
        </div>
      )}
    </div>
  );
};
