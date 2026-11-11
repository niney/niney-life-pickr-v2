import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useMealStory } from '@repo/shared';
import { MEAL_STORY_PATH } from '../meal/mealPaths';
import { AmountText } from './MealStoryFigure';
import { RecordRecipeButton, ShareStoryButton } from './mealStoryActions';
import { useLeaveStory } from './mealStoryNav';

// 레시피 전체 보기 — 요리하면서 보는 한 장(스크롤). 재료·만드는 법·1인분 영양정보·출처.
// 나가는 단추는 왼쪽 위 '← 뒤로' 하나(이야기·식단 상세와 같다) — 이야기에서 왔으면 그 장면으로, 기록 상세에서 왔으면 그
// 기록으로 돌아간다. 주소로 바로 들어왔으면 이 레시피의 이야기로 간다. 이야기로 가는 길은 제목 아래 한 줄이 따로 있다.
export const MealStoryRecipe = () => {
  const { slug = '' } = useParams();
  const q = useMealStory(slug);
  const { leave, label: backLabel } = useLeaveStory({ to: MEAL_STORY_PATH.story(slug), label: '이야기' });
  const story = q.data;
  const back = (
    <div className="msl-head">
      <button type="button" className="msp-back" onClick={leave}>
        <ArrowLeft className="size-5" aria-hidden />
        {backLabel}
      </button>
    </div>
  );
  if (!story) {
    return (
      <main className="msr">
        {back}
        {q.isLoading ? <Loader2 className="size-5 animate-spin" aria-label="불러오는 중" /> : <p>레시피를 찾지 못했어요.</p>}
      </main>
    );
  }
  const recipe = story.recipe;
  return (
    <main className="msr">
      {back}
      <p className="msr-kicker">건강식단 레시피{story.status === 'draft' ? ' · 초안' : ''}</p>
      <h1 className="meal-title">{recipe?.name ?? story.title}</h1>
      <p className="msr-from">
        <Link to={MEAL_STORY_PATH.story(story.slug)}>
          {story.title} <span className="msr-from-go">이야기 보기</span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </p>
      {story.coverUrl ? <img src={story.coverUrl} alt="" className="msr-cover" /> : null}
      {recipe ? (
        <>
          <section className="msr-sec" aria-labelledby="msr-ingredients">
            <h2 id="msr-ingredients">재료 ({recipe.servings}인분)</h2>
            <ul className="mss-rows">
              {recipe.ingredients.map((it, i) => (
                <li key={i} className="mss-row">
                  <span className="mss-row-main">
                    <span className="mss-row-label">{it.label}</span>
                    {it.note ? <span className="mss-row-note"> · {it.note}</span> : null}
                  </span>
                  <span className="mss-row-amt">{it.grams.toLocaleString('ko-KR')}g</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="msr-sec" aria-labelledby="msr-steps">
            <h2 id="msr-steps">만드는 법</h2>
            <ol className="msr-steps">
              {recipe.steps.map((st, i) => (
                <li key={i} className="msr-step">
                  <span className="msr-step-num" aria-hidden>
                    {i + 1}
                  </span>
                  <div>
                    <p className="msr-step-text">{st.text}</p>
                    {st.tip ? (
                      <p className="mss-tip mt-2">
                        <strong>팁</strong>
                        {st.tip}
                      </p>
                    ) : null}
                    {st.image ? <img src={st.image} alt={`${i + 1}단계 사진`} loading="lazy" /> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="msr-sec" aria-labelledby="msr-nutrition">
            <div className="mss-label">
              <h2 id="msr-nutrition" className="mss-label-title">
                영양정보
              </h2>
              <p className="mss-label-sub">{recipe.servings}인분 기준</p>
              <ul>
                {recipe.nutrition.map((r) => (
                  <li key={r.key} className="mss-label-row">
                    <span>{r.label}</span>
                    <AmountText figure={r.figure} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <div className="msr-actions">
            <RecordRecipeButton story={story} />
            <ShareStoryButton story={story} />
          </div>
        </>
      ) : (
        <p className="mt-6">이 이야기에는 레시피가 없어요.</p>
      )}
      <section className="msr-sec" aria-labelledby="msr-sources">
        <h2 id="msr-sources">출처</h2>
        <ul className="msr-sources">
          {story.sources.map((s) => (
            <li key={s.id}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {s.label}
                </a>
              ) : (
                s.label
              )}
            </li>
          ))}
          <li>{story.reviewedAt ? `검수 ${story.reviewedAt}` : '검수 전 초안이에요.'}</li>
        </ul>
      </section>
    </main>
  );
};
