import { useSyncExternalStore } from 'react';
import type { MealStoryType } from '@repo/api-contract';
import { WANTED_SANS_ID, ensureFontStylesheet } from '../meal/mealFont';
import { FONT_LOADS, FONT_STYLESHEETS, motionFontText } from './motion/fonts';

// 영상(종이 오리기)의 글꼴 준비 — 손글씨 제목은 개구(Gaegu, OFL), 숫자·작은 글은 식단 글꼴(원티드 산스).
// 둘 다 글자 묶음별로 나뉜 분할판이라 글자가 처음 그려질 때 조각을 받는다 → 그대로 두면 영상이 도는 중에 제목 글꼴이
// 바뀐다(표지 제목이 재생 시작 0.6초 넘게 다른 글꼴이었다). 스토리 글자를 미리 받고, 다 받았거나 WAIT_MS 가 지나면
// 재생을 시작한다. 글꼴(브라우저 바깥 자원)의 준비 여부를 스토리별로 들고 있다가 React 에 알린다(구독).

const HAND_FONT_ID = 'meal-story-hand-font';
/** 글꼴이 늦어도 영상을 이보다 오래 붙잡지 않는다(그 뒤에 오면 그때 바뀐다). */
const WAIT_MS = 1500;

interface FontEntry {
  ready: boolean;
  subscribe: (onChange: () => void) => () => void;
}

const entries = new Map<string, FontEntry>();
const READY: FontEntry = { ready: true, subscribe: () => () => {} };

const stylesheetLoaded = (link: HTMLLinkElement): Promise<void> =>
  new Promise((resolve) => {
    if (link.sheet) {
      resolve();
      return;
    }
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });

/**
 * 스토리의 글꼴을 받기 시작한다(스토리마다 한 번 — 다시 불러도 같은 것). 스토리 응답이 오자마자 부르면 재생기 코드를
 * 받는 동안 글꼴도 함께 온다.
 */
export const startStoryFonts = (story: MealStoryType): FontEntry => {
  // 글꼴 API 가 없는 환경(테스트 jsdom)은 기다리지 않는다.
  if (typeof document === 'undefined' || typeof document.fonts?.load !== 'function') return READY;
  const hit = entries.get(story.slug);
  if (hit) return hit;
  const listeners = new Set<() => void>();
  const entry: FontEntry = {
    ready: false,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
  entries.set(story.slug, entry);
  const done = () => {
    if (entry.ready) return;
    entry.ready = true;
    for (const l of listeners) l();
  };
  const text = motionFontText(story);
  window.setTimeout(done, WAIT_MS);
  void Promise.all([
    stylesheetLoaded(ensureFontStylesheet(WANTED_SANS_ID, FONT_STYLESHEETS.wanted)),
    stylesheetLoaded(ensureFontStylesheet(HAND_FONT_ID, FONT_STYLESHEETS.hand)),
  ])
    .then(() => Promise.all(FONT_LOADS.map((font) => document.fonts.load(font, text))))
    .then(done, done);
  return entry;
};

/** 이 스토리의 영상 글꼴이 준비됐는지 — 준비되면 다시 그린다. */
export const useStoryFontsReady = (story: MealStoryType): boolean => {
  const entry = startStoryFonts(story);
  return useSyncExternalStore(entry.subscribe, () => entry.ready);
};
