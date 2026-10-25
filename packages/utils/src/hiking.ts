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

// 이정표 방향 코드(ST·BR·TR·SR·UT·SL·TL·BL)는 조사자가 걸어온 방향 기준이라 코스 방향과 다를 수 있다 — 화면은 코드 대신
// 서버가 코스마다 정한 가는 길·온 길(guide.way)을 쓴다.

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

// ── 예상 시간 ────────────────────────────────────────────────────────────────
// docs/PLAN-hiking.md §2차 — 서버가 적재 때 Tobler 보행 함수로 낸 이동 분(moveMin)에 보행 배율과 피로·휴식 보정을 곱한다:
// 예상 = 1.12 × 이동 × (1 + min(이동, 360) / 600). 산림청 명산등산로 안내 시간 6구간 + 한라산국립공원 안내 시간 2구간에
// 맞췄다(이동 103~316분, 중앙 오차 2%·가장 큰 오차 +36% 마니산). 맞춘 표본보다 긴 종주(이동 360분 넘음)는 보정 배율을
// 더 키우지 않는다. 짧은 휴식은 들어 있고 점심·긴 휴식은 없다.
export const HIKING_TIME_FACTOR = 1.12;
export const HIKING_FATIGUE_MIN = 600;
export const HIKING_FATIGUE_CAP_MIN = 360;
export const estimateHikingMinutes = (moveMin: number): number =>
  Math.round(HIKING_TIME_FACTOR * moveMin * (1 + Math.min(moveMin, HIKING_FATIGUE_CAP_MIN) / HIKING_FATIGUE_MIN));

// loop 원점회귀 · summit 정상에서 끝나는 편도(같은 길로 내려온다) · traverse 넘어가는 편도.
export const HIKING_COURSE_SHAPES = ['loop', 'summit', 'traverse'] as const;
export type HikingCourseShape = (typeof HIKING_COURSE_SHAPES)[number];
export const isHikingCourseShape = (v: unknown): v is HikingCourseShape =>
  typeof v === 'string' && (HIKING_COURSE_SHAPES as readonly string[]).includes(v);
// summit 은 코스의 가장 높은 곳에서 끝난다는 뜻이라(계곡 끝 사찰일 수도 있다) "정상" 대신 "왕복".
export const HIKING_SHAPE_LABEL: Record<HikingCourseShape, string> = { loop: '원점회귀', summit: '왕복', traverse: '편도' };

export interface HikingCourseTimes {
  // 시작→끝(코스 방향) · 끝→시작.
  timeMin: number;
  timeRevMin: number;
  // summit 만 — 오르고 같은 길로 내려오기(이동을 합쳐 보정하므로 두 편도 합보다 길다).
  roundTripMin: number | null;
}
export const hikingCourseTimes = (shape: HikingCourseShape, moveMin: number | null, moveRevMin: number | null): HikingCourseTimes | null =>
  moveMin === null || moveRevMin === null
    ? null
    : {
        timeMin: estimateHikingMinutes(moveMin),
        timeRevMin: estimateHikingMinutes(moveRevMin),
        roundTripMin: shape === 'summit' ? estimateHikingMinutes(moveMin + moveRevMin) : null,
      };

// "45분" · "3시간" · "3시간 10분" — 추정치라 1시간 아래는 5분, 그 위는 10분 단위.
export const formatHikingDuration = (min: number): string => {
  const r = min < 60 ? Math.max(5, Math.round(min / 5) * 5) : Math.round(min / 10) * 10;
  const h = Math.floor(r / 60);
  const m = r % 60;
  return h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
};

// ── 난이도 ────────────────────────────────────────────────────────────────────
// docs/PLAN-hiking.md §2차 — 607코스 분포(예상 p50 4시간·p90 7시간, 누적 상승 p50 700·p90 1,010m, 가장 가파른 500m
// 평균 경사 p50 40·p90 57%)로 정했다. 정상 왕복은 왕복 시간으로 본다. 노면 범위가 거칠어(유형마다 처음·마지막 나온 곳)
// 험한 노면은 "쉬움"을 막는 데만 쓴다 — 밧줄·릿지·사다리(암릉·너덜길은 100대 명산 대부분에 있다).
export const HIKING_DIFFICULTIES = ['easy', 'moderate', 'hard'] as const;
export type HikingDifficulty = (typeof HIKING_DIFFICULTIES)[number];
export const HIKING_DIFFICULTY_LABEL: Record<HikingDifficulty, string> = { easy: '쉬움', moderate: '보통', hard: '어려움' };
export const HIKING_DIFFICULTY_RULE = {
  easyBelowMin: 180,
  easyBelowGainM: 500,
  easyBelowSteepPct: 35,
  hardFromMin: 330,
  hardFromGainM: 1000,
  hardFromSteepPct: 55,
} as const;
const TECHNICAL_SURFACES = ['밧줄', '릿지', '사다리'];

export interface HikingEffort {
  // 나들이 전체 시간 — 정상 왕복은 왕복, 나머지는 코스 방향 편도.
  outingMin: number;
  roundTrip: boolean;
  gainM: number;
  steepPct: number | null;
  roughSurfaces: readonly string[];
}

const effortFlags = (e: HikingEffort) => {
  const R = HIKING_DIFFICULTY_RULE;
  const steep = e.steepPct ?? 0;
  return {
    hardTime: e.outingMin >= R.hardFromMin,
    hardGain: e.gainM >= R.hardFromGainM,
    hardSteep: steep >= R.hardFromSteepPct,
    notEasyTime: e.outingMin >= R.easyBelowMin,
    notEasyGain: e.gainM >= R.easyBelowGainM,
    notEasySteep: steep >= R.easyBelowSteepPct,
    technical: e.roughSurfaces.filter((s) => TECHNICAL_SURFACES.includes(s)),
  };
};

export const hikingDifficulty = (e: HikingEffort): HikingDifficulty => {
  const f = effortFlags(e);
  if (f.hardTime || f.hardGain || f.hardSteep) return 'hard';
  if (f.notEasyTime || f.notEasyGain || f.notEasySteep || f.technical.length > 0) return 'moderate';
  return 'easy';
};

// 그 난이도가 된 까닭 — 어려움은 어려움 기준을 넘은 것, 보통은 쉬움 기준을 넘은 것, 쉬움은 시간·오르막.
export const hikingDifficultyReasons = (e: HikingEffort): string[] => {
  const f = effortFlags(e);
  const time = `${e.roundTrip ? '왕복 ' : ''}예상 ${formatHikingDuration(e.outingMin)}`;
  const gain = `누적 상승 ${Math.round(e.gainM).toLocaleString('ko-KR')}m`;
  const steep = `가파른 500m 평균 ${e.steepPct ?? 0}%`;
  const level = hikingDifficulty(e);
  const out: string[] = [];
  if (level === 'hard') {
    if (f.hardTime) out.push(time);
    if (f.hardGain) out.push(gain);
    if (f.hardSteep) out.push(steep);
  } else if (level === 'moderate') {
    if (f.notEasyTime) out.push(time);
    if (f.notEasyGain) out.push(gain);
    if (f.notEasySteep) out.push(steep);
    if (f.technical.length > 0) out.push(`${f.technical.join('·')} 구간`);
  } else out.push(time, gain);
  return out;
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
