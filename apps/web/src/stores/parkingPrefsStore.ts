import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 주차 필터 — 주차장(공영만·무료만·실시간만)·충전소(급속·주차료 무료·사용 가능·제한 없음). 위치(ll,z)·탭(t)·선택(sel)은
// URL 이 진실이고, 필터는 사용자 취향이라 persist(localStorage) — housingPrefsStore 관례. 지도·주변 목록이 같은 필터를 본다.
export interface ParkingLotFilterState {
  publicOnly: boolean;
  freeOnly: boolean;
  liveOnly: boolean;
}
export interface EvFilterState {
  fastOnly: boolean;
  freeParkingOnly: boolean;
  availableOnly: boolean;
  openOnly: boolean;
}

interface ParkingPrefsState {
  lotFilters: ParkingLotFilterState;
  evFilters: EvFilterState;
  toggleLotFilter: (key: keyof ParkingLotFilterState) => void;
  toggleEvFilter: (key: keyof EvFilterState) => void;
}

export const useParkingPrefsStore = create<ParkingPrefsState>()(
  persist(
    (set) => ({
      lotFilters: { publicOnly: false, freeOnly: false, liveOnly: false },
      evFilters: { fastOnly: false, freeParkingOnly: false, availableOnly: false, openOnly: false },
      toggleLotFilter: (key) => set((s) => ({ lotFilters: { ...s.lotFilters, [key]: !s.lotFilters[key] } })),
      toggleEvFilter: (key) => set((s) => ({ evFilters: { ...s.evFilters, [key]: !s.evFilters[key] } })),
    }),
    {
      name: 'lp:parking-prefs',
      version: 1,
      partialize: (s) => ({ lotFilters: s.lotFilters, evFilters: s.evFilters }),
    },
  ),
);
