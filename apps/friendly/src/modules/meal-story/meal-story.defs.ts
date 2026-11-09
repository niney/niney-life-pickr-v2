import type { MealStoryNutrientType } from '@repo/api-contract';
import { KDRI_AGE_GROUPS, nutrientReference, type KdriAgeGroup, type KdriNutrient } from '../meal-nutrition/kdri.js';
import { NUTRIENT_DEFS } from '../meal-nutrition/meal-nutrition.defs.js';

// 건강식단 스토리의 표 — 영양 값 이름·단위·반올림, 서버가 스스로 붙이는 출처, 섭취기준 해석.

export const MEAL_STORY_NUTRIENTS: Readonly<Record<MealStoryNutrientType, { label: string; unit: 'kcal' | 'g' | 'mg' }>> = {
  kcal: { label: '열량', unit: 'kcal' },
  carbG: { label: '탄수화물', unit: 'g' },
  proteinG: { label: '단백질', unit: 'g' },
  fatG: { label: '지방', unit: 'g' },
  sugarG: { label: '당류', unit: 'g' },
  fiberG: { label: '식이섬유', unit: 'g' },
  sodiumMg: { label: '나트륨', unit: 'mg' },
  potassiumMg: { label: '칼륨', unit: 'mg' },
};

/** 레시피 전체 보기의 영양 표 차례. */
export const MEAL_STORY_RECIPE_NUTRIENTS: readonly MealStoryNutrientType[] = [
  'kcal',
  'carbG',
  'sugarG',
  'proteinG',
  'fatG',
  'fiberG',
  'sodiumMg',
  'potassiumMg',
];

/** 단위대로 반올림 — mg·kcal·% 는 정수, g 은 10 미만이면 소수 한 자리. */
export const roundForUnit = (value: number, unit: string): number => {
  if (unit === 'g') return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return Math.round(value);
};

export const formatAmount = (value: number, unit: string): string =>
  `${roundForUnit(value, unit).toLocaleString('ko-KR')}${unit}`;

/** 원고가 sources 에 적지 않아도 서버가 값에 붙이는 출처. */
export const MEAL_STORY_BUILTIN_SOURCES: Readonly<Record<string, string>> = {
  'kdri-2020': '2020 한국인 영양소 섭취기준(보건복지부·한국영양학회)',
  'mfds-raw': '식약처 전국통합식품영양성분정보(원재료성식품) 표준데이터 — 공공데이터포털 15100065',
  'mfds-processed': '식약처 전국통합식품영양성분정보(가공식품) 표준데이터 — 공공데이터포털 15100066',
};

const KDRI_KIND: Readonly<Record<'sodium' | 'potassium', { kind: 'cdrr' | 'ai'; basis: string; unit: 'mg' }>> = {
  // 나트륨은 '이보다 적게'(만성질환위험감소섭취량), 칼륨은 '이만큼'(충분섭취량).
  sodium: { kind: 'cdrr', basis: '성인 하루 기준(이보다 적게)', unit: 'mg' },
  potassium: { kind: 'ai', basis: '성인 하루 충분섭취량', unit: 'mg' },
};

const AGE_LABEL: Readonly<Record<KdriAgeGroup, string>> = {
  '12-14': '12~14세',
  '15-18': '15~18세',
  '19-29': '19~29세',
  '30-49': '30~49세',
  '50-64': '50~64세',
  '65-74': '65~74세',
  '75+': '75세 이상',
};

const ADULT_GROUPS: readonly KdriAgeGroup[] = KDRI_AGE_GROUPS.filter((g) => g !== '12-14' && g !== '15-18');

/**
 * 섭취기준 하나 — 성인(19~29세) 값과, 성인 안에서 값이 다른 나이·성별을 덧말로. 성별이 다르면 낮은 쪽이 아니라
 * 둘을 함께 밝힌다(19~29세 남녀가 다르면 basis 에 '남자' 값을 쓰고 덧말에 여자 값).
 */
export const kdriFigure = (
  nutrient: 'sodium' | 'potassium',
): { value: number | null; unit: string; basis: string; detail: string | null } => {
  const { kind, basis, unit } = KDRI_KIND[nutrient];
  const at = (sex: 'male' | 'female', g: KdriAgeGroup) => nutrientReference(nutrient as KdriNutrient, sex, g)[kind];
  const base = at('male', '19-29') ?? null;
  const notes: string[] = [];
  const femaleBase = at('female', '19-29');
  if (femaleBase !== undefined && femaleBase !== base) notes.push(`여자 ${formatAmount(femaleBase, unit)}`);
  for (const g of ADULT_GROUPS) {
    if (g === '19-29') continue;
    const m = at('male', g);
    const f = at('female', g);
    if (m === base && (f === femaleBase || f === undefined)) continue;
    if (m !== undefined && m === f) notes.push(`${AGE_LABEL[g]} ${formatAmount(m, unit)}`);
    else {
      if (m !== undefined && m !== base) notes.push(`${AGE_LABEL[g]} 남자 ${formatAmount(m, unit)}`);
      if (f !== undefined && f !== femaleBase) notes.push(`${AGE_LABEL[g]} 여자 ${formatAmount(f, unit)}`);
    }
  }
  return { value: base, unit, basis, detail: notes.length > 0 ? notes.join(' · ') : null };
};

/** 영양 탭과 같은 주의 문구. */
export const cautionText = (key: 'potassium'): string =>
  NUTRIENT_DEFS.find((d) => d.key === key)?.caution ?? '';
