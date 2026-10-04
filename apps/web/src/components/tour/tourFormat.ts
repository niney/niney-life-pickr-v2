// 여행로그 공개 화면 공용 상수·포맷 — 컴포넌트 파일과 분리(react-refresh: 컴포넌트만 export).

import type { TourPlanFocusType, TourPlanPaceType, TourPlanPlaceKeyType, TourPlanTransportType } from '@repo/api-contract';
import { TOUR_REGIONS, type TourRegionKey } from '@repo/utils';

// 지역 라벨(7차) — utils TOUR_REGIONS. 지역 칩(권역 1행 → 시도 2행)은 TourFilterBar 가 utils TOUR_REGION_GROUPS 로 그린다.
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

// ── 코스 일정표(10차) ──
// 자정부터 분 → "10:00" / 분 → "1시간 30분".
export const clockLabel = (min: number): string => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const durationLabel = (min: number): string => (min < 60 ? `${min}분` : min % 60 === 0 ? `${min / 60}시간` : `${Math.floor(min / 60)}시간 ${min % 60}분`);
// 응답에 장소 좌표가 없어(여행로그 장소 자체는 공개하지 않는다) 지도는 이름 검색으로 잇는다.
export const naverMapSearchUrl = (name: string, sigungu?: string | null): string => `https://map.naver.com/p/search/${encodeURIComponent([name, sigungu].filter(Boolean).join(' '))}`;
// 일수 → "당일" · "2박 3일".
export const tripLengthLabel = (days: number): string => (days <= 1 ? '당일' : `${days - 1}박 ${days}일`);
export const nightsLabel = (n: number | undefined): string => (n === undefined ? '' : (TOUR_NIGHTS_OPTIONS.find((o) => o.value === n)?.label ?? `${n}박`));

// ── 코스 입력 확장(11차) ──
// 일정 옵션(속도·취향·이동수단) — 기본값이면 요청에 싣지 않는다.
export interface TourPlanOptionsValue {
  pace: TourPlanPaceType;
  focus: TourPlanFocusType[];
  transport: TourPlanTransportType;
  // 여행 시작일 "YYYY-MM-DD"(12차) — 일정에 날짜를 붙이고, 예보가 닿는 날은 비 오는 날을 실내 위주로 짠다. 서버에는 날짜가 아니라
  // 비 오는 일차 번호(wetDays)만 간다.
  startDate: string | null;
}
export const DEFAULT_TOUR_PLAN_OPTIONS: TourPlanOptionsValue = { pace: 'normal', focus: [], transport: 'car', startDate: null };
// 꼭 갈 곳·뺄 곳은 이름(+읍면동)으로 가리킨다 — 응답에 장소 id 가 없다.
export const tourPlaceKey = (p: { name: string; emd?: string | null }): TourPlanPlaceKeyType => ({ name: p.name, emd: p.emd ?? null });
export const sameTourPlace = (a: { name: string; emd?: string | null }, b: { name: string; emd?: string | null }): boolean => a.name === b.name && (a.emd ?? null) === (b.emd ?? null);
export const TOUR_PLAN_MUST_MAX = 8;
export const TOUR_PLAN_AVOID_MAX = 30;

// ── 날씨(12차) ──
// "YYYY-MM-DD" 에 n 일을 더한다(달력 계산만 — 시간대 무관).
export const addDaysYmd = (ymd: string, n: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// 일차별 날짜·예보 — forecast 는 "비 70%" 같은 한 줄(예보가 닿지 않는 날은 null), wet 은 비 예보 여부.
export interface TourDayWeather {
  date: string;
  forecast: string | null;
  wet: boolean;
}
// 강수확률이 이만큼이면 날씨 문구와 상관없이 비 오는 날로 본다.
export const TOUR_WET_POP = 60;

