import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 통합 주변 겸표시 토글 — 버스 모드 '지하철역 표시' / 지하철 모드 '정류장 표시'
// 를 한 스위치로 공유(웹 transitCrossShowStore 이식). 사용자 선택이라 persist
// (AsyncStorage)로 앱 재시작 후에도 기억. 기본 on — 비동기 hydration 동안
// 기본값이 잠깐 보이는 건 허용(토글 위치만 다를 뿐 위험 없음).
interface TransitCrossShowState {
  show: boolean;
  toggle: () => void;
  setShow: (v: boolean) => void;
}

export const useTransitCrossShowStore = create<TransitCrossShowState>()(
  persist(
    (set) => ({
      show: true,
      toggle: () => set((s) => ({ show: !s.show })),
      setShow: (v) => set({ show: v }),
    }),
    {
      name: 'lp:transit-cross-show',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
