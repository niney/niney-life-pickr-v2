import { useEffect } from 'react';
import {
  useActiveAutoDiscoverJobStore,
  useAutoDiscoverJob,
  useCancelAutoDiscover,
  useConfirmAutoDiscover,
  useStartAutoDiscover,
} from '@repo/shared';
import { AutoDiscoverForm } from '~/components/admin/auto-discover/AutoDiscoverForm';
import { AutoDiscoverJobCard } from '~/components/admin/auto-discover/AutoDiscoverJobCard';

// 어드민 "맛집 자동 발견" 페이지. 입력 폼 → 백엔드 잡 시작 → SSE 로 진행 카드
// 라이브 갱신. 잡은 actor 당 1개 — 이미 진행 중이면 새 잡 시작 비활성.

export const AdminAutoDiscoverPage = () => {
  const activeJobId = useActiveAutoDiscoverJobStore((s) => s.jobId);
  const clearActiveJob = useActiveAutoDiscoverJobStore((s) => s.clear);

  const job = useAutoDiscoverJob(activeJobId);
  const startMutation = useStartAutoDiscover();
  const cancelMutation = useCancelAutoDiscover();
  const confirmMutation = useConfirmAutoDiscover();

  const snapshot = job.data;
  const isJobRunning =
    snapshot?.state === 'pending' || snapshot?.state === 'running';

  // 잡 종료 후 60 초 뒤 자동 정리. 즉시 비우면 결과 확인 못 함.
  // useEffect 가 적절한 케이스 — 외부 시스템(타이머) 동기화.
  const finalState = !isJobRunning ? (snapshot?.state ?? null) : null;
  useEffect(() => {
    if (!finalState) return undefined;
    if (finalState === 'pending' || finalState === 'running') return undefined;
    const t = setTimeout(() => clearActiveJob(), 60_000);
    return () => clearTimeout(t);
  }, [finalState, clearActiveJob]);

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6">
      <AutoDiscoverForm
        isJobRunning={isJobRunning}
        isStarting={startMutation.isPending}
        onStart={(input) => {
          startMutation.mutate(input);
        }}
      />

      {startMutation.isError && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {(startMutation.error as Error | null)?.message ?? '잡 시작 실패'}
        </div>
      )}

      {snapshot && (
        <AutoDiscoverJobCard
          snapshot={snapshot}
          onCancel={() => {
            if (activeJobId) cancelMutation.mutate(activeJobId);
          }}
          onClose={() => clearActiveJob()}
          onConfirm={() => {
            if (activeJobId) confirmMutation.mutate(activeJobId);
          }}
          canCancel={!cancelMutation.isPending}
          isConfirming={confirmMutation.isPending}
        />
      )}
    </div>
  );
};
