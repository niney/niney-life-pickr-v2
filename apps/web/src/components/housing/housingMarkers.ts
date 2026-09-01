import type { HousingCellType, HousingPointType, HousingPointsResultType } from '@repo/api-contract';
import {
  HOUSING_DEAL_TYPE_LABEL,
  buildHousingBadgeDataUrl,
  buildHousingCellDataUrl,
  buildHousingEmptyMarkerDataUrl,
  buildHousingMutedBadgeDataUrl,
  formatHousingDealPrice,
  formatHousingPrice,
  formatHousingUnitPriceShort,
  type HousingDealType,
} from '@repo/utils';
import type { MapMarker } from '~/components/restaurant/MapCanvas';

// 집값 마커 빌더 — 서버 응답(단지 배지/집계 셀)을 MapCanvas 마커로. 글자는 SVG 안에 새기므로 라벨은
// 쓰지 않고 전부 fixedScale(줌과 무관하게 원본 크기). 배지 이미지는 `종류|글자|유형|선택` 키로 메모
// (한 화면에 같은 가격이 여럿 — 상한을 넘으면 통째로 비운다).
//
// 단지 배지 우선순위(선택 축 = 유형×면적 구간):
//   latest(축의 최근 거래, 유형색) → fallback(다른 조건의 마지막 거래, 회색 — 유형 라벨을 붙여 "같은 유형
//   이라도 다른 면적 구간" 임을 드러낸다) → official(공시가격 중위, 점선 회색) → 임대단지 회색 '임대' 배지
//   → 회색 점(정보 없음). 임대단지(K-apt 분양형태 '임대')는 폴백·공시 배지 글자 앞에 '임대 ' 를 붙인다.

const EMPTY_ICON = { src: buildHousingEmptyMarkerDataUrl(false), selectedSrc: buildHousingEmptyMarkerDataUrl(true) };
const CACHE_MAX = 5000;
const badgeCache = new Map<string, string>();
type BadgeKind = 'deal' | 'fallback' | 'official';
const badgeUrl = (kind: BadgeKind, text: string, dealType: HousingDealType, selected: boolean): string => {
  const key = `${kind}|${text}|${kind === 'deal' ? dealType : '-'}|${selected ? 1 : 0}`;
  let url = badgeCache.get(key);
  if (!url) {
    url =
      kind === 'deal'
        ? buildHousingBadgeDataUrl(text, dealType, selected)
        : buildHousingMutedBadgeDataUrl(text, { dashed: kind === 'official', selected });
    if (badgeCache.size >= CACHE_MAX) badgeCache.clear();
    badgeCache.set(key, url);
  }
  return url;
};
const badgeIcon = (kind: BadgeKind, text: string, dealType: HousingDealType) => ({
  src: badgeUrl(kind, text, dealType, false),
  selectedSrc: badgeUrl(kind, text, dealType, true),
});
// 셀 알약은 단지 수 버킷(1~9/10~49/50+)별로만 크기가 달라 대표값으로 키를 줄인다.
const cellBucketCount = (count: number): number => (count < 10 ? 1 : count < 50 ? 10 : 50);
const cellCache = new Map<string, string>();
const cellUrl = (text: string, count: number, dealType: HousingDealType): string => {
  const bucket = cellBucketCount(count);
  const key = `${text}|${bucket}|${dealType}`;
  let url = cellCache.get(key);
  if (!url) {
    url = buildHousingCellDataUrl(text, bucket, dealType);
    if (cellCache.size >= CACHE_MAX) cellCache.clear();
    cellCache.set(key, url);
  }
  return url;
};

// 마커 id — 단지 `c:${id}`, 셀 `cell:${index}`(index = 응답 cells 배열 위치).
export const housingMarkerId = (id: string): string => `c:${id}`;
export type ParsedHousingMarkerId = { kind: 'complex'; id: string } | { kind: 'cell'; index: number };
export const parseHousingMarkerId = (markerId: string): ParsedHousingMarkerId | null => {
  if (markerId.startsWith('cell:')) {
    const index = Number(markerId.slice(5));
    return Number.isInteger(index) && index >= 0 ? { kind: 'cell', index } : null;
  }
  if (markerId.startsWith('c:') && markerId.length > 2) return { kind: 'complex', id: markerId.slice(2) };
  return null;
};

export const isHousingRental = (saleType: string | null | undefined): boolean => saleType === '임대';

// 단지 하나의 아이콘 — 우선순위 규칙(파일 머리 주석)대로.
const complexIcon = (p: HousingPointType, dealType: HousingDealType): MapMarker['icon'] => {
  const rental = isHousingRental(p.saleType);
  if (p.latest) return badgeIcon('deal', formatHousingDealPrice(dealType, p.latest.price, p.latest.rent), dealType);
  if (p.fallback) {
    const f = p.fallback;
    return badgeIcon(
      'fallback',
      `${rental ? '임대 ' : ''}${HOUSING_DEAL_TYPE_LABEL[f.dealType]} ${formatHousingDealPrice(f.dealType, f.price, f.rent)}`,
      dealType,
    );
  }
  if (p.official) return badgeIcon('official', `${rental ? '임대 ' : ''}공시 ${formatHousingPrice(p.official.median)}`, dealType);
  if (rental) return badgeIcon('fallback', '임대', dealType);
  return EMPTY_ICON;
};

// 응답 → 마커. 셀은 그 칸 단지들의 평균 평당가 알약(거래 있는 단지가 없으면 단지 수) — 글자는 짧은 형
// ('3,251만', '/평' 생략)으로, 셀 한 칸(서버 격자 = 화면 ~128px) 안에 들어가 이웃 알약과 겹치지 않게.
export const buildHousingMarkers = (result: HousingPointsResultType | undefined): MapMarker[] => {
  if (!result) return [];
  const { dealType } = result;
  if (result.mode === 'cells') {
    return result.cells.map((c, index) => {
      const text = c.unitPrice !== null ? formatHousingUnitPriceShort(c.unitPrice) : `${c.count}단지`;
      const src = cellUrl(text, c.count, dealType);
      return { id: `cell:${index}`, lat: c.lat, lng: c.lng, icon: { src, selectedSrc: src }, fixedScale: true };
    });
  }
  return result.items.map((p) => ({
    id: housingMarkerId(p.id),
    lat: p.lat,
    lng: p.lng,
    icon: complexIcon(p, dealType),
    fixedScale: true,
  }));
};

export const housingCellAt = (result: HousingPointsResultType | undefined, index: number): HousingCellType | null =>
  result?.mode === 'cells' ? (result.cells[index] ?? null) : null;
