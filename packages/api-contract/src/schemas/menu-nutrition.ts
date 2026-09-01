import { z } from 'zod';

// 공개 식당 메뉴 칼로리 — 메뉴 탭에서 지연 조회. 상세(detail) 응답에 넣지 않는다(상세는 이미 무겁다).
//
// 서버(friendly food/menu-nutrition)가 메뉴명을 카탈로그(식약처 식품영양성분 DB)에 대어
// 보수적으로 판정한 결과만 담는다 — 애매하면 항목이 빠진다(틀린 칼로리는 없는 것보다 나쁘다).
//   per_serving: 정확 매칭이고 카탈로그 1인분 값이 진짜 1인분일 때.
//   per_100g / per_100ml: 메뉴명에 중량·인분·크기 표식이 있거나, 낮은 정밀 매칭(부위+구이·괄호 힌트·
//                        핵심어 접미)일 때 — 양과 무관한 비율이라 안전하다.

export const MenuKcalBasis = z.enum(['per_serving', 'per_100g', 'per_100ml']);
export type MenuKcalBasisType = z.infer<typeof MenuKcalBasis>;

export const MenuKcalMatchedBy = z.enum([
  'exact',
  'alias',
  'synonym',
  'modifier',
  'variant',
  'hint',
  'suffix',
]);
export type MenuKcalMatchedByType = z.infer<typeof MenuKcalMatchedBy>;

export const RestaurantMenuKcalItem = z.object({
  // 상세 응답의 메뉴명과 문자 그대로 같다 — 클라이언트가 이름으로 join 한다.
  name: z.string(),
  basis: MenuKcalBasis,
  kcal: z.number().int().nonnegative(),
  // 대어 본 카탈로그 음식명(예: "삼겹살구이") — 툴팁에 근거로 보여 준다.
  foodName: z.string(),
  matchedBy: MenuKcalMatchedBy,
  // 카탈로그가 같은 계열에서 빌려온 값이면 그 출처 문구("소불고기 외 2종 중앙값").
  nutritionFrom: z.string().nullable(),
});
export type RestaurantMenuKcalItemType = z.infer<typeof RestaurantMenuKcalItem>;

export const MENU_NUTRITION_NOTICE =
  '식약처 식품영양성분 DB 기준 추정치입니다. 식당의 조리법·양에 따라 실제와 다를 수 있습니다.';

export const RestaurantMenuNutrition = z.object({
  placeId: z.string(),
  // 판정된 항목만. 표시할 게 없으면 빈 배열(404 아님).
  items: z.array(RestaurantMenuKcalItem),
  notice: z.string(),
});
export type RestaurantMenuNutritionType = z.infer<typeof RestaurantMenuNutrition>;
