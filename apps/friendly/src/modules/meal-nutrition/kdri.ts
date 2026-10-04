// 2020 한국인 영양소 섭취기준(보건복지부·한국영양학회) — 영양소 점검에 쓰는 항목만. 값은 공식 요약표(02 비타민
// 책자 ix~xviii 쪽, 2020-12)에서 옮겼다. 연령은 만 나이, 12세 미만은 다루지 않는다(아이 영양제는 소아과 상담 영역).
//   ear  평균필요량 — 이보다 적게 먹으면 부족할 가능성이 높다.
//   rni  권장섭취량 — 인구 97~98% 의 필요량을 채우는 양.
//   ai   충분섭취량 — 근거가 부족해 rni 대신 둔 양(식이섬유·칼륨·비타민D).
//   ul   상한섭취량 — 넘으면 해로울 수 있는 양(니아신은 니코틴산 기준).
//   cdrr 만성질환위험감소섭취량(나트륨) — 이보다 적게 먹으라는 양.

export type KdriSex = 'male' | 'female';
export const KDRI_AGE_GROUPS = ['12-14', '15-18', '19-29', '30-49', '50-64', '65-74', '75+'] as const;
export type KdriAgeGroup = (typeof KDRI_AGE_GROUPS)[number];

export const KDRI_NUTRIENTS = [
  'protein',
  'fiber',
  'calcium',
  'iron',
  'potassium',
  'vitaminA',
  'vitaminD',
  'thiamin',
  'riboflavin',
  'niacin',
  'vitaminC',
  'sodium',
] as const;
export type KdriNutrient = (typeof KDRI_NUTRIENTS)[number];

export interface NutrientReference {
  ear?: number;
  rni?: number;
  ai?: number;
  ul?: number;
  cdrr?: number;
}

type ByAge = readonly [number, number, number, number, number, number, number];
interface Columns {
  ear?: ByAge;
  rni?: ByAge;
  ai?: ByAge;
  ul?: ByAge;
  cdrr?: ByAge;
}

// 연령 순서는 KDRI_AGE_GROUPS(12-14 … 75+).
const TABLE: Readonly<Record<KdriSex, Readonly<Record<KdriNutrient, Columns>>>> = {
  male: {
    protein: { ear: [50, 55, 50, 50, 50, 50, 50], rni: [60, 65, 65, 65, 60, 60, 60] },
    fiber: { ai: [30, 30, 30, 30, 30, 25, 25] },
    calcium: {
      ear: [800, 750, 650, 650, 600, 600, 600],
      rni: [1000, 900, 800, 800, 750, 700, 700],
      ul: [3000, 3000, 2500, 2500, 2000, 2000, 2000],
    },
    iron: {
      ear: [11, 11, 8, 8, 8, 7, 7],
      rni: [14, 14, 10, 10, 10, 9, 9],
      ul: [40, 45, 45, 45, 45, 45, 45],
    },
    potassium: { ai: [3500, 3500, 3500, 3500, 3500, 3500, 3500] },
    vitaminA: {
      ear: [530, 620, 570, 560, 530, 510, 500],
      rni: [750, 850, 800, 800, 750, 700, 700],
      ul: [2300, 2800, 3000, 3000, 3000, 3000, 3000],
    },
    vitaminD: { ai: [10, 10, 10, 10, 10, 15, 15], ul: [100, 100, 100, 100, 100, 100, 100] },
    thiamin: { ear: [0.9, 1.1, 1.0, 1.0, 1.0, 0.9, 0.9], rni: [1.1, 1.3, 1.2, 1.2, 1.2, 1.1, 1.1] },
    riboflavin: {
      ear: [1.2, 1.4, 1.3, 1.3, 1.3, 1.2, 1.1],
      rni: [1.5, 1.7, 1.5, 1.5, 1.5, 1.4, 1.3],
    },
    niacin: {
      ear: [11, 13, 12, 12, 12, 11, 10],
      rni: [15, 17, 16, 16, 16, 14, 13],
      ul: [25, 30, 35, 35, 35, 35, 35],
    },
    vitaminC: {
      ear: [70, 80, 75, 75, 75, 75, 75],
      rni: [90, 100, 100, 100, 100, 100, 100],
      ul: [1400, 1600, 2000, 2000, 2000, 2000, 2000],
    },
    sodium: {
      ai: [1500, 1500, 1500, 1500, 1500, 1300, 1100],
      cdrr: [2300, 2300, 2300, 2300, 2300, 2100, 1700],
    },
  },
  female: {
    protein: { ear: [45, 45, 45, 40, 40, 40, 40], rni: [55, 55, 55, 50, 50, 50, 50] },
    fiber: { ai: [25, 25, 20, 20, 20, 20, 20] },
    calcium: {
      ear: [750, 700, 550, 550, 600, 600, 600],
      rni: [900, 800, 700, 700, 800, 800, 800],
      ul: [3000, 3000, 2500, 2500, 2000, 2000, 2000],
    },
    iron: {
      ear: [12, 11, 11, 11, 6, 6, 5],
      rni: [16, 14, 14, 14, 8, 8, 7],
      ul: [40, 45, 45, 45, 45, 45, 45],
    },
    potassium: { ai: [3500, 3500, 3500, 3500, 3500, 3500, 3500] },
    vitaminA: {
      ear: [480, 450, 460, 450, 430, 410, 410],
      rni: [650, 650, 650, 650, 600, 600, 600],
      ul: [2300, 2800, 3000, 3000, 3000, 3000, 3000],
    },
    vitaminD: { ai: [10, 10, 10, 10, 10, 15, 15], ul: [100, 100, 100, 100, 100, 100, 100] },
    thiamin: { ear: [0.9, 0.9, 0.9, 0.9, 0.9, 0.8, 0.7], rni: [1.1, 1.1, 1.1, 1.1, 1.1, 1.0, 0.8] },
    riboflavin: {
      ear: [1.0, 1.0, 1.0, 1.0, 1.0, 0.9, 0.8],
      rni: [1.2, 1.2, 1.2, 1.2, 1.2, 1.1, 1.0],
    },
    niacin: {
      ear: [11, 11, 11, 11, 11, 10, 9],
      rni: [15, 14, 14, 14, 14, 13, 12],
      ul: [25, 30, 35, 35, 35, 35, 35],
    },
    vitaminC: {
      ear: [70, 80, 75, 75, 75, 75, 75],
      rni: [90, 100, 100, 100, 100, 100, 100],
      ul: [1400, 1600, 2000, 2000, 2000, 2000, 2000],
    },
    sodium: {
      ai: [1500, 1500, 1500, 1500, 1500, 1300, 1100],
      cdrr: [2300, 2300, 2300, 2300, 2300, 2100, 1700],
    },
  },
};

// 에너지 필요추정량(kcal/일) — 기록이 일부만 남았는지(기록 열량 ÷ 필요량) 가늠하는 데만 쓴다.
const EER: Readonly<Record<KdriSex, ByAge>> = {
  male: [2500, 2700, 2600, 2500, 2200, 2000, 1900],
  female: [2000, 2000, 2000, 1900, 1700, 1600, 1500],
};

// 성별·나이를 모를 때의 기준 — 30-49세, 남녀 기준이 다르면 필요량은 낮은 쪽·상한은 낮은 쪽(부족을 덜 단정하고 과다는
// 더 조심한다). 화면은 "성별·나이를 넣으면 더 정확해요"라고 밝힌다.
export const DEFAULT_AGE_GROUP: KdriAgeGroup = '30-49';

export const ageGroupFor = (age: number): KdriAgeGroup | null => {
  if (!Number.isFinite(age) || age < 12) return null;
  if (age <= 14) return '12-14';
  if (age <= 18) return '15-18';
  if (age <= 29) return '19-29';
  if (age <= 49) return '30-49';
  if (age <= 64) return '50-64';
  if (age <= 74) return '65-74';
  return '75+';
};

const pick = (cols: Columns, i: number): NutrientReference => {
  const out: NutrientReference = {};
  for (const k of ['ear', 'rni', 'ai', 'ul', 'cdrr'] as const) {
    const v = cols[k]?.[i];
    if (v !== undefined) out[k] = v;
  }
  return out;
};

const lower = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined ? b : b === undefined ? a : Math.min(a, b);

export const nutrientReference = (
  nutrient: KdriNutrient,
  sex: KdriSex | null,
  ageGroup: KdriAgeGroup,
): NutrientReference => {
  const i = KDRI_AGE_GROUPS.indexOf(ageGroup);
  if (sex) return pick(TABLE[sex][nutrient], i);
  const m = pick(TABLE.male[nutrient], i);
  const f = pick(TABLE.female[nutrient], i);
  const out: NutrientReference = {};
  for (const k of ['ear', 'rni', 'ai', 'ul', 'cdrr'] as const) {
    const v = lower(m[k], f[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
};

export const energyRequirement = (sex: KdriSex | null, ageGroup: KdriAgeGroup): number => {
  const i = KDRI_AGE_GROUPS.indexOf(ageGroup);
  return sex ? EER[sex][i]! : Math.min(EER.male[i]!, EER.female[i]!);
};
