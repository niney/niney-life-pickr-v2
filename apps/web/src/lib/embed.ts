import { isLpEmbedded } from '@repo/shared';

// 앱 WebView 임베드 판정 — 상단바·사이드바 없이 본문만 그린다(PublicLayout).
//  1. `?embed=1` 쿼리(첫 진입). 한 번 보이면 sessionStorage 에 남겨 WebView 안에서 링크로 이동한
//     다음 페이지(공유 페이지·내 타로 기록)도 크롬 없이 이어진다 — 링크마다 쿼리를 달지 않아도 되게.
//  2. 앱이 브리지를 주입했으면(window.__LP_EMBED__ / ReactNativeWebView) 쿼리 없이도 임베드.
const KEY = 'lp:embed';

export const isEmbedMode = (params: URLSearchParams): boolean => {
  if (params.get('embed') === '1') {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      // 저장 불가 환경(프라이빗 모드 등) — 이번 페이지만 임베드.
    }
    return true;
  }
  if (isLpEmbedded()) return true;
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
