import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// 자동 발견 잡의 활성 ID. activeDiningcodeBulkSaveJobStore 와 동형.
// 페이지 새로고침/이동 후 돌아와도 진행 카드를 이어볼 수 있게 localStorage persist.
// 자동 정리: useAutoDiscoverJob 훅이 GET snapshot 호출 시 404 면 clear.

interface ActiveAutoDiscoverJobState {
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  clear: () => void;
}

export const useActiveAutoDiscoverJobStore = create<ActiveAutoDiscoverJobState>()(
  persist(
    (set) => ({
      jobId: null,
      setJobId: (jobId) => set({ jobId }),
      clear: () => set({ jobId: null }),
    }),
    {
      name: 'lp:activeAutoDiscoverJob',
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
