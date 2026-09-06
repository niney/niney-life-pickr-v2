// 앱 WebView 임베드 브리지 — 웹(apps/web)이 앱(apps/mobile) WebView 안에서 열릴 때의 계약.
//
// 앱 → 웹: 페이지 로드 전에 `window.__LP_EMBED__` 를 주입한다(injectedJavaScriptBeforeContentLoaded).
//   웹은 부팅 시 이 값을 읽어 세션 토큰·게스트 키를 자기 스토어에 넣는다 — 앱에서 로그인한 회원은
//   WebView 안에서도 회원이고, 게스트 키는 앱이 보관한 값을 써서 기기 한도·오늘의 카드 잠금이 앱과
//   WebView 사이에 일치한다. URL 에 토큰을 싣지 않는다(로그·리퍼러 노출).
// 웹 → 앱: `window.ReactNativeWebView.postMessage(JSON)` — 공유 시트·외부 링크처럼 WebView 가 못
//   하는 일을 앱에 맡긴다. 앱은 type 으로 분기하고 모르는 type 은 무시한다.

export interface LpEmbedInit {
  token: string | null;
  guestKey: string | null;
  // 앱 화면 모드 — 웹 테마를 맞출 때 쓴다(없으면 웹 기본).
  theme?: 'light' | 'dark';
}

export type LpEmbedMessage =
  // OS 공유 시트(링크). WebView 는 navigator.share 가 없거나 제한적이다.
  | { type: 'share'; url: string; title?: string }
  // 외부 브라우저로 열기(이미지 저장 등 WebView 가 다운로드를 못 하는 경우).
  | { type: 'open'; url: string }
  // 웹 문서 제목 — 앱 헤더 타이틀 동기화용(선택).
  | { type: 'title'; title: string };

declare global {
  interface Window {
    __LP_EMBED__?: LpEmbedInit;
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

// 웹에서: 앱 WebView 안인지.
export const isLpEmbedded = (): boolean =>
  typeof window !== 'undefined' && (!!window.__LP_EMBED__ || !!window.ReactNativeWebView);

// 웹에서: 주입값 읽기(없으면 null).
export const readLpEmbedInit = (): LpEmbedInit | null =>
  typeof window !== 'undefined' && window.__LP_EMBED__ ? window.__LP_EMBED__ : null;

// 웹에서: 앱으로 메시지. 앱 밖이면 false(호출자가 브라우저 대안을 쓴다).
export const postLpEmbedMessage = (msg: LpEmbedMessage): boolean => {
  if (typeof window === 'undefined' || !window.ReactNativeWebView) return false;
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
};

// 앱에서: 주입 스크립트. 값은 JSON 으로 직렬화해 문자열 주입 시 인젝션이 없게 한다.
export const buildLpEmbedInjection = (init: LpEmbedInit): string =>
  `window.__LP_EMBED__ = ${JSON.stringify(init)}; true;`;

// 앱에서: WebView 메시지 파싱. 계약 밖이면 null.
export const parseLpEmbedMessage = (raw: string): LpEmbedMessage | null => {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.type === 'share' && typeof o.url === 'string') {
    return { type: 'share', url: o.url, ...(typeof o.title === 'string' ? { title: o.title } : {}) };
  }
  if (o.type === 'open' && typeof o.url === 'string') return { type: 'open', url: o.url };
  if (o.type === 'title' && typeof o.title === 'string') return { type: 'title', title: o.title };
  return null;
};
