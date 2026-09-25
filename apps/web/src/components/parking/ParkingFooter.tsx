import type { ParkingStatusResultType } from '@repo/api-contract';
import {
  EV_LEVELS,
  EV_LEVEL_COLOR,
  EV_LEVEL_LABEL,
  PARKING_LEVELS,
  PARKING_LEVEL_COLOR,
  PARKING_LEVEL_LABEL,
  PARKING_NO_LIVE_COLOR,
  formatRelativeMin,
  type ParkingTab,
} from '@repo/utils';

// 범례 + 적재 상태 + 출처 — 패널 하단. 색은 항상 글자와 함께(색만으로 뜻을 전하지 않는다). 출처: 공공데이터포털
// 전국주차장정보표준데이터(15012896)·서울 열린데이터광장 공영주차장 안내/시영 실시간 주차대수·한국환경공단 전기자동차 충전소
// 정보(15076352, 공공누리 제1유형)·한국공항공사 주차장 혼잡도(15158689)·인천국제공항공사 주차 정보(15095047).

const Swatch = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1">
    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </span>
);

const n = (v: number): string => v.toLocaleString('ko-KR');

export const ParkingFooter = ({ tab, status }: { tab: ParkingTab; status: ParkingStatusResultType | undefined }) => {
  const lots = status?.lots;
  const ev = status?.ev;
  const live = status?.live;
  return (
    <div className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="parking-footer">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {tab === 'ev'
          ? EV_LEVELS.map((l) => <Swatch key={l} color={EV_LEVEL_COLOR[l]} label={EV_LEVEL_LABEL[l]} />)
          : [
              ...PARKING_LEVELS.map((l) => <Swatch key={l} color={PARKING_LEVEL_COLOR[l]} label={PARKING_LEVEL_LABEL[l]} />),
              <Swatch key="none" color={PARKING_NO_LIVE_COLOR} label="실시간 없음" />,
            ]}
      </div>
      <div className="mt-1">
        {tab === 'lot' &&
          (lots?.loaded
            ? `주차장 ${n(lots.count)}곳(서울 ${n(lots.bySource.seoul)} · 전국 표준 ${n(lots.bySource.std)}) · 실시간 여석 ${n(live?.lotCount ?? 0)}곳${live?.lotAt ? ` · ${formatRelativeMin(live.lotAt)} 갱신` : ''}`
            : '주차장 데이터 적재 전')}
        {tab === 'ev' &&
          (ev?.loaded ? `충전소 ${n(ev.stations)}곳 · 충전기 ${n(ev.chargers)}기${ev.statusAt ? ` · 상태 ${formatRelativeMin(ev.statusAt)} 반영` : ''}` : '충전소 데이터 적재 전')}
        {tab === 'airport' &&
          `공항 주차장 ${n(live?.airportLotCount ?? 0)}곳${live?.airportAt ? ` · ${formatRelativeMin(live.airportAt)} 갱신` : ''}`}
      </div>
      <div className="mt-1">
        {tab === 'lot' && '출처: 전국주차장정보표준데이터(공공데이터포털) · 서울시 공영주차장 안내·시영주차장 실시간 주차대수(서울 열린데이터광장). 요금·운영시간은 원천 신고값이라 현장과 다를 수 있습니다.'}
        {tab === 'ev' && '출처: 한국환경공단 전기자동차 충전소 정보(공공데이터포털, 공공누리 제1유형). 충전기 상태는 10분마다 반영합니다.'}
        {tab === 'airport' && '출처: 한국공항공사 전국공항 주차장 혼잡도 · 인천국제공항공사 주차 정보(공공데이터포털).'}
      </div>
    </div>
  );
};
