// 일상지도 범죄 통계 배경 레이어 — 경찰청 「범죄 발생 지역별 통계」(data.go.kr 3074462, 연 1회
// CSV: 범죄대분류·중분류 × 시군구 230열)를 행안부 주민등록 인구로 나눠 시군구별 인구 10만 명당
// 발생률로 만들고 5등급(분위) 색칠한다. 점 레이어(CCTV·화장실·병의원)와 달리 면(시군구 경계)에
// 칠하는 "배경(overlay)" 유형이라 내주변·상세와 섞지 않는다. 서버(적재 빌드)와 웹(등급·범례)이
// 같은 규칙을 쓰도록 순수 로직을 한 곳에 둔다.

// 배경 레이어 — 한 번에 하나만 켜진다(면 색칠이 겹치면 읽을 수 없다). 지금은 범죄 통계뿐.
export const LIFE_MAP_OVERLAYS = ['crime'] as const;
export type LifeMapOverlay = (typeof LIFE_MAP_OVERLAYS)[number];
export const LIFE_MAP_OVERLAY_LABEL: Record<LifeMapOverlay, string> = { crime: '범죄 통계' };
export const isLifeMapOverlay = (v: unknown): v is LifeMapOverlay => v === 'crime';

// 색칠 대상 범죄군 — 경찰청 대분류 중 생활 안전과 직결되는 3종만(사기·교통·기타는 합계를
// 지배하지만 "안전" 과 무관해 뺀다). total 은 3종 합.
export const LIFE_CRIME_CATEGORIES = ['violent', 'theft', 'assault'] as const;
export type LifeCrimeCategory = (typeof LIFE_CRIME_CATEGORIES)[number];
export const LIFE_CRIME_METRICS = ['total', ...LIFE_CRIME_CATEGORIES] as const;
export type LifeCrimeMetric = (typeof LIFE_CRIME_METRICS)[number];
export const LIFE_CRIME_METRIC_LABEL: Record<LifeCrimeMetric, string> = {
  total: '전체',
  violent: '강력',
  theft: '절도',
  assault: '폭력',
};
export const isLifeCrimeMetric = (v: unknown): v is LifeCrimeMetric =>
  (LIFE_CRIME_METRICS as readonly unknown[]).includes(v);

// 경찰청 CSV 범죄대분류 → 카테고리. 표에 없는 대분류(지능·풍속·교통 …)는 집계에서 뺀다.
export const LIFE_CRIME_CATEGORY_OF_MAJOR: Record<string, LifeCrimeCategory> = {
  강력범죄: 'violent',
  절도범죄: 'theft',
  폭력범죄: 'assault',
};

// ── 등급 ─────────────────────────────────────────────────────────────────────
// 5등급 분위 — 전국 시군구 발생률의 20/40/60/80 분위를 경계(4개, 오름차순)로 쓴다. 절대 기준이
// 아니라 상대 순위라 "전국에서 어느 쪽인가" 만 말한다(낙인 완화·읽기 쉬움).
export const LIFE_CRIME_GRADES = [1, 2, 3, 4, 5] as const;
export type LifeCrimeGrade = (typeof LIFE_CRIME_GRADES)[number];
export const LIFE_CRIME_GRADE_COUNT = LIFE_CRIME_GRADES.length;
export const LIFE_CRIME_GRADE_LABEL: Record<LifeCrimeGrade, string> = {
  1: '매우 낮음',
  2: '낮음',
  3: '보통',
  4: '높음',
  5: '매우 높음',
};
// 단일 색상(호박색) 밝→어둡 순차 램프 — CCTV 생활방범(파랑)·화장실(분홍)·병의원(청록) 점과 겹쳐도
// 구분되고, 빨강(상태색·경고)을 피한다. 지도에는 반투명으로 깔린다.
export const LIFE_CRIME_GRADE_COLOR: Record<LifeCrimeGrade, string> = {
  1: '#fde68a',
  2: '#fbbf24',
  3: '#f59e0b',
  4: '#b45309',
  5: '#78350f',
};

// 인구 10만 명당 — 소수 1자리. 인구가 없으면 null(비교 불가).
export const lifeCrimePer100k = (count: number, population: number): number | null =>
  population > 0 ? Math.round((count / population) * 100_000 * 10) / 10 : null;

// 분위 경계 — 정렬한 값의 p 분위(선형 보간, R type 7). grades 등급이면 grades-1 개 경계.
export const lifeCrimeQuantileBreaks = (values: readonly number[], grades = LIFE_CRIME_GRADE_COUNT): number[] => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return Array.from({ length: grades - 1 }, () => 0);
  const at = (p: number): number => {
    const h = (sorted.length - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    const a = sorted[lo]!;
    const b = sorted[hi]!;
    return Math.round((a + (b - a) * (h - lo)) * 10) / 10;
  };
  return Array.from({ length: grades - 1 }, (_, i) => at((i + 1) / grades));
};

// 값 → 등급. 경계 이하면 낮은 등급(경계값은 아래 등급에 속한다), 마지막 경계 초과가 5.
export const lifeCrimeGrade = (value: number, breaks: readonly number[]): LifeCrimeGrade => {
  let g = 1;
  for (const b of breaks) if (value > b) g += 1;
  return Math.min(g, LIFE_CRIME_GRADE_COUNT) as LifeCrimeGrade;
};

// 발생률 표기 — 1,234.5 → '1,234.5'. null 은 '-'.
export const formatLifeCrimeRate = (v: number | null): string =>
  v === null ? '-' : v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
