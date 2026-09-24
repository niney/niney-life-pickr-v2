import type { SeaSlotType, SeaSpotType } from '@repo/api-contract';
import { approxDistanceM, seaActivityHasPeriod, type SeaActivity } from '@repo/utils';

// 바다 화면 표시 도우미 — 선택 날짜·시간대의 슬롯 고르기, 순위 정렬, 한 줄 요약. 순수 함수(테스트 대상).

export type SeaPeriod = 'am' | 'pm';

// 지점의 선택 날짜·시간대 슬롯. 오전/오후가 없는 활동(갯벌·바다갈라짐)은 그날 슬롯 하나.
export const seaSlotFor = (spot: SeaSpotType, activity: SeaActivity, date: string, period: SeaPeriod): SeaSlotType | null => {
  const day = spot.slots.filter((s) => s.date === date);
  if (!seaActivityHasPeriod(activity)) return day[0] ?? null;
  return day.find((s) => s.period === period) ?? day[0] ?? null;
};

export interface SeaRankedSpot {
  spot: SeaSpotType;
  slot: SeaSlotType | null;
  distM: number | null;
}

// 순위 — 지수 높은 순(없음·체험불가는 뒤), 같으면 가까운 순(내 위치가 있을 때), 그다음 이름.
export const rankSeaSpots = (
  spots: SeaSpotType[],
  activity: SeaActivity,
  date: string,
  period: SeaPeriod,
  me: { lat: number; lng: number } | null,
): SeaRankedSpot[] =>
  spots
    .map((spot) => ({ spot, slot: seaSlotFor(spot, activity, date, period), distM: me ? Math.round(approxDistanceM(me, spot)) : null }))
    .sort((a, b) => {
      const la = a.slot?.level ?? -1;
      const lb = b.slot?.level ?? -1;
      if (la !== lb) return lb - la;
      if (a.distM !== null && b.distM !== null && a.distM !== b.distM) return a.distM - b.distM;
      return a.spot.name.localeCompare(b.spot.name, 'ko');
    });

const n1 = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// 목록 한 줄 요약 — 활동마다 결정에 쓰이는 값만(없는 값은 생략).
export const seaSlotSummary = (activity: SeaActivity, slot: SeaSlotType): string => {
  const parts: string[] = [];
  if ((activity === 'mudflat' || activity === 'seaSplit') && slot.timeFrom && slot.timeTo) {
    parts.push(`${activity === 'seaSplit' ? '갈라짐' : '체험'} ${slot.timeFrom}~${slot.timeTo}`);
  }
  if (slot.waveM !== null) parts.push(`파고 ${n1(slot.waveM)}m`);
  if (slot.wavePeriodS !== null) parts.push(`주기 ${n1(slot.wavePeriodS)}초`);
  if (slot.waterTempC !== null) parts.push(`수온 ${n1(slot.waterTempC)}℃`);
  if (slot.waterTempC === null && slot.airTempC !== null) parts.push(`기온 ${n1(slot.airTempC)}℃`);
  if (slot.windMs !== null) parts.push(`바람 ${n1(slot.windMs)}m/s`);
  if (slot.tidePhase) parts.push(slot.tidePhase);
  if (slot.weather) parts.push(slot.weather);
  if (slot.openStatus) parts.push(slot.openStatus);
  return parts.join(' · ');
};

export const formatSeaDistance = (m: number): string => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)}km`);
