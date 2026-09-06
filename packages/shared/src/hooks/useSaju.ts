import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type {
  CreateSajuReadingInputType,
  SajuChartType,
  SajuReadingResultType,
} from '@repo/api-contract';
import { sajuApi } from '../api/saju.api.js';
import { getGuestKey } from '../stores/guestKeyStore.js';
import { useAuthStore } from '../stores/authStore.js';

export function useSajuReading() {
  const [chart, setChart] = useState<SajuChartType | null>(null);
  const [result, setResult] = useState<SajuReadingResultType | null>(null);
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
    async (input: CreateSajuReadingInputType) => {
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
        const calculated = await sajuApi.chart(input, controller.signal);
        if (!current()) return;
        setChart(calculated);
        const reading = await sajuApi.reading(input, getGuestKey(), controller.signal);
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
export function useMySajuReadings() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useInfiniteQuery({
    queryKey: ['saju', 'mine', userId],
    enabled: !!userId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => sajuApi.listMine(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
  });
}
