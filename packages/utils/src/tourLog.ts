// 여행로그(AI 허브 「국내 여행로그 데이터」 2023 — 71780 제주·도서, 71779 서부권, 71778 동부권, 71581 수도권) 공통 상수 — 적재기·집계·
// 화면이 같은 값을 쓴다. 계획·이용조건은 docs/PLAN-tour-log.md. 7차(서부권)부터 데이터셋이 여럿이라 "데이터셋(적재 단위)" 과
// "지역(공개 화면 축)" 을 여기서 한 번만 정의한다. 권역을 더 붙일 때는 TOUR_DATASETS 한 줄 + TOUR_REGIONS(권역·시도) + 계약 두 배열.

// ── 데이터셋(적재 단위) ────────────────────────────────────────────────────────
// tour-c export 한 폴더 = 데이터셋 하나. 로더는 `--dataset` 으로 받아 그 데이터셋 행만 갈아끼운다. 장소 id 는 export 안에서만
// 유일(POI/이름+좌표 해시)이라 서울역·휴게소 같은 공용 장소가 세트마다 같은 id 로 나온다 → 기본 세트(jeju, 첫 적재본)만 접두 없음.
// 키 목록은 @repo/api-contract 의 TourDataset·TourRegion zod enum 과 같아야 한다(utils 는 api-contract 를 import 할 수 없어 —
// 순환 금지 — 리터럴을 다시 적고, friendly 의 tour 테스트가 두 목록의 동일성을 검증한다. foodTaxonomy 와 같은 규약).
export const TOUR_DATASET_KEYS = ['jeju', 'west', 'east', 'capital'] as const;
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
  east: { key: 'east', aihub: '71778', name: '국내 여행로그 데이터(동부권)', label: '동부권', exportName: 'lp-east-2023', idPrefix: 'east:', sidos: ['강원', '경북', '경남', '부산', '대구', '울산'] },
  // 수도권(9차)은 거주자의 근교 나들이 표본(당일 67%, 85% 수도권 거주) — 장소당 표본이 얇아 시드보다 매칭·밀도·코스 용도.
  capital: { key: 'capital', aihub: '71581', name: '국내 여행로그 데이터(수도권)', label: '수도권', exportName: 'lp-capital-2023', idPrefix: 'capital:', sidos: ['서울', '경기', '인천'] },
};
export const isTourDatasetKey = (s: unknown): s is TourDatasetKey => typeof s === 'string' && (TOUR_DATASET_KEYS as readonly string[]).includes(s);
export const tourPlaceIdOf = (dataset: TourDatasetKey, rawId: string): string => `${TOUR_DATASETS[dataset].idPrefix}${rawId}`;
// LifeMasterSync layer — 첫 세트는 'tour'(기존 이력·deploy.sh 호환), 나머지는 'tour-<key>'.
export const tourSyncLayer = (dataset: TourDatasetKey): string => (dataset === 'jeju' ? 'tour' : `tour-${dataset}`);

// ── 지역(공개 화면 축) ──────────────────────────────────────────────────────────
// 인사이트·코스·숙소·지역비교·시드 콘솔의 region 값. 'jeju' 는 isJeju(본섬+부속섬, bbox 판정 포함) 그대로, 시도 지역은 방문 sido,
// 'west'/'east'/'capital' 은 그 권역 시도의 합, 'all' 은 필터 없음(적재된 전체). 순서는 화면 칩 순서(권역 → 그 권역의 시도). 데이터셋
// 키는 항상 지역 키이기도 하다(표본 단위 지역). api-contract TourRegion 과 동일해야 한다.
export const TOUR_REGION_KEYS = [
  'jeju',
  'west',
  'jeonbuk',
  'jeonnam',
  'chungnam',
  'daejeon',
  'chungbuk',
  'gwangju',
  'sejong',
  'east',
  'gangwon',
  'gyeongbuk',
  'gyeongnam',
  'busan',
  'daegu',
  'ulsan',
  'capital',
  'seoul',
  'gyeonggi',
  'incheon',
  'all',
] as const;
export type TourRegionKey = (typeof TOUR_REGION_KEYS)[number];
export interface TourRegionDef {
  key: TourRegionKey;
  label: string;
  // 권역 묶음 — 시도 지역은 속한 권역 키(west|east), 권역·제주·전체는 null. 화면 칩의 1행(권역)/2행(시도)이 이걸로 갈린다.
  parent: TourRegionKey | null;
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
// 동부권(8차) 거점 — 동부권 전이 표에서 여행자 8명 이상인 역·터미널·공항(휴게소 제외). '경주역' 은 '신경주역' 도 포함(includes).
const EAST_SIDOS = TOUR_DATASETS.east.sidos;
const GANGWON_HUBS = ['강릉역', '강릉시외버스터미널', '강릉고속버스터미널', '속초고속버스터미널', '속초시외버스터미널', '춘천역', '양양종합여객터미널', '양양국제공항', '원주역'] as const;
const GYEONGBUK_HUBS = ['신경주역', '경주역', '경주시외버스터미널', '경주고속버스터미널', '포항역', '포항터미널', '안동역', '안동터미널', '영주역', '구미역'] as const;
const GYEONGNAM_HUBS = ['진주역', '창원중앙역', '마산역', '사천공항', '통영종합버스터미널', '거제고현버스터미널'] as const;
const BUSAN_HUBS = ['부산역', '김해국제공항', '부산종합버스터미널', '부산서부버스터미널', '해운대시외버스정류소', '부전역', '구포역'] as const;
const DAEGU_HUBS = ['동대구역', '동대구터미널', '대구역', '대구국제공항', '서대구역'] as const;
const ULSAN_HUBS = ['울산역', '태화강역', '울산시외버스터미널', '울산고속버스터미널', '울산공항'] as const;
const EAST_HUBS = [...GANGWON_HUBS, ...GYEONGBUK_HUBS, ...GYEONGNAM_HUBS, ...BUSAN_HUBS, ...DAEGU_HUBS, ...ULSAN_HUBS] as const;
// 수도권(9차) 거점 — 표본이 집에서 출발하는 나들이라 "거점 다음" 은 타지 거주자(15%)와 역·터미널 이용자에게만 의미가 있다. 역·터미널·공항만.
const CAPITAL_SIDOS = TOUR_DATASETS.capital.sidos;
const SEOUL_HUBS = ['서울역', '용산역', '수서역', '청량리역', '서울고속버스터미널', '센트럴시티터미널', '동서울종합터미널', '김포국제공항', '김포공항'] as const;
const GYEONGGI_HUBS = ['수원역', '가평역', '광명역', '동탄역', '평택역', '의정부역', '용문역'] as const;
const INCHEON_HUBS = ['인천국제공항', '인천공항', '인천종합버스터미널', '인천역', '송도역', '강화여객자동차터미널'] as const;
const CAPITAL_HUBS = [...SEOUL_HUBS, ...GYEONGGI_HUBS, ...INCHEON_HUBS] as const;
export const TOUR_REGIONS: Record<TourRegionKey, TourRegionDef> = {
  jeju: { key: 'jeju', label: '제주', parent: null, sidos: ['제주'], center: { lat: 33.38, lng: 126.55, zoom: 10 }, bbox: [33.0, 125.9, 34.2, 127.2], hubs: JEJU_HUBS, hubLabel: '공항 다음 첫 목적지' },
  west: { key: 'west', label: '서부권', parent: null, sidos: WEST_SIDOS, center: { lat: 36.0, lng: 127.1, zoom: 8 }, bbox: [33.9, 125.9, 37.25, 128.6], hubs: WEST_HUBS, hubLabel: '역·터미널·공항 다음 첫 목적지' },
  jeonbuk: { key: 'jeonbuk', label: '전북', parent: 'west', sidos: ['전북'], center: { lat: 35.75, lng: 127.05, zoom: 9 }, bbox: [35.3, 126.3, 36.2, 127.9], hubs: JEONBUK_HUBS, hubLabel: '역·터미널 다음 첫 목적지' },
  jeonnam: { key: 'jeonnam', label: '전남', parent: 'west', sidos: ['전남'], center: { lat: 34.85, lng: 126.95, zoom: 8 }, bbox: [33.9, 125.9, 35.5, 127.9], hubs: JEONNAM_HUBS, hubLabel: '역·공항 다음 첫 목적지' },
  chungnam: { key: 'chungnam', label: '충남', parent: 'west', sidos: ['충남'], center: { lat: 36.55, lng: 126.75, zoom: 9 }, bbox: [35.95, 125.9, 37.05, 127.4], hubs: CHUNGNAM_HUBS, hubLabel: '역·터미널 다음 첫 목적지' },
  daejeon: { key: 'daejeon', label: '대전', parent: 'west', sidos: ['대전'], center: { lat: 36.35, lng: 127.38, zoom: 11 }, bbox: [36.18, 127.25, 36.5, 127.56], hubs: DAEJEON_HUBS, hubLabel: '역·터미널 다음 첫 목적지' },
  chungbuk: { key: 'chungbuk', label: '충북', parent: 'west', sidos: ['충북'], center: { lat: 36.8, lng: 127.75, zoom: 9 }, bbox: [36.0, 127.25, 37.25, 128.6], hubs: CHUNGBUK_HUBS, hubLabel: '역·공항 다음 첫 목적지' },
  gwangju: { key: 'gwangju', label: '광주', parent: 'west', sidos: ['광주'], center: { lat: 35.16, lng: 126.85, zoom: 11 }, bbox: [35.05, 126.65, 35.27, 127.02], hubs: GWANGJU_HUBS, hubLabel: '역·공항·터미널 다음 첫 목적지' },
  sejong: { key: 'sejong', label: '세종', parent: 'west', sidos: ['세종'], center: { lat: 36.55, lng: 127.28, zoom: 11 }, bbox: [36.4, 127.1, 36.75, 127.4], hubs: SEJONG_HUBS, hubLabel: '역 다음 첫 목적지' },
  east: { key: 'east', label: '동부권', parent: null, sidos: EAST_SIDOS, center: { lat: 36.3, lng: 128.8, zoom: 7 }, bbox: [34.5, 127.6, 38.65, 132.0], hubs: EAST_HUBS, hubLabel: '역·터미널·공항 다음 첫 목적지' },
  gangwon: { key: 'gangwon', label: '강원', parent: 'east', sidos: ['강원'], center: { lat: 37.75, lng: 128.3, zoom: 8 }, bbox: [37.0, 127.5, 38.65, 129.4], hubs: GANGWON_HUBS, hubLabel: '역·터미널·공항 다음 첫 목적지' },
  gyeongbuk: { key: 'gyeongbuk', label: '경북', parent: 'east', sidos: ['경북'], center: { lat: 36.4, lng: 128.9, zoom: 8 }, bbox: [35.55, 127.8, 37.55, 132.0], hubs: GYEONGBUK_HUBS, hubLabel: '역·터미널 다음 첫 목적지' },
  gyeongnam: { key: 'gyeongnam', label: '경남', parent: 'east', sidos: ['경남'], center: { lat: 35.3, lng: 128.3, zoom: 8 }, bbox: [34.5, 127.55, 35.95, 129.3], hubs: GYEONGNAM_HUBS, hubLabel: '역·공항·터미널 다음 첫 목적지' },
  busan: { key: 'busan', label: '부산', parent: 'east', sidos: ['부산'], center: { lat: 35.17, lng: 129.07, zoom: 11 }, bbox: [34.95, 128.75, 35.4, 129.35], hubs: BUSAN_HUBS, hubLabel: '역·공항·터미널 다음 첫 목적지' },
  daegu: { key: 'daegu', label: '대구', parent: 'east', sidos: ['대구'], center: { lat: 35.85, lng: 128.6, zoom: 11 }, bbox: [35.6, 128.35, 36.05, 128.8], hubs: DAEGU_HUBS, hubLabel: '역·터미널·공항 다음 첫 목적지' },
  ulsan: { key: 'ulsan', label: '울산', parent: 'east', sidos: ['울산'], center: { lat: 35.55, lng: 129.25, zoom: 11 }, bbox: [35.3, 128.95, 35.75, 129.5], hubs: ULSAN_HUBS, hubLabel: '역·터미널 다음 첫 목적지' },
  capital: { key: 'capital', label: '수도권', parent: null, sidos: CAPITAL_SIDOS, center: { lat: 37.5, lng: 127.0, zoom: 9 }, bbox: [36.9, 124.6, 38.3, 127.9], hubs: CAPITAL_HUBS, hubLabel: '역·터미널·공항 다음 첫 목적지' },
  seoul: { key: 'seoul', label: '서울', parent: 'capital', sidos: ['서울'], center: { lat: 37.5665, lng: 126.978, zoom: 11 }, bbox: [37.42, 126.76, 37.71, 127.19], hubs: SEOUL_HUBS, hubLabel: '역·터미널·공항 다음 첫 목적지' },
  gyeonggi: { key: 'gyeonggi', label: '경기', parent: 'capital', sidos: ['경기'], center: { lat: 37.4, lng: 127.2, zoom: 9 }, bbox: [36.9, 126.3, 38.3, 127.9], hubs: GYEONGGI_HUBS, hubLabel: '역 다음 첫 목적지' },
  incheon: { key: 'incheon', label: '인천', parent: 'capital', sidos: ['인천'], center: { lat: 37.45, lng: 126.7, zoom: 11 }, bbox: [37.1, 124.6, 37.85, 126.85], hubs: INCHEON_HUBS, hubLabel: '공항·역·터미널 다음 첫 목적지' },
  all: { key: 'all', label: '전체', parent: null, sidos: null, center: { lat: 36.0, lng: 127.9, zoom: 7 }, bbox: [33.0, 124.0, 39.0, 132.0], hubs: [...JEJU_HUBS, ...WEST_HUBS, ...EAST_HUBS, ...CAPITAL_HUBS], hubLabel: '공항·역·터미널 다음 첫 목적지' },
};
export const isTourRegionKey = (s: unknown): s is TourRegionKey => typeof s === 'string' && (TOUR_REGION_KEYS as readonly string[]).includes(s);
export const tourRegionLabel = (key: TourRegionKey): string => TOUR_REGIONS[key].label;

// 화면 칩 묶음 — 1행은 권역(제주·서부권·동부권·전체), 2행은 고른 권역의 시도. parent 에서 파생하므로 키만 추가하면 된다.
export interface TourRegionGroup {
  key: TourRegionKey;
  children: readonly TourRegionKey[];
}
export const TOUR_REGION_GROUPS: readonly TourRegionGroup[] = TOUR_REGION_KEYS.filter((k) => TOUR_REGIONS[k].parent === null).map((k) => ({
  key: k,
  children: TOUR_REGION_KEYS.filter((c) => TOUR_REGIONS[c].parent === k),
}));
// 지역 키가 속한 1행 칩(권역) — 시도는 parent, 그 밖은 자기 자신.
export const tourRegionGroupOf = (key: TourRegionKey): TourRegionKey => TOUR_REGIONS[key].parent ?? key;

// 표본 단위 지역 = 데이터셋 키(jeju·west·east). 밀도 레이어를 켰을 때 지도가 어느 표본 bbox 안인지 판정하고, 밖이면 가까운 표본 중심으로.
export type TourSampleRegionKey = TourDatasetKey;
const inBbox = (lat: number, lng: number, b: readonly [number, number, number, number]): boolean => lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3];
export const tourSampleRegionAt = (lat: number, lng: number): TourSampleRegionKey | null => TOUR_DATASET_KEYS.find((k) => inBbox(lat, lng, TOUR_REGIONS[k].bbox)) ?? null;
export const nearestTourSampleRegion = (lat: number, lng: number): TourSampleRegionKey => {
  const d = (k: TourSampleRegionKey): number => (TOUR_REGIONS[k].center.lat - lat) ** 2 + (TOUR_REGIONS[k].center.lng - lng) ** 2;
  return TOUR_DATASET_KEYS.reduce((best, k) => (d(k) < d(best) ? k : best));
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

// ── 10차 코스 일정표(13차에서 제주 밖으로) ─────────────────────────────────────
// 일정표(일차·순서·시각)를 합성해 주는 지역과 그 지역의 동선 규모. '전체' 는 어디로 갈지 정하지 않은 것이라 넣지 않는다(장소만).
// 값은 2026-10-04 적재 표본에서 잰 것이다(docs/PLAN-tour-log.md 부록 D) — 제주는 하루에 섬 절반을 도는데 본토 여행은 한 도시
// 안팎에서 끝난다(하루 동선 반경 75% 선: 제주 20km, 본토 4~11km · 날짜 사이 이동 90% 선: 제주 35km, 본토 7~38km).
export interface TourItineraryRegionDef {
  // 하루 권역 반경(km) — 그 지역 여행의 하루 동선 반경(그날 들른 곳들의 중심에서 가장 먼 곳) 75% 선을 5~12km 로 자른 값.
  zoneKm: number;
  // 일정 전체가 머무는 반경(km) — 거점 권역에서 이 거리 안의 권역만 쓴다(날짜 사이 이동 거리 90% 선을 15~40km 로 자른 값).
  // 이게 없으면 "강원 2박" 이 강릉 → 춘천 → 속초로 튄다. null = 제한 없음(제주 — 섬 전체가 하루 거리다).
  hubKm: number | null;
  // 부속섬(isIsland) 장소를 일정에서 뺀다. 이 열은 제주 세트에서만 뜻이 맞는다(다른 세트에서는 전주한옥마을·강릉 시내에도 붙어 있다).
  skipIslands: boolean;
  // 식사 자리에 넣을 식당 후보가 없으면 볼거리로 채운다. 제주 밖은 식당마다 표본이 얇아(여행 5건 이상인 식당이 드물다) 이렇게
  // 하지 않으면 볼거리가 많은 동네도 하루가 비어 버린다.
  mealFallback: boolean;
  // 예보 지점(12차 — weatherRegions.ts 의 지점 id). null 이면 서버가 일정의 거점에서 가장 가까운 지점을 응답으로 알려 준다.
  // 제주는 섬 중심에서 가까운 지점이 성판악(산간)이라 사람이 모이는 제주시를 직접 적는다.
  weatherPlaceId: string | null;
}
const mainland = (zoneKm: number, hubKm: number): TourItineraryRegionDef => ({ zoneKm, hubKm, skipIslands: false, mealFallback: true, weatherPlaceId: null });
export const TOUR_ITINERARY_REGIONS: Partial<Record<TourRegionKey, TourItineraryRegionDef>> = {
  jeju: { zoneKm: 12, hubKm: null, skipIslands: true, mealFallback: false, weatherPlaceId: '11G00201' },
  west: mainland(9, 36),
  jeonbuk: mainland(8, 28),
  jeonnam: mainland(8, 32),
  chungnam: mainland(11, 32),
  daejeon: mainland(5, 15),
  chungbuk: mainland(9, 24),
  gwangju: mainland(5, 15),
  sejong: mainland(5, 15),
  east: mainland(9, 35),
  gangwon: mainland(9, 38),
  gyeongbuk: mainland(10, 31),
  gyeongnam: mainland(10, 31),
  busan: mainland(7, 15),
  daegu: mainland(5, 15),
  ulsan: mainland(9, 16),
  capital: mainland(7, 24),
  seoul: mainland(5, 15),
  gyeonggi: mainland(6, 26),
  incheon: mainland(6, 20),
};
export const isTourItineraryRegion = (key: TourRegionKey): boolean => key in TOUR_ITINERARY_REGIONS;
// 일정표 일수 = 박수 + 1(당일은 하루), 4박 이상은 5일로 묶는다(박수 필터의 "4박 이상" 과 같은 상한).
export const TOUR_ITINERARY_MAX_DAYS = 5;
export const tourItineraryDays = (nights: number): number => Math.max(1, Math.min(TOUR_ITINERARY_MAX_DAYS, Math.round(nights) + 1));

// ── 11차 코스 입력 확장 ────────────────────────────────────────────────────────
// 일정표를 내 사정에 맞추는 선택 입력. 키 목록은 @repo/api-contract 의 zod enum 과 같아야 한다(순환 금지라 리터럴을 다시 적고
// friendly 테스트가 동일성을 검증 — TOUR_REGION_KEYS 와 같은 규약).
// 속도 — 하루에 들르는 곳 수를 비슷한 여행의 중앙에서 하나 줄이거나 늘린다.
export const TOUR_PLAN_PACE_KEYS = ['relaxed', 'normal', 'packed'] as const;
export type TourPlanPaceKey = (typeof TOUR_PLAN_PACE_KEYS)[number];
export const TOUR_PLAN_PACES: Record<TourPlanPaceKey, { label: string; lenShift: number }> = {
  relaxed: { label: '여유롭게', lenShift: -1 },
  normal: { label: '보통', lenShift: 0 },
  packed: { label: '빽빽하게', lenShift: 1 },
};
// 취향 — 고른 묶음의 유형에 가중을 준다(목록 순위와 일정표의 볼거리 자리 모두). 식당은 대상이 아니다.
export const TOUR_PLAN_FOCUS_KEYS = ['nature', 'city', 'activity', 'culture'] as const;
export type TourPlanFocusKey = (typeof TOUR_PLAN_FOCUS_KEYS)[number];
export const TOUR_PLAN_FOCUSES: Record<TourPlanFocusKey, { label: string; kinds: readonly TourTypeShort[] }> = {
  nature: { label: '자연·바다', kinds: ['자연', '산책'] },
  city: { label: '시장·쇼핑', kinds: ['상업'] },
  activity: { label: '체험·액티비티', kinds: ['체험', '레저', '테마'] },
  culture: { label: '문화·역사', kinds: ['문화', '역사'] },
};
export const TOUR_PLAN_FOCUS_BOOST = 1.5;
// 이동수단 — 대중교통은 구간 이동 분을 버스 기록으로 보고(없으면 차 × 1.8 + 10분) 하루 권역을 좁힌다.
export const TOUR_PLAN_TRANSPORT_KEYS = ['car', 'transit'] as const;
export type TourPlanTransportKey = (typeof TOUR_PLAN_TRANSPORT_KEYS)[number];
export const TOUR_PLAN_TRANSPORTS: Record<TourPlanTransportKey, { label: string }> = {
  car: { label: '차(렌터카·택시)' },
  transit: { label: '대중교통' },
};

// ── 14차 코스 다양화 ──────────────────────────────────────────────────────────
// 조건이 달라도, 다시 찾아도 같은 코스가 나오던 것을 푼다(2026-10-04 실측 — 제주 200개 조건의 일정에 나오는 장소가 후보 815곳 중
// 85곳, 조건의 59% 가 같은 첫날). 키 목록은 @repo/api-contract 의 zod enum 과 같아야 한다(friendly 테스트가 검증).
// 유명도 — 추천 점수에서 "여행 수" 가 차지하는 몫(여행 수의 지수). 후보의 8할이 여행 20건 미만인데 보정 만족도는 인기 장소와 같은
// 수준이라(중앙 4.35 대 4.43) √여행 수를 그대로 곱하면 늘 같은 곳이 이긴다. 기본은 지금까지와 같은 famous.
export const TOUR_PLAN_FAME_KEYS = ['famous', 'mixed', 'hidden'] as const;
export type TourPlanFameKey = (typeof TOUR_PLAN_FAME_KEYS)[number];
export const TOUR_PLAN_FAMES: Record<TourPlanFameKey, { label: string; exponent: number }> = {
  famous: { label: '유명한 곳 위주', exponent: 0.5 },
  mixed: { label: '골고루', exponent: 0.25 },
  hidden: { label: '덜 알려진 곳도', exponent: 0 },
};
// 여행 목적 — 원본의 미션(코드표 MIS, 여행마다 1~5개 받는다)으로 "그 목적의 여행이 평균보다 더 간 곳" 을 앞세운다. 유형 묶음에
// 일괄 가중을 주는 취향(focus)과 달리 장소 단위다(역사 유적 → 항파두리·제주목 관아, 등산 → 한라산·오름). 21개 미션 가운데 표본이
// 두껍고(권역마다 100건 이상) 장소가 실제로 갈리는 것만 연다. mission = MIS 코드.
export const TOUR_PLAN_PURPOSE_KEYS = ['theme', 'history', 'culture', 'sports', 'hiking', 'shopping', 'spa', 'filming', 'hotplace', 'newplace'] as const;
export type TourPlanPurposeKey = (typeof TOUR_PLAN_PURPOSE_KEYS)[number];
export const TOUR_PLAN_PURPOSES: Record<TourPlanPurposeKey, { label: string; mission: string }> = {
  theme: { label: '테마파크·동식물원', mission: '2' },
  history: { label: '역사 유적', mission: '3' },
  culture: { label: '전시·공연', mission: '6' },
  sports: { label: '야외 스포츠·레포츠', mission: '5' },
  hiking: { label: '등산', mission: '28' },
  shopping: { label: '쇼핑', mission: '1' },
  spa: { label: '온천·스파', mission: '10' },
  filming: { label: '촬영지', mission: '12' },
  hotplace: { label: '요즘 뜨는 곳', mission: '26' },
  newplace: { label: '새로운 곳 찾기', mission: '24' },
};
// 목적은 셋까지 — 여러 개를 곱하면 가중이 한쪽으로 쏠린다.
export const TOUR_PLAN_PURPOSE_MAX = 3;
// 다른 코스 보기 — 변형 번호(0 = 가장 점수가 높은 코스). 같은 번호는 같은 코스다.
export const TOUR_PLAN_VARIANT_MAX = 99;

// 출처 표기(AI 허브 이용정책 — NIA 사업결과·데이터명·aihub.or.kr 필수). 집계를 쓰는 모든 섹션 하단에 그대로.
// 세트를 합쳐 집계하므로 데이터명은 적재 가능한 세트 전부를 적는다(TOUR_DATASETS 순서).
export const TOUR_DATASET_NAMES: readonly string[] = TOUR_DATASET_KEYS.map((k) => TOUR_DATASETS[k].name);
export const TOUR_DATASET_NAME = TOUR_DATASET_NAMES.join('·');
export const TOUR_SAMPLE_LABEL = '2023년 4~9월 여행자 표본';
export const TOUR_SOURCE_NOTE =
  '이 통계는 과학기술정보통신부·한국지능정보사회진흥원(NIA) 인공지능 학습용 데이터 구축사업 결과물인 ' +
  `${TOUR_DATASET_NAMES.map((n) => `「${n}」`).join('·')}(AI 허브 aihub.or.kr, 2023)을 가공한 2차 저작물입니다. ` +
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
