import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateSajuPairInputType,
  SajuPairChartType,
  SajuPairResultType,
} from '@repo/api-contract';
import { sajuApi } from '../api/saju.api.js';
import { getGuestKey } from '../stores/guestKeyStore.js';
import { useAuthStore } from '../stores/authStore.js';

export function useSajuPairReading() {
  const [chart, setChart] = useState<SajuPairChartType | null>(null);
  const [result, setResult] = useState<SajuPairResultType | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const reset = useCallback(() => {
    sequence.current++;
    abort.current?.abort();
    setChart(null);
    setResult(null);
    setPending(false);
    setError(null);
  }, []);
  useEffect(
    () => () => {
      sequence.current++;
      abort.current?.abort();
    },
    [],
  );
  const start = useCallback(
    async (input: CreateSajuPairInputType) => {
      reset();
      const seq = sequence.current;
      const principal = useAuthStore.getState().user?.id ?? 'guest';
      const current = () =>
        seq === sequence.current && principal === (useAuthStore.getState().user?.id ?? 'guest');
      const controller = new AbortController();
      abort.current = controller;
      setPending(true);
      try {
        const value = await sajuApi.pairChart(input, controller.signal);
        if (!current()) return;
        setChart(value);
        const completed = await sajuApi.pairReading(input, getGuestKey(), controller.signal);
        if (current()) {
          setChart(completed.chart);
          setResult(completed);
        }
      } catch (e) {
        if (current() && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
      } finally {
        if (current()) setPending(false);
      }
    },
    [reset],
  );
  return { chart, result, pending, error, start, reset };
}
