import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LifeCctvPurpose, LifeMapLayer, LifeToiletFilterKey } from '@repo/utils';

// 일상지도 표시 설정(앱) — 레이어 on/off·CCTV 설치목적 필터·화장실 편의 필터. 웹 lifeMapPrefsStore 와
// 같은 모양, 저장소만 AsyncStorage(transitRecentStore 관례). 빈 purposes = 전체, 화장실 필터는 AND.
export type LifeToiletFilterState = Record<LifeToiletFilterKey, boolean>;

interface LifeMapPrefsState {
  layers: Record<LifeMapLayer, boolean>;
  purposes: LifeCctvPurpose[];
  toiletFilters: LifeToiletFilterState;
  toggleLayer: (layer: LifeMapLayer) => void;
  togglePurpose: (purpose: LifeCctvPurpose) => void;
  clearPurposes: () => void;
  toggleToiletFilter: (key: LifeToiletFilterKey) => void;
}

const DEFAULT_TOILET_FILTERS: LifeToiletFilterState = { open24: false, disabled: false, kids: false, diaper: false, bell: false };

export const useLifeMapPrefsStore = create<LifeMapPrefsState>()(
  persist(
    (set) => ({
      layers: { cctv: true, toilet: true },
      purposes: [],
      toiletFilters: DEFAULT_TOILET_FILTERS,
      toggleLayer: (layer) => set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
      togglePurpose: (purpose) =>
        set((s) => ({ purposes: s.purposes.includes(purpose) ? s.purposes.filter((p) => p !== purpose) : [...s.purposes, purpose] })),
      clearPurposes: () => set({ purposes: [] }),
      toggleToiletFilter: (key) => set((s) => ({ toiletFilters: { ...s.toiletFilters, [key]: !s.toiletFilters[key] } })),
    }),
    {
      name: 'lp:life-map-prefs',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ layers: s.layers, purposes: s.purposes, toiletFilters: s.toiletFilters }),
    },
  ),
);
