import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import {
  SUBWAY_FAVORITES_MAX,
  type SubwayFavoriteLineItemType,
  type SubwayFavoriteStationItemType,
} from '@repo/api-contract';

// 지하철 즐겨찾기 — 비로그인(게스트) 저장분. 로그인 사용자는 서버 저장분을
// React Query 로 다루고(useSubwayFavorites), 게스트는 이 store 를 그대로 쓴다.
// 로그인 직후 이 store 의 항목을 서버로 union 병합(sync)한 뒤 clearAll 한다.
//
// 배열 순서 = 등록순(끝에 push). 서버 목록 정렬 계약(createdAt asc)과 같은
// 의미라 병합 후에도 눈에 익은 순서가 유지된다.
//
// storage 어댑터는 busFavoriteStore 와 같은 lazy resolver 패턴 — 웹은
// localStorage 자동, 앱은 entry 에서 setSubwayFavoriteStorage(AsyncStorage) 주입.

let injectedStorage: StateStorage | null = null;

/**
 * RN/외부 환경에서 persist 용 storage 를 주입한다. 모듈 import 후 한 번만
 * 호출. 미호출 + 브라우저 환경이면 window.localStorage 가 자동 사용된다.
 */
export const setSubwayFavoriteStorage = (storage: StateStorage): void => {
  injectedStorage = storage;
};

const NO_OP_STORAGE: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const resolveStorage = (): StateStorage => {
  if (injectedStorage) return injectedStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return NO_OP_STORAGE;
};

interface SubwayFavoriteState {
  // 등록순 배열. persist 대상.
  stations: SubwayFavoriteStationItemType[];
  lines: SubwayFavoriteLineItemType[];

  // 역 즐겨찾기 토글 — stationId 일치가 있으면 제거, 없으면 끝에 추가. 상한
  // (SUBWAY_FAVORITES_MAX) 도달 상태에서 추가 시도면 무동작 + false. 그 외는 true.
  toggleStation(item: SubwayFavoriteStationItemType): boolean;
  // 역×호선 토글 — (stationId, lineId) 일치 기준. 상한 정책은 위와 동일.
  toggleLine(item: SubwayFavoriteLineItemType): boolean;
  removeStation(stationId: string): void;
  removeLine(stationId: string, lineId: string): void;
  // 로그인 sync 성공 후 게스트 저장분을 비운다.
  clearAll(): void;
}

export const useSubwayFavoriteStore = create<SubwayFavoriteState>()(
  persist(
    (set, get) => ({
      stations: [],
      lines: [],

      toggleStation(item) {
        const { stations } = get();
        if (stations.some((s) => s.stationId === item.stationId)) {
          set({ stations: stations.filter((s) => s.stationId !== item.stationId) });
          return true;
        }
        if (stations.length >= SUBWAY_FAVORITES_MAX) return false;
        set({ stations: [...stations, item] });
        return true;
      },

      toggleLine(item) {
        const { lines } = get();
        const match = (l: SubwayFavoriteLineItemType) =>
          l.stationId === item.stationId && l.lineId === item.lineId;
        if (lines.some(match)) {
          set({ lines: lines.filter((l) => !match(l)) });
          return true;
        }
        if (lines.length >= SUBWAY_FAVORITES_MAX) return false;
        set({ lines: [...lines, item] });
        return true;
      },

      removeStation(stationId) {
        set((s) => ({ stations: s.stations.filter((x) => x.stationId !== stationId) }));
      },

      removeLine(stationId, lineId) {
        set((s) => ({
          lines: s.lines.filter((l) => !(l.stationId === stationId && l.lineId === lineId)),
        }));
      },

      clearAll() {
        set({ stations: [], lines: [] });
      },
    }),
    {
      name: 'subway-favorites-v1',
      version: 1,
      // 데이터만 영속 — 액션은 store 정의에서 매번 재생성.
      partialize: (s) => ({ stations: s.stations, lines: s.lines }),
      storage: createJSONStorage(() => resolveStorage()),
    },
  ),
);
