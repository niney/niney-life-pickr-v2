import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { createInjectableStorage } from './injectableStorage.js';
import { RESTAURANT_FAVORITES_MAX, type RestaurantFavoriteItemType } from '@repo/api-contract';

// 맛집 즐겨찾기 — 비로그인(게스트) 저장분. 로그인 사용자는 서버 저장분을
// React Query 로 다루고(useRestaurantFavorites), 게스트는 이 store 를 그대로
// 쓴다. 로그인 직후 이 store 의 항목을 서버로 union 병합(sync)한 뒤 clearAll.
//
// 배열 순서 = 등록순(끝에 push). 서버 목록 정렬 계약(createdAt asc)과 같은
// 의미라 병합 후에도 눈에 익은 순서가 유지된다.
//
// storage 어댑터는 busFavoriteStore 와 같은 lazy resolver 패턴 — 웹은
// localStorage 자동, 앱은 entry 에서 setRestaurantFavoriteStorage(AsyncStorage) 주입.

const favoriteStorage = createInjectableStorage();

/**
 * RN/외부 환경에서 persist 용 storage 를 주입한다. 모듈 import 후 한 번만
 * 호출. 미호출 + 브라우저 환경이면 window.localStorage 가 자동 사용된다.
 */
export const setRestaurantFavoriteStorage = (storage: StateStorage): void => {
  favoriteStorage.setStorage(storage);
};

interface RestaurantFavoriteState {
  // 등록순 배열. persist 대상.
  items: RestaurantFavoriteItemType[];

  // 토글 — placeId 일치가 있으면 제거, 없으면 끝에 추가. 상한
  // (RESTAURANT_FAVORITES_MAX) 도달 상태에서 추가 시도면 무동작 + false.
  // 그 외(추가 성공/제거)는 true.
  toggle(item: RestaurantFavoriteItemType): boolean;
  remove(placeId: string): void;
  // 로그인 sync 성공 후 게스트 저장분을 비운다.
  clearAll(): void;
}

export const useRestaurantFavoriteStore = create<RestaurantFavoriteState>()(
  persist(
    (set, get) => ({
      items: [],

      toggle(item) {
        const { items } = get();
        if (items.some((i) => i.placeId === item.placeId)) {
          set({ items: items.filter((i) => i.placeId !== item.placeId) });
          return true;
        }
        if (items.length >= RESTAURANT_FAVORITES_MAX) return false;
        set({ items: [...items, item] });
        return true;
      },

      remove(placeId) {
        set((s) => ({ items: s.items.filter((i) => i.placeId !== placeId) }));
      },

      clearAll() {
        set({ items: [] });
      },
    }),
    {
      name: 'restaurant-favorites-v1',
      version: 1,
      // 데이터만 영속 — 액션은 store 정의에서 매번 재생성.
      partialize: (s) => ({ items: s.items }),
      storage: createJSONStorage(() => favoriteStorage.storage),
    },
  ),
);

// 주입은 이 모듈 평가 이후에 일어나므로(앱 entry), 그때 저장분을 다시 읽어온다.
favoriteStorage.bindRehydrate(() => {
  void useRestaurantFavoriteStore.persist.rehydrate();
});
