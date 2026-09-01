import { z } from 'zod';
import { FoodAllergenStatus, MealAllergen } from './allergen.js';

// 음식 카탈로그(food) — 식단 관리(meal) 도메인의 마스터 데이터. 사용자 식단 기록의
// 음식 항목이 여기 행을 "스냅샷"으로 가리키고(FK 없음 — 재적재에 안전), 추천 후보
// 풀·자동완성·분류 통계가 이 카탈로그를 읽는다.
//
// 시드 출처(docs/PLAN-meal.md "데이터 소스"):
//   mfds-nutrition  식약처 전국통합식품영양성분정보(음식) 표준데이터 — data.go.kr 15100070
//                   (api.data.go.kr tn_pubr_public_nutri_food_info_api, pageNo/numOfRows≤1000)
//   mfds-recipe     식품안전나라 조리식품의 레시피 DB COOKRCP01 (1,156건, 재료 문자열)
//   mafra-recipe    농림수산식품교육문화정보원 레시피 기본/재료 (537건, 주재료 구조화)
//   hansik-800      한식진흥원 한식메뉴 외국어표기 800선 (XLSX→CSV 수동, 별칭·카테고리)
//   menu-canonical  기존 global_menu_canonicals(리뷰 언급 어휘) 필터분
//   manual          어드민 수기 등록
//
// 분류는 2축 + 1: dishType(조리형태 — 식약처 식품대분류 25종 축약) × mainIngredient(주재료)
// + cuisine(요리 계통). 키는 영문 snake_case 문자열(SQLite 에 String 저장, 이 enum 이 진실).
// 라벨·매핑 헬퍼는 @repo/utils foodTaxonomy.ts 에 같은 키 순서로 있다(friendly 테스트가
// 두 목록의 동일성을 검증).

export const FoodDishType = z.enum([
  'rice', // 밥·죽
  'noodle', // 면·만두
  'soup', // 국·탕
  'stew', // 찌개·전골
  'grill', // 구이
  'stir_fry', // 볶음
  'braise', // 조림
  'steam', // 찜
  'pancake', // 전·부침
  'fried', // 튀김
  'namul', // 나물·숙채
  'salad', // 생채·무침·샐러드
  'kimchi', // 김치·절임·젓갈
  'raw_fish', // 회·초밥
  'bakery', // 빵·과자·떡
  'dairy', // 유제품·빙과
  'beverage', // 음료·차
  'alcohol', // 주류
  'other', // 기타
]);
export type FoodDishTypeType = z.infer<typeof FoodDishType>;

export const FoodMainIngredient = z.enum([
  'beef',
  'pork',
  'chicken',
  'other_meat', // 오리·양 등
  'fish',
  'seafood', // 새우·오징어·조개 등
  'vegetable', // 채소·버섯·해조
  'tofu_bean',
  'egg',
  'dairy',
  'grain', // 곡물·감자·떡·면 자체
  'fruit',
  'other',
]);
export type FoodMainIngredientType = z.infer<typeof FoodMainIngredient>;

export const FoodCuisine = z.enum([
  'korean',
  'chinese',
  'japanese',
  'western',
  'asian', // 동남아·인도 등
  'fast_food', // 분식·패스트푸드·프랜차이즈
  'other',
]);
export type FoodCuisineType = z.infer<typeof FoodCuisine>;

export const FoodSource = z.enum([
  'mfds-nutrition',
  'mfds-recipe',
  'mafra-recipe',
  'hansik-800',
  'menu-canonical',
  'manual',
]);
export type FoodSourceType = z.infer<typeof FoodSource>;

// 1인분 기준 영양(표준데이터는 100g 기준 → foodSize(1인분 중량)로 환산해 저장). 값이 없으면 null.
export const FoodNutrition = z.object({
  kcal: z.number().nullable(),
  carbG: z.number().nullable(),
  proteinG: z.number().nullable(),
  fatG: z.number().nullable(),
  sodiumMg: z.number().nullable(),
  sugarG: z.number().nullable(),
});
export type FoodNutritionType = z.infer<typeof FoodNutrition>;

// 카탈로그 행(어드민 상세/목록).
export const FoodItem = z.object({
  id: z.string(),
  name: z.string(),
  // 대표식품명(표준데이터 foodLv4Nm) — 변형 축약 키. 없으면 null.
  repName: z.string().nullable(),
  // 별칭(표시 문자열). 매칭은 서버가 normalizeTerm 으로 정규화해 비교한다.
  aliases: z.array(z.string()),
  dishType: FoodDishType.nullable(),
  mainIngredient: FoodMainIngredient.nullable(),
  cuisine: FoodCuisine.nullable(),
  // 주요 재료(레시피 DB 에서). 없으면 null.
  ingredients: z.array(z.string()).nullable(),
  // 재료 문자열 기반 추정 또는 운영자 검수 결과. 빈 목록도 안전 보장이 아니다.
  allergens: z.array(MealAllergen),
  allergenEvidence: z.array(z.string()),
  allergenStatus: FoodAllergenStatus,
  // 1인분 중량(g 또는 ml). 없으면 null.
  servingG: z.number().nullable(),
  // 100g(100ml)당 열량 — 원본 단위. servingG 가 없어 1인분 영양이 비어도 있을 수 있다.
  kcalPer100g: z.number().nullable(),
  nutrition: FoodNutrition.nullable(),
  source: FoodSource,
  sourceId: z.string().nullable(),
  // 원본 분류명(식품대분류 / RCP_PAT2 / 800선 카테고리 / categoryPath) — 감사·재매핑용.
  sourceCategory: z.string().nullable(),
  // 외식 등장 식당 수 등 — 후보 풀·자동완성 정렬 가중.
  popularity: z.number().int(),
  active: z.boolean(),
  // LLM 2축 분류 버전/모델. 매핑 테이블로만 채운 행은 null.
  classifyVersion: z.number().int().nullable(),
  classifyModel: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FoodItemType = z.infer<typeof FoodItem>;

// ── 사용자 검색(자동완성) — 인증 사용자, 레이트리밋 ───────────────────────────
export const FoodSearchQuery = z.object({
  q: z.string().trim().min(1).max(40),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type FoodSearchQueryType = z.infer<typeof FoodSearchQuery>;

// 자동완성 한 줄 — 분류 배지까지만(영양·출처 상세는 어드민/상세 조회).
export const FoodSearchItem = z.object({
  id: z.string(),
  name: z.string(),
  repName: z.string().nullable(),
  dishType: FoodDishType.nullable(),
  mainIngredient: FoodMainIngredient.nullable(),
  cuisine: FoodCuisine.nullable(),
  popularity: z.number().int(),
});
export type FoodSearchItemType = z.infer<typeof FoodSearchItem>;

export const FoodSearchResult = z.object({
  items: z.array(FoodSearchItem),
});
export type FoodSearchResultType = z.infer<typeof FoodSearchResult>;

// ── 사용자: 음식 → 수집된 메뉴·리뷰 식당 역검색 ──
// 좌표는 둘 다 보내거나 둘 다 생략해야 한다. 좌표가 있으면 radiusM 안의
// canonical 식당만 근거 신뢰도→거리순으로, 없으면 수집 근거·평점순으로 돌려준다.
export const FoodRestaurantsQuery = z
  .object({
    lat: z.coerce.number().finite().min(-90).max(90).optional(),
    lng: z.coerce.number().finite().min(-180).max(180).optional(),
    radiusM: z.coerce.number().int().min(100).max(50_000).default(5_000),
    limit: z.coerce.number().int().min(1).max(30).default(10),
  })
  .superRefine((value, ctx) => {
    if ((value.lat === undefined) !== (value.lng === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'lat과 lng는 함께 보내야 합니다',
        path: value.lat === undefined ? ['lat'] : ['lng'],
      });
    }
  });
export type FoodRestaurantsQueryType = z.infer<typeof FoodRestaurantsQuery>;

// menu_catalog = 수집된 원본 메뉴, review_mentions = 리뷰에서 추출·정규화한
// 메뉴 언급. 둘 모두 실시간 판매 여부를 의미하지 않는다.
export const FoodRestaurantEvidence = z.enum(['menu_catalog', 'review_mentions']);
export type FoodRestaurantEvidenceType = z.infer<typeof FoodRestaurantEvidence>;

export const FoodRestaurant = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  distanceM: z.number().int().nonnegative().nullable(),
  evidence: z.array(FoodRestaurantEvidence).min(1),
  mentionCount: z.number().int().nonnegative(),
  positiveRatio: z.number().min(0).max(1).nullable(),
  matchedMenus: z.array(z.string()),
});
export type FoodRestaurantType = z.infer<typeof FoodRestaurant>;

export const FOOD_RESTAURANT_DATA_NOTICE =
  '수집된 메뉴·리뷰에서 확인된 연결이며, 현재 판매 여부를 보장하지 않습니다.' as const;

export const FoodRestaurantsResult = z.object({
  foodId: z.string(),
  foodName: z.string(),
  matchedGlobalKeys: z.array(z.string()),
  notice: z.literal(FOOD_RESTAURANT_DATA_NOTICE),
  items: z.array(FoodRestaurant),
});
export type FoodRestaurantsResultType = z.infer<typeof FoodRestaurantsResult>;

// ── 어드민: 카탈로그 목록/편집/통계 ───────────────────────────────────────────
const boolParam = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === '1' || v === 'true'));

export const FoodAdminListQuery = z.object({
  q: z.string().trim().max(40).optional(),
  dishType: FoodDishType.optional(),
  mainIngredient: FoodMainIngredient.optional(),
  cuisine: FoodCuisine.optional(),
  source: FoodSource.optional(),
  allergenStatus: FoodAllergenStatus.optional(),
  // '1'/'0' — 미지정이면 전체.
  active: boolParam,
  // '1' 이면 dishType 또는 mainIngredient 또는 cuisine 이 비어 있는 행만.
  unclassified: boolParam,
  sort: z.enum(['popularity', 'name', 'updatedAt']).default('popularity'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type FoodAdminListQueryType = z.infer<typeof FoodAdminListQuery>;

export const FoodAdminListResult = z.object({
  items: z.array(FoodItem),
  total: z.number().int(),
});
export type FoodAdminListResultType = z.infer<typeof FoodAdminListResult>;

// 수기 등록(source=manual). name 은 nameNorm 으로 기존 행과 충돌하면 409.
export const FoodAdminCreateInput = z.object({
  name: z.string().trim().min(1).max(60),
  repName: z.string().trim().max(60).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  dishType: FoodDishType.nullable().optional(),
  mainIngredient: FoodMainIngredient.nullable().optional(),
  cuisine: FoodCuisine.nullable().optional(),
  ingredients: z.array(z.string().trim().min(1).max(40)).max(40).nullable().optional(),
  // inferred를 보내면 ingredients에서 서버가 다시 계산한다. verified는 운영자 검수값,
  // unknown은 목록·근거를 비운다.
  allergens: z.array(MealAllergen).max(MealAllergen.options.length).optional(),
  allergenStatus: FoodAllergenStatus.optional(),
  active: z.boolean().optional(),
});
export type FoodAdminCreateInputType = z.infer<typeof FoodAdminCreateInput>;

// 편집 — 부분 갱신. 분류를 null 로 보내면 비움(재분류 대상이 된다).
export const FoodAdminUpdateInput = FoodAdminCreateInput.partial();
export type FoodAdminUpdateInputType = z.infer<typeof FoodAdminUpdateInput>;

export const FoodAdminStats = z.object({
  total: z.number().int(),
  active: z.number().int(),
  // dishType·mainIngredient·cuisine 셋 다 채워진 행.
  classified: z.number().int(),
  // 적재가 남긴 필드 단위 관측과 아직 결정하지 않은 병합 충돌.
  sourceObservationCount: z.number().int().nonnegative(),
  openMergeConflictCount: z.number().int().nonnegative(),
  // 카탈로그 영양 출처 엄밀도. nutritionFrom이 있으면 donor 추정으로 본다.
  nutritionDirectCount: z.number().int().nonnegative(),
  nutritionEstimatedCount: z.number().int().nonnegative(),
  nutritionMissingCount: z.number().int().nonnegative(),
  allergenUnknownCount: z.number().int().nonnegative(),
  allergenInferredCount: z.number().int().nonnegative(),
  allergenVerifiedCount: z.number().int().nonnegative(),
  bySource: z.array(z.object({ source: FoodSource, count: z.number().int() })),
  byDishType: z.array(z.object({ dishType: FoodDishType.nullable(), count: z.number().int() })),
});
export type FoodAdminStatsType = z.infer<typeof FoodAdminStats>;

// ── 어드민: 출처 관측·병합 충돌 검토 큐 ──
// 외부 소스가 보낸 값을 FoodItem 대표값과 별개로 남긴다. 단순 누적 필드
// (aliases/popularity)는 관측만 남기고, 단일 대표값 필드만 충돌 검토 대상이다.
export const FoodSourceObservationField = z.enum([
  'name',
  'repName',
  'aliases',
  'dishType',
  'mainIngredient',
  'cuisine',
  'ingredients',
  'servingG',
  'kcal',
  'carbG',
  'proteinG',
  'fatG',
  'sodiumMg',
  'sugarG',
  'sourceCategory',
  'popularity',
]);
export type FoodSourceObservationFieldType = z.infer<typeof FoodSourceObservationField>;

export const FoodMergeConflictField = z.enum([
  'repName',
  'dishType',
  'mainIngredient',
  'cuisine',
  'ingredients',
  'servingG',
  'kcal',
  'carbG',
  'proteinG',
  'fatG',
  'sodiumMg',
  'sugarG',
  'sourceCategory',
]);
export type FoodMergeConflictFieldType = z.infer<typeof FoodMergeConflictField>;

export const FoodMergeConflictStatus = z.enum([
  'open',
  'kept_existing',
  'accepted_incoming',
  'dismissed',
]);
export type FoodMergeConflictStatusType = z.infer<typeof FoodMergeConflictStatus>;

export const FoodObservedValue = z.union([z.string(), z.number(), z.array(z.string())]);
export type FoodObservedValueType = z.infer<typeof FoodObservedValue>;

export const FoodSourceObservation = z.object({
  id: z.string(),
  field: FoodSourceObservationField,
  value: FoodObservedValue,
  source: FoodSource,
  sourceId: z.string().nullable(),
  observedAt: z.string().datetime(),
});
export type FoodSourceObservationType = z.infer<typeof FoodSourceObservation>;

export const FoodMergeConflictItem = z.object({
  id: z.string(),
  foodItem: z.object({ id: z.string(), name: z.string() }),
  field: FoodMergeConflictField,
  existingValue: FoodObservedValue,
  incomingValue: FoodObservedValue,
  source: FoodSource,
  sourceId: z.string().nullable(),
  status: FoodMergeConflictStatus,
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  // 같은 음식·필드의 최근 관측. 개별 식단/사용자 정보는 포함하지 않는다.
  observations: z.array(FoodSourceObservation).max(20),
});
export type FoodMergeConflictItemType = z.infer<typeof FoodMergeConflictItem>;

export const FoodMergeConflictListQuery = z.object({
  status: FoodMergeConflictStatus.default('open'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type FoodMergeConflictListQueryType = z.infer<typeof FoodMergeConflictListQuery>;

export const FoodMergeConflictListResult = z.object({
  items: z.array(FoodMergeConflictItem),
  total: z.number().int().nonnegative(),
});
export type FoodMergeConflictListResultType = z.infer<typeof FoodMergeConflictListResult>;

export const FoodMergeConflictAction = z.enum(['keep_existing', 'accept_incoming', 'dismiss']);
export type FoodMergeConflictActionType = z.infer<typeof FoodMergeConflictAction>;

export const FoodMergeConflictResolveInput = z.object({
  action: FoodMergeConflictAction,
});
export type FoodMergeConflictResolveInputType = z.infer<typeof FoodMergeConflictResolveInput>;

// ── 어드민: 식단 사진 인식 교정 품질 ──
// 개별 식단이 아닌 운영 집계만 내린다. 음식명은 오탐 개선에 필요하지만
// 민감할 수 있으므로 top 항목은 서버에서 서로 다른 사용자 2명 이상이 기여한 집계만 노출한다.
export const FoodRecognitionQualityQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  // model/version 은 recognitionJson 에 남은 실제 실행 계보를 대상으로 한다.
  // confidenceBucket 경계는 서버와 어드민 UI가 같은 enum 을 사용한다.
  model: z.string().trim().min(1).max(120).optional(),
  version: z.coerce.number().int().min(1).max(10_000).optional(),
  confidenceBucket: z.enum(['low', 'medium', 'high']).optional(),
});
export type FoodRecognitionQualityQueryType = z.infer<typeof FoodRecognitionQualityQuery>;

const RecognitionQualityCount = z.number().int().nonnegative();

export const FoodRecognitionQualityResult = z.object({
  days: z.number().int().min(1).max(365),
  from: z.string().datetime(),
  to: z.string().datetime(),
  // recognitionJson 이 있는 필터 일치 기록. 파싱 불가 JSON만 invalid 이며, 과거의 정상
  // 프롬프트 버전은 버전별 품질 추이를 위해 유효 표본으로 유지한다.
  recognitionEntryCount: RecognitionQualityCount,
  invalidRecognitionCount: RecognitionQualityCount,
  originalDishCount: RecognitionQualityCount,
  confirmedCount: RecognitionQualityCount,
  correctedCount: RecognitionQualityCount,
  deletedCount: RecognitionQualityCount,
  manuallyAddedCount: RecognitionQualityCount,
  // (corrected + deleted) / originalDishCount. 원본이 없으면 0.
  correctionRate: z.number().min(0).max(1),
  // 최종 MealItem 중 카탈로그 foodId 를 찾지 못한 항목.
  unmatchedFinalItemCount: RecognitionQualityCount,
  // distinct-user k-anonymity(k=2) 적용 완료. 유저·메모·사진·개별 기록 id 는 계약에 없다.
  topCorrections: z
    .array(
      z.object({
        originalName: z.string().min(1).max(120),
        finalName: z.string().min(1).max(120),
        count: z.number().int().min(2),
      }),
    )
    .max(20),
  topUnmatched: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        count: z.number().int().min(2),
      }),
    )
    .max(20),
  // 음식명·사용자 식별자가 없는 운영 메타데이터별 집계. 사용자 유래 텍스트는 위의
  // top* 에서만 나오며, 그 두 목록에는 서버가 distinct-user k=2를 적용한다.
  byModelVersion: z
    .array(
      z.object({
        model: z.string().min(1).max(120).nullable(),
        version: z.number().int().min(1).max(10_000).nullable(),
        recognitionEntryCount: RecognitionQualityCount,
        originalDishCount: RecognitionQualityCount,
        confirmedCount: RecognitionQualityCount,
        correctedCount: RecognitionQualityCount,
        deletedCount: RecognitionQualityCount,
        correctionRate: z.number().min(0).max(1),
      }),
    )
    .max(100),
  byConfidence: z
    .array(
      z.object({
        bucket: z.enum(['low', 'medium', 'high']),
        originalDishCount: RecognitionQualityCount,
        confirmedCount: RecognitionQualityCount,
        correctedCount: RecognitionQualityCount,
        deletedCount: RecognitionQualityCount,
        correctionRate: z.number().min(0).max(1),
      }),
    )
    .max(3),
});
export type FoodRecognitionQualityResultType = z.infer<typeof FoodRecognitionQualityResult>;

// ── 적재 잡(import) — random-crawl 과 같은 "설정 + 지금 실행 + 이력 + SSE" 골격 ──
// 어드민 잡이 도는 소스. hansik-800 은 수동 CSV 파일이라 CLI(load:food-catalog --file)
// 전용이고 어드민 잡 소스 목록에는 없다.
export const FoodImportSource = z.enum([
  'mfds-nutrition',
  'mfds-recipe',
  'mafra-recipe',
  'menu-canonical',
]);
export type FoodImportSourceType = z.infer<typeof FoodImportSource>;

export const FoodImportTrigger = z.enum(['cron', 'manual']);
export type FoodImportTriggerType = z.infer<typeof FoodImportTrigger>;

// running → done | failed | skipped(overlap) | interrupted(재시작 고아)
export const FoodImportRunStatus = z.enum(['running', 'done', 'failed', 'skipped', 'interrupted']);
export type FoodImportRunStatusType = z.infer<typeof FoodImportRunStatus>;

// live 진행 단계 — 이력 행은 null.
export const FoodImportPhase = z.enum([
  'fetching',
  'normalizing',
  'upserting',
  'classifying',
  'done',
]);
export type FoodImportPhaseType = z.infer<typeof FoodImportPhase>;

export const FoodImportConfig = z.object({
  enabled: z.boolean(),
  cronExpr: z.string(),
  timezone: z.string(),
  sources: z.array(FoodImportSource),
  // 적재 후 미분류 행 LLM 2축 분류까지 수행할지.
  classify: z.boolean(),
  // 각 외부 소스의 키가 설정돼 있는지(읽기 전용) — 없으면 그 소스는 skip 되므로 UI 경고.
  apiConfigured: z.object({
    'mfds-nutrition': z.boolean(),
    'mfds-recipe': z.boolean(),
    'mafra-recipe': z.boolean(),
  }),
  lastRunAt: z.string().nullable(),
  lastStatus: FoodImportRunStatus.nullable(),
  nextRunAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type FoodImportConfigType = z.infer<typeof FoodImportConfig>;

export const FoodImportConfigInput = z.object({
  enabled: z.boolean(),
  cronExpr: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default('Asia/Seoul'),
  sources: z.array(FoodImportSource).min(1),
  classify: z.boolean().default(true),
});
export type FoodImportConfigInputType = z.infer<typeof FoodImportConfigInput>;

// 지금 실행 — 설정을 덮어쓰지 않고 이번 회차만 소스/분류 여부를 바꿀 수 있다.
export const FoodImportRunInput = z.object({
  sources: z.array(FoodImportSource).min(1).optional(),
  classify: z.boolean().optional(),
});
export type FoodImportRunInputType = z.infer<typeof FoodImportRunInput>;

// 소스별 집계 — fetched(원본 행) → inserted/updated(카탈로그 반영) / skipped(필터·중복·파싱 실패).
export const FoodImportSourceStat = z.object({
  source: FoodImportSource,
  fetched: z.number().int(),
  inserted: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  // 소스 단위 실패(키 없음·업스트림 오류) — 다른 소스는 계속 진행.
  error: z.string().nullable(),
});
export type FoodImportSourceStatType = z.infer<typeof FoodImportSourceStat>;

export const FoodImportRun = z.object({
  runId: z.string(),
  trigger: FoodImportTrigger,
  status: FoodImportRunStatus,
  phase: FoodImportPhase.nullable(),
  sources: z.array(FoodImportSource),
  stats: z.array(FoodImportSourceStat),
  // LLM 분류 반영 행 수.
  classifiedCount: z.number().int(),
  // live 진행(현재 단계의 처리/전체). 이력 행은 null.
  progress: z
    .object({ processed: z.number().int(), total: z.number().int().nullable() })
    .nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type FoodImportRunType = z.infer<typeof FoodImportRun>;

export const FoodImportRunList = z.object({
  items: z.array(FoodImportRun),
  inflightRunId: z.string().nullable(),
});
export type FoodImportRunListType = z.infer<typeof FoodImportRunList>;

export const FoodImportPreviewInput = z.object({
  cronExpr: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default('Asia/Seoul'),
});
export type FoodImportPreviewInputType = z.infer<typeof FoodImportPreviewInput>;

export const FoodImportPreviewResult = z.object({
  valid: z.boolean(),
  error: z.string().nullable(),
  nextRuns: z.array(z.string()),
});
export type FoodImportPreviewResultType = z.infer<typeof FoodImportPreviewResult>;

// ── SSE ─────────────────────────────────────────────────────────────────────
export const FoodImportProgressEvent = z.object({
  type: z.literal('progress'),
  runId: z.string(),
  phase: FoodImportPhase,
  source: FoodImportSource.nullable(),
  processed: z.number().int(),
  total: z.number().int().nullable(),
  message: z.string().nullable(),
});
export type FoodImportProgressEventType = z.infer<typeof FoodImportProgressEvent>;

export const FoodImportDoneEvent = z.object({
  type: z.literal('done'),
  runId: z.string(),
  status: FoodImportRunStatus,
  finishedAt: z.string(),
});
export type FoodImportDoneEventType = z.infer<typeof FoodImportDoneEvent>;
