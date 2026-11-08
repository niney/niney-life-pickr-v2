// 카탈로그의 100g(100ml)당 비타민·무기질 등(FoodItem.nutrientsPer100gJson) — 식약처 음식 표준데이터 열과 카탈로그 키.
// 적재(food-import)와 영양소 점검(meal-nutrition)이 함께 쓴다. 단위는 키 끝(G·Mg·Ug)이 밝힌다.
//
// proteinG·sodiumMg 는 100g당 단백질·나트륨이다 — 영양소 점검은 식단 항목에 저장된 1인분 스냅샷을 먼저 쓰고, 스냅샷이
// 빈 항목(1인분이 없는 원재료·영양 기준 음식으로 추정한 항목)만 이 값을 쓴다. magnesiumMg·zincMg·folateUg(μg DFE)는
// K-FIND 식품영양성분 DB 전체판(음식 DB 엑셀)과 국가표준식품성분표에만 있다 — 표준데이터(CSV·API) 24성분에는 없다.
// carbG·fatG·sugarG(2026-11-08)는 **100g당** 탄수화물·지방·당류다(FoodItem.carbG 같은 1인분 열과 이름은 같지만 단위가
// 다르다). 1인분이 없는 원재료(회·참치·닭가슴살·과일)는 이것으로만 탄단지·열량 구성을 낼 수 있다 — 통계의 탄단지 계산이
// 1인분 값이 없을 때 쓴다(meal-nutrition itemMacroGrams). 비타민·무기질 판단(isNutrientProfileRow)에서는 뺀다.

export const NUTRIENT_KEYS = [
  'fiberG',
  'calciumMg',
  'ironMg',
  'phosphorusMg',
  'potassiumMg',
  'vitaminAUg',
  'vitaminDUg',
  'thiaminMg',
  'riboflavinMg',
  'niacinMg',
  'vitaminCMg',
  'cholesterolMg',
  'saturatedFatG',
  'proteinG',
  'sodiumMg',
  'magnesiumMg',
  'zincMg',
  'folateUg',
  'carbG',
  'fatG',
  'sugarG',
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutrientsPer100g = Partial<Record<NutrientKey, number>>;
/** 100g당 탄수화물·지방·당류 — 비타민·무기질이 아니라 탄단지(열량 구성)용. */
export const MACRO_PER100_KEYS = ['carbG', 'fatG', 'sugarG'] as const satisfies readonly NutrientKey[];

// 정규화 레코드(camelCase) 열 — 표준데이터 API 실측(2026-10-04, 김치찌개): fibtg·ca·fe·p·k·vitaRae(μg RAE)·vitd·thia·
// ribf·nia·vitc·chole·fasat·prot·nat. 빈 문자열은 값 없음, "0.00" 은 0 이다. mg·zn·folDfe 는 API 에 없는 **파일 전용**
// 이름이다(K-FIND 엑셀 열을 옮겨 담는 자리) — API 로 적재하면 셋은 늘 비어 있다.
export const MFDS_NUTRIENT_API_FIELD: Readonly<Record<NutrientKey, string>> = {
  fiberG: 'fibtg',
  calciumMg: 'ca',
  ironMg: 'fe',
  phosphorusMg: 'p',
  potassiumMg: 'k',
  vitaminAUg: 'vitaRae',
  vitaminDUg: 'vitd',
  thiaminMg: 'thia',
  riboflavinMg: 'ribf',
  niacinMg: 'nia',
  vitaminCMg: 'vitc',
  cholesterolMg: 'chole',
  saturatedFatG: 'fasat',
  proteinG: 'prot',
  sodiumMg: 'nat',
  magnesiumMg: 'mg',
  zincMg: 'zn',
  folateUg: 'folDfe',
  // 표준데이터 API·배포본의 100g당 탄수화물·지방·당류 열(음식 적재의 1인분 환산도 같은 열을 읽는다).
  carbG: 'chocdf',
  fatG: 'fatce',
  sugarG: 'sugar',
};

// 배포 파일(CSV/XLSX) 한글 열 → 정규화 레코드 열. 공백·μ 표기 차이는 느슨한 머리글 비교(looseNutrientHeader)가 흡수한다.
// 단백질·나트륨 열은 음식 적재의 기본 열 표(CSV_FIELD_MAP)에도 같은 이름(prot·nat)으로 있다.
export const MFDS_NUTRIENT_CSV_HEADER: Readonly<Record<string, string>> = {
  '식이섬유(g)': 'fibtg',
  '칼슘(mg)': 'ca',
  '철(mg)': 'fe',
  '인(mg)': 'p',
  '칼륨(mg)': 'k',
  '비타민 A(μg RAE)': 'vitaRae',
  '비타민 D(μg)': 'vitd',
  '티아민(mg)': 'thia',
  '리보플라빈(mg)': 'ribf',
  '니아신(mg)': 'nia',
  '비타민 C(mg)': 'vitc',
  '콜레스테롤(mg)': 'chole',
  '포화지방산(g)': 'fasat',
  '단백질(g)': 'prot',
  '나트륨(mg)': 'nat',
  // K-FIND 식품영양성분 DB 전체판(음식 DB 엑셀, 160열)에만 있는 열.
  '마그네슘(mg)': 'mg',
  '아연(mg)': 'zn',
  '엽산(μg DFE)': 'folDfe',
  // 100g당 탄수화물·지방·당류 — 원재료 배포본(15100065)에도 있다.
  '탄수화물(g)': 'chocdf',
  '지방(g)': 'fatce',
  '당류(g)': 'sugar',
};

// 배포 CSV 첫 머리글의 BOM(U+FEFF) — 리터럴 대신 코드포인트로(에디터·린터가 안 보이는 문자를 싫어한다).
const BOM_RE = new RegExp(`^${String.fromCharCode(0xfeff)}`);

/** 배포본마다 '비타민 A(μg RAE)'·'비타민A(㎍RAE)'처럼 공백·μ 표기가 달라 머리글을 느슨하게 비교한다. */
export const looseNutrientHeader = (h: string): string =>
  h
    .replace(BOM_RE, '')
    .replace(/\s+/g, '')
    .replace(/㎍/g, 'μg')
    .replace(/µ/g, 'μ');

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * 같은 대표식품의 여러 변형(외식 분석·급식 산출…)에서 영양소별로 값을 고른다 — 같은 층에서 **0 보다 큰 값들의 중앙값**,
 * 모두 0 이면 0, 아무도 적지 않았으면 뺀다. 식약처 분석 행은 측정하지 않은 영양소를 0 으로 둔 경우가 있어(김치찌개 외식
 * 분석 행의 철·비타민C 가 0, 같은 음식 급식 산출 행은 0.3·1.27) 0 은 양수가 하나라도 있으면 세지 않는다.
 * 단, 이름이 대표식품과 같은 변형(tier 0)이 그 영양소를 적었으면 그 안에서만 고른다 — 김치찌개_참치 같은 다른 음식의
 * 비타민D 가 김치찌개로 넘어오지 않게(tier = priority 의 백의 자리, food-import 의 exactRank).
 *
 * 2026-11-07 전에는 "우선순위 순 0 보다 큰 첫 값"이었다. 그러면 첫 행이 이상치일 때 그대로 대표값이 됐다 — 해장국 철이
 * 선지(피) 변형의 6.83mg/100g(중앙값 2.03), 대표 음식의 6~12% 가 같은 층 양수 중앙값과 2배 넘게 어긋났다(K-FIND 음식 DB
 * 실측). 영양 기준 음식 연결로 이 값이 더 많은 기록에 쓰이게 돼 중앙값으로 바꿨다(docs/PLAN-meal-nutrition.md).
 */
export const pickNutrientsPer100g = (
  variants: readonly { priority: number; values: Partial<Record<NutrientKey, number | null>> }[],
): NutrientsPer100g => {
  const sorted = [...variants].sort((a, b) => a.priority - b.priority);
  const tiers = [...new Set(sorted.map((v) => Math.floor(v.priority / 100)))];
  const out: NutrientsPer100g = {};
  for (const key of NUTRIENT_KEYS) {
    for (const tier of tiers) {
      const reported = sorted
        .filter((v) => Math.floor(v.priority / 100) === tier)
        .map((v) => v.values[key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
      if (reported.length === 0) continue;
      // 같은 값은 한 번만 — K-FIND 음식 DB 는 같은 급식 레시피를 초등·중고등·산업체 급식 행 셋에 같은 값으로 싣는다.
      // 그대로 세면 산출값 하나가 세 표를 받아 실측값을 밀어낸다(김치찌개 칼슘: 외식 분석 38 · 급식 23×3 → 23).
      const positive = [...new Set(reported.filter((v) => v > 0))];
      out[key] = positive.length > 0 ? round3(median(positive)) : 0;
      break;
    }
  }
  return out;
};

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

export const parseNutrientsPer100g = (json: string | null | undefined): NutrientsPer100g => {
  if (!json) return {};
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: NutrientsPer100g = {};
    for (const key of NUTRIENT_KEYS) {
      const v = (value as Record<string, unknown>)[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
};

/** 값이 하나도 없으면 null(칼럼이 비어 있어야 "아직 모름"으로 다시 채울 수 있다). */
export const serializeNutrientsPer100g = (
  nutrients: NutrientsPer100g | null | undefined,
): string | null =>
  nutrients && Object.keys(nutrients).length > 0 ? JSON.stringify(nutrients) : null;

/**
 * 이미 있는 값은 그대로 두고 **빈 키만** 들어온 값으로 채운다(재적재 기본 규칙 — 다른 출처·빌린 값이 덮이지 않게).
 * 새 영양소 열(마그네슘·아연·엽산)이 생긴 뒤 재적재하면 기존 행에 그 키만 더해진다. 바뀐 게 없으면 null.
 */
export const mergeNutrientsPer100g = (
  existingJson: string | null | undefined,
  incoming: NutrientsPer100g | null | undefined,
): string | null => {
  if (!incoming || Object.keys(incoming).length === 0) return null;
  const existing = parseNutrientsPer100g(existingJson);
  const merged: NutrientsPer100g = { ...existing };
  let changed = false;
  for (const key of NUTRIENT_KEYS) {
    const v = incoming[key];
    if (v === undefined || existing[key] !== undefined) continue;
    merged[key] = v;
    changed = true;
  }
  return changed ? serializeNutrientsPer100g(merged) : null;
};

/**
 * 들어온 키는 **덮어쓰고** 나머지 키는 그대로 둔다 — 대표값 규칙을 바꾼 뒤 비타민·무기질만 다시 쓰는 재적재
 * (`--refresh-nutrients`)용. 1인분 열량·탄단지(`--refresh-nutrition` 이 덮는 것)는 건드리지 않는다. 바뀐 게 없으면 null.
 */
export const overwriteNutrientsPer100g = (
  existingJson: string | null | undefined,
  incoming: NutrientsPer100g | null | undefined,
): string | null => {
  if (!incoming || Object.keys(incoming).length === 0) return null;
  const existing = parseNutrientsPer100g(existingJson);
  const next: NutrientsPer100g = { ...existing, ...incoming };
  const changed = NUTRIENT_KEYS.some((k) => next[k] !== existing[k]);
  return changed ? serializeNutrientsPer100g(next) : null;
};
