import { z } from 'zod';

// 식품안전나라 표시 기준의 알레르기 유발물질 19개 군. 사용자 선호와 음식
// 카탈로그가 같은 enum을 써야 추천 필터에서 문자열 변환이 끼지 않는다.
// 구조화 값은 교차접촉·미표기 재료까지 보장하는 "안전 인증"이 아니다.
export const MealAllergen = z.enum([
  'egg',
  'milk',
  'buckwheat',
  'peanut',
  'soybean',
  'wheat',
  'pine_nut',
  'walnut',
  'crab',
  'shrimp',
  'squid',
  'mackerel',
  'shellfish',
  'peach',
  'tomato',
  'chicken',
  'pork',
  'beef',
  'sulfites',
]);
export type MealAllergenType = z.infer<typeof MealAllergen>;

export const MEAL_ALLERGEN_LABEL: Record<MealAllergenType, string> = {
  egg: '알류(달걀)',
  milk: '우유',
  buckwheat: '메밀',
  peanut: '땅콩',
  soybean: '대두',
  wheat: '밀',
  pine_nut: '잣',
  walnut: '호두',
  crab: '게',
  shrimp: '새우',
  squid: '오징어',
  mackerel: '고등어',
  shellfish: '조개류',
  peach: '복숭아',
  tomato: '토마토',
  chicken: '닭고기',
  pork: '돼지고기',
  beef: '쇠고기',
  sulfites: '아황산류',
};

// unknown: 판정할 재료/검수 근거가 없음
// inferred: 공개된 재료 문자열을 결정 규칙으로 검사함(교차접촉은 알 수 없음)
// verified: 운영자가 구조화 목록을 직접 검토함(그래도 제조·매장 안전 보장은 아님)
export const FoodAllergenStatus = z.enum(['unknown', 'inferred', 'verified']);
export type FoodAllergenStatusType = z.infer<typeof FoodAllergenStatus>;
