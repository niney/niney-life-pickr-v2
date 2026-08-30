// 일상지도(전국 CCTV·공중화장실·병의원) 순수 유틸 — 코드표·범례 그룹·편의시설 판정·저줌 집계 셀.
// 원천은 지방행정인허가데이터개방(localdata.go.kr) 전국 CSV(실측 2026-08: CCTV 377,278행 /
// 화장실 53,559행)와 심평원 병원정보서비스 API(data.go.kr 15001698, 병의원 ~8만 기관).
// 서버(적재·조회)와 웹(범례·필터·마커)이 같은 코드표를 쓰도록 한 곳에 둔다.

export const LIFE_MAP_LAYERS = ['cctv', 'toilet', 'hospital'] as const;
export type LifeMapLayer = (typeof LIFE_MAP_LAYERS)[number];
export const LIFE_MAP_LAYER_LABEL: Record<LifeMapLayer, string> = {
  cctv: 'CCTV',
  toilet: '공중화장실',
  hospital: '병의원',
};
export const isLifeMapLayer = (v: unknown): v is LifeMapLayer =>
  v === 'cctv' || v === 'toilet' || v === 'hospital';

// 개별 지점을 그리기 시작하는 줌 — 미만은 서버 집계 셀(버블 카운트). CCTV 는 서울 도심
// 밀도(≈100개/km²) 기준 z15 뷰포트(≈16km²)에서 ~1,500점, 화장실(≈9개/km²)은 z13(≈260km²)
// 에서 ~2,400점 — 요청당 점 상한 안에 들어온다. 병의원은 서울 평균 ≈33개/km²(강남 의료몰은
// 국지적으로 그 몇 배)라 z14(≈65km²)에서 보통 ~2천 점, 최밀집 뷰포트만 truncated 안내.
export const LIFE_MAP_POINT_MIN_ZOOM: Record<LifeMapLayer, number> = { cctv: 15, toilet: 13, hospital: 14 };
export const LIFE_MAP_POINTS_MAX = 4000;

// ── CCTV 설치목적 ─────────────────────────────────────────────────────────────
// 원본 10종(실측 분포: 생활방범 62%·다목적 13%·어린이보호 8%·교통단속 5%·시설물관리 3%·
// 재난재해 2%·쓰레기단속 2%·차량방범 2%·기타 2%·교통정보수집 1%). 모르는 값은 '기타'.
export const LIFE_CCTV_PURPOSES = [
  '생활방범',
  '다목적',
  '어린이보호',
  '교통단속',
  '교통정보수집',
  '시설물관리',
  '재난재해',
  '쓰레기단속',
  '차량방범',
  '기타',
] as const;
export type LifeCctvPurpose = (typeof LIFE_CCTV_PURPOSES)[number];

export const normalizeLifeCctvPurpose = (raw: string | null | undefined): LifeCctvPurpose => {
  const s = (raw ?? '').replace(/\s+/g, '').trim();
  return (LIFE_CCTV_PURPOSES as readonly string[]).includes(s) ? (s as LifeCctvPurpose) : '기타';
};

// 쉼표 구분 설치목적 파라미터 → 유효 목적 배열(중복 제거, 모르는 값 무시). 빈 배열 = 전체.
export const parseLifeCctvPurposes = (raw: string | null | undefined): LifeCctvPurpose[] => {
  if (!raw) return [];
  const out: LifeCctvPurpose[] = [];
  for (const part of raw.split(',')) {
    const s = part.trim();
    if ((LIFE_CCTV_PURPOSES as readonly string[]).includes(s) && !out.includes(s as LifeCctvPurpose)) {
      out.push(s as LifeCctvPurpose);
    }
  }
  return out;
};

// 범례 그룹 4종 — 지도 점은 색 하나로 구분돼야 하는데 범주색은 4개까지만 전 쌍이 읽힌다
// (팔레트 검증 통과 기준). 필터는 10종 그대로 두고, 색·범례만 묶는다.
export const LIFE_CCTV_PURPOSE_GROUPS = ['safety', 'child', 'traffic', 'etc'] as const;
export type LifeCctvPurposeGroup = (typeof LIFE_CCTV_PURPOSE_GROUPS)[number];
export const LIFE_CCTV_PURPOSE_GROUP_LABEL: Record<LifeCctvPurposeGroup, string> = {
  safety: '생활방범',
  child: '어린이보호',
  traffic: '교통',
  etc: '다목적·기타',
};
const LIFE_CCTV_PURPOSE_GROUP_OF: Record<LifeCctvPurpose, LifeCctvPurposeGroup> = {
  생활방범: 'safety',
  어린이보호: 'child',
  교통단속: 'traffic',
  교통정보수집: 'traffic',
  다목적: 'etc',
  시설물관리: 'etc',
  재난재해: 'etc',
  쓰레기단속: 'etc',
  차량방범: 'etc',
  기타: 'etc',
};
export const lifeCctvPurposeGroup = (purpose: string | null | undefined): LifeCctvPurposeGroup =>
  LIFE_CCTV_PURPOSE_GROUP_OF[normalizeLifeCctvPurpose(purpose)];
export const lifeCctvPurposesOfGroup = (group: LifeCctvPurposeGroup): LifeCctvPurpose[] =>
  LIFE_CCTV_PURPOSES.filter((p) => LIFE_CCTV_PURPOSE_GROUP_OF[p] === group);

// ── 공중화장실 ───────────────────────────────────────────────────────────────
export const LIFE_TOILET_KINDS = ['공중화장실', '개방화장실', '간이화장실', '이동화장실', '기타'] as const;
export type LifeToiletKind = (typeof LIFE_TOILET_KINDS)[number];
export const normalizeLifeToiletKind = (raw: string | null | undefined): LifeToiletKind => {
  const s = (raw ?? '').replace(/\s+/g, '').trim();
  return (LIFE_TOILET_KINDS as readonly string[]).includes(s) ? (s as LifeToiletKind) : '기타';
};

// 개방시간 구분 — 원본 '정시'(운영시간 있음)/'상시'/'불규칙'/'미개방', 빈값은 '미상'.
export const LIFE_TOILET_OPEN_TYPES = ['상시', '정시', '불규칙', '미개방', '미상'] as const;
export type LifeToiletOpenType = (typeof LIFE_TOILET_OPEN_TYPES)[number];
export const normalizeLifeToiletOpenType = (raw: string | null | undefined): LifeToiletOpenType => {
  const s = (raw ?? '').replace(/\s+/g, '').trim();
  return (LIFE_TOILET_OPEN_TYPES as readonly string[]).includes(s) ? (s as LifeToiletOpenType) : '미상';
};

// 24시간 개방 판정 — 구분이 '상시'이거나 상세가 24시간(00:00~24:00·연중무휴 등)을 말할 때.
// '정시 + 24시간' 같은 조합이 실데이터에 흔해 상세도 본다. 미개방은 상세와 무관하게 false.
// 개방시간 한 줄 — 24시간이면 그것만, 아니면 구분 + 상세(웹·앱 표시 공용).
export const lifeToiletOpenLabel = (openType: string, openDetail: string | null, open24: boolean): string => {
  if (open24) return '24시간';
  if (openType === '미개방') return '미개방';
  if (openDetail) return openType === '미상' ? openDetail : `${openType} ${openDetail}`;
  return openType === '미상' ? '개방시간 미상' : openType;
};

export const lifeToiletOpen24 = (openType: string | null | undefined, openDetail: string | null | undefined): boolean => {
  const type = normalizeLifeToiletOpenType(openType);
  if (type === '미개방') return false;
  if (type === '상시') return true;
  const d = (openDetail ?? '').replace(/\s+/g, '');
  return /24시간|24시|00:00[~\-–]24:00|00:00[~\-–]00:00|0:00[~\-–]24:00|연중무휴|24h/i.test(d);
};

// 편의시설 배지 — 표시 순서 고정. 키는 서버 항목 필드명과 1:1.
export const LIFE_TOILET_FEATURES = [
  { key: 'open24', label: '24시간' },
  { key: 'disabled', label: '장애인용' },
  { key: 'kids', label: '어린이용' },
  { key: 'diaper', label: '기저귀교환대' },
  { key: 'bell', label: '비상벨' },
  { key: 'entranceCctv', label: '입구 CCTV' },
] as const;
export type LifeToiletFeatureKey = (typeof LIFE_TOILET_FEATURES)[number]['key'];
// 필터로도 쓰는 키(서버 쿼리 파라미터와 1:1) — 입구 CCTV 는 표시만.
export const LIFE_TOILET_FILTER_KEYS = ['open24', 'disabled', 'kids', 'diaper', 'bell'] as const;
export type LifeToiletFilterKey = (typeof LIFE_TOILET_FILTER_KEYS)[number];

export interface LifeToiletFixtureCounts {
  maleToilet: number;
  maleUrinal: number;
  maleDisabledToilet: number;
  maleDisabledUrinal: number;
  maleKidsToilet: number;
  maleKidsUrinal: number;
  femaleToilet: number;
  femaleDisabledToilet: number;
  femaleKidsToilet: number;
}

// 변기수 한 줄 요약 — "남 대변기 2·소변기 3 / 여 대변기 4". 전부 0이면 null.
export const summarizeLifeToiletFixtures = (f: LifeToiletFixtureCounts): string | null => {
  const male: string[] = [];
  if (f.maleToilet > 0) male.push(`대변기 ${f.maleToilet}`);
  if (f.maleUrinal > 0) male.push(`소변기 ${f.maleUrinal}`);
  const female: string[] = [];
  if (f.femaleToilet > 0) female.push(`대변기 ${f.femaleToilet}`);
  const parts: string[] = [];
  if (male.length > 0) parts.push(`남 ${male.join('·')}`);
  if (female.length > 0) parts.push(`여 ${female.join('·')}`);
  return parts.length > 0 ? parts.join(' / ') : null;
};

// ── 병의원 ───────────────────────────────────────────────────────────────────
// 필터·마커용 정규화 7종 — 심평원 종별코드명(clCdNm, 상급종합병원~조산원 15종 안팎)을 묶는다.
// 원문 종별은 상세(kindName)에 그대로 보여 주고, 필터 칩·서버 category 열은 이 7종만 쓴다.
export const LIFE_HOSPITAL_CATEGORIES = ['종합병원', '병원', '의원', '치과', '한방', '보건기관', '기타'] as const;
export type LifeHospitalCategory = (typeof LIFE_HOSPITAL_CATEGORIES)[number];

const LIFE_HOSPITAL_CATEGORY_OF: Record<string, LifeHospitalCategory> = {
  // 심평원 실응답(프로브 2026-08-28)은 '상급종합병원'이 아니라 '상급종합'으로 온다.
  상급종합: '종합병원',
  상급종합병원: '종합병원',
  종합병원: '종합병원',
  병원: '병원',
  요양병원: '병원',
  정신병원: '병원',
  치과병원: '치과',
  치과의원: '치과',
  한방병원: '한방',
  한의원: '한방',
  의원: '의원',
  보건소: '보건기관',
  보건지소: '보건기관',
  보건진료소: '보건기관',
  보건의료원: '보건기관',
};

export const normalizeLifeHospitalCategory = (clCdNm: string | null | undefined): LifeHospitalCategory => {
  const s = (clCdNm ?? '').replace(/\s+/g, '').trim();
  return LIFE_HOSPITAL_CATEGORY_OF[s] ?? '기타';
};

// 쉼표 구분 category 파라미터 → 유효 카테고리 배열(중복 제거, 모르는 값 무시). 빈 배열 = 전체.
export const parseLifeHospitalCategories = (raw: string | null | undefined): LifeHospitalCategory[] => {
  if (!raw) return [];
  const out: LifeHospitalCategory[] = [];
  for (const part of raw.split(',')) {
    const s = part.trim();
    if ((LIFE_HOSPITAL_CATEGORIES as readonly string[]).includes(s) && !out.includes(s as LifeHospitalCategory)) {
      out.push(s as LifeHospitalCategory);
    }
  }
  return out;
};

// ── 표시 도우미 ──────────────────────────────────────────────────────────────
// 'YYYYMM' → 'YYYY.MM'. 원본에 'YYYY-MM'·'YYYY.MM'·'YYYYMMDD' 도 섞여 있어 앞 6자리(숫자)만 본다.
export const formatLifeYm = (ym: string | null | undefined): string | null => {
  const digits = (ym ?? '').replace(/\D/g, '');
  const m = /^(\d{4})(\d{2})/.exec(digits);
  if (!m) return null;
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  return `${m[1]}.${m[2]}`;
};

// 집계 버블 숫자 — 1,234 → '1.2천', 12,345 → '1.2만', 123,456 → '12만'. 천 미만은 그대로.
export const formatLifeCount = (n: number): string => {
  if (n >= 100_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}천`;
  return String(n);
};

// 버블 크기 버킷 — 1~9 / 10~99 / 100~999 / 1,000+.
export const lifeCountBucket = (n: number): 0 | 1 | 2 | 3 => (n < 10 ? 0 : n < 100 ? 1 : n < 1000 ? 2 : 3);

// ── 저줌 집계 셀 ─────────────────────────────────────────────────────────────
// 셀 한 변 = 웹 메르카토르 타일(256px)의 1/4 — 어느 줌에서나 화면 ~64px 격자. 위도 방향은
// 0.8배(≈cos 37°)로 한국 위도에서 정사각에 가깝게. 원점은 전국 고정(124°E, 33°N)이라 패닝해도
// 셀 경계가 흔들리지 않는다(서버 GROUP BY 와 캐시 키가 이 값을 쓴다).
export const LIFE_CELL_ORIGIN = { lat: 33, lng: 124 } as const;
export const lifeCellSizeDeg = (zoom: number): { dLng: number; dLat: number } => {
  const z = Math.max(0, Math.min(22, Math.floor(Number.isFinite(zoom) ? zoom : 0)));
  const dLng = 360 / 2 ** z / 4;
  return { dLng, dLat: dLng * 0.8 };
};
