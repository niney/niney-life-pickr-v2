// 여행로그(AI 허브 「국내 여행로그 데이터」 2023 — 71780 제주·도서, 71779 서부권) 공통 상수 — 적재기·집계·화면이 같은 값을 쓴다.
// 계획·이용조건은 docs/PLAN-tour-log.md. 7차(서부권)부터 데이터셋이 둘이라 "데이터셋(적재 단위)" 과 "지역(공개 화면 축)" 을
// 여기서 한 번만 정의한다.

// ── 데이터셋(적재 단위) ────────────────────────────────────────────────────────
// tour-c export 한 폴더 = 데이터셋 하나. 로더는 `--dataset` 으로 받아 그 데이터셋 행만 갈아끼운다. 장소 id 는 export 안에서만
// 유일(POI/이름+좌표 해시)이라 서울역·휴게소 같은 공용 장소가 세트마다 같은 id 로 나온다 → 기본 세트(jeju, 첫 적재본)만 접두 없음.
// 키 목록은 @repo/api-contract 의 TourDataset·TourRegion zod enum 과 같아야 한다(utils 는 api-contract 를 import 할 수 없어 —
// 순환 금지 — 리터럴을 다시 적고, friendly 의 tour 테스트가 두 목록의 동일성을 검증한다. foodTaxonomy 와 같은 규약).
export const TOUR_DATASET_KEYS = ['jeju', 'west'] as const;
export type TourDatasetKey = (typeof TOUR_DATASET_KEYS)[number];
export interface TourDatasetDef {
  key: TourDatasetKey;
  // AI 허브 dataSetSn.
  aihub: string;
  // 출처 표기용 데이터명(AI 허브 등록명).
  name: string;
  label: string;
  // 기본 export 폴더명(data/open/tour/<exportName>).
  exportName: string;
  // TourPlace id 접두(장소를 참조하는 모든 열에 같이 붙는다).
  idPrefix: string;
  // 이 세트의 표본 목적지 시도(짧은 이름 — tour-c SIDO_MAP 값).
  sidos: readonly string[];
}
export const TOUR_DATASETS: Record<TourDatasetKey, TourDatasetDef> = {
  jeju: { key: 'jeju', aihub: '71780', name: '국내 여행로그 데이터(제주도 및 도서지역)', label: '제주·도서', exportName: 'lp-2023', idPrefix: '', sidos: ['제주'] },
  west: { key: 'west', aihub: '71779', name: '국내 여행로그 데이터(서부권)', label: '서부권', exportName: 'lp-west-2023', idPrefix: 'west:', sidos: ['전북', '전남', '충남', '대전', '충북', '광주', '세종'] },
};
export const isTourDatasetKey = (s: unknown): s is TourDatasetKey => typeof s === 'string' && (TOUR_DATASET_KEYS as readonly string[]).includes(s);
export const tourPlaceIdOf = (dataset: TourDatasetKey, rawId: string): string => `${TOUR_DATASETS[dataset].idPrefix}${rawId}`;
// LifeMasterSync layer — 첫 세트는 'tour'(기존 이력·deploy.sh 호환), 나머지는 'tour-<key>'.
export const tourSyncLayer = (dataset: TourDatasetKey): string => (dataset === 'jeju' ? 'tour' : `tour-${dataset}`);

// ── 지역(공개 화면 축) ──────────────────────────────────────────────────────────
// 인사이트·코스·숙소·지역비교·시드 콘솔의 region 값. 'jeju' 는 isJeju(본섬+부속섬, bbox 판정 포함) 그대로, 시도 지역은 방문 sido,
// 'west' 는 서부권 7개 시도 합, 'all' 은 필터 없음(적재된 전체). 순서는 화면 칩 순서. api-contract TourRegion 과 동일해야 한다.
export const TOUR_REGION_KEYS = ['jeju', 'west', 'jeonbuk', 'jeonnam', 'chungnam', 'daejeon', 'chungbuk', 'gwangju', 'sejong', 'all'] as const;
export type TourRegionKey = (typeof TOUR_REGION_KEYS)[number];
export interface TourRegionDef {
  key: TourRegionKey;
  label: string;
  // 방문 sido 조건(null = 조건 없음). jeju 는 sido 대신 isJeju 열을 쓴다(부속섬·bbox 보정 포함).
  sidos: readonly string[] | null;
  // 지도 이동 목표(일상지도 밀도 레이어·코스 화면).
  center: { lat: number; lng: number; zoom: number };
  // 이 지역 "안" 판정 bbox [minLat, minLng, maxLat, maxLng] — 켰을 때 지도가 밖이면 center 로 이동.
  bbox: readonly [number, number, number, number];
  // "거점 다음 첫 목적지" 집계의 거점 이름 조각(전이 from_name includes). 비면 집계하지 않는다.
  hubs: readonly string[];
  hubLabel: string;
}
const WEST_SIDOS = TOUR_DATASETS.west.sidos;
const JEJU_HUBS = ['제주국제공항'] as const;
const JEONBUK_HUBS = ['전주역', '익산역', '전주고속버스터미널', '전주시외버스터미널', '군산역'] as const;
const JEONNAM_HUBS = ['여수엑스포역', '여수공항', '목포역', '순천역', '광주송정역', '여수시외버스터미널'] as const;
const CHUNGNAM_HUBS = ['천안아산역', '천안역', '공주역', '천안종합버스터미널'] as const;
const DAEJEON_HUBS = ['대전역', '서대전역', '대전복합터미널', '유성시외버스터미널'] as const;
const CHUNGBUK_HUBS = ['오송역', '청주국제공항', '청주공항', '충주역', '제천역', '청주시외버스터미널'] as const;
const GWANGJU_HUBS = ['광주송정역', '광주공항', '광주종합버스터미널', '유스퀘어'] as const;
const SEJONG_HUBS = ['오송역'] as const;
const WEST_HUBS = [...JEONBUK_HUBS, ...JEONNAM_HUBS, ...CHUNGNAM_HUBS, ...DAEJEON_HUBS, ...CHUNGBUK_HUBS, ...GWANGJU_HUBS] as const;
export const TOUR_REGIONS: Record<TourRegionKey, TourRegionDef> = {
  jeju: { key: 'jeju', label: '제주', sidos: ['제주'], center: { lat: 33.38, lng: 126.55, zoom: 10 }, bbox: [33.0, 125.9, 34.2, 127.2], hubs: JEJU_HUBS, hubLabel: '공항 다음 첫 목적지' },
  west: { key: 'west', label: '서부권', sidos: WEST_SIDOS, center: { lat: 36.0, lng: 127.1, zoom: 8 }, bbox: [33.9, 125.9, 37.25, 128.6], hubs: WEST_HUBS, hubLabel: '역·터미널·공항 다음 첫 목적지' },
  jeonbuk: { key: 'jeonbuk', label: '전북', sidos: ['전북'], center: { lat: 35.75, lng: 127.05, zoom: 9 }, bbox: [35.3, 126.3, 36.2, 127.9], hubs: JEONBUK_HUBS, hubLabel: '역·터미널 다음 첫 목적지' },
  jeonnam: { key: 'jeonnam', label: '전남', sidos: ['전남'], center: { lat: 34.85, lng: 126.95, zoom: 8 }, bbox: [33.9, 125.9, 35.5, 127.9], hubs: JEONNAM_HUBS, hubLabel: '역·공항 다음 첫 목적지' },
  chungnam: { key: 'chungnam', label: '충남', sidos: ['충남'], center: { lat: 36.55, lng: 126.75, zoom: 9 }, bbox: [35.95, 125.9, 37.05, 127.4], hubs: CHUNGNAM_HUBS, hubLabel: '역·터미널 다음 첫 목적지' },
  daejeon: { key: 'daejeon', label: '대전', sidos: ['대전'], center: { lat: 36.35, lng: 127.38, zoom: 11 }, bbox: [36.18, 127.25, 36.5, 127.56], hubs: DAEJEON_HUBS, hubLabel: '역·터미널 다음 첫 목적지' },
  chungbuk: { key: 'chungbuk', label: '충북', sidos: ['충북'], center: { lat: 36.8, lng: 127.75, zoom: 9 }, bbox: [36.0, 127.25, 37.25, 128.6], hubs: CHUNGBUK_HUBS, hubLabel: '역·공항 다음 첫 목적지' },
  gwangju: { key: 'gwangju', label: '광주', sidos: ['광주'], center: { lat: 35.16, lng: 126.85, zoom: 11 }, bbox: [35.05, 126.65, 35.27, 127.02], hubs: GWANGJU_HUBS, hubLabel: '역·공항·터미널 다음 첫 목적지' },
  sejong: { key: 'sejong', label: '세종', sidos: ['세종'], center: { lat: 36.55, lng: 127.28, zoom: 11 }, bbox: [36.4, 127.1, 36.75, 127.4], hubs: SEJONG_HUBS, hubLabel: '역 다음 첫 목적지' },
  all: { key: 'all', label: '전체', sidos: null, center: { lat: 35.5, lng: 127.0, zoom: 7 }, bbox: [33.0, 124.0, 39.0, 132.0], hubs: [...JEJU_HUBS, ...WEST_HUBS], hubLabel: '공항·역·터미널 다음 첫 목적지' },
};
export const isTourRegionKey = (s: unknown): s is TourRegionKey => typeof s === 'string' && (TOUR_REGION_KEYS as readonly string[]).includes(s);
export const tourRegionLabel = (key: TourRegionKey): string => TOUR_REGIONS[key].label;
// 표본 세트 단위 bbox 안인지 — 밀도 레이어를 켰을 때 지도가 어느 표본 근처에 있는지 판정한다.
const inBbox = (lat: number, lng: number, b: readonly [number, number, number, number]): boolean => lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3];
export const tourSampleRegionAt = (lat: number, lng: number): Extract<TourRegionKey, 'jeju' | 'west'> | null =>
  inBbox(lat, lng, TOUR_REGIONS.jeju.bbox) ? 'jeju' : inBbox(lat, lng, TOUR_REGIONS.west.bbox) ? 'west' : null;
// 표본 밖이면 가까운 표본(제주·서부권) 중심 — 켤 때 이동 목표.
export const nearestTourSampleRegion = (lat: number, lng: number): Extract<TourRegionKey, 'jeju' | 'west'> => {
  const d = (k: 'jeju' | 'west'): number => (TOUR_REGIONS[k].center.lat - lat) ** 2 + (TOUR_REGIONS[k].center.lng - lng) ** 2;
  return d('jeju') <= d('west') ? 'jeju' : 'west';
};

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
// 두 세트를 합쳐 집계하므로 데이터명은 둘 다 적는다.
export const TOUR_DATASET_NAMES = [TOUR_DATASETS.jeju.name, TOUR_DATASETS.west.name] as const;
export const TOUR_DATASET_NAME = TOUR_DATASET_NAMES.join('·');
export const TOUR_SAMPLE_LABEL = '2023년 4~9월 여행자 표본';
export const TOUR_SOURCE_NOTE =
  '이 통계는 과학기술정보통신부·한국지능정보사회진흥원(NIA) 인공지능 학습용 데이터 구축사업 결과물인 ' +
  `「${TOUR_DATASETS.jeju.name}」·「${TOUR_DATASETS.west.name}」(AI 허브 aihub.or.kr, 2023)을 가공한 2차 저작물입니다. ` +
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

// 제주 본섬 중심·근방 판정 — 7차부터는 TOUR_REGIONS.jeju / tourSampleRegionAt 이 원본이고 이 둘은 그 별칭이다.
export const JEJU_CENTER = TOUR_REGIONS.jeju.center;
export const isNearJeju = (lat: number, lng: number): boolean => tourSampleRegionAt(lat, lng) === 'jeju';
