import { Link } from 'react-router-dom';
import { useMealStories } from '@repo/shared';
import { MEAL_STORY_PATH } from './mealPaths';
import { findStoryFor, storyDirectionFor } from './mealStoryMatch';

/**
 * 이 영양소를 다루는 건강식단 이야기로 가는 한 줄 — '많음'이면 줄이는 이야기, '부족'·'조금 부족'이면 채우는 이야기(가장 새 것).
 * 맞는 이야기가 없으면 아무것도 그리지 않는다. 영양 탭의 영양소 줄과 통계의 영양소 흐름이 같이 쓴다.
 * 초안(관리자에게만 온다)이면 '(초안)'을 붙인다.
 */
export const NutrientStoryLink = ({ nutrient, status }: { nutrient: string; status: string | null | undefined }) => {
  const stories = useMealStories();
  const story = findStoryFor(stories.data?.items ?? [], nutrient, status);
  if (!story) return null;
  return (
    <Link to={MEAL_STORY_PATH.story(story.slug)} className="inline-block text-xs font-bold underline underline-offset-4">
      {storyDirectionFor(status) === 'reduce' ? '줄이는 법' : '채우는 법'} 보기 — {story.title}
      {story.status === 'draft' ? ' (초안)' : ''}
    </Link>
  );
};
