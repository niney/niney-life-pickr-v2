// 끼니 영양 합계 — 앱·웹이 같은 문구를 쓰도록 순수 함수로 둔다.
//
// 카탈로그 영양 커버리지가 100% 가 아니다(활성 3,876종 중 62%, 대표 한식 150종 중 80%). 외식
// 브랜드 메뉴(양념치킨 등)는 애초에 영양이 공개되지 않는다. 그래서 합계는 **값이 있는 항목만**
// 더한 과소평가이고, 화면은 그 사실(counted/total)을 반드시 함께 보여 준다. 없는 값을 0 으로
// 채우면 "안 먹었다"는 뜻이 되어 버린다.

export interface MealNutritionItem {
  kcal?: number | null;
  proteinG?: number | null;
  sodiumMg?: number | null;
  nutritionFrom?: string | null;
}

export interface MealNutritionSummary {
  kcal: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
  /** 영양 값이 있어 합계에 들어간 항목 수. */
  counted: number;
  /** 전체 항목 수. counted < total 이면 합계는 실제보다 적다. */
  total: number;
  /** 하나라도 같은 계열에서 빌려온 값(추정)이 섞였는지. */
  hasEstimate: boolean;
}

export const summarizeMealNutrition = (items: MealNutritionItem[]): MealNutritionSummary => {
  let kcal = 0;
  let proteinG = 0;
  let sodiumMg = 0;
  let counted = 0;
  let hasEstimate = false;
  for (const item of items) {
    if (item.kcal === null || item.kcal === undefined) continue;
    counted += 1;
    kcal += item.kcal;
    proteinG += item.proteinG ?? 0;
    sodiumMg += item.sodiumMg ?? 0;
    if (item.nutritionFrom) hasEstimate = true;
  }
  return {
    kcal: counted === 0 ? null : Math.round(kcal),
    proteinG: counted === 0 ? null : Math.round(proteinG * 10) / 10,
    sodiumMg: counted === 0 ? null : Math.round(sodiumMg),
    counted,
    total: items.length,
    hasEstimate,
  };
};

/**
 * 카드 한 줄용 문구. 값이 없으면 null 을 돌려주고 화면은 아무것도 그리지 않는다.
 * 일부만 반영됐으면 그 사실을 붙인다 — "약 530kcal · 4개 중 2개 반영".
 */
export const mealNutritionLabel = (s: MealNutritionSummary): string | null => {
  if (s.kcal === null) return null;
  const base = `약 ${s.kcal.toLocaleString('ko-KR')}kcal`;
  if (s.counted < s.total) return `${base} · ${s.total}개 중 ${s.counted}개 반영`;
  return s.hasEstimate ? `${base} (추정)` : base;
};
