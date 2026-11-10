import { Loader2 } from 'lucide-react';
import type { MealStoryListItemType } from '@repo/api-contract';
import { useMealNutrition, useMealStories } from '@repo/shared';
import { MEAL_NUTRIENT_STATUS_LABEL, mealNutrientDisplayStatus } from '@repo/utils';
import { MealPageHeader } from '../meal/MealPageHeader';
import { storyDirectionFor } from '../meal/mealStoryMatch';
import { MealStoryCards } from './MealStoryCards';
import { MEAL_STORY_INTRO } from './mealStoryTopic';
import './mealStory.css';

// 건강식단 목록(식단 안) — 로그인한 사람이 /meal/stories 에서 보는 화면. 식단 셸(사이드 메뉴·하단 탭) 안의 한 구역이고,
// 메뉴 항목 없이 홈의 건강식단 줄 '모두 보기'와 이야기 화면의 '건강식단'에서 들어온다(2026-11-10: 별도 메뉴로 두지 않는다).
// 내 최근 14일 판정에 맞는 이야기('나트륨 많음' → 나트륨 줄이기)는 카드 위에 표시하고 앞에 둔다. 이야기 한 편은 전체 화면
// 재생기(MealStoryApp)로 나간다. 로그인 전에는 같은 주소가 공개 목록(MealStoryList)이다.
export const MealStoriesPage = () => {
  const stories = useMealStories();
  // 홈이 이미 부른 조회(같은 키)라 보통 다시 받지 않는다.
  const nutrition = useMealNutrition(14);
  const items = stories.data?.items ?? [];
  const analysis = nutrition.data;
  const flagOf = (s: MealStoryListItemType): string | null => {
    if (!analysis || analysis.status === 'insufficient' || !s.topic) return null;
    const n = analysis.nutrients.find((x) => x.key === s.topic?.nutrient);
    if (!n) return null;
    const shown = mealNutrientDisplayStatus(n);
    return storyDirectionFor(shown) === s.topic.direction ? `내 기록 · ${n.label} ${MEAL_NUTRIENT_STATUS_LABEL[shown]}` : null;
  };
  // 내 기록에 맞는 이야기를 앞에(그 안에서는 서버가 준 차례 — 새 것 먼저).
  const ordered = [...items].sort((a, b) => Number(flagOf(b) !== null) - Number(flagOf(a) !== null));
  return (
    <>
      <MealPageHeader title="건강식단" description={MEAL_STORY_INTRO} />
      {stories.isLoading ? (
        <Loader2 className="size-5 animate-spin" aria-label="불러오는 중" />
      ) : items.length === 0 ? (
        <p className="msl-empty">아직 올라온 이야기가 없어요.</p>
      ) : (
        <MealStoryCards items={ordered} wide flagOf={flagOf} />
      )}
    </>
  );
};
