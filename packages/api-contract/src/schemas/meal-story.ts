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
]);
export type MealStoryNutrientType = z.infer<typeof MealStoryNutrient>;

export const MealStoryStatus = z.enum(['draft', 'published']);
export type MealStoryStatusType = z.infer<typeof MealStoryStatus>;

export const MealStoryTopic = z.object({
  // 영양 탭 영양소 — 그 줄이 '많음'(reduce)·'부족'(increase)일 때 이 스토리를 잇는다.
  nutrient: MealNutrientKey,
  direction: z.enum(['reduce', 'increase']),
});
export type MealStoryTopicType = z.infer<typeof MealStoryTopic>;

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
});
export type MealStoryFigureType = z.infer<typeof MealStoryFigure>;

export const MealStoryIngredient = z.object({
  label: z.string(),
  grams: z.number(),
  note: z.string().nullable(),
  // 값을 가져온 식품 이름(원고 foods 의 label).
  food: z.string(),
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
    note: z.string().nullable(),
  }),
  z.object({
    type: z.literal('list'),
    title: z.string(),
    items: z.array(z.object({ title: z.string(), text: z.string().nullable() })),
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
