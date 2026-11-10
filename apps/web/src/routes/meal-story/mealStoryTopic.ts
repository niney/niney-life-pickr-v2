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

/** 건강식단 목록의 한 줄 소개 — 로그인 전 목록과 식단 안 목록이 같이 쓴다. */
export const MEAL_STORY_INTRO = '주제 하나를 장면으로 넘겨 봐요 — 줄이는 방법, 만들어 먹는 레시피, 바꿔 먹기까지.';

export const mealStoryTopicLabel = (topic: MealStoryTopicType | null): string =>
  topic ? `${NUTRIENT_LABEL[topic.nutrient]} ${topic.direction === 'reduce' ? '줄이기' : '채우기'}` : '건강식단';
