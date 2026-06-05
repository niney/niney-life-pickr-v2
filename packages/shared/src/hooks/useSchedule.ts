import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ScheduleConfigInputType,
  ScheduleProgressEventType,
  ScheduleRunType,
} from '@repo/api-contract';
import { buildScheduleRunEventsUrl, scheduleApi } from '../api/schedule.api.js';

export const useScheduleConfig = () =>
  useQuery({
    queryKey: ['schedule', 'config'],
    queryFn: scheduleApi.getConfig,
  });

export const useScheduleRuns = () =>
  useQuery({
    queryKey: ['schedule', 'runs'],
    queryFn: scheduleApi.listRuns,
  });

export const useUpdateScheduleConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleConfigInputType) => scheduleApi.updateConfig(input),
    onSuccess: (cfg) => {
      qc.setQueryData(['schedule', 'config'], cfg);
    },
  });
};

export const useRunScheduleNow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => scheduleApi.runNow(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', 'runs'] });
      qc.invalidateQueries({ queryKey: ['schedule', 'config'] });
    },
  });
};

// 저장 전 cron 미리보기 — cronExpr/timezone 변경 시 자동 검증 + 다음 실행 시각.
// enabled 로 호출 시점 제어(빈 입력 등에서 끄기). caller 가 입력 디바운스.
export const useSchedulePreview = (
  cronExpr: string,
  timezone: string,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['schedule', 'preview', cronExpr, timezone],
    queryFn: () => scheduleApi.preview({ cronExpr, timezone }),
    enabled: enabled && cronExpr.trim().length > 0,
  });

// 진행 중 run 의 SSE 구독 — manual "지금 실행" 또는 cron tick 진행을 live 로.
// enabled=true 일 때만 연결하고, done 이벤트에서 schedule/analytics 캐시를
// 무효화한다(머지 결과가 통계에 반영되도록). global-merge 훅과 같은 재연결 백오프.
export const useScheduleRunEvents = (
  enabled: boolean,
): { progress: ScheduleProgressEventType | null } => {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ScheduleProgressEventType | null>(null);
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
      qc.invalidateQueries({ queryKey: ['schedule', 'runs'] });
      qc.invalidateQueries({ queryKey: ['schedule', 'config'] });
      // 머지 결과가 전역 통계/overview 에 반영되도록.
      qc.invalidateQueries({ queryKey: ['analytics'] });
    };

    const connect = async (): Promise<void> => {
      if (cancelled || closed) return;
      const url = await buildScheduleRunEventsUrl();
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse((e as MessageEvent).data) as ScheduleRunType | null;
          if (snap && snap.status === 'running') {
            setProgress({
              type: 'progress',
              runId: snap.runId,
              phase: snap.phase ?? 'collecting',
              processed: snap.processedCount,
              total: snap.totalTargets ?? 0,
              skipped: snap.skippedCount,
              currentName: null,
            });
          }
          retry = 0;
        } catch {
          // ignore
        }
      });

      es.addEventListener('progress', (e) => {
        try {
          setProgress(JSON.parse((e as MessageEvent).data) as ScheduleProgressEventType);
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
