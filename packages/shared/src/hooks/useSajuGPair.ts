import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateSajuGPairInputType,
  SajuGPairChartType,
  SajuGPairResultType,
} from '@repo/api-contract';
import { sajuGApi } from '../api/saju-g.api.js';
import { getGuestKey } from '../stores/guestKeyStore.js';
import { useAuthStore } from '../stores/authStore.js';

export function useSajuGPairReading() {
  const [chart, setChart] = useState<SajuGPairChartType | null>(null);
  const [result, setResult] = useState<SajuGPairResultType | null>(null);
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
    async (input: CreateSajuGPairInputType) => {
      reset();
      const seq = sequence.current;
      const principal = useAuthStore.getState().user?.id ?? 'guest';
      const current = () =>
        seq === sequence.current && principal === (useAuthStore.getState().user?.id ?? 'guest');
      const controller = new AbortController();
      abort.current = controller;
      setPending(true);
      try {
        const value = await sajuGApi.pairChart(input, controller.signal);
        if (!current()) return;
        setChart(value);
        const completed = await sajuGApi.pairReading(input, getGuestKey(), controller.signal);
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
