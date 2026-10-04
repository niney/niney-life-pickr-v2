import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import {
  ApiError,
  applyCssVars,
  configureApi,
  darkTheme,
  handleUnauthorizedForCurrentSession,
  lightTheme,
  QUERY_GC_TIME,
  QUERY_STALE_TIME,
  readLpEmbedInit,
  setMealDraftPrincipal,
  ThemeProvider,
  useAuthStore,
  useGuestKeyStore,
} from '@repo/shared';
import { App } from './App';
import { useThemeStore } from './stores/theme';
import './styles/tailwind.css';
import './styles/global.css';

const TOKEN_KEY = 'lp:token';
const GUEST_KEY = 'lp:guest';

const storedToken = localStorage.getItem(TOKEN_KEY);
const storedGuest = localStorage.getItem(GUEST_KEY) === '1';
if (storedToken) {
  useAuthStore.setState({ token: storedToken });
} else if (storedGuest) {
  useAuthStore.setState({ isGuest: true });
}

// 앱 WebView 임베드 — 앱이 로드 전에 주입한 세션 토큰·게스트 키가 WebView 의 localStorage 보다
// 우선한다(앱에서 로그아웃/재로그인해도 WebView 가 옛 세션을 들고 있지 않게). 아래 subscribe 가
// 같은 키로 다시 저장하므로 이후 부팅도 일관된다.
const embedInit = readLpEmbedInit();
if (embedInit) {
  if (embedInit.token) useAuthStore.setState({ token: embedInit.token, isGuest: false });
  else if (storedToken) useAuthStore.setState({ token: null });
  if (embedInit.guestKey) useGuestKeyStore.setState({ guestKey: embedInit.guestKey });
}

useAuthStore.subscribe((state) => {
  if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
  else localStorage.removeItem(TOKEN_KEY);
  if (state.isGuest) localStorage.setItem(GUEST_KEY, '1');
  else localStorage.removeItem(GUEST_KEY);
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_GC_TIME,
      // 한 번만 재시도하되 4xx 는 하지 않는다 — 만료·없는 링크(410/404)나 권한 오류는 다시 물어도 답이
      // 같고, 재시도 대기(1초) 동안 에러 화면이 늦게 뜬다(공유 정산·투표 링크).
      retry: (failureCount, error) =>
        failureCount < 1 &&
        !(error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500),
      refetchOnWindowFocus: false,
    },
  },
});

configureApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: (requestToken) => {
    handleUnauthorizedForCurrentSession({
      requestToken,
      getCurrentToken: () => useAuthStore.getState().token,
      onCurrentSessionUnauthorized: () => {
        // cancelQueries 호출과 cache/session 제거는 같은 JS turn에서 시작해 중간에 다른 계정의
        // 로그인 상태가 끼어들지 않게 한다. clear()는 진행 query도 파기한다.
        void queryClient.cancelQueries();
        queryClient.clear();
        void setMealDraftPrincipal(null);
        useAuthStore.getState().clearSession();
      },
    });
  },
});

const applyMode = (mode: 'light' | 'dark') => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  applyCssVars(mode === 'dark' ? darkTheme : lightTheme, document.documentElement);
};
if (embedInit?.theme) useThemeStore.getState().setMode(embedInit.theme);
applyMode(useThemeStore.getState().mode);
useThemeStore.subscribe((state) => applyMode(state.mode));

const ThemedApp = () => {
  const mode = useThemeStore((s) => s.mode);
  return (
    <ThemeProvider mode={mode}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>,
);
