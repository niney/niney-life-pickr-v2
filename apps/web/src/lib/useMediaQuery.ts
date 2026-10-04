import { useCallback, useSyncExternalStore } from 'react';

// CSS 미디어 쿼리를 React 상태로 — 레이아웃을 CSS 이중 마운트(hidden xl:flex / xl:hidden) 대신
// JS 분기로 가를 때 쓴다(지도 인스턴스·패널을 한 벌만 두고 싶은 페이지). matchMedia 가 없는
// 환경(jsdom·SSR)에선 fallback 을 그대로 돌려준다 — 테스트는 기본값(데스크톱)으로 렌더되고,
// 모바일 분기는 matchMedia 를 목으로 바꿔 본다.
export const useMediaQuery = (query: string, fallback = false): boolean => {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query, supported],
  );
  const getSnapshot = useCallback(
    () => (supported ? window.matchMedia(query).matches : fallback),
    [query, supported, fallback],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
};

// Tailwind `xl`(80rem = 1280px) 과 같은 조건 — 공개 지도 페이지들이 데스크톱 3-column 과
// 모바일 시트 패턴을 가르는 기준. matchMedia 가 없으면 데스크톱으로 본다.
export const useIsDesktopXl = (): boolean => useMediaQuery('(min-width: 80rem)', true);

// Tailwind `lg`(64rem = 1024px) — 식단 화면이 두 단으로 펼치는 기준. 데스크톱에서만 부르는 요청(목록 옆 최근 7일
// 요약)·기본 선택(달력의 오늘)을 가른다. matchMedia 가 없으면 좁은 화면으로 본다(테스트가 예전 동작 그대로).
export const useIsDesktopLg = (): boolean => useMediaQuery('(min-width: 64rem)', false);
