import { z } from 'zod';
import {
  FoodCuisine,
  FoodDishType,
  MEAL_STORY_IMAGE_PATTERN,
  MEAL_STORY_SLUG_PATTERN,
  MealStatsNutrientKey,
  MealStoryAction,
  MealStoryIcon,
  MealStoryNutrient,
  MealStoryStatus,
  MealStoryTopic,
} from '@repo/api-contract';

// 건강식단 스토리 원고(content/meal-stories/<slug>/story.json)와 재료 값 파일(foods.json, build:meal-stories 가 만든다)의
// 형식 — 서버·스크립트만 쓴다(웹이 받는 모양은 @repo/api-contract 의 MealStory).
//
// 원고에는 숫자를 적지 않는다. 숫자는 아래 MealStoryValueRef 로 가리킨다:
//   { kdri: 'sodium' }                         2020 한국인 영양소 섭취기준(성인 기준, 나이별 차이는 서버가 덧말로)
//   { kdri: 'fiber', sex: 'female' }           남녀 값이 다른 기준(식이섬유 30g·20g, 칼슘 800mg·700mg)은 성별을 골라 나란히 보인다
//   { food: 'spaghetti', nutrient, grams }     foods 의 100g당 값 × 그램
//   { foods: [{ food, grams }, …], nutrient }  섞은 값(예: 건면 40g + 통밀 40g) — 식품마다 100g당 값 × 그램의 합
//   { recipe: 'sodiumMg', part?: 'sauce' }     레시피 1인분 합계(part 를 주면 그 묶음 재료만)
//   { my: 'sodium' }                           보는 사람의 최근 2주 하루 평균(로그인했을 때만, 화면이 채운다)
//   { value, unit, source }                    출처가 있는 고정값 — sources 의 id 를 꼭 단다
// 글자 수 상한은 휴대폰 360px 화면 한 장에 들어가게 잡았다.

/** 원고가 가리킬 수 있는 섭취기준 — 서버 표(meal-story.defs 의 KDRI_KIND)와 같은 이름. */
export const MEAL_STORY_KDRI_KEYS = ['sodium', 'potassium', 'fiber', 'calcium', 'vitaminC'] as const;
export type MealStoryKdriKey = (typeof MEAL_STORY_KDRI_KEYS)[number];
/** 영양 탭과 같은 주의 문구를 붙일 수 있는 영양소. */
export const MEAL_STORY_CAUTION_KEYS = ['potassium', 'fiber', 'calcium'] as const;
export type MealStoryCautionKey = (typeof MEAL_STORY_CAUTION_KEYS)[number];

const Id = z.string().max(40).regex(MEAL_STORY_SLUG_PATTERN, '소문자·숫자·하이픈만');
const ImageName = z.string().max(60).regex(MEAL_STORY_IMAGE_PATTERN, '소문자·숫자·하이픈 + .jpg/.png/.webp');
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const text = (max: number) => z.string().trim().min(1).max(max);

export const MealStoryValueRef = z.union([
  z.object({ kdri: z.enum(MEAL_STORY_KDRI_KEYS), sex: z.enum(['male', 'female']).optional() }).strict(),
  z.object({ food: Id, nutrient: MealStoryNutrient, grams: z.number().positive().max(5000) }).strict(),
  z
    .object({
      foods: z
        .array(z.object({ food: Id, grams: z.number().positive().max(5000) }).strict())
        .min(2)
        .max(4),
      nutrient: MealStoryNutrient,
    })
    .strict(),
  z.object({ recipe: MealStoryNutrient, part: Id.optional() }).strict(),
  z.object({ my: MealStatsNutrientKey }).strict(),
  z.object({ value: z.number().finite(), unit: z.enum(['mg', 'g', 'kcal', '%']), source: Id }).strict(),
]);
export type MealStoryValueRefType = z.infer<typeof MealStoryValueRef>;

const Figure = z.object({ label: text(24), value: MealStoryValueRef }).strict();

export const MealStoryScriptScene = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('cover'),
      kicker: text(16),
      title: text(32),
      subtitle: text(70).optional(),
      image: ImageName.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('stat'),
      title: text(32),
      figures: z.array(Figure).min(1).max(3),
      note: text(90).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('bars'),
      title: text(32),
      bars: z
        .array(
          z
            .object({
              label: text(24),
              value: MealStoryValueRef,
              aside: MealStoryValueRef.optional(),
              highlight: z.boolean().optional(),
            })
            .strict(),
        )
        .min(2)
        .max(4),
      note: text(90).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('list'),
      title: text(32),
      items: z
        .array(z.object({ title: text(22), text: text(70).optional(), icon: MealStoryIcon.optional() }).strict())
        .min(2)
        .max(6),
      note: text(90).optional(),
    })
    .strict(),
  z.object({ type: z.literal('ingredients'), title: text(32) }).strict(),
  z.object({ type: z.literal('step'), step: z.number().int().min(1).max(8) }).strict(),
  z
    .object({
      type: z.literal('nutrition'),
      title: text(32),
      nutrients: z.array(MealStoryNutrient).min(2).max(6),
      // 영양 탭과 같은 주의 문구(meal-nutrition.defs 의 caution)를 붙인다.
      cautions: z.array(z.enum(MEAL_STORY_CAUTION_KEYS)).max(2).optional(),
      note: text(90).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('outro'),
      title: text(32),
      text: text(90).optional(),
      actions: z.array(MealStoryAction).min(1).max(4),
    })
    .strict(),
]);
export type MealStoryScriptSceneType = z.infer<typeof MealStoryScriptScene>;

const num = z.number().nonnegative().nullable().optional();
export const MealStoryPer100 = z
  .object({
    kcal: num,
    carbG: num,
    proteinG: num,
    fatG: num,
    sugarG: num,
    fiberG: num,
    sodiumMg: num,
    potassiumMg: num,
    calciumMg: num,
    vitaminCMg: num,
  })
  .strict();
export type MealStoryPer100Type = z.infer<typeof MealStoryPer100>;

const count = z.number().int().nonnegative().optional();
export const MealStoryPer100Counts = z
  .object({ kcal: count, carbG: count, proteinG: count, fatG: count, sugarG: count, fiberG: count, sodiumMg: count, potassiumMg: count, calciumMg: count, vitaminCMg: count })
  .strict();
export type MealStoryPer100CountsType = z.infer<typeof MealStoryPer100Counts>;

// 식약처 표준데이터 식품코드(R101-024020002-0000 · P113-206020400-0227).
const FoodCode = z.string().regex(/^[A-Z]\d{3}-\d{9}-\d{4}$/, '식품코드 형식(R101-024020002-0000)');

export const MealStoryFoodSpec = z
  .object({
    id: Id,
    label: text(30),
    // 한 식품 — raw = 원재료성 식품 표준데이터(15100065), processed = 가공식품 표준데이터(15100066).
    ref: z.object({ db: z.enum(['raw', 'processed']), code: FoodCode }).strict().optional(),
    // 여러 제품의 중앙값 — 식품명이 all 을 모두, any 중 하나를 품고 none 은 없는 행(category 는 식품대분류명).
    group: z
      .object({
        db: z.enum(['raw', 'processed']),
        all: z.array(text(20)).min(1).max(4),
        any: z.array(text(20)).max(6).optional(),
        none: z.array(text(20)).max(8).optional(),
        category: text(30).optional(),
        min: z.number().int().min(2).max(50).optional(),
      })
      .strict()
      .optional(),
    // 표준데이터에 없는 식품 — 값과 출처를 직접 적는다(check 가 사람 확인 목록에 올린다).
    manual: z.object({ per100: MealStoryPer100, source: Id, note: text(80).optional() }).strict().optional(),
  })
  .strict()
  .refine((f) => [f.ref, f.group, f.manual].filter(Boolean).length === 1, {
    message: 'ref·group·manual 중 하나만 적는다',
  });
export type MealStoryFoodSpecType = z.infer<typeof MealStoryFoodSpec>;

export const MealStoryRecipeSpec = z
  .object({
    name: text(30),
    servings: z.number().int().min(1).max(4),
    // 카탈로그 음식으로 맞출 때의 조리형태·요리 계통([이 레시피로 기록]). 계통을 적지 않으면 'other'.
    dishType: FoodDishType,
    cuisine: FoodCuisine.optional(),
    ingredients: z
      .array(
        z
          .object({
            food: Id,
            grams: z.number().positive().max(2000),
            label: text(24),
            note: text(30).optional(),
            // 묶음(예: sauce) — { recipe, part } 가 이 묶음 재료만 더한다.
            part: Id.optional(),
            // 영상 소품 그림(재료가 냄비로 날아든다) — 없으면 첫 글자.
            icon: MealStoryIcon.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    steps: z
      .array(z.object({ text: text(100), tip: text(60).optional(), image: ImageName.optional(), icon: MealStoryIcon.optional() }).strict())
      .min(1)
      .max(8),
  })
  .strict();
export type MealStoryRecipeSpecType = z.infer<typeof MealStoryRecipeSpec>;

export const MealStorySourceSpec = z
  .object({ id: Id, label: text(100), url: z.string().url().max(300).optional() })
  .strict();

export const MealStoryScript = z
  .object({
    slug: z.string().max(60).regex(MEAL_STORY_SLUG_PATTERN),
    status: MealStoryStatus,
    title: text(32),
    summary: text(90),
    topic: MealStoryTopic.strict().optional(),
    publishedAt: DateString,
    reviewedAt: DateString.nullable(),
    cover: ImageName.optional(),
    sources: z.array(MealStorySourceSpec).max(12),
    foods: z.array(MealStoryFoodSpec).max(30),
    recipe: MealStoryRecipeSpec.optional(),
    scenes: z.array(MealStoryScriptScene).min(3).max(14),
  })
  .strict();
export type MealStoryScriptType = z.infer<typeof MealStoryScript>;

// foods.json — build:meal-stories 가 표준데이터에서 채운 100g당 값. 손으로 고치지 않는다.
export const MealStoryFoodsFile = z
  .object({
    generatedBy: z.literal('build:meal-stories'),
    foods: z.record(
      z.string(),
      z
        .object({
          per100: MealStoryPer100,
          // 기준량(100g·100ml)
          basis: z.enum(['100g', '100ml']),
          provenance: text(240),
          source: Id,
          // 묶음 중앙값이면 고른 제품 수와 이름 몇 개. counts — 값을 적은 제품이 묶음보다 적은 영양소만(식이섬유는 라벨에
          // 없는 제품이 많다). 화면이 'N개 제품의 중앙값'이라고 밝힌다.
          matched: z
            .object({
              count: z.number().int().positive(),
              names: z.array(z.string()).max(10),
              counts: MealStoryPer100Counts.optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type MealStoryFoodsFileType = z.infer<typeof MealStoryFoodsFile>;
