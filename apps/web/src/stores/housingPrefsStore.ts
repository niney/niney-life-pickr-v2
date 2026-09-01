import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HousingAreaBand, HousingDealType } from '@repo/utils';

// 집값 표시 설정 — 거래 유형(매매/전세/월세)·전용면적 구간. 위치(ll,z)·선택(sel)은 URL 이 진실이고,
// 이 축은 사용자 취향이라 persist(localStorage) — lifeMapPrefsStore 관례. 지도 배지·주변 목록·상세
// 통계가 같은 축을 본다.
interface HousingPrefsState {
  dealType: HousingDealType;
  band: HousingAreaBand;
  setDealType: (dealType: HousingDealType) => void;
  setBand: (band: HousingAreaBand) => void;
}

export const useHousingPrefsStore = create<HousingPrefsState>()(
  persist(
    (set) => ({
      dealType: 'trade',
      band: 'all',
      setDealType: (dealType) => set({ dealType }),
      setBand: (band) => set({ band }),
    }),
    {
      name: 'lp:housing-prefs',
      version: 1,
      partialize: (s) => ({ dealType: s.dealType, band: s.band }),
    },
  ),
);
