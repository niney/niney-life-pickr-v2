import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// AI 분석 관리 페이지의 메뉴 정규화 잡(MenuGroupingJob) 활성 ID 를 어드민
// 페이지 단위로 들고 다닌다. 잡 자체는 서버 in-memory 레지스트리에서 돌아가고
// SSE 로 진행을 push 받으므로, 클라이언트는 jobId 만 들고 있으면 충분.
//
// 왜 store 인가:
// AdminAnalyticsPage 로컬 state 였을 때는 다른 어드민 페이지로 이동했다 돌아오면
// 컴포넌트가 다시 마운트되면서 jobId 가 null 로 초기화 → 진행 카드가 사라졌다.
// store 로 끌어올리고 localStorage 에 persist 해서 새로고침까지 견디게 한다.
//
// 자동 정리: useGroupingJob 훅이 GET snapshot 호출 시 404(잡이 서버에서 만료/
// 삭제됨)면 clear 호출 — stale jobId 가 남아 무한 SSE 재연결 시도되는 것 방지.

interface ActiveGroupingJobState {
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  clear: () => void;
}

export const useActiveGroupingJobStore = create<ActiveGroupingJobState>()(
  persist(
    (set) => ({
      jobId: null,
      setJobId: (jobId) => set({ jobId }),
      clear: () => set({ jobId: null }),
    }),
    {
      name: 'lp:activeGroupingJob',
      // SSR / 모바일(RN) 환경 안전 — window 없으면 localStorage 호출 안 함.
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
