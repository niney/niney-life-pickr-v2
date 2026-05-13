import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// 글로벌 머지 잡(전역 메뉴 통계 산출 LLM 잡) 활성 ID 보관. 식당 정규화 잡과
// 동일한 패턴 — 다른 어드민 페이지로 이동했다 돌아오거나 새로고침해도 진행
// 카드가 유지되도록 store + localStorage persist.
//
// 별도 store 인 이유: 식당 정규화(activeGroupingJob) 와 전역 머지는 동시에
// 실행 가능한 독립 잡이라 단일 슬롯에 합치면 안 됨.
//
// 자동 정리: useGlobalMergeJob 훅이 GET snapshot 호출 시 404 면 clear()
// — stale jobId 로 SSE 무한 재연결 시도 방지.

interface ActiveGlobalMergeJobState {
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  clear: () => void;
}

export const useActiveGlobalMergeJobStore = create<ActiveGlobalMergeJobState>()(
  persist(
    (set) => ({
      jobId: null,
      setJobId: (jobId) => set({ jobId }),
      clear: () => set({ jobId: null }),
    }),
    {
      name: 'lp:activeGlobalMergeJob',
      storage: createJSONStorage(() =>
        typeof window === 'undefined'
          ? {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            }
          : window.localStorage,
      ),
    },
  ),
);
