import { MealStoryStore } from './meal-story.store.js';

// 스토리 파일 저장소 하나를 API 라우트와 공유 링크 미리보기(OG)가 함께 쓴다(같은 캐시). 폴더는 부를 때마다
// MEAL_STORY_DIR(없으면 content/meal-stories)에서 읽어, 테스트가 픽스처 폴더로 바꿀 수 있다.

let store: MealStoryStore | null = null;

export const mealStoryStore = (logger?: { warn: (obj: object, msg: string) => void }): MealStoryStore => {
  store ??= new MealStoryStore({ recheckMs: process.env.NODE_ENV === 'test' ? 0 : 5_000, logger });
  return store;
};
