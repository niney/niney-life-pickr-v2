import type { MealStoryTopicNutrientType, MealStoryTopicType, MealStoryType } from '@repo/api-contract';

// 스토리 주제 이름 — '나트륨 줄이기' · '식이섬유 채우기'.
const NUTRIENT_LABEL: Record<MealStoryTopicNutrientType, string> = {
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
  kcal: '열량',
};

/** 건강식단 목록의 한 줄 소개 — 로그인 전 목록과 식단 안 목록이 같이 쓴다. */
export const MEAL_STORY_INTRO = '주제 하나를 장면으로 넘겨 봐요 — 줄이는 방법, 만들어 먹는 레시피, 바꿔 먹기까지.';

export const mealStoryTopicLabel = (topic: MealStoryTopicType | null): string =>
  topic ? `${NUTRIENT_LABEL[topic.nutrient]} ${topic.direction === 'reduce' ? '줄이기' : '채우기'}` : '건강식단';

/**
 * 목록 카드의 이름 — 그 편의 머리말(원고 표지의 kicker, '국수 열량 줄이기'), 없으면 주제 이름. 주제 이름만 쓰면 한 주제에 편이
 * 여럿일 때 카드가 똑같아 보인다. 내 기록에 잇는 규칙(meal/mealStoryMatch)은 그대로 주제(topic)로 맞춘다.
 */
export const mealStoryCardLabel = (story: { kicker?: string | null; topic: MealStoryTopicType | null }): string =>
  story.kicker || mealStoryTopicLabel(story.topic);

/** 이야기 한 편(전체 응답)의 머리말 — 표지 장면의 kicker, 없으면 주제 이름. 이야기 옆 칸이 목록 카드와 같은 이름을 쓴다. */
export const mealStoryKicker = (story: Pick<MealStoryType, 'scenes' | 'topic'>): string => {
  const cover = story.scenes.find((s) => s.type === 'cover');
  return (cover?.type === 'cover' ? cover.kicker : '') || mealStoryTopicLabel(story.topic);
};
