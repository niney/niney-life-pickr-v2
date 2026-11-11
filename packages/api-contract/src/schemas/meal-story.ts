import { z } from 'zod';
import { FoodDishType } from './food.js';
import { MealNutrientKey, MealStatsNutrientKey } from './meal.js';

// 건강식단 스토리(2026-11-09) — 주제 하나(나트륨 줄이기 …)를 장면 여러 장으로 넘겨 보는 손수 만든 콘텐츠. 누구나 본다.
// 원고는 서버 파일(apps/friendly/content/meal-stories/<slug>/story.json)이고 숫자를 직접 적지 않는다 — 섭취기준·식품
// 100g당 값(식약처 표준데이터 코드)·레시피 합계·내 기록을 가리키면 서버가 값을 계산해 아래 응답에 넣는다.
// 만드는 절차는 docs/meal-story-authoring.md.

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다');

export const MEAL_STORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MEAL_STORY_IMAGE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpg|jpeg|png|webp)$/;

/** 스토리가 다루는 영양 값(100g당·1인분) — 식품 표준데이터에서 늘 채워지는 것만. */
export const MealStoryNutrient = z.enum([
  'kcal',
  'carbG',
  'proteinG',
  'fatG',
  'sugarG',
  'fiberG',
  'sodiumMg',
  'potassiumMg',
  'calciumMg',
]);
export type MealStoryNutrientType = z.infer<typeof MealStoryNutrient>;

/**
 * 영상 소품(종이로 오린 그림) — 목록 항목·재료·만드는 법 단계 옆에 움직이는 그림. 없으면 화면이 번호·첫 글자로 대신한다.
 * 새 이름은 웹 motion/paper 의 그림과 함께 늘린다.
 */
export const MealStoryIcon = z.enum([
  'bowl',
  'kimchi',
  'sauce',
  'can',
  'ramen',
  'shaker',
  'spoon',
  'lemon',
  'magnifier',
  'label',
  'dip',
  'noodle',
  'tomato',
  'onion',
  'garlic',
  'oil',
  'leaf',
  'cheese',
  'pot',
  'pan',
  'plate',
  'timer',
  'clock',
  // 식이섬유 편(2026-11-10) — 밥공기·버섯·당근·달걀·콩나물·콩·사과·물컵·참기름·간장·볶는 팬·비빔밥 그릇
  'rice',
  'mushroom',
  'carrot',
  'egg',
  'sprout',
  'bean',
  'apple',
  'water',
  'sesame',
  'soy',
  'stirfry',
  'bibimbap',
  // 칼슘 편(2026-11-11) — 우유·멸치·케일·두부·요거트·대파·깨·볶음밥 그릇
  'milk',
  'anchovy',
  'kale',
  'tofu',
  'yogurt',
  'scallion',
  'sesameseed',
  'friedrice',
]);
export type MealStoryIconType = z.infer<typeof MealStoryIcon>;

export const MealStoryStatus = z.enum(['draft', 'published']);
export type MealStoryStatusType = z.infer<typeof MealStoryStatus>;

export const MealStoryTopic = z.object({
  // 영양 탭 영양소 — 그 줄이 '많음'(reduce)·'부족'(increase)일 때 이 스토리를 잇는다.
  nutrient: MealNutrientKey,
  direction: z.enum(['reduce', 'increase']),
});
export type MealStoryTopicType = z.infer<typeof MealStoryTopic>;

/**
 * 같은 양을 다른 단위로 본 값(나트륨 → 소금) — 서버가 환산하고 근거를 숫자의 sources 에 넣는다.
 * 내 기록(my)은 서버가 값을 모르므로 value 는 null 이고, 화면이 내 값 ÷ per 로 같은 식을 쓴다.
 */
export const MealStoryEquivalent = z.object({
  // 무엇으로 바꿨는지(예: '소금').
  label: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  // 환산 단위 1 이 원래 단위로 얼마인지(소금 1g = 나트륨 400mg) — 환산 값 = 원래 값 ÷ per.
  per: z.number().positive(),
});
export type MealStoryEquivalentType = z.infer<typeof MealStoryEquivalent>;

/** 장면 속 숫자 하나 — 서버가 계산한 값과 그 근거. */
export const MealStoryFigure = z.object({
  // 계산한 값(단위대로 반올림). 내 기록(my)은 서버가 모르니 null — 화면이 통계(stats/nutrients)에서 채운다.
  value: z.number().nullable(),
  unit: z.string(),
  // 무엇의 값인지 짧게(예: '스파게티 건면 80g', '성인 하루', '1인분').
  basis: z.string().nullable(),
  // 덧말 — 서버가 표에서 만든 글(나이별 기준, 값을 모르는 재료 등).
  detail: z.string().nullable(),
  // 값의 출처 id(MealStory.sources).
  sources: z.array(z.string()),
  // 내 기록 값이면 통계 영양소 키.
  my: MealStatsNutrientKey.nullable(),
  // 다른 단위로 본 값 — 큰 숫자(stat) 장면의 나트륨 숫자에만(소금 몇 g). 없으면 null.
  equivalent: MealStoryEquivalent.nullable(),
});
export type MealStoryFigureType = z.infer<typeof MealStoryFigure>;

export const MealStoryIngredient = z.object({
  label: z.string(),
  grams: z.number(),
  note: z.string().nullable(),
  // 값을 가져온 식품 이름(원고 foods 의 label).
  food: z.string(),
  icon: MealStoryIcon.nullable(),
});
export type MealStoryIngredientType = z.infer<typeof MealStoryIngredient>;

export const MealStoryNutritionRow = z.object({
  key: MealStoryNutrient,
  label: z.string(),
  figure: MealStoryFigure,
});
export type MealStoryNutritionRowType = z.infer<typeof MealStoryNutritionRow>;

export const MealStoryAction = z.enum(['record', 'recipe', 'share', 'stats']);
export type MealStoryActionType = z.infer<typeof MealStoryAction>;

const ImageUrl = z.string().nullable();

export const MealStoryScene = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cover'),
    kicker: z.string(),
    title: z.string(),
    subtitle: z.string().nullable(),
    image: ImageUrl,
  }),
  z.object({
    type: z.literal('stat'),
    title: z.string(),
    figures: z.array(z.object({ label: z.string(), figure: MealStoryFigure })),
    note: z.string().nullable(),
  }),
  z.object({
    type: z.literal('bars'),
    title: z.string(),
    bars: z.array(
      z.object({
        label: z.string(),
        figure: MealStoryFigure,
        // 막대 옆 작은 값(예: 열량 막대 옆 단백질).
        aside: z.object({ label: z.string(), figure: MealStoryFigure }).nullable(),
        highlight: z.boolean(),
      }),
    ),
    // 막대가 둘이고 작은 쪽이 큰 쪽의 '약 N분의 1'로 말해도 될 때(서버가 두 값으로 계산 — 어림이 15% 넘게 벗어나면 null).
    // bar = 작은 막대의 차례(0부터), denominator = N.
    fraction: z.object({ bar: z.number().int(), denominator: z.number().int() }).nullable(),
    note: z.string().nullable(),
  }),
  z.object({
    type: z.literal('list'),
    title: z.string(),
    items: z.array(z.object({ title: z.string(), text: z.string().nullable(), icon: MealStoryIcon.nullable() })),
    note: z.string().nullable(),
  }),
  z.object({
    type: z.literal('ingredients'),
    title: z.string(),
    servings: z.number().int(),
    items: z.array(MealStoryIngredient),
  }),
  z.object({
    type: z.literal('step'),
    number: z.number().int(),
    total: z.number().int(),
    text: z.string(),
    tip: z.string().nullable(),
    image: ImageUrl,
    icon: MealStoryIcon.nullable(),
  }),
  z.object({
    type: z.literal('nutrition'),
    title: z.string(),
    servings: z.number().int(),
    rows: z.array(MealStoryNutritionRow),
    cautions: z.array(z.string()),
    note: z.string().nullable(),
  }),
  z.object({
    type: z.literal('outro'),
    title: z.string(),
    text: z.string().nullable(),
    actions: z.array(MealStoryAction),
  }),
]);
export type MealStorySceneType = z.infer<typeof MealStoryScene>;

export const MealStorySourceRef = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string().nullable(),
});

export const MealStory = z.object({
  slug: z.string(),
  status: MealStoryStatus,
  title: z.string(),
  summary: z.string(),
  topic: MealStoryTopic.nullable(),
  publishedAt: DateString,
  // 검수일 — 사람이 출처·숫자를 확인한 날. 초안은 null 일 수 있다.
  reviewedAt: DateString.nullable(),
  coverUrl: z.string().nullable(),
  scenes: z.array(MealStoryScene),
  recipe: z
    .object({
      name: z.string(),
      servings: z.number().int(),
      dishType: FoodDishType,
      ingredients: z.array(MealStoryIngredient),
      steps: z.array(z.object({ text: z.string(), tip: z.string().nullable(), image: ImageUrl })),
      // 1인분 영양(원고의 영양 장면과 같은 계산).
      nutrition: z.array(MealStoryNutritionRow),
    })
    .nullable(),
  sources: z.array(MealStorySourceRef),
});
export type MealStoryType = z.infer<typeof MealStory>;

export const MealStoryListItem = z.object({
  slug: z.string(),
  status: MealStoryStatus,
  title: z.string(),
  summary: z.string(),
  topic: MealStoryTopic.nullable(),
  publishedAt: DateString,
  coverUrl: z.string().nullable(),
  sceneCount: z.number().int(),
  // 이 스토리 레시피를 맞춘 카탈로그 음식 id — 누군가 [이 레시피로 기록]을 누른 적이 있을 때만 있다(없으면 null).
  // 식단 기록 상세가 항목의 foodId 와 맞춰 '이 레시피 이야기 보기'를 잇는다.
  recipeFoodId: z.string().nullable(),
});
export type MealStoryListItemType = z.infer<typeof MealStoryListItem>;

export const MealStoryListResult = z.object({ items: z.array(MealStoryListItem) });
export type MealStoryListResultType = z.infer<typeof MealStoryListResult>;

export const MealStorySlugParams = z.object({
  slug: z.string().max(60).regex(MEAL_STORY_SLUG_PATTERN),
});

export const MealStoryImageParams = z.object({
  slug: z.string().max(60).regex(MEAL_STORY_SLUG_PATTERN),
  file: z.string().max(60).regex(MEAL_STORY_IMAGE_PATTERN),
});

/** [이 레시피로 기록] — 레시피를 카탈로그 음식으로 맞춘 결과. 새 기록 화면이 이 음식으로 항목을 채운다. */
export const MealStoryFoodResult = z.object({
  foodId: z.string(),
  name: z.string(),
  dishType: FoodDishType,
});
export type MealStoryFoodResultType = z.infer<typeof MealStoryFoodResult>;
