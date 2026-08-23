import {
  FoodCuisine,
  FoodDishType,
  FoodMainIngredient,
  MealAllergen,
  MealNutritionBasis,
  type MealRecommendationFeedbackType,
  type MealRecommendationItemType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';

export const parseMealRecommendationFeedback = (json: string | null): MealRecommendationFeedbackType | null => {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<MealRecommendationFeedbackType>;
    return {
      pickedName: typeof v.pickedName === 'string' ? v.pickedName : null,
      rating: v.rating === -1 || v.rating === 1 ? v.rating : null,
      eatenEntryId: typeof v.eatenEntryId === 'string' ? v.eatenEntryId : null,
    };
  } catch {
    return null;
  }
};

export const parseMealRecommendationItems = (json: string): MealRecommendationItemType[] => {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({
        name: String(x['name'] ?? ''),
        foodId: typeof x['foodId'] === 'string' ? x['foodId'] : null,
        dishType: FoodDishType.safeParse(x['dishType']).success ? (x['dishType'] as never) : null,
        mainIngredient: FoodMainIngredient.safeParse(x['mainIngredient']).success ? (x['mainIngredient'] as never) : null,
        cuisine: FoodCuisine.safeParse(x['cuisine']).success ? (x['cuisine'] as never) : null,
        reason: String(x['reason'] ?? ''),
        tags: Array.isArray(x['tags']) ? (x['tags'] as unknown[]).filter((t): t is string => typeof t === 'string') : [],
        score: typeof x['score'] === 'number' ? x['score'] : 0,
        lastEatenDate: typeof x['lastEatenDate'] === 'string' ? x['lastEatenDate'] : null,
        ingredients: Array.isArray(x['ingredients'])
          ? (x['ingredients'] as unknown[]).filter((t): t is string => typeof t === 'string')
          : [],
        allergenWarnings: Array.isArray(x['allergenWarnings'])
          ? (x['allergenWarnings'] as unknown[]).flatMap((value) => {
              const parsed = MealAllergen.safeParse(value);
              return parsed.success ? [parsed.data] : [];
            })
          : [],
        allergenEvidence: Array.isArray(x['allergenEvidence'])
          ? (x['allergenEvidence'] as unknown[]).filter((t): t is string => typeof t === 'string')
          : [],
        allergenAssessment:
          x['allergenAssessment'] === 'possible' ||
          x['allergenAssessment'] === 'none_known' ||
          x['allergenAssessment'] === 'unknown'
            ? (x['allergenAssessment'] as MealRecommendationItemType['allergenAssessment'])
            : ('unknown' as const),
        nutritionBasis: MealNutritionBasis.safeParse(x['nutritionBasis']).success
          ? (x['nutritionBasis'] as 'direct' | 'donor_estimate' | 'missing')
          : typeof x['nutritionFrom'] === 'string'
            ? 'donor_estimate'
            : 'missing',
        nutritionFrom: typeof x['nutritionFrom'] === 'string' ? x['nutritionFrom'] : null,
      }))
      .filter((i) => i.name.length > 0);
  } catch {
    return [];
  }
};

export const findMealRecommendationCandidate = (
  itemsJson: string,
  eatenNames: readonly string[],
): string | null => {
  const candidates = new Map(
    parseMealRecommendationItems(itemsJson).map((item) => [normalizeTerm(item.name), item.name]),
  );
  for (const name of eatenNames) {
    const matched = candidates.get(normalizeTerm(name));
    if (matched) return matched;
  }
  return null;
};

export const isMealRecommendationCandidate = (itemsJson: string, name: string): boolean =>
  findMealRecommendationCandidate(itemsJson, [name]) !== null;
