// 카탈로그의 100g(100ml)당 비타민·무기질 등(FoodItem.nutrientsPer100gJson) — 식약처 음식 표준데이터 열과 카탈로그 키.
// 적재(food-import)와 영양소 점검(meal-nutrition)이 함께 쓴다. 단위는 키 끝(G·Mg·Ug)이 밝힌다.

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
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutrientsPer100g = Partial<Record<NutrientKey, number>>;

// 표준데이터 API(camelCase) 열 — 실측(2026-10-04, 김치찌개): fibtg·ca·fe·p·k·vitaRae(μg RAE)·vitd·thia·ribf·nia·
// vitc·chole·fasat. 빈 문자열은 값 없음, "0.00" 은 0 이다.
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
};

// 배포 파일(CSV/XLSX) 한글 열 → API 열. 공백·μ 표기 차이는 food-import 의 느슨한 머리글 비교가 흡수한다.
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
};

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * 같은 대표식품의 여러 변형(외식 분석·급식 산출…)에서 영양소별로 값을 고른다 — 우선순위(작을수록 먼저) 순으로 0 보다
 * 큰 첫 값, 모두 0 이면 0, 아무도 적지 않았으면 뺀다. 식약처 분석 행은 측정하지 않은 영양소를 0 으로 둔 경우가 있어
 * (김치찌개 외식 분석 행의 철·비타민C 가 0, 같은 음식 급식 산출 행은 0.3·1.27) 첫 행 값만 쓰면 부족하다고 잘못 본다.
 * 단, 이름이 대표식품과 같은 변형(tier 0)이 그 영양소를 적었으면 그 안에서만 고른다 — 김치찌개_참치 같은 다른 음식의
 * 비타민D 가 김치찌개로 넘어오지 않게(tier = priority 의 백의 자리, food-import 의 exactRank).
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
      out[key] = round3(reported.find((v) => v > 0) ?? 0);
      break;
    }
  }
  return out;
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
