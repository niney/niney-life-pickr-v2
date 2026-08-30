import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LifeCctvPurpose, LifeHospitalCategory, LifeMapLayer, LifeToiletFilterKey } from '@repo/utils';

// 일상지도 표시 설정 — 레이어 on/off·CCTV 설치목적 필터·화장실 편의 필터·병의원 종별 필터.
// 위치(ll,z)·선택(sel)은 URL 이 진실이고, 이 설정은 사용자 취향이라 persist(localStorage) —
// transitCrossShowStore 관례. 빈 purposes/hospitalCategories = 전체, 화장실 필터는 AND.
export type LifeToiletFilterState = Record<LifeToiletFilterKey, boolean>;

interface LifeMapPrefsState {
  layers: Record<LifeMapLayer, boolean>;
  purposes: LifeCctvPurpose[];
  toiletFilters: LifeToiletFilterState;
  hospitalCategories: LifeHospitalCategory[];
  toggleLayer: (layer: LifeMapLayer) => void;
  setLayer: (layer: LifeMapLayer, on: boolean) => void;
  togglePurpose: (purpose: LifeCctvPurpose) => void;
  setPurposes: (purposes: LifeCctvPurpose[]) => void;
  toggleToiletFilter: (key: LifeToiletFilterKey) => void;
  toggleHospitalCategory: (category: LifeHospitalCategory) => void;
  setHospitalCategories: (categories: LifeHospitalCategory[]) => void;
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
      layers: { cctv: true, toilet: true, hospital: true },
      purposes: [],
      toiletFilters: DEFAULT_TOILET_FILTERS,
      hospitalCategories: [],
      toggleLayer: (layer) => set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
      setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
      togglePurpose: (purpose) =>
        set((s) => ({
          purposes: s.purposes.includes(purpose) ? s.purposes.filter((p) => p !== purpose) : [...s.purposes, purpose],
        })),
      setPurposes: (purposes) => set({ purposes }),
      toggleToiletFilter: (key) =>
        set((s) => ({ toiletFilters: { ...s.toiletFilters, [key]: !s.toiletFilters[key] } })),
      toggleHospitalCategory: (category) =>
        set((s) => ({
          hospitalCategories: s.hospitalCategories.includes(category)
            ? s.hospitalCategories.filter((c) => c !== category)
            : [...s.hospitalCategories, category],
        })),
      setHospitalCategories: (categories) => set({ hospitalCategories: categories }),
      resetFilters: () => set({ purposes: [], toiletFilters: DEFAULT_TOILET_FILTERS, hospitalCategories: [] }),
    }),
    {
      name: 'lp:life-map-prefs',
      version: 2,
      // v1 → v2: 병의원 레이어 추가 — 기존 사용자도 기본 켬, 종별 필터는 전체.
      migrate: (persisted) => {
        const s = persisted as Partial<LifeMapPrefsState>;
        return {
          ...s,
          layers: { cctv: true, toilet: true, hospital: true, ...(s.layers ?? {}) },
          hospitalCategories: s.hospitalCategories ?? [],
        } as LifeMapPrefsState;
      },
      partialize: (s) => ({
        layers: s.layers,
        purposes: s.purposes,
        toiletFilters: s.toiletFilters,
        hospitalCategories: s.hospitalCategories,
      }),
    },
  ),
);
