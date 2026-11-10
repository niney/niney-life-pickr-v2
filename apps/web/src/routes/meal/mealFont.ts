import { useEffect } from 'react';

// 식단 글꼴(원티드 산스, 쓰는 글자만 받는 분할판) — 식단 셸과 건강식단 스토리 화면이 들어올 때 한 번만 붙인다.
export const WANTED_SANS_ID = 'meal-font-wanted-sans';
export const WANTED_SANS_CSS =
  'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css';

/** 글꼴 CSS 를 문서 head 에 한 번만 붙이고 그 link 를 돌려준다(이미 있으면 그것). */
export const ensureFontStylesheet = (id: string, href: string): HTMLLinkElement => {
  const found = document.getElementById(id);
  if (found instanceof HTMLLinkElement) return found;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  return link;
};

/** 문서 head(외부)에 붙이는 일이라 effect. */
export const useMealFont = (): void => {
  useEffect(() => {
    ensureFontStylesheet(WANTED_SANS_ID, WANTED_SANS_CSS);
  }, []);
};
