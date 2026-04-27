import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import {
  applyCssVars,
  configureApi,
  lightTheme,
  QUERY_GC_TIME,
  QUERY_STALE_TIME,
  ThemeProvider,
  useAuthStore,
} from '@repo/shared';
import { App } from './App';
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

applyCssVars(lightTheme, document.documentElement);

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider mode="light">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
