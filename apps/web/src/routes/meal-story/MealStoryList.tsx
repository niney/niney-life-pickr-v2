import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useMealStories } from '@repo/shared';
import { MEAL_PATH } from '../meal/mealPaths';
import { MealStoryCards } from './MealStoryCards';
import { MEAL_STORY_INTRO } from './mealStoryTopic';

// 건강식단 목록(로그인 전) — 식단의 공개 얼굴. 사이트 메뉴 '식단'이 로그인 전에는 여기로 온다(MealEntry). 게시일 최근 순.
// 로그인한 사람은 같은 주소에서 식단 셸 안의 목록(MealStoriesPage)을 본다.
export const MealStoryList = () => {
  const stories = useMealStories();
  const items = stories.data?.items ?? [];
  return (
    <main className="msl">
      <div className="msl-head">
        <Link to="/">
          <ArrowLeft className="size-4" aria-hidden /> Life Pickr
        </Link>
        {/* 로그인하면 식단 홈으로 — 기록을 쌓으면 이야기 속 '내 숟가락'이 내 평균으로 찬다. */}
        <Link to={`/login?next=${encodeURIComponent(MEAL_PATH.home)}`}>로그인하고 식단 기록하기</Link>
      </div>
      <h1 className="meal-title">건강식단</h1>
      <p className="msl-intro">{MEAL_STORY_INTRO}</p>
      {stories.isLoading ? (
        <Loader2 className="mt-8 size-5 animate-spin" aria-label="불러오는 중" />
      ) : items.length === 0 ? (
        <p className="msl-empty">아직 올라온 이야기가 없어요.</p>
      ) : (
        <MealStoryCards items={items} />
      )}
    </main>
  );
};
