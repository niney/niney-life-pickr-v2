import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LifeCctvPurpose, LifeMapLayer, LifeToiletFilterKey } from '@repo/utils';

// 일상지도 표시 설정 — 레이어 on/off·CCTV 설치목적 필터·화장실 편의 필터. 위치(ll,z)·선택(sel)은
// URL 이 진실이고, 이 설정은 사용자 취향이라 persist(localStorage) — transitCrossShowStore 관례.
// 빈 purposes = 전체, 화장실 필터는 AND.
export type LifeToiletFilterState = Record<LifeToiletFilterKey, boolean>;

interface LifeMapPrefsState {
  layers: Record<LifeMapLayer, boolean>;
  purposes: LifeCctvPurpose[];
  toiletFilters: LifeToiletFilterState;
  toggleLayer: (layer: LifeMapLayer) => void;
  setLayer: (layer: LifeMapLayer, on: boolean) => void;
  togglePurpose: (purpose: LifeCctvPurpose) => void;
  setPurposes: (purposes: LifeCctvPurpose[]) => void;
  toggleToiletFilter: (key: LifeToiletFilterKey) => void;
  resetFilters: () => void;
}

const DEFAULT_TOILET_FILTERS: LifeToiletFilterState = {
  open24: false,
  disabled: false,
  kids: false,
  diaper: false,
  bell: false,
};

export const useLifeMapPrefsStore = create<LifeMapPrefsState>()(
  persist(
    (set) => ({
      layers: { cctv: true, toilet: true },
      purposes: [],
      toiletFilters: DEFAULT_TOILET_FILTERS,
      toggleLayer: (layer) => set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
      setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
      togglePurpose: (purpose) =>
        set((s) => ({
          purposes: s.purposes.includes(purpose) ? s.purposes.filter((p) => p !== purpose) : [...s.purposes, purpose],
        })),
      setPurposes: (purposes) => set({ purposes }),
      toggleToiletFilter: (key) =>
        set((s) => ({ toiletFilters: { ...s.toiletFilters, [key]: !s.toiletFilters[key] } })),
      resetFilters: () => set({ purposes: [], toiletFilters: DEFAULT_TOILET_FILTERS }),
    }),
    {
      name: 'lp:life-map-prefs',
      version: 1,
      partialize: (s) => ({ layers: s.layers, purposes: s.purposes, toiletFilters: s.toiletFilters }),
    },
  ),
);
