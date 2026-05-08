import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import {
  applyCssVars,
  configureApi,
  darkTheme,
  lightTheme,
  QUERY_GC_TIME,
  QUERY_STALE_TIME,
  ThemeProvider,
  useAuthStore,
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

useAuthStore.subscribe((state) => {
  if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
  else localStorage.removeItem(TOKEN_KEY);
  if (state.isGuest) localStorage.setItem(GUEST_KEY, '1');
  else localStorage.removeItem(GUEST_KEY);
});

configureApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().clearSession(),
});

const applyMode = (mode: 'light' | 'dark') => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  applyCssVars(mode === 'dark' ? darkTheme : lightTheme, document.documentElement);
};
applyMode(useThemeStore.getState().mode);
useThemeStore.subscribe((state) => applyMode(state.mode));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_GC_TIME,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
