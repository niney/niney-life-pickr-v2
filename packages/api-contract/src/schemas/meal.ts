import { z } from 'zod';
import { FoodCuisine, FoodDishType, FoodMainIngredient } from './food.js';

// 식단 관리(meal) — 사용자 개인의 한 끼 기록 + 사진 인식 + 통계 + 선호 설정 + 다음 끼니 추천.
// docs/PLAN-meal.md. 전 표면 로그인 필수(공개·공유 표면 없음).
//
// 기록 행은 음식 카탈로그(FoodItem)·식당(Restaurant)에 **FK 를 걸지 않고 스냅샷**으로 가리킨다
// (카탈로그는 재적재로 갈리고 식당은 재크롤/삭제된다 — RestaurantFavorite 와 같은 원칙).

// 끼니. 시각으로 자동 추정하고 사용자가 고칠 수 있다(@repo/utils mealSlot).
export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'late_night']);
export type MealSlotType = z.infer<typeof MealSlot>;

// 식사 유형 — 추천의 convenience 가중치와 후보 풀(외식이면 근처 식당 메뉴)에 쓰인다.
export const MealType = z.enum(['home', 'dining_out', 'delivery', 'convenience', 'other']);
export type MealTypeType = z.infer<typeof MealType>;

// 한 끼가 어떻게 만들어졌는지 — 통계/품질 측정용.
export const MealEntrySource = z.enum(['photo', 'manual', 'recommendation']);
export type MealEntrySourceType = z.infer<typeof MealEntrySource>;

// 음식 항목 출처. recognized=사진 인식, catalog=자동완성 선택, manual=자유 입력.
export const MealItemSource = z.enum(['recognized', 'manual', 'catalog', 'recommendation']);
export type MealItemSourceType = z.infer<typeof MealItemSource>;

// 양은 서수만 — 질량 추정은 비전 모델 신뢰도가 낮다(OmniFood-Bench MAPE 50~400%).
export const MealPortion = z.enum(['small', 'normal', 'large']);
export type MealPortionType = z.infer<typeof MealPortion>;

// 'YYYY-MM-DD' — 사용자 로컬 날짜. 달력·통계의 그룹 키(서버는 형식만 검증).
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다');
const MonthString = z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM 형식이어야 합니다');
// 서버가 발급한 사진 토큰(uuid v4) — 경로 조립에 그대로 쓰이므로 형식을 계약으로 묶는다.
export const MealPhotoToken = z
  .string()
  .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);

export const MEAL_MAX_PHOTOS_PER_ENTRY = 5;
export const MEAL_MAX_ITEMS_PER_ENTRY = 20;

// ── 기록 ────────────────────────────────────────────────────────────────────

export const MealPhoto = z.object({
  token: MealPhotoToken,
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  byteSize: z.number().int(),
  sortOrder: z.number().int(),
});
export type MealPhotoType = z.infer<typeof MealPhoto>;

export const MealItem = z.object({
  id: z.string(),
  name: z.string(),
  // 카탈로그 매칭 결과 스냅샷(FK 아님). 못 찾았으면 null — 통계는 이름 정규화로 묶는다.
  foodId: z.string().nullable(),
  dishType: FoodDishType.nullable(),
  mainIngredient: FoodMainIngredient.nullable(),
  cuisine: FoodCuisine.nullable(),
  portion: MealPortion.nullable(),
  // false = 반찬·곁들임. 빈도 통계에서 주식과 분리한다.
  isMain: z.boolean(),
  // 인식 confidence(0~1). 수동 입력은 null.
  confidence: z.number().nullable(),
  source: MealItemSource,
  sortOrder: z.number().int(),
  // 저장 시점의 영양 스냅샷 — 1인분 값 × 양(portion) 배수. 카탈로그에 값이 없으면 null 이고
  // UI 는 숫자를 지어내지 않고 비워 둔다(활성 카탈로그의 62%, 대표 한식의 80%만 값이 있다).
  kcal: z.number().nullable(),
  proteinG: z.number().nullable(),
  sodiumMg: z.number().nullable(),
  // 영양을 같은 계열 음식에서 빌려왔으면 그 출처("버섯콩불고기 외 8종 중앙값"). 직접 값이면 null.
  nutritionFrom: z.string().nullable(),
});
export type MealItemType = z.infer<typeof MealItem>;

// 시간 입력 프리셋 — 끼니별 "내가 보통 먹는 시각".
//
// 일반값(점심 12:30)이 아니라 **내 기록의 중앙값**을 쓴다. 평균이 아닌 이유는 어쩌다 새벽에
// 먹은 한 끼가 평균을 통째로 끌고 가기 때문이고, 표본이 적으면(3건 미만) 내 값 대신 일반값을
// 쓰는 이유는 1건으로 "내 점심은 15시"라고 단정하면 오히려 방해가 되기 때문이다.
export const MealTimePreset = z.object({
  slot: MealSlot,
  // 'HH:MM'(Asia/Seoul 기준). 화면은 날짜를 건드리지 않고 시:분만 이 값으로 바꾼다.
  time: z.string(),
  // 내 기록에서 뽑았는지 — false 면 일반 기본값이다.
  fromRecords: z.boolean(),
  sampleCount: z.number().int(),
});
export type MealTimePresetType = z.infer<typeof MealTimePreset>;

export const MealTimePresetsResult = z.object({ presets: z.array(MealTimePreset) });
export type MealTimePresetsResultType = z.infer<typeof MealTimePresetsResult>;

// 수동 입력 보조 — "이 음식을 지난번에 어떻게 먹었나". 기록이 없으면 found=false.
//
// 사진은 **자동으로 붙이지 않는다**. 오늘 먹은 게 지난번과 같게 생겼을 리 없으니 자동 첨부는
// 사실과 다른 기록이 된다. 화면은 참고용으로만 보여 주고, 쓸지 말지는 사용자가 정한다.
export const RecentMealItemQuery = z.object({
  name: z.string().trim().min(1).max(60),
});
export type RecentMealItemQueryType = z.infer<typeof RecentMealItemQuery>;

export const RecentMealItemResult = z.object({
  found: z.boolean(),
  name: z.string().nullable(),
  lastEatenDate: DateString.nullable(),
  // 지난번에 먹은 양 — 비어 있는 입력을 채워 준다.
  portion: MealPortion.nullable(),
  isMain: z.boolean().nullable(),
  dishType: FoodDishType.nullable(),
  mainIngredient: FoodMainIngredient.nullable(),
  cuisine: FoodCuisine.nullable(),
  // 그때 그 끼니의 대표 사진(있으면). 복사해서 쓰려면 photoCopy 를 부른다.
  photoToken: z.string().nullable(),
});
export type RecentMealItemResultType = z.infer<typeof RecentMealItemResult>;

export const MealItemInput = z.object({
  name: z.string().trim().min(1).max(60),
  foodId: z.string().max(64).nullable().optional(),
  dishType: FoodDishType.nullable().optional(),
  mainIngredient: FoodMainIngredient.nullable().optional(),
  cuisine: FoodCuisine.nullable().optional(),
  portion: MealPortion.nullable().optional(),
  isMain: z.boolean().default(true),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: MealItemSource.default('manual'),
});
export type MealItemInputType = z.infer<typeof MealItemInput>;

export const MealEntry = z.object({
  id: z.string(),
  // UTC ISO. 표시·정렬은 이 값, 날짜 그룹은 eatenDate 를 쓴다(시간대 경계 오표시 방지).
  eatenAt: z.string(),
  eatenDate: DateString,
  slot: MealSlot,
  mealType: MealType.nullable(),
  placeId: z.string().nullable(),
  placeName: z.string().nullable(),
  memo: z.string().nullable(),
  source: MealEntrySource,
  items: z.array(MealItem),
  photos: z.array(MealPhoto),
  // 인식 원본(모델·버전·후보)을 확정 후에도 보존 — 인식 품질 측정용. 목록에선 생략(null).
  recognition: z
    .object({
      model: z.string().nullable(),
      version: z.number().int().nullable(),
      dishes: z.array(z.unknown()),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MealEntryType = z.infer<typeof MealEntry>;

export const CreateMealEntryInput = z.object({
  eatenAt: z.string().datetime({ offset: true }),
  eatenDate: DateString,
  slot: MealSlot,
  mealType: MealType.nullable().optional(),
  placeId: z.string().max(64).nullable().optional(),
  placeName: z.string().max(120).nullable().optional(),
  memo: z.string().max(500).nullable().optional(),
  source: MealEntrySource.default('manual'),
  items: z.array(MealItemInput).min(1).max(MEAL_MAX_ITEMS_PER_ENTRY),
  // 업로드로 받은 사진 토큰(순서 = 표시 순서).
  photoTokens: z.array(MealPhotoToken).max(MEAL_MAX_PHOTOS_PER_ENTRY).default([]),
  // 인식 결과 원본 보존용(선택).
  recognition: z
    .object({
      model: z.string().max(120).nullable(),
      version: z.number().int().nullable(),
      dishes: z.array(z.unknown()).max(50),
    })
    .nullable()
    .optional(),
});
export type CreateMealEntryInputType = z.infer<typeof CreateMealEntryInput>;

// 수정 — items/photoTokens 를 보내면 전량 교체(부분 패치 아님. 편집 화면이 항상 전체를 들고 있다).
export const UpdateMealEntryInput = CreateMealEntryInput.partial().omit({ recognition: true });
export type UpdateMealEntryInputType = z.infer<typeof UpdateMealEntryInput>;

const boolParam = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === '1' || v === 'true'));

export const ListMealEntriesQuery = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  slot: MealSlot.optional(),
  // 커서 = 직전 페이지 마지막 항목의 eatenAt(ISO). 같은 시각이 여럿이면 id 로 tie-break.
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  // 사진 URL 이 필요 없는 목록에서 페이로드를 줄이려는 용도.
  withPhotos: boolParam,
});
export type ListMealEntriesQueryType = z.infer<typeof ListMealEntriesQuery>;

export const ListMealEntriesResult = z.object({
  items: z.array(MealEntry),
  nextCursor: z.string().nullable(),
});
export type ListMealEntriesResultType = z.infer<typeof ListMealEntriesResult>;

// 달력 — 월 단위 날짜별 요약(끼니 채움 표시).
export const MealCalendarQuery = z.object({ month: MonthString });
export type MealCalendarQueryType = z.infer<typeof MealCalendarQuery>;

export const MealCalendarResult = z.object({
  month: MonthString,
  days: z.array(
    z.object({
      date: DateString,
      count: z.number().int(),
      slots: z.array(MealSlot),
      hasPhoto: z.boolean(),
    }),
  ),
});
export type MealCalendarResultType = z.infer<typeof MealCalendarResult>;

// ── 사진 ────────────────────────────────────────────────────────────────────

export const UploadMealPhotoResult = z.object({
  token: MealPhotoToken,
  // JWT 필요한 경로 — <img src> 로 직접 못 쓴다(훅이 blob 으로 받는다).
  previewUrl: z.string(),
  thumbUrl: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  byteSize: z.number().int(),
});
export type UploadMealPhotoResultType = z.infer<typeof UploadMealPhotoResult>;

// ── 사진 인식 ───────────────────────────────────────────────────────────────

export const RecognizeMealInput = z.object({
  photoTokens: z.array(MealPhotoToken).min(1).max(MEAL_MAX_PHOTOS_PER_ENTRY),
  // 장소를 알면 그 식당 등록 메뉴를 힌트로 준다(영수증 추출의 menuNames 패턴).
  placeId: z.string().max(64).nullable().optional(),
  slot: MealSlot.nullable().optional(),
});
export type RecognizeMealInputType = z.infer<typeof RecognizeMealInput>;

export const RecognizedDish = z.object({
  name: z.string(),
  // 모델이 흔들린 후보(첫 항목이 name 과 같을 수 있다) — UI 가 탭으로 바꿔 고른다.
  candidates: z.array(z.object({ name: z.string(), confidence: z.number() })),
  confidence: z.number(),
  isMain: z.boolean(),
  portion: MealPortion.nullable(),
  isDrink: z.boolean(),
  photoIndex: z.number().int(),
  // 카탈로그 매칭 스냅샷 — 못 찾으면 foodId=null.
  foodId: z.string().nullable(),
  matchedName: z.string().nullable(),
  dishType: FoodDishType.nullable(),
  mainIngredient: FoodMainIngredient.nullable(),
  cuisine: FoodCuisine.nullable(),
});
export type RecognizedDishType = z.infer<typeof RecognizedDish>;

export const RecognizeMealResult = z.object({
  dishes: z.array(RecognizedDish),
  model: z.string(),
  promptVersion: z.number().int(),
  // 인식은 됐지만 사용자 확인이 필요한 상황(빈 결과·저신뢰 다수 등).
  warning: z.string().nullable(),
});
export type RecognizeMealResultType = z.infer<typeof RecognizeMealResult>;

// ── 통계 ────────────────────────────────────────────────────────────────────

export const MealStatsQuery = z.object({
  from: DateString,
  to: DateString,
});
export type MealStatsQueryType = z.infer<typeof MealStatsQuery>;

const CountBucket = z.object({ key: z.string(), label: z.string(), count: z.number().int() });

export const MealStatsResult = z.object({
  from: DateString,
  to: DateString,
  entryCount: z.number().int(),
  itemCount: z.number().int(),
  // 기록이 있는 날 수 / 기간 일수.
  recordedDays: z.number().int(),
  totalDays: z.number().int(),
  bySlot: z.array(CountBucket),
  byDishType: z.array(CountBucket),
  byMainIngredient: z.array(CountBucket),
  byCuisine: z.array(CountBucket),
  byMealType: z.array(CountBucket),
  // 많이 먹은 음식(주식 기준) — 이름 정규화로 묶는다.
  topFoods: z.array(z.object({ name: z.string(), count: z.number().int(), lastEatenDate: DateString })),
  // 같은 음식을 7일 안에 다시 먹은 비율(0~1) — "겹침" 지표.
  repeatRate: z.number(),
  // 연속 기록 일수(오늘/마지막 기록일 기준).
  streakDays: z.number().int(),
  // 날짜별 끼니 수 — 막대 그래프용.
  byDate: z.array(z.object({ date: DateString, count: z.number().int() })),
  // 영양 집계. 값이 있는 항목만 더하므로 **실제보다 적게** 나온다 — coverage 로 그 비율을 함께
  // 내려보내 UI 가 "78% 반영"이라고 밝히게 한다. 값이 하나도 없으면 평균은 null.
  nutrition: z.object({
    avgKcalPerDay: z.number().nullable(),
    avgProteinGPerDay: z.number().nullable(),
    avgSodiumMgPerDay: z.number().nullable(),
    // 영양 값이 있는 항목 / 전체 항목(0~1).
    coverage: z.number(),
    itemsWithNutrition: z.number().int(),
  }),
});
export type MealStatsResultType = z.infer<typeof MealStatsResult>;

// ── 선호 설정 ───────────────────────────────────────────────────────────────

// 중요도 가중치 0~5. 키는 추천 점수 함수의 feature 이름과 1:1.
export const MealWeightKeys = [
  'variety',
  'taste',
  'balance',
  'health',
  'novelty',
  'weather',
  'convenience',
] as const;
export const MealWeights = z.object({
  // 겹침 피하기 — 최근 먹은 음식/분류 감점.
  variety: z.number().int().min(0).max(5),
  // 내 취향 — 자주 먹고 좋아요 한 음식 가점.
  taste: z.number().int().min(0).max(5),
  // 골고루 — 주간 분류 분포가 고르게.
  balance: z.number().int().min(0).max(5),
  // 건강 — 튀김·야식·고나트륨·술 억제, 채소·단백질 가점.
  health: z.number().int().min(0).max(5),
  // 새로운 시도 — 안 먹어본 음식 포함.
  novelty: z.number().int().min(0).max(5),
  // 날씨·계절 적합.
  weather: z.number().int().min(0).max(5),
  // 간편함 — 집밥이면 조리 난이도, 외식이면 접근성.
  convenience: z.number().int().min(0).max(5),
});
export type MealWeightsType = z.infer<typeof MealWeights>;

export const MEAL_DEFAULT_WEIGHTS: MealWeightsType = {
  variety: 4,
  taste: 4,
  balance: 3,
  health: 2,
  novelty: 2,
  weather: 1,
  convenience: 2,
};

// 프리셋 — UI 슬라이더 프리필.
export const MEAL_WEIGHT_PRESETS: Record<string, { label: string; weights: MealWeightsType }> = {
  balanced: { label: '골고루', weights: { variety: 5, taste: 3, balance: 5, health: 3, novelty: 3, weather: 1, convenience: 2 } },
  taste: { label: '내 취향대로', weights: { variety: 2, taste: 5, balance: 2, health: 1, novelty: 1, weather: 1, convenience: 3 } },
  health: { label: '가볍게·건강', weights: { variety: 3, taste: 2, balance: 4, health: 5, novelty: 2, weather: 2, convenience: 2 } },
  novelty: { label: '새로운 도전', weights: { variety: 4, taste: 2, balance: 3, health: 2, novelty: 5, weather: 2, convenience: 1 } },
};

export const MealPreference = z.object({
  weights: MealWeights,
  // 못 먹는/싫어하는 것 — 음식명뿐 아니라 **재료**도 여기에 적는다(오이·고수). 후보의 이름과
  // 카탈로그 재료 목록 양쪽에서 걸러진다(오이 → 오이냉국, 그리고 재료에 오이가 든 김밥까지).
  excludedFoods: z.array(z.string()),
  likedFoods: z.array(z.string()),
  // 주로 하는 식사 유형(후보 풀 편성).
  mealTypes: z.array(MealType),
  // 기록·추천 대상 끼니.
  slots: z.array(MealSlot),
  onboarded: z.boolean(),
  updatedAt: z.string(),
});
export type MealPreferenceType = z.infer<typeof MealPreference>;

export const UpdateMealPreferenceInput = z.object({
  weights: MealWeights.optional(),
  excludedFoods: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  likedFoods: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  mealTypes: z.array(MealType).max(5).optional(),
  slots: z.array(MealSlot).min(1).max(5).optional(),
  onboarded: z.boolean().optional(),
});
export type UpdateMealPreferenceInputType = z.infer<typeof UpdateMealPreferenceInput>;

// ── 추천 ────────────────────────────────────────────────────────────────────

export const MealRecommendationStatus = z.enum(['done', 'fallback', 'failed']);
export type MealRecommendationStatusType = z.infer<typeof MealRecommendationStatus>;

export const CreateMealRecommendationInput = z.object({
  targetDate: DateString,
  targetSlot: MealSlot,
  mealType: MealType.nullable().optional(),
  // 사용자가 덧붙이는 한 줄(예: "가볍게", "국물 있는 걸로").
  note: z.string().max(120).nullable().optional(),
  // 날씨 반영용 좌표(선택) — 없으면 weather 가중치는 0 취급.
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  // 같은 날·끼니·프로필이면 캐시된 결과를 준다. true 면 새로 호출.
  force: z.boolean().default(false),
});
export type CreateMealRecommendationInputType = z.infer<typeof CreateMealRecommendationInput>;

export const MealRecommendationItem = z.object({
  name: z.string(),
  foodId: z.string().nullable(),
  dishType: FoodDishType.nullable(),
  mainIngredient: FoodMainIngredient.nullable(),
  cuisine: FoodCuisine.nullable(),
  // 왜 이걸 골랐는지 1~2문장(LLM). 폴백은 템플릿 문장.
  reason: z.string(),
  // 근거 태그 — '2주간 안 먹음', '단백질 보충', '비 오는 날' 등.
  tags: z.array(z.string()),
  // 결정적 점수(0~1 정규화) — 정렬·디버깅 표시.
  score: z.number(),
  // 마지막으로 먹은 날(있으면).
  lastEatenDate: DateString.nullable(),
  // 주재료(레시피 출처가 있는 음식만, 최대 5개). 없으면 빈 배열.
  ingredients: z.array(z.string()),
});
export type MealRecommendationItemType = z.infer<typeof MealRecommendationItem>;

export const MealRecommendationFeedback = z.object({
  // 사용자가 고른 음식 이름(있으면).
  pickedName: z.string().nullable(),
  // 👍 1 / 👎 -1 / 미평가 null.
  rating: z.number().int().min(-1).max(1).nullable(),
  // "이거 먹었어요" 로 만든 기록 id.
  eatenEntryId: z.string().nullable(),
});
export type MealRecommendationFeedbackType = z.infer<typeof MealRecommendationFeedback>;

export const MealRecommendation = z.object({
  id: z.string(),
  targetDate: DateString,
  targetSlot: MealSlot,
  items: z.array(MealRecommendationItem),
  // 한 줄 총평.
  summary: z.string(),
  status: MealRecommendationStatus,
  model: z.string().nullable(),
  promptVersion: z.number().int(),
  // 기록이 적어 추천 근거가 약할 때의 안내(콜드 스타트 등).
  notice: z.string().nullable(),
  feedback: MealRecommendationFeedback.nullable(),
  createdAt: z.string(),
});
export type MealRecommendationType = z.infer<typeof MealRecommendation>;

export const ListMealRecommendationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListMealRecommendationsQueryType = z.infer<typeof ListMealRecommendationsQuery>;

export const ListMealRecommendationsResult = z.object({
  items: z.array(MealRecommendation),
});
export type ListMealRecommendationsResultType = z.infer<typeof ListMealRecommendationsResult>;

export const MealRecommendationFeedbackInput = z.object({
  pickedName: z.string().max(60).nullable().optional(),
  rating: z.number().int().min(-1).max(1).nullable().optional(),
  eatenEntryId: z.string().max(64).nullable().optional(),
});
export type MealRecommendationFeedbackInputType = z.infer<typeof MealRecommendationFeedbackInput>;

// 추천 화면 진입 시 한 번에 필요한 것 — 프로필 요약(기록 수·최근 먹은 것)과 캐시된 추천.
export const MealRecommendationContext = z.object({
  entryCount: z.number().int(),
  recentFoods: z.array(z.string()),
  preference: MealPreference,
  latest: MealRecommendation.nullable(),
});
export type MealRecommendationContextType = z.infer<typeof MealRecommendationContext>;
