import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  BusStationItemType,
  SubwayStationGroupItemType,
} from '@repo/api-contract';
import type { TransitMode } from '~/hooks/useTransitScreen';

const QUERY_LIMIT_PER_MODE = 10;
const TARGET_LIMIT = 20;

export interface TransitRecentQuery {
  mode: TransitMode;
  q: string;
  usedAt: number;
}

export interface TransitRecentBusTarget {
  kind: 'bus';
  stId: string;
  arsId: string;
  name: string;
  lat: number;
  lng: number;
  selectedAt: number;
}

export interface TransitRecentSubwayTarget {
  kind: 'subway';
  stationId: string;
  name: string;
  lat: number;
  lng: number;
  lines: SubwayStationGroupItemType['lines'];
  selectedAt: number;
}

export type TransitRecentTarget = TransitRecentBusTarget | TransitRecentSubwayTarget;

interface TransitRecentState {
  queries: TransitRecentQuery[];
  targets: TransitRecentTarget[];
  addQuery(mode: TransitMode, q: string): void;
  addBusTarget(item: BusStationItemType): void;
  addSubwayTarget(item: SubwayStationGroupItemType): void;
  removeQuery(mode: TransitMode, q: string): void;
  removeTarget(kind: TransitRecentTarget['kind'], id: string): void;
  clearMode(mode: TransitMode): void;
}

const normalize = (value: string): string => value.trim().normalize('NFC').toLocaleLowerCase();

const targetKey = (target: TransitRecentTarget): string =>
  target.kind === 'bus' ? `bus:${target.stId}` : `subway:${target.stationId}`;

// 검색 기록은 기기 로컬 전용이다. 실제 선택한 장소만 스냅샷으로 보관해 다음
// 진입에서 서버 검색 없이 바로 상세를 열고, 도착정보만 최신값으로 다시 조회한다.
export const useTransitRecentStore = create<TransitRecentState>()(
  persist(
    (set) => ({
      queries: [],
      targets: [],

      addQuery(mode, raw) {
        const q = raw.trim().normalize('NFC');
        if (!q) return;
        set((state) => {
          const key = normalize(q);
          const otherMode = state.queries.filter((item) => item.mode !== mode);
          const sameMode = state.queries
            .filter((item) => item.mode === mode && normalize(item.q) !== key)
            .slice(0, QUERY_LIMIT_PER_MODE - 1);
          return { queries: [{ mode, q, usedAt: Date.now() }, ...sameMode, ...otherMode] };
        });
      },

      addBusTarget(item) {
        const next: TransitRecentBusTarget = {
          kind: 'bus',
          stId: item.stId,
          arsId: item.arsId,
          name: item.name,
          lat: item.lat,
          lng: item.lng,
          selectedAt: Date.now(),
        };
        set((state) => ({
          targets: [next, ...state.targets.filter((item) => targetKey(item) !== targetKey(next))]
            .slice(0, TARGET_LIMIT),
        }));
      },

      addSubwayTarget(item) {
        const next: TransitRecentSubwayTarget = {
          kind: 'subway',
          stationId: item.id,
          name: item.name,
          lat: item.lat,
          lng: item.lng,
          lines: item.lines,
          selectedAt: Date.now(),
        };
        set((state) => ({
          targets: [next, ...state.targets.filter((item) => targetKey(item) !== targetKey(next))]
            .slice(0, TARGET_LIMIT),
        }));
      },

      removeQuery(mode, q) {
        const key = normalize(q);
        set((state) => ({
          queries: state.queries.filter(
            (item) => item.mode !== mode || normalize(item.q) !== key,
          ),
        }));
      },

      removeTarget(kind, id) {
        const key = `${kind}:${id}`;
        set((state) => ({ targets: state.targets.filter((item) => targetKey(item) !== key) }));
      },

      clearMode(mode) {
        set((state) => ({
          queries: state.queries.filter((item) => item.mode !== mode),
          targets: state.targets.filter((item) => item.kind !== mode),
        }));
      },
    }),
    {
      name: 'lp:transit-recents-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ queries: state.queries, targets: state.targets }),
    },
  ),
);

export const matchesTransitRecent = (value: string, q: string): boolean => {
  const needle = normalize(q);
  return needle === '' || normalize(value).includes(needle);
};
