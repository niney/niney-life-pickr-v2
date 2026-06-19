import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RandomCrawlConfigInputType,
  RandomCrawlProgressEventType,
  RandomCrawlRunType,
} from '@repo/api-contract';
import {
  buildRandomCrawlRunEventsUrl,
  randomCrawlApi,
} from '../api/randomCrawl.api.js';

const NON_TERMINAL = ['running', 'awaiting_selection', 'crawling'] as const;

export const useRandomCrawlConfig = () =>
  useQuery({
    queryKey: ['random-crawl', 'config'],
    queryFn: randomCrawlApi.getConfig,
  });

export const useRandomCrawlRuns = () =>
  useQuery({
    queryKey: ['random-crawl', 'runs'],
    queryFn: randomCrawlApi.listRuns,
  });

export const useUpdateRandomCrawlConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RandomCrawlConfigInputType) =>
      randomCrawlApi.updateConfig(input),
    onSuccess: (cfg) => {
      qc.setQueryData(['random-crawl', 'config'], cfg);
    },
  });
};

export const useRunRandomCrawlNow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => randomCrawlApi.runNow(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['random-crawl', 'runs'] });
      qc.invalidateQueries({ queryKey: ['random-crawl', 'config'] });
    },
  });
};

// 저장 전 cron 미리보기 — schedule 과 동일 패턴.
export const useRandomCrawlPreview = (
  cronExpr: string,
  timezone: string,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['random-crawl', 'preview', cronExpr, timezone],
    queryFn: () => randomCrawlApi.preview({ cronExpr, timezone }),
    enabled: enabled && cronExpr.trim().length > 0,
  });

// 전체 시도→시군구 트리 — 한 번 받아 캐시(불변에 가까움).
export const useRegionTree = () =>
  useQuery({
    queryKey: ['random-crawl', 'regions'],
    queryFn: randomCrawlApi.getRegions,
    staleTime: Infinity,
  });

// 특정 시군구의 동 목록 — sido/sigungu 가 정해졌을 때만 조회.
export const useRegionDongs = (sido: string | null, sigungu: string | null) =>
  useQuery({
    queryKey: ['random-crawl', 'dongs', sido, sigungu],
    queryFn: () => randomCrawlApi.getRegionDongs(sido!, sigungu!),
    enabled: !!sido && !!sigungu,
    staleTime: Infinity,
  });

// 진행 중 run 의 SSE 구독 — 검색/대기/크롤 단계를 live 로. done 에서 캐시 무효화.
export const useRandomCrawlRunEvents = (
  enabled: boolean,
): { progress: RandomCrawlProgressEventType | null } => {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<RandomCrawlProgressEventType | null>(
    null,
  );
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setProgress(null);
      return undefined;
    }
    let cancelled = false;
    let closed = false;
    let retry = 0;
    let reconnectId: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      closed = true;
      setProgress(null);
      qc.invalidateQueries({ queryKey: ['random-crawl', 'runs'] });
      qc.invalidateQueries({ queryKey: ['random-crawl', 'config'] });
      qc.invalidateQueries({ queryKey: ['restaurants'] });
    };

    const connect = async (): Promise<void> => {
      if (cancelled || closed) return;
      const url = await buildRandomCrawlRunEventsUrl();
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse((e as MessageEvent).data) as RandomCrawlRunType | null;
          if (snap && (NON_TERMINAL as readonly string[]).includes(snap.status)) {
            setProgress({
              type: 'progress',
              runId: snap.runId,
              phase: snap.phase ?? 'selecting_region',
              regionLabel: snap.regionLabel,
              candidates: snap.candidates,
            });
          }
          retry = 0;
        } catch {
          // ignore
        }
      });

      es.addEventListener('progress', (e) => {
        try {
          setProgress(JSON.parse((e as MessageEvent).data) as RandomCrawlProgressEventType);
          retry = 0;
        } catch {
          // ignore
        }
      });

      es.addEventListener('done', () => {
        es.close();
        finish();
      });

      es.onerror = () => {
        es.close();
        if (cancelled || closed) return;
        const backoff = Math.min(30_000, 1000 * 2 ** retry);
        retry += 1;
        reconnectId = setTimeout(() => {
          void connect();
        }, backoff);
      };
    };

    void connect();

    return () => {
      cancelled = true;
      closed = true;
      if (reconnectId) clearTimeout(reconnectId);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled, qc]);

  return { progress };
};
