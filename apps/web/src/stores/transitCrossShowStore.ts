import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 통합 주변 겸표시 토글 — 버스 탭의 '지하철역 표시' / 지하철 탭의 '정류장 표시'를
// 한 스위치로 공유한다(양 탭·데스크톱/모바일 인스턴스 공통). 데스크톱/모바일이
// CSS 숨김으로 동시 마운트라 컴포넌트 로컬 state 면 따로 놀아 스토어로 승격.
// 13차 transitFavExpandStore 관례를 따르되, 이번엔 사용자 선택이라 persist
// (localStorage)로 새로고침·재방문 후에도 기억. 기본 on.
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
    { name: 'lp:transit-cross-show' },
  ),
);
