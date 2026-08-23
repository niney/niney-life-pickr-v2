import { QueryClient } from '@tanstack/react-query';
import { QUERY_GC_TIME, QUERY_STALE_TIME } from '@repo/shared';

// API bootstrap의 401 세션 정리와 루트 Provider가 반드시 같은 캐시를 다뤄야 한다.
export const mobileQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_GC_TIME,
      retry: 1,
    },
  },
});
