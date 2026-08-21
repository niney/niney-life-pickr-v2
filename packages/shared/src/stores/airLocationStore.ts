import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { AirLocationItemType, AirLocationUpsertBodyType } from '@repo/api-contract';
import { createInjectableStorage } from './injectableStorage.js';

// 내 대기 위치 — 비로그인(게스트) 저장분. 로그인 사용자는 서버 저장분을 React Query 로
// 다루고(useAirLocation), 게스트는 이 store 를 그대로 쓴다. 로그인 직후 서버가 비어
// 있으면 이 값을 서버로 올린 뒤 clear 한다(값이 1개라 union 병합 대신 '서버 우선').
//
// storage 어댑터는 busFavoriteStore 와 같은 주입형 — 웹은 localStorage 자동, 앱은
// entry 에서 setAirLocationStorage(AsyncStorage) 주입.

const airLocationStorage = createInjectableStorage();

export const setAirLocationStorage = (storage: StateStorage): void => {
  airLocationStorage.setStorage(storage);
};

interface AirLocationState {
  location: AirLocationItemType | null;
  // 덮어쓰기 저장 — updatedAt 은 여기서 찍는다(서버 저장분과 같은 형태).
  setLocation(body: AirLocationUpsertBodyType): void;
  clear(): void;
}

export const useAirLocationStore = create<AirLocationState>()(
  persist(
    (set) => ({
      location: null,
      setLocation(body) {
        set({
          location: {
            lat: body.lat,
            lng: body.lng,
            label: body.label ?? null,
            source: body.source,
            updatedAt: new Date().toISOString(),
          },
        });
      },
      clear() {
        set({ location: null });
      },
    }),
    {
      name: 'air-location-v1',
      version: 1,
      partialize: (s) => ({ location: s.location }),
      storage: createJSONStorage(() => airLocationStorage.storage),
    },
  ),
);

// 주입은 이 모듈 평가 이후(앱 entry)에 일어나므로, 그때 저장분을 다시 읽어온다.
airLocationStorage.bindRehydrate(() => {
  void useAirLocationStore.persist.rehydrate();
});
