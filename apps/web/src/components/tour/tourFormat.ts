// 여행로그 공개 화면 공용 상수·포맷 — 컴포넌트 파일과 분리(react-refresh: 컴포넌트만 export).

import { TOUR_REGION_KEYS, TOUR_REGIONS, type TourRegionKey } from '@repo/utils';

// 지역 칩(7차) — utils TOUR_REGIONS 순서·라벨. '전체' 는 적재된 모든 데이터셋 합.
export const TOUR_REGION_OPTIONS: ReadonlyArray<{ value: TourRegionKey; label: string }> = TOUR_REGION_KEYS.map((k) => ({ value: k, label: TOUR_REGIONS[k].label }));
export const tourRegionLabel = (r: string | undefined): string => (r && r in TOUR_REGIONS ? TOUR_REGIONS[r as TourRegionKey].label : '제주');
// 지역 비교 집단 막대 색 — 집단 키가 지역마다 달라(제주 3집단 / 시군구) 순서 기준으로 돌려 쓴다.
export const TOUR_GROUP_BAR_COLORS = ['bg-teal-600', 'bg-sky-500', 'bg-amber-500', 'bg-violet-500', 'bg-emerald-500', 'bg-pink-500', 'bg-orange-500', 'bg-cyan-500'] as const;

// 장소 유형별 색 — 식당 teal 이 여행로그 기준 색, 나머지는 계열별.
export const KIND_BG: Record<string, string> = {
  식당: 'bg-teal-600',
  자연: 'bg-sky-500',
  숙소: 'bg-violet-500',
  상업: 'bg-amber-500',
  교통: 'bg-zinc-400',
  문화: 'bg-violet-400',
  상점: 'bg-amber-400',
  체험: 'bg-sky-400',
  레저: 'bg-sky-600',
  산책: 'bg-emerald-500',
  역사: 'bg-violet-600',
  테마: 'bg-pink-500',
  축제: 'bg-pink-400',
  기타: 'bg-zinc-400',
};
export const kindBg = (kind: string): string => KIND_BG[kind] ?? 'bg-zinc-400';

export const won = (v: number | null | undefined): string =>
  v === null || v === undefined ? '–' : v >= 10000 ? `${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}만원` : `${Math.round(v).toLocaleString('ko-KR')}원`;

// 필터 선택지 — 서버 zod(TourInsightsQuery)와 같은 값. 동반 형태는 원본 데이터의 표기 그대로.
export const TOUR_ACCOMPANY_OPTIONS = [
  '나홀로 여행',
  '2인 여행(가족 외)',
  '2인 가족 여행',
  '3인 이상 여행(가족 외)',
  '3인 이상 가족 여행(친척 포함)',
  '자녀 동반 여행',
  '부모 동반 여행',
  '3대 동반 여행(친척 포함)',
] as const;
export const TOUR_AGE_OPTIONS = ['20', '30', '40', '50', '60'] as const;
export const TOUR_MONTH_OPTIONS = [4, 5, 6, 7, 8, 9] as const;
export const TOUR_NIGHTS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '당일' },
  { value: 1, label: '1박' },
  { value: 2, label: '2박' },
  { value: 3, label: '3박' },
  { value: 4, label: '4박+' },
];
export const shortAccompany = (a: string): string => a.replace('(가족 외)', '').replace('(친척 포함)', '');
export const nightsLabel = (n: number | undefined): string => (n === undefined ? '' : (TOUR_NIGHTS_OPTIONS.find((o) => o.value === n)?.label ?? `${n}박`));
