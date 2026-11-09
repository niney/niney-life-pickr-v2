import type { PrismaClient } from '@prisma/client';
import type { MealStoryFoodResultType, MealStoryNutrientType } from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';
import { inferFoodAllergens, serializeFoodAllergenMetadata } from '../food/food-allergen.js';
import type { LoadedMealStory } from './meal-story.store.js';

// [이 레시피로 기록] — 스토리 레시피를 카탈로그 음식(source manual, sourceId meal-story:<slug>)으로 맞춘다. 식단 기록은
// 카탈로그 행으로 영양을 계산하므로, 스토리에 보인 1인분 값이 그대로 기록에 들어가게 한다(빌린 값이 아니라 직접 값).
// 처음 누를 때 만들고, 원고 숫자가 바뀌었으면 고친다. 이름이 다른 음식과 겹치면 '(건강식단)'(그것도 겹치면 slug)을 붙인다.

export class MealStoryFoodError extends Error {
  constructor(
    readonly code: 'no_recipe' | 'name_taken',
    message: string,
  ) {
    super(message);
  }
}

const sourceIdOf = (slug: string): string => `meal-story:${slug}`;

const PER100_KEYS: readonly Exclude<MealStoryNutrientType, 'kcal'>[] = [
  'carbG',
  'proteinG',
  'fatG',
  'sugarG',
  'fiberG',
  'sodiumMg',
  'potassiumMg',
];

const round2 = (v: number): number => Math.round(v * 100) / 100;

export const recipeFoodValues = (loaded: LoadedMealStory) => {
  const recipe = loaded.story.recipe;
  const spec = loaded.script.recipe;
  if (!recipe || !spec) return null;
  const perServing = new Map(recipe.nutrition.map((r) => [r.key, r.figure.value]));
  const servingG = Math.round(spec.ingredients.reduce((s, i) => s + i.grams, 0) / spec.servings);
  const per100 = (v: number | null | undefined): number | null =>
    v === null || v === undefined || servingG <= 0 ? null : round2((v * 100) / servingG);
  const nutrients: Record<string, number> = {};
  for (const k of PER100_KEYS) {
    const v = per100(perServing.get(k));
    if (v !== null) nutrients[k] = v;
  }
  return {
    name: spec.name,
    dishType: spec.dishType,
    servingG,
    kcal: perServing.get('kcal') ?? null,
    carbG: perServing.get('carbG') ?? null,
    proteinG: perServing.get('proteinG') ?? null,
    fatG: perServing.get('fatG') ?? null,
    sodiumMg: perServing.get('sodiumMg') ?? null,
    sugarG: perServing.get('sugarG') ?? null,
    kcalPer100g: per100(perServing.get('kcal')),
    nutrientsPer100gJson: Object.keys(nutrients).length > 0 ? JSON.stringify(nutrients) : null,
    ingredients: recipe.ingredients.map((i) => i.food),
  };
};

export const ensureMealStoryFood = async (
  prisma: PrismaClient,
  loaded: LoadedMealStory,
): Promise<MealStoryFoodResultType> => {
  const values = recipeFoodValues(loaded);
  if (!values) throw new MealStoryFoodError('no_recipe', '이 스토리에는 레시피가 없습니다');
  const sourceId = sourceIdOf(loaded.script.slug);
  const allergens = serializeFoodAllergenMetadata(inferFoodAllergens(values.ingredients));
  const nutrition = {
    dishType: values.dishType,
    cuisine: 'western' as const,
    ingredientsJson: JSON.stringify(values.ingredients),
    ...allergens,
    servingG: values.servingG,
    kcal: values.kcal,
    carbG: values.carbG,
    proteinG: values.proteinG,
    fatG: values.fatG,
    sodiumMg: values.sodiumMg,
    sugarG: values.sugarG,
    kcalPer100g: values.kcalPer100g,
    nutrientsPer100gJson: values.nutrientsPer100gJson,
    nutritionFrom: null,
    sourceCategory: '건강식단',
    active: true,
  };

  const existing = await prisma.foodItem.findFirst({ where: { source: 'manual', sourceId } });
  if (existing) {
    const row = await prisma.foodItem.update({ where: { id: existing.id }, data: nutrition });
    return { foodId: row.id, name: values.name, dishType: values.dishType };
  }

  // 같은 이름의 음식이 있으면 '(건강식단)', 다른 스토리가 그 이름까지 썼으면 slug 까지 붙인다.
  for (const name of [values.name, `${values.name}(건강식단)`, `${values.name}(건강식단·${loaded.script.slug})`]) {
    const nameNorm = normalizeTerm(name);
    if (await prisma.foodItem.findUnique({ where: { nameNorm }, select: { id: true } })) continue;
    try {
      const row = await prisma.foodItem.create({
        data: {
          name,
          nameNorm,
          aliasesJson: '[]',
          aliasNormsJson: '[]',
          source: 'manual',
          sourceId,
          ...nutrition,
        },
      });
      return { foodId: row.id, name: values.name, dishType: values.dishType };
    } catch (e) {
      // 두 사람이 동시에 처음 눌렀다 — 먼저 만든 행을 쓴다.
      const raced = await prisma.foodItem.findFirst({ where: { source: 'manual', sourceId } });
      if (raced) return { foodId: raced.id, name: values.name, dishType: values.dishType };
      throw e;
    }
  }
  throw new MealStoryFoodError('name_taken', `'${values.name}' 이름의 음식이 이미 있습니다`);
};
