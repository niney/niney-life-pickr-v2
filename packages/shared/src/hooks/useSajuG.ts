import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type {
  CreateSajuGReadingInputType,
  SajuGChartType,
  SajuGReadingResultType,
} from '@repo/api-contract';
import { sajuGApi } from '../api/saju-g.api.js';
import { getGuestKey } from '../stores/guestKeyStore.js';
import { useAuthStore } from '../stores/authStore.js';

export function useSajuGReading() {
  const [chart, setChart] = useState<SajuGChartType | null>(null);
  const [result, setResult] = useState<SajuGReadingResultType | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const cancel = useCallback(() => {
    sequence.current++;
    abort.current?.abort();
  }, []);
  useEffect(() => cancel, [cancel]);
  const start = useCallback(
    async (input: CreateSajuGReadingInputType) => {
      cancel();
      const seq = sequence.current;
      const principal = useAuthStore.getState().user?.id ?? 'guest';
      const current = () =>
        seq === sequence.current && principal === (useAuthStore.getState().user?.id ?? 'guest');
      const controller = new AbortController();
      abort.current = controller;
      setError(null);
      setPending(true);
      setResult(null);
      setChart(null);
      try {
        const calculated = await sajuGApi.chart(input, controller.signal);
        if (!current()) return;
        setChart(calculated);
        const reading = await sajuGApi.reading(input, getGuestKey(), controller.signal);
        if (current()) {
          setResult(reading);
          setChart(reading.chart);
        }
      } catch (e) {
        if (current() && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
      } finally {
        if (current()) setPending(false);
      }
    },
    [cancel],
  );
  const reset = useCallback(() => {
    cancel();
    setChart(null);
    setResult(null);
    setError(null);
    setPending(false);
  }, [cancel]);
  return { chart, result, pending, error, start, reset, setResult };
}
export function useMySajuGReadings() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useInfiniteQuery({
    queryKey: ['saju-g', 'mine', userId],
    enabled: !!userId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => sajuGApi.listMine(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
  });
}
