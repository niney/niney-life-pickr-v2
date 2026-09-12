import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LifeCctvPurpose,
  LifeCrimeMetric,
  LifeHospitalCategory,
  LifeMapLayer,
  LifeMapOverlay,
  LifeStoreLayerKind,
  LifeToiletFilterKey,
} from '@repo/utils';

// 일상지도 표시 설정 — 레이어 on/off·CCTV 설치목적 필터·화장실 편의 필터·병의원 종별 필터·생활편의 업종 필터 + 배경(면)
// 레이어(범죄 통계) 선택·범죄군 메트릭. 배경은 한 번에 하나(null = 없음), 기본 꺼짐 — 전국이 색으로
// 덮여 점 레이어 가독성이 떨어지고 낙인 우려도 있어 사용자가 의도적으로 켠다.
// 위치(ll,z)·선택(sel)은 URL 이 진실이고, 이 설정은 사용자 취향이라 persist(localStorage) —
// transitCrossShowStore 관례. 빈 purposes/hospitalCategories = 전체, 화장실 필터는 AND.
export type LifeToiletFilterState = Record<LifeToiletFilterKey, boolean>;

interface LifeMapPrefsState {
  layers: Record<LifeMapLayer, boolean>;
  purposes: LifeCctvPurpose[];
  toiletFilters: LifeToiletFilterState;
  hospitalCategories: LifeHospitalCategory[];
  // 생활편의 업종(6종, 다중 선택 — 빈 배열 = 전체).
  storeKinds: LifeStoreLayerKind[];
  overlay: LifeMapOverlay | null;
  crimeMetric: LifeCrimeMetric;
  toggleLayer: (layer: LifeMapLayer) => void;
  setLayer: (layer: LifeMapLayer, on: boolean) => void;
  togglePurpose: (purpose: LifeCctvPurpose) => void;
  setPurposes: (purposes: LifeCctvPurpose[]) => void;
  toggleToiletFilter: (key: LifeToiletFilterKey) => void;
  toggleHospitalCategory: (category: LifeHospitalCategory) => void;
  setHospitalCategories: (categories: LifeHospitalCategory[]) => void;
  toggleStoreKind: (kind: LifeStoreLayerKind) => void;
  setStoreKinds: (kinds: LifeStoreLayerKind[]) => void;
  toggleOverlay: (overlay: LifeMapOverlay) => void;
  setOverlay: (overlay: LifeMapOverlay | null) => void;
  setCrimeMetric: (metric: LifeCrimeMetric) => void;
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
      layers: { cctv: true, toilet: true, hospital: true, store: true },
      purposes: [],
      toiletFilters: DEFAULT_TOILET_FILTERS,
      hospitalCategories: [],
      storeKinds: [],
      overlay: null,
      crimeMetric: 'total',
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
      toggleStoreKind: (kind) =>
        set((s) => ({ storeKinds: s.storeKinds.includes(kind) ? s.storeKinds.filter((k) => k !== kind) : [...s.storeKinds, kind] })),
      setStoreKinds: (kinds) => set({ storeKinds: kinds }),
      toggleOverlay: (overlay) => set((s) => ({ overlay: s.overlay === overlay ? null : overlay })),
      setOverlay: (overlay) => set({ overlay }),
      setCrimeMetric: (metric) => set({ crimeMetric: metric }),
      resetFilters: () => set({ purposes: [], toiletFilters: DEFAULT_TOILET_FILTERS, hospitalCategories: [], storeKinds: [] }),
    }),
    {
      name: 'lp:life-map-prefs',
      version: 4,
      // v1 → v2: 병의원 레이어 추가 — 기존 사용자도 기본 켬, 종별 필터는 전체.
      // v2 → v3: 배경 레이어(범죄 통계)·메트릭 — 기본 꺼짐·전체. v3 → v4: 생활편의(store) 레이어 — 기본 켬, 업종 전체.
      migrate: (persisted) => {
        const s = persisted as Partial<LifeMapPrefsState>;
        return {
          ...s,
          layers: { cctv: true, toilet: true, hospital: true, store: true, ...(s.layers ?? {}) },
          hospitalCategories: s.hospitalCategories ?? [],
          storeKinds: s.storeKinds ?? [],
          overlay: s.overlay ?? null,
          crimeMetric: s.crimeMetric ?? 'total',
        } as LifeMapPrefsState;
      },
      partialize: (s) => ({
        layers: s.layers,
        purposes: s.purposes,
        toiletFilters: s.toiletFilters,
        hospitalCategories: s.hospitalCategories,
        storeKinds: s.storeKinds,
        overlay: s.overlay,
        crimeMetric: s.crimeMetric,
      }),
    },
  ),
);
