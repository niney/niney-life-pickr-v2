// 끼니 영양 합계 — 앱·웹이 같은 문구를 쓰도록 순수 함수로 둔다.
//
// 카탈로그 영양 커버리지가 100% 가 아니다(활성 3,876종 중 62%, 대표 한식 150종 중 80%). 외식
// 브랜드 메뉴(양념치킨 등)는 애초에 영양이 공개되지 않는다. 그래서 합계는 **값이 있는 항목만**
// 더한 과소평가이고, 화면은 그 사실(counted/total)을 반드시 함께 보여 준다. 없는 값을 0 으로
// 채우면 "안 먹었다"는 뜻이 되어 버린다.
//
// 단백질·나트륨은 한 겹 더 엄격하다 — 열량이 반영된 음식 **모두**에 값이 있을 때만 합계를 낸다. 열량만 아는 음식은
// 이름 추정(비슷한 음식·웹 실측의 100g당 열량 × 통상 1인분)뿐인데(카탈로그는 열량이 있으면 단백질·나트륨도 있다,
// 2026-11-08), 그런 음식은 대개 그 끼니의 주재료라 빼고 더한 값은 실제와 동떨어진다 — 닭가슴살(추정 159kcal) +
// 쌀밥이 "단백질 3.4g" 으로 보였다. 감춘 사실은 proteinMissing/sodiumMissing → mealMacroGapNote 로 밝힌다.

export interface MealNutritionItem {
  kcal?: number | null;
  proteinG?: number | null;
  sodiumMg?: number | null;
  nutritionFrom?: string | null;
  /** false = 반찬·곁들임. 곁들임만 반영된 합계는 뜻이 없어서 감추는 데 쓴다. */
  isMain?: boolean;
}

export interface MealNutritionSummary {
  kcal: number | null;
  /** 열량이 반영된 음식 모두에 값이 있을 때만의 합계. 하나라도 비면 null(proteinMissing 참고). */
  proteinG: number | null;
  sodiumMg: number | null;
  /** 열량은 있는데 단백질 / 나트륨이 빈 항목 수(이름 추정 등). 0 보다 크면 그 합계는 null 이다. */
  proteinMissing: number;
  sodiumMissing: number;
  /** 영양 값이 있어 합계에 들어간 항목 수. */
  counted: number;
  /** 전체 항목 수. counted < total 이면 합계는 실제보다 적다. */
  total: number;
  /** 하나라도 같은 계열에서 빌려온 값(추정)이 섞였는지. */
  hasEstimate: boolean;
  /** 주식이 하나라도 있는지 / 그 중 합계에 반영된 게 있는지. */
  hasMain: boolean;
  countedMain: number;
}

export const summarizeMealNutrition = (items: MealNutritionItem[]): MealNutritionSummary => {
  let kcal = 0;
  let proteinG = 0;
  let sodiumMg = 0;
  let proteinMissing = 0;
  let sodiumMissing = 0;
  let counted = 0;
  let hasEstimate = false;
  let hasMain = false;
  let countedMain = 0;
  for (const item of items) {
    const main = item.isMain !== false;
    if (main) hasMain = true;
    if (item.kcal === null || item.kcal === undefined) continue;
    counted += 1;
    if (main) countedMain += 1;
    kcal += item.kcal;
    if (item.proteinG === null || item.proteinG === undefined) proteinMissing += 1;
    else proteinG += item.proteinG;
    if (item.sodiumMg === null || item.sodiumMg === undefined) sodiumMissing += 1;
    else sodiumMg += item.sodiumMg;
    if (item.nutritionFrom) hasEstimate = true;
  }
  return {
    kcal: counted === 0 ? null : Math.round(kcal),
    proteinG: counted === 0 || proteinMissing > 0 ? null : Math.round(proteinG * 10) / 10,
    sodiumMg: counted === 0 || sodiumMissing > 0 ? null : Math.round(sodiumMg),
    proteinMissing,
    sodiumMissing,
    counted,
    total: items.length,
    hasEstimate,
    hasMain,
    countedMain,
  };
};

/**
 * 카드 한 줄용 문구. 값이 없으면 null 을 돌려주고 화면은 아무것도 그리지 않는다.
 * 일부만 반영됐으면 그 사실을 붙인다 — "약 530kcal · 4개 중 2개 반영".
 */
export const mealNutritionLabel = (s: MealNutritionSummary): string | null => {
  if (s.kcal === null) return null;
  // 주식이 있는데 반영된 게 곁들임뿐이면 합계를 감춘다. 실측(시뮬레이터): 양념치킨+단무지+맥주에서
  // 단무지만 값이 있어 "약 2kcal"이 떴는데, 이건 정보가 아니라 오해를 부르는 잡음이다.
  if (s.hasMain && s.countedMain === 0) return null;
  const base = `약 ${s.kcal.toLocaleString('ko-KR')}kcal`;
  if (s.counted < s.total) return `${base} · ${s.total}개 중 ${s.counted}개 반영`;
  return s.hasEstimate ? `${base} (추정)` : base;
};

/**
 * 단백질·나트륨을 감춘 이유 한 줄 — 열량만 아는 음식이 섞여 그 합계를 내지 않았을 때만(아니면 null).
 * 상세 화면이 단백질·나트륨 칸을 비우거나 '—' 로 둘 때 함께 보여 준다.
 */
export const mealMacroGapNote = (s: MealNutritionSummary): string | null => {
  if (s.counted === 0) return null;
  const names = [s.proteinMissing > 0 ? '단백질' : null, s.sodiumMissing > 0 ? '나트륨' : null].filter(
    (n): n is string => n !== null,
  );
  if (names.length === 0) return null;
  return `열량만 아는 음식이 섞여 ${names.join('·')} 합계는 내지 않았어요.`;
};
