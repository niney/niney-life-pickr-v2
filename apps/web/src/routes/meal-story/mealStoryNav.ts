import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MEAL_STORY_PATH } from '../meal/mealPaths';

// 스토리 재생기 공통 — 글로 보기(장면 넘기기)와 영상으로 보기(@remotion/player)가 같은 손짓·주소 규칙을 쓴다.
//   오른쪽 누르기·왼쪽으로 밀기 = 다음, 왼쪽 30% 누르기·오른쪽으로 밀기 = 이전.
//   주소 ?s=N(1부터) = 지금 장면, ?view=text|motion = 고른 보기(없으면 '동작 줄이기'가 아니면 영상). 기록을 쌓지 않는다.

export const SWIPE_PX = 48;
export const TAP_PX = 10;
export const PREV_ZONE = 0.3;

export const isInteractive = (target: EventTarget | null): boolean =>
  target instanceof Element && !!target.closest('a, button, summary, input, select, textarea, label');

// 처음 그릴 때 한 번 — 키보드(←·→)를 바로 받게. 함수가 늘 같아 다시 그려도 다시 부르지 않는다.
export const focusOnMount = (el: HTMLElement | null): void => {
  el?.focus({ preventScroll: true });
};

/** 주소 ?s= → 장면 번호(0부터). 숫자가 아니면 첫 장면, 범위를 넘으면 끝 장면. */
export const sceneIndexFrom = (raw: string | null, total: number): number => {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), total) - 1 : 0;
};

export type StoryView = 'text' | 'motion';

/** 지금 장면·보기를 주소에 — 바꿀 것만 넘긴다. */
export const useStoryParams = () => {
  const [params, setParams] = useSearchParams();
  const update = (change: { index?: number; view?: StoryView }) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (change.index !== undefined) next.set('s', String(change.index + 1));
        if (change.view) next.set('view', change.view);
        return next;
      },
      { replace: true },
    );
  return { params, update };
};

/** 닫기 — 앞 화면에서 왔으면 뒤로, 주소로 바로 들어왔으면 목록으로. */
export const useCloseStory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(MEAL_STORY_PATH.list);
  };
};
