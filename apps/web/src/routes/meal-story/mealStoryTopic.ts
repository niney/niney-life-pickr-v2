import type { MealNutrientKeyType, MealStoryTopicType } from '@repo/api-contract';

// 스토리 주제 이름 — '나트륨 줄이기' · '식이섬유 채우기'.
const NUTRIENT_LABEL: Record<MealNutrientKeyType, string> = {
  protein: '단백질',
  fiber: '식이섬유',
  calcium: '칼슘',
  iron: '철',
  potassium: '칼륨',
  vitaminA: '비타민 A',
  vitaminD: '비타민 D',
  thiamin: '티아민',
  riboflavin: '리보플라빈',
  niacin: '니아신',
  vitaminC: '비타민 C',
  sodium: '나트륨',
  magnesium: '마그네슘',
  zinc: '아연',
  folate: '엽산',
};

export const mealStoryTopicLabel = (topic: MealStoryTopicType | null): string =>
  topic ? `${NUTRIENT_LABEL[topic.nutrient]} ${topic.direction === 'reduce' ? '줄이기' : '채우기'}` : '건강식단';
