import { createContext, useContext } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';

// 식단 상세·수정·새 기록을 여는 길(2026-11-08 리뉴얼 3단계).
//
// 데스크톱(1024px~)은 본문 위 오른쪽 패널로 띄운다 — 주소는 그대로(/meal/:id·/meal/:id/edit·/meal/new)라 새로고침·공유가
// 되고, 뒤에 깔린 화면(배경 위치)은 기록 상태(history.state)에 담는다. 선언형 BrowserRouter 라 데이터 라우터의 mask 를
// 못 써서 react-router 예제(modal)와 같은 방식이다. 주소로 바로 열면(배경 없음) 한 화면으로 연다.
// 좁은 화면은 패널 없이 화면을 바꾸고, 들어가고 나올 때 패널처럼 밀려 들어오는 전환(View Transitions)을 준다.

export interface MealPanelState {
  /** 패널 뒤에 깔린 화면. */
  mealBackground: Location;
  /** 상세 패널의 ↑↓(이전·다음) — 연 목록의 기록 순서. */
  mealSiblings?: string[];
}

export const mealPanelStateOf = (location: Location): MealPanelState | null => {
  const state = location.state as Partial<MealPanelState> | null;
  if (!state || typeof state !== 'object' || !state.mealBackground) return null;
  return state as MealPanelState;
};

/** 상세·입력이 그려지는 틀 — 화면(page) 또는 패널(데스크톱). 패널 경로가 감싼다(MealApp). */
export type MealFrame = { type: 'page' } | { type: 'panel'; kind: 'detail' | 'form' };

export const MealFrameContext = createContext<MealFrame>({ type: 'page' });

export const useMealFrame = (): MealFrame => useContext(MealFrameContext);

export interface MealPanelEnv {
  /** 패널로 여는가(데스크톱). 끄면 화면을 바꾼다. */
  panelsOn: boolean;
  /** 지금 떠 있는 패널의 배경 — 패널이 없으면 null. */
  background: Location | null;
  /** 패널이 보여 주는 기록(상세·수정) — 뒤 목록에서 그 줄을 표시한다. */
  openEntryId: string | null;
}

export const MealPanelEnvContext = createContext<MealPanelEnv>({
  panelsOn: false,
  background: null,
  openEntryId: null,
});

export const useMealPanelEnv = (): MealPanelEnv => useContext(MealPanelEnvContext);

export interface MealLinkTarget {
  to: string;
  state?: MealPanelState;
  replace?: boolean;
}

export interface MealLinkOptions {
  /** 상세 ↑↓ 에 쓸 목록 순서. */
  siblings?: string[];
  /** 떠 있는 상세 패널의 내용만 바꾼다(기록 한 칸으로 — 뒤로 = 닫기). */
  swap?: boolean;
}

/**
 * 상세·수정·새 기록으로 가는 링크 값 — `<Link {...link(to)}>`·`navigate(t.to, t)`.
 * 패널이 이미 떠 있으면 그 배경을 그대로 물려준다(패널 하나에 쌓기: 달력 → 기록 → 수정).
 */
export const useMealLink = (): ((to: string, opts?: MealLinkOptions) => MealLinkTarget) => {
  const env = useMealPanelEnv();
  // 배경 화면 안에서는 배경 위치, 패널 안에서는 실제 위치가 나온다(<Routes location> 이 위치 문맥을 바꾼다).
  const location = useLocation();
  return (to, opts = {}) => {
    if (!env.panelsOn) return { to };
    const background = env.background ?? location;
    const state: MealPanelState = { mealBackground: background };
    if (opts.siblings) state.mealSiblings = opts.siblings;
    return { to, state, replace: env.background !== null && opts.swap === true };
  };
};

// ── 좁은 화면의 화면 전환 ──────────────────────────────────────────────────────
// BrowserRouter 는 위치 바꿈을 startTransition 으로 그려서 flushSync 로 바로 그려지지 않는다 — 전환 콜백이 새 위치가
// 실제로 그려질 때(MealApp 의 레이아웃 효과)까지 기다리게 한다. 오래 걸리면(처음 받는 화면 조각) 그냥 끝낸다.
const COMMIT_WAIT_MS = 900;
let resolvePendingCommit: (() => void) | null = null;

/** MealApp 이 새 위치를 그린 직후 부른다. */
export const notifyMealLocationCommitted = (): void => {
  const resolve = resolvePendingCommit;
  resolvePendingCommit = null;
  resolve?.();
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
};

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 화면을 바꾸며 밀려 들어오는(forward)·나가는(back) 전환을 건다. 지원하지 않거나 움직임 줄이기면 그냥 바꾼다. */
export const runMealViewTransition = (direction: 'forward' | 'back', go: () => void): void => {
  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    go();
    return;
  }
  const root = document.documentElement;
  root.dataset.mealNav = direction;
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        resolvePendingCommit = resolve;
        go();
        window.setTimeout(resolve, COMMIT_WAIT_MS);
      }),
  );
  void transition.finished.finally(() => {
    if (root.dataset.mealNav === direction) delete root.dataset.mealNav;
  });
};

/**
 * 패널 닫기·화면에서 나가기 — 들어온 곳으로 돌아간다(뒤로 = 닫기). 주소로 바로 열어 돌아갈 곳이 없으면 fallback 으로.
 * 좁은 화면은 나가는 전환을 건다.
 */
export const useMealLeave = (fallback: string): (() => void) => {
  const navigate = useNavigate();
  const location = useLocation();
  const env = useMealPanelEnv();
  return () => {
    const go = () => {
      if (location.key !== 'default') navigate(-1);
      else if (env.background)
        navigate(`${env.background.pathname}${env.background.search}`, { replace: true });
      else navigate(fallback, { replace: true });
    };
    if (env.background) go();
    else runMealViewTransition('back', go);
  };
};

/**
 * 상세·수정·새 기록으로 이동 — 데스크톱은 패널, 좁은 화면은 전환과 함께 화면을 바꾼다.
 * replace 를 주면 그 값이 swap 계산보다 앞선다.
 */
export const useMealOpen = (): ((
  to: string,
  opts?: MealLinkOptions & { replace?: boolean },
) => void) => {
  const navigate = useNavigate();
  const link = useMealLink();
  const env = useMealPanelEnv();
  return (to, opts = {}) => {
    const target = link(to, opts);
    const go = () =>
      navigate(target.to, { state: target.state, replace: opts.replace ?? target.replace });
    if (env.panelsOn) go();
    else runMealViewTransition('forward', go);
  };
};
