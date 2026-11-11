import type { MealStoryNutrientType } from '@repo/api-contract';
import { KDRI_AGE_GROUPS, nutrientReference, type KdriAgeGroup, type KdriNutrient } from '../meal-nutrition/kdri.js';
import { NUTRIENT_DEFS } from '../meal-nutrition/meal-nutrition.defs.js';
import type { MealStoryCautionKey, MealStoryKdriKey } from './meal-story.script.js';

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
  calciumMg: { label: '칼슘', unit: 'mg' },
  vitaminCMg: { label: '비타민 C', unit: 'mg' },
};

/**
 * 레시피 전체 보기의 영양 표 차례 — 늘 보이는 줄. 그 편의 영양정보 장면이 여기 없는 영양소(칼슘)를 가리키면 그 줄을 뒤에 붙인다
 * (resolve). 모든 편에 줄을 늘리지 않는 까닭: 값을 모르는 재료(가공식품 묶음)가 있는 편은 그 줄이 '일부만 셌어요'가 된다.
 */
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
  // 환산 비율의 근거일 뿐 — 기준값은 섭취기준(kdri-2020)을 쓴다(WHO 의 권고량을 기준으로 섞지 않는다).
  'who-sodium-2012': '나트륨을 소금으로 환산(소금 5g = 나트륨 2g, 소금 1g = 나트륨 400mg) — WHO 나트륨 섭취 지침(2012)',
};

/**
 * 나트륨 → 소금 — 소금(염화나트륨)의 약 40%가 나트륨이라 나트륨 × 2.5 로 어림한다(WHO 지침이 나트륨 2g = 소금 5g 으로 쓴다).
 * 화면이 숫자를 지어내지 않게 서버가 환산하고 출처를 붙인다. per = 소금 1g 에 든 나트륨 mg(나누기라 2,300 ÷ 400 처럼 딱 떨어진다).
 */
export const SODIUM_TO_SALT = { label: '소금', unit: 'g', per: 400, source: 'who-sodium-2012' } as const;

/**
 * '약 N분의 1' — 작은 값이 큰 값의 몇 분의 1 인지. N 은 2 이상의 정수로 어림하고, 실제 비와 15% 넘게 벗어나면 말하지 않는다
 * (2.5배를 '3분의 1'이라 하지 않는다).
 */
export const fractionOf = (small: number, large: number): number | null => {
  if (!(small > 0) || !(large > 0) || large < small) return null;
  const ratio = large / small;
  const n = Math.round(ratio);
  return n >= 2 && Math.abs(ratio - n) / ratio <= 0.15 ? n : null;
};

const KDRI_KIND: Readonly<Record<MealStoryKdriKey, { kind: 'cdrr' | 'ai' | 'rni'; basis: string; unit: 'mg' | 'g' }>> = {
  // 나트륨은 '이보다 적게'(만성질환위험감소섭취량), 칼륨·식이섬유는 '이만큼'(충분섭취량), 칼슘은 권장섭취량. basis 의 '성인' 자리에
  // 성별이 들어간다.
  sodium: { kind: 'cdrr', basis: '성인 하루 기준(이보다 적게)', unit: 'mg' },
  potassium: { kind: 'ai', basis: '성인 하루 충분섭취량', unit: 'mg' },
  fiber: { kind: 'ai', basis: '성인 하루 충분섭취량', unit: 'g' },
  calcium: { kind: 'rni', basis: '성인 하루 권장섭취량', unit: 'mg' },
  // 비타민 C 는 성인 남녀·나이가 모두 같다(100mg) — 덧말이 없다.
  vitaminC: { kind: 'rni', basis: '성인 하루 권장섭취량', unit: 'mg' },
};

const SEX_LABEL = { male: '남자', female: '여자' } as const;

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

/** 나이 구간의 시작 나이('50-64' → 50, '75+' → 75). */
const startAge = (g: KdriAgeGroup): string => g.replace(/[-+].*$/, '');
/** 나이 구간의 끝 나이('50-64' → 64). 끝이 없는 구간('75+')은 null. */
const endAge = (g: KdriAgeGroup): string | null => (g.includes('-') ? g.slice(g.indexOf('-') + 1) : null);

/**
 * 성인 나이 구간 가운데 기본(19~29세)과 값이 다른 것 — 값이 같은 이어진 구간은 하나로 묶는다('65~74세 700mg · 75세 이상
 * 700mg' 이 아니라 '65세 이상 700mg'). 덧말 한 줄이 짧아야 영상 쪽지에 들어간다.
 */
const ageNotes = (valueAt: (g: KdriAgeGroup) => number | undefined, base: number | null, unit: string): string[] => {
  const runs: { from: KdriAgeGroup; to: KdriAgeGroup; value: number }[] = [];
  let open = false;
  for (const g of ADULT_GROUPS) {
    const v = g === '19-29' ? undefined : valueAt(g);
    if (v === undefined || v === base) {
      open = false;
      continue;
    }
    const last = runs[runs.length - 1];
    if (open && last && last.value === v) last.to = g;
    else runs.push({ from: g, to: g, value: v });
    open = true;
  }
  return runs.map((r) => {
    const end = endAge(r.to);
    const label = r.from === r.to ? AGE_LABEL[r.from] : end === null ? `${startAge(r.from)}세 이상` : `${startAge(r.from)}~${end}세`;
    return `${label} ${formatAmount(r.value, unit)}`;
  });
};

/**
 * 섭취기준 하나 — 성인(19~29세) 값과, 성인 안에서 값이 다른 나이·성별을 덧말로. 성별이 다르면 낮은 쪽이 아니라
 * 둘을 함께 밝힌다(19~29세 남녀가 다르면 basis 를 '성인 남자 …'로 쓰고 덧말에 여자 값).
 * sex 를 주면 그 성별의 값만 — 남녀 값이 크게 다른 기준(식이섬유 30g·20g)을 숫자 둘로 나란히 보일 때 쓴다. basis 가
 * '성인 여자 …'가 되고 덧말은 그 성별 안의 나이 차이만 담는다.
 */
export const kdriFigure = (
  nutrient: MealStoryKdriKey,
  sex?: 'male' | 'female',
): { value: number | null; unit: string; basis: string; detail: string | null } => {
  const { kind, basis, unit } = KDRI_KIND[nutrient];
  const at = (s: 'male' | 'female', g: KdriAgeGroup) => nutrientReference(nutrient as KdriNutrient, s, g)[kind];
  if (sex) {
    const own = at(sex, '19-29') ?? null;
    const ages = ageNotes((g) => at(sex, g), own, unit);
    return {
      value: own,
      unit,
      basis: basis.replace('성인', `성인 ${SEX_LABEL[sex]}`),
      detail: ages.length > 0 ? ages.join(' · ') : null,
    };
  }
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
  // 남녀 값이 다르면 앞의 숫자가 누구 값인지 basis 가 밝힌다.
  const sexed = femaleBase !== undefined && femaleBase !== base;
  return {
    value: base,
    unit,
    basis: sexed ? basis.replace('성인', `성인 ${SEX_LABEL.male}`) : basis,
    detail: notes.length > 0 ? notes.join(' · ') : null,
  };
};

/** 영양 탭과 같은 주의 문구. */
export const cautionText = (key: MealStoryCautionKey): string =>
  NUTRIENT_DEFS.find((d) => d.key === key)?.caution ?? '';
