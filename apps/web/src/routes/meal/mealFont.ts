import { useEffect } from 'react';

// 식단 글꼴(원티드 산스, 쓰는 글자만 받는 분할판) — 식단 셸과 건강식단 스토리 화면이 들어올 때 한 번만 붙인다.
const WANTED_SANS_ID = 'meal-font-wanted-sans';
const WANTED_SANS_CSS =
  'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css';

/** 문서 head(외부)에 붙이는 일이라 effect. */
export const useMealFont = (): void => {
  useEffect(() => {
    if (document.getElementById(WANTED_SANS_ID)) return;
    const link = document.createElement('link');
    link.id = WANTED_SANS_ID;
    link.rel = 'stylesheet';
    link.href = WANTED_SANS_CSS;
    document.head.appendChild(link);
  }, []);
};
