import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuthStore, useMealStories } from '@repo/shared';
import { MEAL_PATH, MEAL_STORY_PATH } from '../meal/mealPaths';
import { mealStoryTopicLabel } from './mealStoryTopic';

// 건강식단 목록 — 누구나. 게시일 최근 순(관리자는 초안도, '초안' 표시).
export const MealStoryList = () => {
  const stories = useMealStories();
  const token = useAuthStore((s) => s.token);
  const items = stories.data?.items ?? [];
  return (
    <main className="msl">
      <div className="msl-head">
        <Link to="/">
          <ArrowLeft className="size-4" aria-hidden /> Life Pickr
        </Link>
        {token ? <Link to={MEAL_PATH.home}>내 식단</Link> : null}
      </div>
      <h1 className="meal-title">건강식단</h1>
      <p className="msl-intro">주제 하나를 장면으로 넘겨 봐요 — 줄이는 방법, 만들어 먹는 레시피, 바꿔 먹기까지.</p>
      {stories.isLoading ? (
        <Loader2 className="mt-8 size-5 animate-spin" aria-label="불러오는 중" />
      ) : items.length === 0 ? (
        <p className="msl-empty">아직 올라온 이야기가 없어요.</p>
      ) : (
        <ul className="msl-grid">
          {items.map((s) => (
            <li key={s.slug}>
              <Link to={MEAL_STORY_PATH.story(s.slug)} className="msl-card">
                {s.coverUrl ? (
                  <img src={s.coverUrl} alt="" className="msl-cover" loading="lazy" />
                ) : (
                  <div className="msl-cover msl-cover-text" aria-hidden>
                    {mealStoryTopicLabel(s.topic)}
                  </div>
                )}
                <div className="msl-body">
                  <p className="msl-kicker">
                    {mealStoryTopicLabel(s.topic)} · {s.sceneCount}장면{s.status === 'draft' ? ' · 초안' : ''}
                  </p>
                  <h2 className="msl-title">{s.title}</h2>
                  <p className="msl-summary">{s.summary}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
