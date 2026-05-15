import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// 다이닝코드 정식 페이지의 일괄 저장 잡 활성 ID. activeGroupingJobStore 와 동일 패턴.
// 페이지 새로고침/이동 후 돌아와도 진행 카드를 이어볼 수 있게 localStorage 에 persist.
//
// 자동 정리: useDiningcodeBulkSaveJob 훅이 GET snapshot 호출 시 404 면 clear.

interface ActiveDiningcodeBulkSaveJobState {
  jobId: string | null;
  setJobId: (jobId: string | null) => void;
  clear: () => void;
}

export const useActiveDiningcodeBulkSaveJobStore =
  create<ActiveDiningcodeBulkSaveJobState>()(
    persist(
      (set) => ({
        jobId: null,
        setJobId: (jobId) => set({ jobId }),
        clear: () => set({ jobId: null }),
      }),
      {
        name: 'lp:activeDiningcodeBulkSaveJob',
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
