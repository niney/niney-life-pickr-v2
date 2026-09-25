import type { ParkingLotItemType } from '@repo/api-contract';
import {
  PARKING_DAY_KIND_LABEL,
  PARKING_FEE_TYPE_LABEL,
  PARKING_LOT_TYPE_LABEL,
  PARKING_OWNERSHIP_LABEL,
  formatParkingHours,
  isParkingOpenAt,
  parkingDayKindKst,
  type ParkingFeeRule,
} from '@repo/utils';

// 주차 화면 표시 헬퍼 — 목록·상세·식당 가는 법이 같은 문구를 쓰도록 한 곳에.

export const formatWon = (n: number): string => `${n.toLocaleString('ko-KR')}원`;

export const lotAddress = (item: Pick<ParkingLotItemType, 'roadAddr' | 'lotAddr'>): string | null => item.roadAddr ?? item.lotAddr;

// '공영 · 노외 · 유료' — 모르는 칸은 생략.
export const lotTypeLine = (item: Pick<ParkingLotItemType, 'ownership' | 'lotType' | 'feeType'>): string =>
  [
    item.ownership ? PARKING_OWNERSHIP_LABEL[item.ownership] : null,
    item.lotType ? PARKING_LOT_TYPE_LABEL[item.lotType] : null,
    item.feeType ? PARKING_FEE_TYPE_LABEL[item.feeType] : null,
  ]
    .filter(Boolean)
    .join(' · ');

export const feeRuleOf = (item: Pick<ParkingLotItemType, 'feeType' | 'fee'>): ParkingFeeRule => ({
  feeType: item.feeType ?? 'paid',
  baseMin: item.fee.baseMin,
  baseFee: item.fee.baseFee,
  addMin: item.fee.addMin,
  addFee: item.fee.addFee,
  dayMaxFee: item.fee.dayMaxFee,
  dayPassFee: item.fee.dayPassFee,
});

// 오늘(KST 요일 구분) 운영시간과 지금 운영 중 여부. 요금 무료 요일(서울)은 문구에 덧붙인다.
export const todayHours = (item: Pick<ParkingLotItemType, 'hours' | 'satFree' | 'holFree'>, now: Date = new Date()) => {
  const kind = parkingDayKindKst(now);
  const h = item.hours[kind];
  const freeToday = (kind === 'sat' && item.satFree === true) || (kind === 'hol' && item.holFree === true);
  return { kind, label: PARKING_DAY_KIND_LABEL[kind], text: formatParkingHours(h), open: isParkingOpenAt(h, now), freeToday };
};

// 네이버 지도 자동차 길찾기(식당 상세의 대중교통 링크와 같은 형식).
export const naverCarDirections = (lat: number, lng: number, name: string): string =>
  `https://map.naver.com/p/directions/-/${lng},${lat},${encodeURIComponent(name)}/-/car`;
