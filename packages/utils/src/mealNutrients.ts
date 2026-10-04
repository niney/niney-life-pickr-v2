// 영양소 점검(식단 > 영양) 표시 — 앱·웹·서버 프롬프트가 같은 라벨·숫자 모양을 쓴다. 판단은 서버(friendly meal-nutrition).
// utils 는 api-contract 에 의존할 수 없어(순환 금지) 값 유니온을 다시 적는다 — 계약 MealNutrientStatus·reference.kind 와 같은 값.

export type MealNutrientStatusKey = 'low' | 'borderline' | 'ok' | 'high' | 'unknown';

export const MEAL_NUTRIENT_STATUS_LABEL: Record<MealNutrientStatusKey, string> = {
  low: '부족',
  borderline: '조금 부족',
  ok: '충분',
  high: '많음',
  unknown: '판단 보류',
};

// 화면 정렬 — 모자란 것부터, 판단 보류는 맨 뒤.
export const MEAL_NUTRIENT_STATUS_ORDER: Record<MealNutrientStatusKey, number> = {
  low: 0,
  borderline: 1,
  high: 2,
  ok: 3,
  unknown: 4,
};

export const MEAL_NUTRIENT_REFERENCE_LABEL: Record<'rni' | 'ai' | 'cdrr', string> = {
  rni: '권장섭취량',
  ai: '충분섭취량',
  cdrr: '만성질환위험감소섭취량',
};

/** 영양소 양 — 100 이상은 정수(천 단위 쉼표), 10 이상은 소수 첫째, 그 아래는 둘째 자리까지. */
export const formatNutrientAmount = (v: number): string => {
  if (v >= 100) return Math.round(v).toLocaleString('en-US');
  if (v >= 10) return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
};

/** 막대 폭(0~100%) — 기준 대비 150% 까지 그리고 자른다(기준선은 66.7% 위치). */
export const NUTRIENT_BAR_MAX_PERCENT = 150;
export const nutrientBarWidth = (percent: number | null): number =>
  percent === null ? 0 : (Math.max(0, Math.min(NUTRIENT_BAR_MAX_PERCENT, percent)) / NUTRIENT_BAR_MAX_PERCENT) * 100;

// 식단 설정의 성별 선택지(계약 MealSex) — null 은 '선택 안 함'(성인 기본 기준).
export const MEAL_SEX_OPTIONS: ReadonlyArray<{ value: 'male' | 'female' | null; label: string }> = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
  { value: null, label: '선택 안 함' },
];

/** 출생연도 입력 → 저장 값. 빈칸은 null(성인 기본 기준), 1900~올해 네 자리가 아니면 undefined(형식 오류). */
export const parseMealBirthYear = (raw: string, now: Date = new Date()): number | null | undefined => {
  const s = raw.trim();
  if (!s) return null;
  const year = Number(s);
  return /^\d{4}$/.test(s) && year >= 1900 && year <= now.getFullYear() ? year : undefined;
};

/** 점검 기준 문구 — "30-49세 여성 기준" / 성별·나이가 없으면 "30-49세 성인 기준". */
export const mealNutrientProfileLabel = (p: {
  sex: 'male' | 'female' | null;
  ageGroup: string;
  basis: 'user' | 'default';
}): string =>
  p.basis === 'user' && p.sex
    ? `${p.ageGroup}세 ${p.sex === 'male' ? '남성' : '여성'} 기준`
    : `${p.ageGroup}세 성인 기준`;
