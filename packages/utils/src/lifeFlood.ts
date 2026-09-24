// 침수 흔적 — 서울시 침수흔적도(열린데이터 OA-15636, 2010~ 연도별 SHP)를 점(필지 무게중심)으로 적재한
// LifeFloodTrace 를 집값 단지 기준 반경으로 센다. 단지 상세(건수·사건별 내역)와 지도 배지 물방울이 같은
// 반경·단계 규칙을 쓴다. 주소·필지는 어디에도 내보내지 않는다(개수·연월·침수심만).

// 단지 좌표 반경(m). 서울 아파트 9,783단지 실측(2026-09-24): 1건 이상 55% · 중앙값 1건 · 상위 10% 9건 이상.
// 50m 는 큰 단지 안쪽 흔적을 놓치고(27%), 200m 는 80% 가 걸려 변별력이 없다.
export const HOUSING_FLOOD_RADIUS_M = 100;

// 지도 배지 물방울 단계 — 1~4건 연한 물방울, 5건 이상 진한 물방울(위 실측 기준 상위 약 21%).
export const HOUSING_FLOOD_MANY_MIN = 5;
export type HousingFloodLevel = 'none' | 'some' | 'many';
export const housingFloodLevel = (count: number | null | undefined): HousingFloodLevel =>
  count === null || count === undefined || count <= 0 ? 'none' : count >= HOUSING_FLOOD_MANY_MIN ? 'many' : 'some';

// 침수심(m) 표시 — 1m 미만은 cm(원본이 0.02·0.45 처럼 cm 단위로 적힌다), 이상은 m 소수 한 자리.
export const formatFloodDepth = (m: number): string => (m < 1 ? `${Math.round(m * 100)}cm` : `${m.toFixed(1)}m`);

// 사건 묶음 표시 — 월이 있으면 '2022년 8월', 없으면(원본에 피해일자가 없는 행) '2025년'.
export const formatFloodEventLabel = (year: number, month: number | null): string =>
  month === null ? `${year}년` : `${year}년 ${month}월`;
