// 여행로그(AI 허브 71780 「국내 여행로그 데이터(제주도 및 도서지역)」) 공통 상수 — 적재기·집계·화면이 같은 값을 쓴다.
// 계획·이용조건은 docs/PLAN-tour-log.md.

// tour-c 파생표의 장소 유형 축약(VIS 코드 → type_short). 공개 화면의 색·필터 축.
export const TOUR_TYPE_SHORTS = [
  '자연',
  '역사',
  '문화',
  '상업',
  '레저',
  '테마',
  '산책',
  '축제',
  '교통',
  '상점',
  '식당',
  '기타',
  '체험',
  '숙소',
] as const;
export type TourTypeShort = (typeof TOUR_TYPE_SHORTS)[number];

// 비공개 방문(집 21 · 친구/친지집 22 · 사무실 23)의 type_short — 이름·주소·좌표가 NULL 인 행. 집계에서 항상 제외.
export const TOUR_PRIVATE_TYPE_SHORTS = ['집', '친지', '사무실'] as const;

// 맛집 매칭 대상 유형 — 식당/카페 외에 시장·상점으로 잘못 기록된 식당이 있어(2차 분석) 상업·상점도 후보.
export const TOUR_RESTAURANT_TYPE_SHORTS = ['식당', '상업', '상점'] as const;

// 소셀 억제 — 집계 셀의 여행자(또는 방문) 수가 이 값 미만이면 공개 응답에서 null. 장소 평점은 평가 3건 미만이면 숨긴다.
export const TOUR_K_MIN = 5;
export const TOUR_RATING_MIN_N = 3;

// 출처 표기(AI 허브 이용정책 — NIA 사업결과·데이터명·aihub.or.kr 필수). 집계를 쓰는 모든 섹션 하단에 그대로.
export const TOUR_DATASET_NAME = '국내 여행로그 데이터(제주도 및 도서지역)';
export const TOUR_SAMPLE_LABEL = '2023년 4~9월 여행자 표본';
export const TOUR_SOURCE_NOTE =
  '이 통계는 과학기술정보통신부·한국지능정보사회진흥원(NIA) 인공지능 학습용 데이터 구축사업 결과물인 ' +
  '「국내 여행로그 데이터(제주도 및 도서지역)」(AI 허브 aihub.or.kr, 2023)을 가공한 2차 저작물입니다. ' +
  '2023년 4~9월 패널 표본을 집계한 값이며 현재 영업 상태나 관광객 전체를 대표하지 않습니다.';

// ── 6차 지도 밀도(일상지도 배경 레이어) ─────────────────────────────────────────
// 공개 방문(좌표 있음)을 0.02°(위도 ≈2.2km × 경도 ≈1.9km) 격자로 세고 여행자 5명 미만 칸은 내지 않는다. 등급은 칸의
// 방문 수 20/40/60/80 분위(범죄 통계 배경과 같은 규칙) — 절대량이 아니라 "표본 안에서 어느 쪽인가".
export const TOUR_DENSITY_CELL_DEG = 0.02;
export const TOUR_DENSITY_KINDS = ['all', 'restaurant'] as const;
export type TourDensityKind = (typeof TOUR_DENSITY_KINDS)[number];
export const TOUR_DENSITY_KIND_LABEL: Record<TourDensityKind, string> = { all: '전체', restaurant: '식당만' };
export const TOUR_DENSITY_GRADES = [1, 2, 3, 4, 5] as const;
export type TourDensityGrade = (typeof TOUR_DENSITY_GRADES)[number];
export const TOUR_DENSITY_GRADE_LABEL: Record<TourDensityGrade, string> = { 1: '드묾', 2: '적음', 3: '보통', 4: '많음', 5: '매우 많음' };
// 청록 램프(밝→어둡) — 식당 teal 계열, 범죄 통계(호박색)·점 레이어와 구분.
export const TOUR_DENSITY_GRADE_COLOR: Record<TourDensityGrade, string> = {
  1: '#ccfbf1',
  2: '#5eead4',
  3: '#14b8a6',
  4: '#0f766e',
  5: '#134e4a',
};

// 분위 경계(4개, 오름차순) — R type 7 선형 보간. 값이 없으면 0.
export const tourDensityQuantileBreaks = (values: readonly number[]): number[] => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0, 0];
  const at = (p: number): number => {
    const h = (sorted.length - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (h - lo);
  };
  return [0.2, 0.4, 0.6, 0.8].map((p) => Math.round(at(p) * 1e6) / 1e6);
};
export const tourDensityGrade = (n: number, breaks: readonly number[]): TourDensityGrade => {
  let g = 1;
  for (const b of breaks) if (n > b) g += 1;
  return Math.min(g, 5) as TourDensityGrade;
};

// 칸 인덱스(x = floor(lng/deg), y = floor(lat/deg)) → WGS84 bbox.
export const tourDensityCellBbox = (x: number, y: number, deg = TOUR_DENSITY_CELL_DEG) => ({
  minLng: x * deg,
  minLat: y * deg,
  maxLng: (x + 1) * deg,
  maxLat: (y + 1) * deg,
});
export const tourDensityCellKey = (x: number, y: number): string => `${x}:${y}`;
export const parseTourDensityCellKey = (key: string): { x: number; y: number } | null => {
  const [xs, ys] = key.split(':');
  const x = Number(xs);
  const y = Number(ys);
  return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
};

// 제주 본섬 중심·근방 판정 — 배경 레이어를 켰는데 지도가 제주 밖이면 여기로 이동한다.
export const JEJU_CENTER = { lat: 33.38, lng: 126.55, zoom: 10 } as const;
export const isNearJeju = (lat: number, lng: number): boolean => lat >= 33.0 && lat <= 34.2 && lng >= 125.9 && lng <= 127.2;
