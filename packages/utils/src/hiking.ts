// 등산(/hiking) — 100대 명산 코스의 공용 규칙. 서버 적재(시도 추출)·웹 표시(라벨·색·지도 지점)가 같은 값을 쓴다.
// docs/PLAN-hiking.md

// ── 시도 ──────────────────────────────────────────────────────────────────────
// 명산등산로 소재지(areanm) 문구에서 뽑는다 — "강원도 춘천시 …, 홍천군 …" / "강원 양구군" / "전남 고흥군" 처럼
// 정식·줄인 이름이 섞이고, 두세 시도에 걸친 산은 쉼표 뒤에 다음 시도가 온다.
export const HIKING_REGIONS = [
  'seoul',
  'busan',
  'daegu',
  'incheon',
  'gwangju',
  'daejeon',
  'ulsan',
  'sejong',
  'gyeonggi',
  'gangwon',
  'chungbuk',
  'chungnam',
  'jeonbuk',
  'jeonnam',
  'gyeongbuk',
  'gyeongnam',
  'jeju',
] as const;
export type HikingRegion = (typeof HIKING_REGIONS)[number];

const REGION_PATTERN: Record<HikingRegion, RegExp> = {
  seoul: /서울/,
  busan: /부산/,
  daegu: /대구/,
  incheon: /인천/,
  // 경기 광주시와 헷갈리지 않게 광역시만.
  gwangju: /광주광역시/,
  daejeon: /대전/,
  ulsan: /울산/,
  sejong: /세종/,
  gyeonggi: /경기/,
  gangwon: /강원/,
  chungbuk: /충청북도|충북/,
  chungnam: /충청남도|충남/,
  jeonbuk: /전라북도|전북/,
  jeonnam: /전라남도|전남/,
  gyeongbuk: /경상북도|경북/,
  gyeongnam: /경상남도|경남/,
  jeju: /제주/,
};

export const hikingRegionsOf = (area: string | null | undefined): HikingRegion[] =>
  area ? HIKING_REGIONS.filter((r) => REGION_PATTERN[r].test(area)) : [];

// 목록 칩 — 시도 17개는 너무 잘아 권역으로 묶는다(산 100개라 권역당 10~30개).
export const HIKING_REGION_GROUPS = [
  { key: 'capital', label: '수도권', regions: ['seoul', 'incheon', 'gyeonggi'] },
  { key: 'gangwon', label: '강원', regions: ['gangwon'] },
  { key: 'chungcheong', label: '충청', regions: ['daejeon', 'sejong', 'chungbuk', 'chungnam'] },
  { key: 'jeolla', label: '전라', regions: ['gwangju', 'jeonbuk', 'jeonnam'] },
  { key: 'gyeongsang', label: '경상', regions: ['busan', 'daegu', 'ulsan', 'gyeongbuk', 'gyeongnam'] },
  { key: 'jeju', label: '제주', regions: ['jeju'] },
] as const satisfies readonly { key: string; label: string; regions: readonly HikingRegion[] }[];
export type HikingRegionGroup = (typeof HIKING_REGION_GROUPS)[number]['key'];
export const isHikingRegionGroup = (v: unknown): v is HikingRegionGroup =>
  typeof v === 'string' && HIKING_REGION_GROUPS.some((g) => g.key === v);
export const hikingInRegionGroup = (regions: readonly string[], group: HikingRegionGroup): boolean => {
  const g = HIKING_REGION_GROUPS.find((x) => x.key === group);
  return !!g && regions.some((r) => (g.regions as readonly string[]).includes(r));
};

// ── 지점 분류(GPX category 원문 코드) ────────────────────────────────────────────
export const HIKING_POI_LABEL: Record<string, string> = {
  PEAK: '봉우리',
  SIGN: '갈림길',
  ENTRY: '들머리',
  TRANS: '대중교통',
  PARK: '주차장',
  TOILET: '화장실',
  DANGER: '위험',
  SHELTER: '대피소',
  REST: '쉼터',
  SPRING: '샘터',
  VIEW: '전망',
  SCENERY: '경관',
  CULTURAL: '문화재',
  PHOTO: '사진 명소',
  INFO: '안내',
  FOOD: '식당',
  STORE: '매점',
  CAMP: '야영장',
  WILD: '야생동물',
  NONE: '기타',
};
export const hikingPoiLabel = (category: string): string => HIKING_POI_LABEL[category] ?? '기타';

// 코스 지도·목록에 올리는 분류(순서 = 목록 순서). 나머지(경관·안내·쉼터 등 1만여 점)는 지도가 빽빽해져 뺀다.
export const HIKING_MAP_POI_CATEGORIES = ['PEAK', 'ENTRY', 'SIGN', 'DANGER', 'SHELTER', 'TOILET', 'SPRING', 'PARK', 'TRANS', 'VIEW'] as const;
export type HikingMapPoiCategory = (typeof HIKING_MAP_POI_CATEGORIES)[number];
export const isHikingMapPoiCategory = (v: string): v is HikingMapPoiCategory =>
  (HIKING_MAP_POI_CATEGORIES as readonly string[]).includes(v);

// 이정표 방향 코드(GPX signpost "목적지;코드", API orgnSgnpstDstn*DrcntCd) — 조사 진행 방향 기준.
export const HIKING_SIGN_DIR_LABEL: Record<string, string> = { ST: '직진', TL: '왼쪽', TR: '오른쪽', UT: '뒤쪽' };
export const HIKING_SIGN_DIR_ARROW: Record<string, string> = { ST: '↑', TL: '←', TR: '→', UT: '↓' };

// ── 노면 ──────────────────────────────────────────────────────────────────────
// GPX rtsc 이름 그대로. 험한 노면은 고도 그래프 아래 띠로 따로 보여 준다.
export const HIKING_ROUGH_SURFACES = ['암릉', '릿지', '밧줄', '사다리', '너덜길'] as const;
export const isHikingRoughSurface = (s: string): boolean => (HIKING_ROUGH_SURFACES as readonly string[]).includes(s);
export const HIKING_SURFACE_COLOR: Record<string, string> = {
  암릉: '#b91c1c',
  릿지: '#c2410c',
  밧줄: '#a16207',
  사다리: '#7c3aed',
  너덜길: '#78716c',
};

// ── 지도 색 ──────────────────────────────────────────────────────────────────
export const HIKING_MOUNTAIN_COLOR = '#15803d';
// 같은 산 여러 코스를 구분하는 선 색(순환). 선택 코스는 HIKING_SELECTED_COURSE_COLOR.
export const HIKING_COURSE_COLORS = ['#2563eb', '#db2777', '#0891b2', '#9333ea', '#ea580c', '#0d9488', '#4f46e5', '#be123c'] as const;
export const HIKING_SELECTED_COURSE_COLOR = '#dc2626';
export const hikingCourseColor = (index: number): string => HIKING_COURSE_COLORS[index % HIKING_COURSE_COLORS.length]!;

// ── 표시 ──────────────────────────────────────────────────────────────────────
export const formatHikingLength = (m: number): string => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);
export const formatHikingEle = (m: number): string => `${Math.round(m).toLocaleString('ko-KR')}m`;

// 고도 프로필(서버 저장 형식) — d: 시작에서 거리(m), e: 고도(m). 같은 길이.
export interface HikingProfile {
  d: number[];
  e: number[];
}
