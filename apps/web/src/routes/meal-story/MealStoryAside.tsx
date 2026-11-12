import { Link } from 'react-router-dom';
import type { MealStorySceneType, MealStoryType } from '@repo/api-contract';
import { MEAL_STORY_PATH } from '../meal/mealPaths';
import { RecordRecipeButton, ShareStoryButton } from './mealStoryActions';
import { mealStoryKicker } from './mealStoryTopic';

// 이야기 옆 칸(2026-11-10) — 식단 셸 안의 넓은 화면에서 재생기 카드 오른쪽에 놓는다(세로 영상 옆이 비어 있었다).
// 무슨 이야기인지(주제·제목·요약), 장면 차례(누르면 그 장면으로 — 지금 장면 표시), 끝까지 보지 않아도 쓸 수 있는
// 기록·레시피·공유 단추. 영상·글 보기가 같이 쓴다 — 지금 장면과 건너뛰기는 재생기가 넘긴다.
// 좁은 화면·로그인 전(전체 화면)에는 그리지 않는다 — 거기서는 누르기·밀기로 넘기고 단추는 마무리 장면에 있다.

/** 차례에 적을 장면 이름 — 장면이 화면에 보이는 제목 그대로(표지는 이야기 제목과 같아 '처음'). */
const sceneName = (scene: MealStorySceneType): string => {
  switch (scene.type) {
    case 'cover':
      return '처음';
    case 'ingredients':
      return `${scene.title} · ${scene.servings}인분`;
    case 'step':
      return `만드는 법 ${scene.number} / ${scene.total}`;
    default:
      return scene.title;
  }
};

// 지금 장면이 차례의 보이는 자리 밖이면(장면이 많아 차례가 스크롤될 때) 보이는 자리로 옮긴다. 지금 장면 단추에만 다는 ref —
// 지금 장면이 바뀔 때만 React 가 새 단추로 부른다(함수가 늘 같아 다시 그릴 때는 부르지 않는다).
const showCurrent = (el: HTMLButtonElement | null): void => {
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
};

export const MealStoryAside = ({
  story,
  current,
  onPick,
  onLeave,
}: {
  story: MealStoryType;
  /** 지금 장면(0부터). */
  current: number;
  onPick: (index: number) => void;
  /** 레시피로 떠나기 직전 — 영상은 돌아올 장면을 주소에 적는다. */
  onLeave?: () => void;
}) => {
  const outro = story.scenes[story.scenes.length - 1];
  const actions = outro?.type === 'outro' ? outro.actions : [];
  return (
    <aside className="msa" aria-label="이야기 차례">
      <div>
        <p className="msa-kicker">
          건강식단 · {mealStoryKicker(story)}
          {story.status === 'draft' ? ' · 초안' : ''}
        </p>
        <h1 className="msa-title">{story.title}</h1>
        {story.summary ? <p className="msa-summary">{story.summary}</p> : null}
      </div>
      <ol className="msa-scenes">
        {story.scenes.map((scene, i) => (
          <li key={i}>
            <button
              ref={i === current ? showCurrent : undefined}
              type="button"
              className="msa-scene"
              aria-current={i === current ? 'step' : undefined}
              onClick={() => onPick(i)}
            >
              <span className="msa-no" aria-hidden>
                {i + 1}
              </span>
              <span className="msa-name">{sceneName(scene)}</span>
            </button>
          </li>
        ))}
      </ol>
      {story.recipe || actions.includes('share') ? (
        <div className="msa-actions">
          {actions.includes('record') ? <RecordRecipeButton story={story} /> : null}
          {actions.includes('recipe') && story.recipe ? (
            <Link to={MEAL_STORY_PATH.recipe(story.slug)} className="mss-btn" onClick={onLeave}>
              레시피 전체 보기
            </Link>
          ) : null}
          {actions.includes('share') ? <ShareStoryButton story={story} /> : null}
        </div>
      ) : null}
    </aside>
  );
};
