import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 일상지도 "최근 본 위치" — 지역 이동 검색에서 고른 곳을 최대 8개 기억(persist). 같은 라벨·좌표는
// 앞으로 끌어올린다. 위치(ll,z)는 URL 이 진실이지만, 다시 찾아가기 편의는 로컬 취향이라 스토어.
export interface LifeMapRecentItem {
  label: string;
  sub: string | null;
  lat: number;
  lng: number;
  zoom: number;
  at: string;
}

interface LifeMapRecentState {
  items: LifeMapRecentItem[];
  add: (item: Omit<LifeMapRecentItem, 'at'>) => void;
  clear: () => void;
}

const MAX_RECENT = 8;
const sameSpot = (a: Pick<LifeMapRecentItem, 'label' | 'lat' | 'lng'>, b: Pick<LifeMapRecentItem, 'label' | 'lat' | 'lng'>): boolean =>
  a.label === b.label && Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lng - b.lng) < 0.0005;

export const useLifeMapRecentStore = create<LifeMapRecentState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => ({
          items: [{ ...item, at: new Date().toISOString() }, ...s.items.filter((it) => !sameSpot(it, item))].slice(0, MAX_RECENT),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: 'lp:life-map-recent', version: 1 },
  ),
);
