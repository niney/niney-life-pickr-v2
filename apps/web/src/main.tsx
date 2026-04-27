import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import {
  configureApi,
  QUERY_GC_TIME,
  QUERY_STALE_TIME,
  useAuthStore,
} from '@repo/shared';
import { App } from './App';
import './styles/global.css';

const TOKEN_KEY = 'lp:token';

const storedToken = localStorage.getItem(TOKEN_KEY);
if (storedToken) {
  useAuthStore.setState({ token: storedToken });
}

useAuthStore.subscribe((state) => {
  if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
  else localStorage.removeItem(TOKEN_KEY);
});

configureApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().clearSession(),
});

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
