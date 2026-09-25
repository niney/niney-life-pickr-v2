// 주차(/parking) 순수 유틸 — 주차장(전국주차장정보표준데이터 15012896 + 서울 공영주차장)·전기차 충전소(환경공단
// 15076352)·공항 주차(한국공항공사 15158689 + 인천공항 15095047). 서버(적재·조회)와 웹(범례·필터·상세)이
// 같은 코드표·계산을 쓰도록 한 곳에 둔다. docs/PLAN-parking.md

export const PARKING_TABS = ['lot', 'ev', 'airport'] as const;
export type ParkingTab = (typeof PARKING_TABS)[number];
export const PARKING_TAB_LABEL: Record<ParkingTab, string> = { lot: '주차장', ev: '충전소', airport: '공항' };
export const isParkingTab = (v: unknown): v is ParkingTab => v === 'lot' || v === 'ev' || v === 'airport';

// ── 주차장 코드 ──────────────────────────────────────────────────────────────
export const PARKING_OWNERSHIPS = ['public', 'private'] as const;
export type ParkingOwnership = (typeof PARKING_OWNERSHIPS)[number];
export const PARKING_OWNERSHIP_LABEL: Record<ParkingOwnership, string> = { public: '공영', private: '민영' };

export const PARKING_LOT_TYPES = ['street', 'offstreet', 'attached'] as const;
export type ParkingLotType = (typeof PARKING_LOT_TYPES)[number];
export const PARKING_LOT_TYPE_LABEL: Record<ParkingLotType, string> = { street: '노상', offstreet: '노외', attached: '부설' };

export const PARKING_FEE_TYPES = ['free', 'paid', 'mixed'] as const;
export type ParkingFeeType = (typeof PARKING_FEE_TYPES)[number];
export const PARKING_FEE_TYPE_LABEL: Record<ParkingFeeType, string> = { free: '무료', paid: '유료', mixed: '일부 유료' };

export const PARKING_SOURCES = ['std', 'seoul', 'kotsa'] as const;
export type ParkingSource = (typeof PARKING_SOURCES)[number];
export const PARKING_SOURCE_LABEL: Record<ParkingSource, string> = {
  std: '전국주차장정보표준데이터',
  seoul: '서울시 공영주차장 안내',
  kotsa: '한국교통안전공단 주차정보',
};

// 원문 → 코드. 모르는 값은 null(표시 생략).
export const parseParkingOwnership = (raw: string | null | undefined): ParkingOwnership | null => {
  const s = (raw ?? '').replace(/\s+/g, '');
  if (s.includes('공영')) return 'public';
  if (s.includes('민영')) return 'private';
  return null;
};
export const parseParkingLotType = (raw: string | null | undefined): ParkingLotType | null => {
  const s = (raw ?? '').replace(/\s+/g, '');
  if (s.includes('노상')) return 'street';
  if (s.includes('노외')) return 'offstreet';
  if (s.includes('부설')) return 'attached';
  return null;
};
// 표준데이터 요금정보('무료'·'유료'·'혼합'·'유료+무' 같은 변종).
export const parseParkingFeeType = (raw: string | null | undefined): ParkingFeeType | null => {
  const s = (raw ?? '').replace(/\s+/g, '');
  if (s === '') return null;
  if (s.includes('혼합') || (s.includes('유료') && s.includes('무'))) return 'mixed';
  if (s.includes('유료')) return 'paid';
  if (s.includes('무료')) return 'free';
  return null;
};

// ── 운영시간 ────────────────────────────────────────────────────────────────
// 'HHMM' | 'HH:MM' | 'H:MM' → 'HH:MM'(24:00 허용). 깨진 값은 null.
export const normalizeParkingHhmm = (raw: string | null | undefined): string | null => {
  const s = (raw ?? '').trim();
  const m = /^(\d{1,2}):?(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59 || (h === 24 && mm !== 0)) return null;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const hhmmToMin = (s: string): number => {
  const [h, m] = s.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export type ParkingDayKind = 'wd' | 'sat' | 'hol';
export const PARKING_DAY_KIND_LABEL: Record<ParkingDayKind, string> = { wd: '평일', sat: '토요일', hol: '일·공휴일' };

// KST 기준 요일 구분(공휴일은 모른다 — 일요일만 공휴일 시간으로).
export const parkingDayKindKst = (now: Date = new Date()): ParkingDayKind => {
  const dow = new Date(now.getTime() + 9 * 3_600_000).getUTCDay();
  return dow === 0 ? 'hol' : dow === 6 ? 'sat' : 'wd';
};
// KST 요일(0=일)·시(0~23) — 혼잡 이력 칸 키.
export const parkingKstSlot = (now: Date = new Date()): { dow: number; hour: number } => {
  const k = new Date(now.getTime() + 9 * 3_600_000);
  return { dow: k.getUTCDay(), hour: k.getUTCHours() };
};

export interface ParkingHours {
  open: string | null;
  close: string | null;
}
// 하루 운영시간 해석 — '00:00~00:00' 은 정보 없음(원천이 빈 값을 0 으로 채운다), '00:00~24:00'·'00:00~23:59' 는 24시간.
export type ParkingHoursKind = 'unknown' | 'allday' | 'range';
export const parkingHoursKind = (h: ParkingHours): ParkingHoursKind => {
  if (!h.open || !h.close) return 'unknown';
  if (h.open === '00:00' && h.close === '00:00') return 'unknown';
  if (h.open === '00:00' && (h.close === '24:00' || h.close === '23:59')) return 'allday';
  return 'range';
};
export const formatParkingHours = (h: ParkingHours): string => {
  const kind = parkingHoursKind(h);
  if (kind === 'unknown') return '정보 없음';
  if (kind === 'allday') return '24시간';
  return `${h.open}~${h.close}`;
};
// 지금 운영 중인지 — 정보 없으면 null. 종료가 시작보다 이르면 자정을 넘는 운영(05:00~01:00).
export const isParkingOpenAt = (h: ParkingHours, now: Date = new Date()): boolean | null => {
  const kind = parkingHoursKind(h);
  if (kind === 'unknown') return null;
  if (kind === 'allday') return true;
  const { hour } = parkingKstSlot(now);
  const cur = hour * 60 + new Date(now.getTime() + 9 * 3_600_000).getUTCMinutes();
  const o = hhmmToMin(h.open!);
  let c = hhmmToMin(h.close!);
  if (c === 23 * 60 + 59) c = 24 * 60;
  if (c > o) return cur >= o && cur < c;
  if (c < o) return cur >= o || cur < c;
  return null;
};

// ── 요금 ────────────────────────────────────────────────────────────────────
export interface ParkingFeeRule {
  feeType: ParkingFeeType;
  // 기본 시간(분)·요금(원), 추가 단위 시간(분)·요금(원), 일 최대 요금, 1일권 요금. null = 정보 없음.
  baseMin: number | null;
  baseFee: number | null;
  addMin: number | null;
  addFee: number | null;
  dayMaxFee: number | null;
  dayPassFee: number | null;
}
// 체류 minutes 동안의 예상 요금(원). 무료면 0, 계산에 필요한 값이 없으면 null.
// 기본 시간 안이면 기본 요금, 넘으면 추가 단위를 올림으로 더한다. 일 최대·1일권 중 싼 쪽으로 자른다.
export const estimateParkingFee = (rule: ParkingFeeRule, minutes: number): number | null => {
  if (rule.feeType === 'free') return 0;
  const { baseMin, baseFee, addMin, addFee } = rule;
  if (baseFee === null || baseMin === null) return null;
  let fee: number;
  if (minutes <= baseMin) fee = baseFee;
  else if (addMin !== null && addMin > 0 && addFee !== null) fee = baseFee + Math.ceil((minutes - baseMin) / addMin) * addFee;
  else if (baseMin > 0) fee = Math.ceil(minutes / baseMin) * baseFee;
  else return null;
  if (rule.dayMaxFee !== null && rule.dayMaxFee > 0) fee = Math.min(fee, rule.dayMaxFee);
  if (rule.dayPassFee !== null && rule.dayPassFee > 0 && minutes <= 24 * 60) fee = Math.min(fee, rule.dayPassFee);
  return Math.max(0, Math.round(fee));
};
// "기본 30분 1,000원 · 추가 10분 500원" 한 줄. 무료·정보 없음도 문구로.
export const formatParkingFeeRule = (rule: ParkingFeeRule): string => {
  if (rule.feeType === 'free') return '무료';
  if (rule.baseFee === null || rule.baseMin === null) return '요금 정보 없음';
  const won = (n: number): string => `${n.toLocaleString('ko-KR')}원`;
  const parts = [`기본 ${rule.baseMin}분 ${won(rule.baseFee)}`];
  if (rule.addMin !== null && rule.addMin > 0 && rule.addFee !== null) parts.push(`추가 ${rule.addMin}분 ${won(rule.addFee)}`);
  return parts.join(' · ');
};
// 상세의 예상 요금 칸(1·2·3시간).
export const PARKING_FEE_ESTIMATE_MINUTES = [60, 120, 180] as const;

// ── 혼잡 단계(실시간) ────────────────────────────────────────────────────────
export const PARKING_LEVELS = ['free', 'normal', 'busy', 'full'] as const;
export type ParkingLevel = (typeof PARKING_LEVELS)[number];
export const PARKING_LEVEL_LABEL: Record<ParkingLevel, string> = { free: '여유', normal: '보통', busy: '혼잡', full: '만차' };
// 신호등 관행색 + 실시간 없음(파랑, 주차 표지색). 목록·상세는 항상 글자와 함께 쓴다.
export const PARKING_LEVEL_COLOR: Record<ParkingLevel, string> = {
  free: '#16a34a',
  normal: '#ca8a04',
  busy: '#ea580c',
  full: '#dc2626',
};
export const PARKING_NO_LIVE_COLOR = '#2563eb';
// 점유율(현재 대수 ÷ 면수) → 단계. 면수를 모르면 null. 인천공항처럼 면수를 넘는 초과 주차도 만차.
export const parkingLevelOf = (total: number | null | undefined, occupied: number | null | undefined): ParkingLevel | null => {
  if (total === null || total === undefined || total <= 0 || occupied === null || occupied === undefined || occupied < 0) return null;
  const r = occupied / total;
  if (r >= 0.97) return 'full';
  if (r >= 0.9) return 'busy';
  if (r >= 0.7) return 'normal';
  return 'free';
};
export const parkingLevelColor = (level: ParkingLevel | null | undefined): string =>
  level ? PARKING_LEVEL_COLOR[level] : PARKING_NO_LIVE_COLOR;
// 혼잡 이력 '만차' 표본 기준(점유율).
export const PARKING_FULL_RATIO = 0.97;
// 이력 칸 하나를 믿을 최소 표본(5분 폴링 × 1시간 = 12 → 대략 두 주).
export const PARKING_PATTERN_MIN_SAMPLES = 24;

// ── 지도 ────────────────────────────────────────────────────────────────────
// 전국 ~2만 곳 — 서울 도심 밀도(구당 수십~백여 곳)에서 z13 뷰포트(≈260km²)도 수백 점이라 점 모드 임계는 13.
// 충전소는 ~12만 곳(서울 구당 수천 기)이라 15.
export const PARKING_POINT_MIN_ZOOM = 13;
export const EV_POINT_MIN_ZOOM = 15;
export const PARKING_POINTS_MAX = 3000;
export const PARKING_NEARBY_RADIUS_M = 1000;
export const PARKING_RESTAURANT_RADIUS_M = 300;

// ── 전기차 충전기 ────────────────────────────────────────────────────────────
// 환경공단 가이드 v1.25 코드표.
export const EV_CHARGER_TYPE_LABEL: Record<string, string> = {
  '01': 'DC차데모',
  '02': 'AC완속',
  '03': 'DC차데모+AC3상',
  '04': 'DC콤보',
  '05': 'DC차데모+DC콤보',
  '06': 'DC차데모+AC3상+DC콤보',
  '07': 'AC3상',
  '08': 'DC콤보(완속)',
  '09': 'NACS',
  '10': 'DC콤보+NACS',
  '11': 'DC콤보2(버스전용)',
};
export const evChargerTypeLabel = (code: string | null | undefined): string =>
  (code && EV_CHARGER_TYPE_LABEL[code]) || '기타';

export const EV_STATS = [0, 1, 2, 3, 4, 5, 6, 9] as const;
export type EvStat = (typeof EV_STATS)[number];
export const EV_STAT_LABEL: Record<number, string> = {
  0: '알 수 없음',
  1: '통신 이상',
  2: '사용 가능',
  3: '충전 중',
  4: '운영 중지',
  5: '점검 중',
  6: '예약 중',
  9: '상태 미확인',
};
export const evStatLabel = (stat: number): string => EV_STAT_LABEL[stat] ?? '알 수 없음';
export const EV_STAT_AVAILABLE = 2;
export const EV_STAT_CHARGING = 3;

// 급속 판정 — 용량(kW) 30 이상. 용량이 없으면 완속 타입(02 AC완속·08 DC콤보 완속)만 완속.
export const isEvChargerFast = (type: string | null | undefined, outputKw: number | null | undefined): boolean => {
  if (outputKw !== null && outputKw !== undefined && outputKw > 0) return outputKw >= 30;
  return type !== '02' && type !== '08';
};

export const EV_LEVELS = ['available', 'busy', 'offline'] as const;
export type EvLevel = (typeof EV_LEVELS)[number];
export const EV_LEVEL_LABEL: Record<EvLevel, string> = { available: '사용 가능', busy: '모두 충전 중', offline: '이용 불가·확인 필요' };
export const EV_LEVEL_COLOR: Record<EvLevel, string> = { available: '#16a34a', busy: '#ea580c', offline: '#9ca3af' };
// 충전소 단계 — 사용 가능 1기 이상이면 available, 없고 충전 중이 있으면 busy, 나머지(고장·점검·미확인)는 offline.
export const evStationLevel = (available: number, charging: number): EvLevel =>
  available > 0 ? 'available' : charging > 0 ? 'busy' : 'offline';

export const EV_KIND_LABEL: Record<string, string> = {
  A0: '공공시설',
  B0: '주차시설',
  C0: '휴게시설',
  D0: '관광시설',
  E0: '상업시설',
  F0: '차량정비시설',
  G0: '기타시설',
  H0: '공동주택시설',
  I0: '근린생활시설',
  J0: '교육문화시설',
};
export const EV_KIND_DETAIL_LABEL: Record<string, string> = {
  A001: '관공서',
  A002: '주민센터',
  A003: '공공기관',
  A004: '지자체시설',
  B001: '공영주차장',
  B002: '공원주차장',
  B003: '환승주차장',
  B004: '일반주차장',
  C001: '고속도로 휴게소',
  C002: '지방도로 휴게소',
  C003: '쉼터',
  D001: '공원',
  D002: '전시관',
  D003: '민속마을',
  D004: '생태공원',
  D005: '홍보관',
  D006: '관광안내소',
  D007: '관광지',
  D008: '박물관',
  D009: '유적지',
  E001: '마트(쇼핑몰)',
  E002: '백화점',
  E003: '숙박시설',
  E004: '골프장',
  E005: '카페',
  E006: '음식점',
  E007: '주유소',
  E008: '영화관',
  F001: '서비스센터',
  F002: '정비소',
  G001: '군부대',
  G002: '야영장',
  G003: '공중전화부스',
  G004: '기타',
  G005: '오피스텔',
  G006: '단독주택',
  H001: '아파트',
  H002: '빌라',
  H003: '사업장(사옥)',
  H004: '기숙사',
  H005: '연립주택',
  I001: '병원',
  I002: '종교시설',
  I003: '보건소',
  I004: '경찰서',
  I005: '도서관',
  I006: '복지관',
  I007: '수련원',
  I008: '금융기관',
  J001: '학교',
  J002: '교육원',
  J003: '학원',
  J004: '공연장',
  J005: '관람장',
  J006: '동식물원',
  J007: '경기장',
};
export const evKindLabel = (kind: string | null | undefined, kindDetail: string | null | undefined): string | null =>
  (kindDetail && EV_KIND_DETAIL_LABEL[kindDetail]) || (kind && EV_KIND_LABEL[kind]) || null;

// ── 공항 ────────────────────────────────────────────────────────────────────
// 원천에 좌표가 없어 공항 좌표를 상수로 둔다(활주로 기준점 근사 — 전국 줌 마커용). apiName 은 한국공항공사
// 응답의 airportKor 값. 인천은 인천공항공사 API(구역 19개)라 source 가 다르다.
export interface ParkingAirport {
  code: string;
  name: string;
  apiName: string;
  source: 'kac' | 'iiac';
  lat: number;
  lng: number;
}
export const PARKING_AIRPORTS: readonly ParkingAirport[] = [
  { code: 'ICN', name: '인천국제공항', apiName: '인천국제공항', source: 'iiac', lat: 37.4602, lng: 126.4407 },
  { code: 'GMP', name: '김포국제공항', apiName: '김포국제공항', source: 'kac', lat: 37.5586, lng: 126.7903 },
  { code: 'PUS', name: '김해국제공항', apiName: '김해국제공항', source: 'kac', lat: 35.1795, lng: 128.9381 },
  { code: 'CJU', name: '제주국제공항', apiName: '제주국제공항', source: 'kac', lat: 33.5111, lng: 126.493 },
  { code: 'TAE', name: '대구국제공항', apiName: '대구국제공항', source: 'kac', lat: 35.8942, lng: 128.6589 },
  { code: 'CJJ', name: '청주국제공항', apiName: '청주국제공항', source: 'kac', lat: 36.7166, lng: 127.4992 },
  { code: 'KWJ', name: '광주공항', apiName: '광주공항', source: 'kac', lat: 35.1236, lng: 126.8086 },
  { code: 'MWX', name: '무안국제공항', apiName: '무안국제공항', source: 'kac', lat: 34.9914, lng: 126.3828 },
  { code: 'RSU', name: '여수공항', apiName: '여수공항', source: 'kac', lat: 34.8422, lng: 127.6161 },
  { code: 'USN', name: '울산공항', apiName: '울산공항', source: 'kac', lat: 35.5933, lng: 129.3517 },
  { code: 'KUV', name: '군산공항', apiName: '군산공항', source: 'kac', lat: 35.9039, lng: 126.6158 },
  { code: 'WJU', name: '원주공항', apiName: '원주공항', source: 'kac', lat: 37.4381, lng: 127.9603 },
  { code: 'HIN', name: '사천공항', apiName: '사천공항', source: 'kac', lat: 35.0886, lng: 128.0703 },
  { code: 'YNY', name: '양양국제공항', apiName: '양양국제공항', source: 'kac', lat: 38.0614, lng: 128.6692 },
];
export const parkingAirportByApiName = (apiName: string): ParkingAirport | null =>
  PARKING_AIRPORTS.find((a) => a.apiName === apiName.trim()) ?? null;
export const parkingAirportByCode = (code: string): ParkingAirport | null => PARKING_AIRPORTS.find((a) => a.code === code) ?? null;

// ── 이름 정규화(중복 판정용) ─────────────────────────────────────────────────
// '세종로 공영주차장(시)' ↔ '세종로공영주차장' 이 같은 키가 되게 — 괄호 보조어·'공영/주차장' 꼬리·공백 제거.
export const normalizeParkingName = (s: string): string =>
  s
    .replace(/\((시|구|공영|민영|유료|무료)\)/g, '')
    .replace(/(공영|민영)?주차(장|타워|빌딩)?/g, '')
    .replace(/[\s\-_·.,()()\[\]]/g, '')
    .toLowerCase();
