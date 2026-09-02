import { z } from 'zod';

// 공개 식당 메뉴 칼로리 — 메뉴 탭에서 지연 조회. 상세(detail) 응답에 넣지 않는다(상세는 이미 무겁다).
//
// 서버(friendly food/menu-nutrition)가 메뉴명을 카탈로그(식약처 식품영양성분 DB)에 대어
// 보수적으로 판정한 결과만 담는다 — 애매하면 항목이 빠진다(틀린 칼로리는 없는 것보다 나쁘다).
//   per_serving: 정확 매칭이고 카탈로그 1인분 값이 진짜 1인분일 때.
//   per_100g / per_100ml: 메뉴명에 중량·인분·크기 표식이 있거나, 낮은 정밀 매칭(부위+구이·괄호 힌트·
//                        핵심어 접미)일 때 — 양과 무관한 비율이라 안전하다.

//   components: "문어+소라+새우장" 처럼 결합 기호로 나열된 세트 — 구성요소별 판정을 parts 에 담는다.
//               kcal 은 구성 전부가 1인분 판정일 때만 합계, 아니면 null(분량을 모르니 합산하지 않는다).
export const MenuKcalBasis = z.enum(['per_serving', 'per_100g', 'per_100ml', 'components']);
export type MenuKcalBasisType = z.infer<typeof MenuKcalBasis>;

export const MenuKcalMatchedBy = z.enum([
  'exact',
  'alias',
  'synonym',
  'modifier',
  'variant',
  'hint',
  'suffix',
  // 규칙이 못 잡은 이름을 LLM 이 카탈로그 음식에 연결(high 신뢰도만, 100g당만). 어휘 단위 영구 캐시.
  'llm',
  // 카탈로그에 없는 음식 — 웹 실측(fatsecret.kr 검색 결과 복수 항목 중앙값) 추정. 100g당만.
  'web',
  // 결합 기호 세트 — 구성요소(parts)를 각각 판정.
  'set',
]);
export type MenuKcalMatchedByType = z.infer<typeof MenuKcalMatchedBy>;

// 세트 구성요소 하나의 판정 — 규칙 계층으로 잡힌 것만.
export const RestaurantMenuKcalPart = z.object({
  name: z.string(),
  basis: z.enum(['per_serving', 'per_100g', 'per_100ml']),
  kcal: z.number().int().nonnegative(),
  foodName: z.string(),
});
export type RestaurantMenuKcalPartType = z.infer<typeof RestaurantMenuKcalPart>;

// 100g당 항목에 붙는 "그 양의 칼로리". stated = 메뉴명에 적힌 중량(항정살 150g → 461kcal, 가정 없음),
// typical = 종류별 통상 1인분 중량표로 환산(생삼겹살 → 150g 기준). typical 은 부가 문구로만 보여 준다.
export const RestaurantMenuKcalPortion = z.object({
  grams: z.number().int().positive(),
  kcal: z.number().int().nonnegative(),
  basis: z.enum(['stated', 'typical']),
  // 음료는 ml. 없으면 g.
  unit: z.enum(['g', 'ml']).optional(),
});
export type RestaurantMenuKcalPortionType = z.infer<typeof RestaurantMenuKcalPortion>;

export const RestaurantMenuKcalItem = z.object({
  // 상세 응답의 메뉴명과 문자 그대로 같다 — 클라이언트가 이름으로 join 한다.
  name: z.string(),
  basis: MenuKcalBasis,
  // components 이고 구성 전부가 1인분이 아니면 null.
  kcal: z.number().int().nonnegative().nullable(),
  // 대어 본 카탈로그 음식명(예: "삼겹살구이") — 툴팁에 근거로 보여 준다. components 면 메뉴명 자체.
  foodName: z.string(),
  matchedBy: MenuKcalMatchedBy,
  // 카탈로그가 같은 계열에서 빌려온 값이면 그 출처 문구("소불고기 외 2종 중앙값").
  nutritionFrom: z.string().nullable(),
  // basis 가 components 일 때 구성요소 판정. 판정 안 된 구성은 빠진다 — partsTotal 로 전체 수를 안다.
  parts: z.array(RestaurantMenuKcalPart).optional(),
  partsTotal: z.number().int().nonnegative().optional(),
  // 구성이 이름에 없어 LLM 이 추정한 구성이면 true("모듬회" → 광어·우럭·연어). 칩에 "AI 추정" 표시.
  partsEstimated: z.boolean().optional(),
  // per_100g/per_100ml 일 때 그 양·통상 1인분 환산. 없으면 100g당만.
  portion: RestaurantMenuKcalPortion.optional(),
});
export type RestaurantMenuKcalItemType = z.infer<typeof RestaurantMenuKcalItem>;

export const MENU_NUTRITION_NOTICE =
  '식약처 식품영양성분 DB 기준 추정치입니다. 식당의 조리법·양에 따라 실제와 다를 수 있습니다.';

export const RestaurantMenuNutrition = z.object({
  placeId: z.string(),
  // 판정된 항목만. 표시할 게 없으면 빈 배열(404 아님).
  items: z.array(RestaurantMenuKcalItem),
  notice: z.string(),
  // 규칙이 못 잡은 메뉴명을 LLM 이 백그라운드에서 판정 중 — 클라이언트는 잠시 뒤 다시 조회하면
  // 'llm' 항목이 더해진다. 판정이 끝났거나 LLM 이 꺼져 있으면 false.
  llmPending: z.boolean(),
});
export type RestaurantMenuNutritionType = z.infer<typeof RestaurantMenuNutrition>;
