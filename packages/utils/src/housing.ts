// 집값(/housing) 순수 유틸 — 거래 유형·면적 구간·단지 종류 코드표, 가격·면적·연월 포맷, 지도 임계값.
// 원천은 국토교통부 실거래가 API(아파트 매매 상세 15126468 · 아파트 전월세 15126474 — 시군구×계약년월
// 단위 조회, 좌표 없음)와 한국부동산원 공동주택 단지 식별정보 CSV(15106861 — 단지고유번호·PNU·지번
// 주소·종류·동수·세대수·사용승인일, 좌표 없음 → VWorld 지오코딩). 서버(적재·조회)와 웹(필터·마커·
// 상세)이 같은 코드표를 쓰도록 한 곳에 둔다.

// ── 거래 유형 ────────────────────────────────────────────────────────────────
// 매매(15126468) / 전세·월세(15126474 — monthlyRent 0 이면 전세). 한 번에 하나만 본다(색·마커·통계 축).
export const HOUSING_DEAL_TYPES = ['trade', 'jeonse', 'monthly'] as const;
export type HousingDealType = (typeof HOUSING_DEAL_TYPES)[number];
export const HOUSING_DEAL_TYPE_LABEL: Record<HousingDealType, string> = {
  trade: '매매',
  jeonse: '전세',
  monthly: '월세',
};
export const isHousingDealType = (v: unknown): v is HousingDealType =>
  v === 'trade' || v === 'jeonse' || v === 'monthly';

// ── 전용면적 구간 ─────────────────────────────────────────────────────────────
// K-apt·통계청 관행 경계(60·85·135㎡, 85 = 국민주택 규모). (min, max] — 60.00 은 b1, 60.01 은 b2.
export const HOUSING_AREA_BANDS = ['all', 'b1', 'b2', 'b3', 'b4'] as const;
export type HousingAreaBand = (typeof HOUSING_AREA_BANDS)[number];
export type HousingAreaBandStrict = Exclude<HousingAreaBand, 'all'>;
export const HOUSING_AREA_BAND_LABEL: Record<HousingAreaBand, string> = {
  all: '전체 면적',
  b1: '60㎡ 이하',
  b2: '60~85㎡',
  b3: '85~135㎡',
  b4: '135㎡ 초과',
};
export const HOUSING_AREA_BAND_RANGE: Record<HousingAreaBandStrict, { min: number; max: number | null }> = {
  b1: { min: 0, max: 60 },
  b2: { min: 60, max: 85 },
  b3: { min: 85, max: 135 },
  b4: { min: 135, max: null },
};
export const isHousingAreaBand = (v: unknown): v is HousingAreaBand =>
  v === 'all' || v === 'b1' || v === 'b2' || v === 'b3' || v === 'b4';
export const housingAreaBandOf = (areaM2: number): HousingAreaBandStrict => {
  if (areaM2 <= 60) return 'b1';
  if (areaM2 <= 85) return 'b2';
  if (areaM2 <= 135) return 'b3';
  return 'b4';
};

// ── 단지 종류 ────────────────────────────────────────────────────────────────
// 한국부동산원 단지종류 코드 1 아파트 / 2 연립 / 3 다세대. 1차는 아파트만 적재·표시(실거래 API 도
// 아파트 계열만 붙였다) — 연립·다세대는 코드표만 미리 둔다.
export const HOUSING_COMPLEX_KINDS = ['apt', 'row', 'multi'] as const;
export type HousingComplexKind = (typeof HOUSING_COMPLEX_KINDS)[number];
export const HOUSING_COMPLEX_KIND_LABEL: Record<HousingComplexKind, string> = {
  apt: '아파트',
  row: '연립',
  multi: '다세대',
};
export const housingComplexKindOfCode = (code: string | null | undefined): HousingComplexKind | null => {
  const s = (code ?? '').trim();
  return s === '1' ? 'apt' : s === '2' ? 'row' : s === '3' ? 'multi' : null;
};
export const isHousingComplexKind = (v: unknown): v is HousingComplexKind =>
  v === 'apt' || v === 'row' || v === 'multi';

// ── 지도 ─────────────────────────────────────────────────────────────────────
// 개별 단지(가격 배지)를 그리기 시작하는 줌 — 미만은 서버 집계 셀(평당가 버블). 전국 아파트 단지
// ≈4.6만(서울 ≈8개/km²) → z13 뷰포트(≈260km²)에서 ~2천 단지, 요청당 상한 안. 배지가 점보다 커서
// 일상지도(화장실 13)와 같은 줌이라도 밀도는 더 낮게 잡았다.
export const HOUSING_POINT_MIN_ZOOM = 13;
export const HOUSING_POINTS_MAX = 4000;

// ── 가격 ─────────────────────────────────────────────────────────────────────
// 실거래가 API 금액은 만원 단위 문자열('58,960'). 서버는 정수 만원으로 저장한다.
export const parseHousingManwon = (raw: string | number | null | undefined): number | null => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  const s = (raw ?? '').replace(/[,\s]/g, '');
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

// 만원 → '12.5억' / '9,800만' / '123억'. 100억 이상은 소수 없이, 1억 이상은 소수 1자리(정수면 생략).
export const formatHousingPrice = (manwon: number | null | undefined): string => {
  if (manwon === null || manwon === undefined || !Number.isFinite(manwon)) return '-';
  const n = Math.round(manwon);
  if (Math.abs(n) >= 10_000) {
    const eok = n / 10_000;
    if (Math.abs(eok) >= 100) return `${Math.round(eok).toLocaleString('ko-KR')}억`;
    const fixed = Math.round(eok * 10) / 10;
    return `${fixed.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`;
  }
  return `${n.toLocaleString('ko-KR')}만`;
};

// 월세 — '보증금/월세'(월세는 만원 숫자만, 호갱노노·직방 관행): '1억/120', '5,000만/60'.
export const formatHousingRent = (deposit: number, monthlyRent: number): string =>
  `${formatHousingPrice(deposit)}/${Math.round(monthlyRent).toLocaleString('ko-KR')}`;

// 거래 유형에 맞는 한 줄 — 매매·전세는 금액, 월세는 보증금/월세.
export const formatHousingDealPrice = (dealType: HousingDealType, price: number, monthlyRent: number): string =>
  dealType === 'monthly' ? formatHousingRent(price, monthlyRent) : formatHousingPrice(price);

// 평(3.3058㎡) 환산 — 표시에만 쓴다(법정 단위는 ㎡).
export const PYEONG_M2 = 3.3058;
export const housingPyeong = (areaM2: number): number => Math.round((areaM2 / PYEONG_M2) * 10) / 10;
// '84.97㎡ (25.7평)'
export const formatHousingArea = (areaM2: number, withPyeong = true): string => {
  const m2 = `${Number(areaM2.toFixed(2)).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎡`;
  return withPyeong ? `${m2} (${housingPyeong(areaM2)}평)` : m2;
};
// 단위 가격(만원/㎡) → 평당 표시 '5,200만/평' · '1.2억/평'.
export const formatHousingUnitPrice = (manwonPerM2: number | null | undefined): string => {
  if (manwonPerM2 === null || manwonPerM2 === undefined || !Number.isFinite(manwonPerM2)) return '-';
  return `${formatHousingPrice(manwonPerM2 * PYEONG_M2)}/평`;
};
// 집계 셀 알약용 짧은 평당가 — '/평' 을 떼고 금액만('3,251만' · '1.2억'). 셀 한 칸(화면 ~128px) 안에
// 들어가야 이웃 알약과 겹치지 않는다(범례가 "평당" 을 설명한다).
export const formatHousingUnitPriceShort = (manwonPerM2: number | null | undefined): string => {
  if (manwonPerM2 === null || manwonPerM2 === undefined || !Number.isFinite(manwonPerM2)) return '-';
  return formatHousingPrice(manwonPerM2 * PYEONG_M2);
};

// ── 연월·날짜 ────────────────────────────────────────────────────────────────
const isYm = (ym: string): boolean => /^\d{6}$/.test(ym) && Number(ym.slice(4)) >= 1 && Number(ym.slice(4)) <= 12;

// 'YYYYMM' → 'YYYY.MM'
export const formatHousingYm = (ym: string | null | undefined): string | null => {
  if (!ym || !isYm(ym)) return null;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
};
// 'YYYY-MM-DD' → 'YY.MM.DD'(목록용 짧은 표기). 형식이 다르면 원문.
export const formatHousingDateShort = (date: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[1]!.slice(2)}.${m[2]}.${m[3]}` : date;
};

// 'YYYYMM' ± n개월.
export const housingYmAdd = (ym: string, months: number): string => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + months;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}${String(mm + 1).padStart(2, '0')}`;
};
// from~to(포함) 연월 목록 — 오름차순. from > to 면 빈 배열.
export const housingYmRange = (from: string, to: string): string[] => {
  if (!isYm(from) || !isYm(to) || from > to) return [];
  const out: string[] = [];
  for (let ym = from; ym <= to; ym = housingYmAdd(ym, 1)) out.push(ym);
  return out;
};
// 현재 연월(Asia/Seoul) — 적재 스크립트·스케줄러가 "이번 달" 을 결정할 때.
export const housingCurrentYm = (now: Date = new Date(), timeZone = 'Asia/Seoul'): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${y}${m}`;
};
// 'YYYY-MM-DD' 기준 n개월 전 같은 날(월말 넘침은 그 달 말일로).
export const housingDateMonthsAgo = (date: string, months: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 - months;
  const d = Number(m[3]);
  const yy = y + Math.floor(mo / 12);
  const mm = ((mo % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
};

// 실거래 계약일 조각(dealYear/dealMonth/dealDay) → 'YYYY-MM-DD'. 어느 하나라도 없으면 null.
export const housingDealDate = (
  year: string | number | null | undefined,
  month: string | number | null | undefined,
  day: string | number | null | undefined,
): string | null => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// ── 단지명 정규화(실거래 aptNm ↔ 단지 마스터 매칭용) ─────────────────────────────────
// 공백·괄호 안 내용·'아파트'/'APT' 접미·특수문자 제거, 소문자 — '경희궁자이(1단지)' 와 '경희궁자이 1단지'
// 가 같은 키가 되진 않지만(괄호 제거 vs 공백 제거) 둘 다 '경희궁자이1단지' 로 접근하도록 괄호는
// 내용을 살려 접는다.
export const normalizeHousingName = (name: string | null | undefined): string =>
  (name ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, '$1')
    .replace(/아파트|apt\.?|에이피티/g, '')
    .replace(/[\s\-_·.,'"‘’“”「」\[\]/]+/g, '')
    .trim();
