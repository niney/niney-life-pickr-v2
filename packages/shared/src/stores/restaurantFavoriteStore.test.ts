import { beforeEach, describe, expect, it } from 'vitest';
import { RESTAURANT_FAVORITES_MAX, type RestaurantFavoriteItemType } from '@repo/api-contract';
import { useRestaurantFavoriteStore } from './restaurantFavoriteStore.js';

// 게스트(비로그인) 맛집 즐겨찾기 스토어 — 토글의 반환값 계약(추가 성공/제거는
// true, 상한 도달로 무동작이면 false)이 UI 의 "꽉 찼어요" 안내를 결정한다.
// bus/subway 즐겨찾기 스토어는 이 로직의 동일 복제(키만 다름)라 대표로 여기만
// 깊게 검증한다.

const fav = (placeId: string): RestaurantFavoriteItemType => ({
  placeId,
  name: `식당${placeId}`,
  category: null,
  address: null,
  thumbnailUrl: null,
  latitude: null,
  longitude: null,
});

const store = () => useRestaurantFavoriteStore.getState();

describe('restaurantFavoriteStore', () => {
  beforeEach(() => {
    store().clearAll();
  });

  it('toggle — 없으면 끝에 추가(true), 있으면 제거(true), 등록순 유지', () => {
    expect(store().toggle(fav('1'))).toBe(true);
    expect(store().toggle(fav('2'))).toBe(true);
    expect(store().toggle(fav('3'))).toBe(true);
    expect(store().items.map((i) => i.placeId)).toEqual(['1', '2', '3']);

    // 가운데를 제거해도 나머지 순서는 그대로 — 즐겨찾기는 위치가 안 바뀌어야
    // 눈이 기억한다(정렬 계약: 등록순).
    expect(store().toggle(fav('2'))).toBe(true);
    expect(store().items.map((i) => i.placeId)).toEqual(['1', '3']);
  });

  it('상한 도달 상태의 추가 시도는 무동작 + false, 제거는 여전히 동작한다', () => {
    for (let i = 0; i < RESTAURANT_FAVORITES_MAX; i += 1) {
      expect(store().toggle(fav(String(i)))).toBe(true);
    }
    expect(store().items).toHaveLength(RESTAURANT_FAVORITES_MAX);

    // 초과 추가 — 거부되고 목록 불변.
    expect(store().toggle(fav('9999'))).toBe(false);
    expect(store().items).toHaveLength(RESTAURANT_FAVORITES_MAX);

    // 상한 상태에서도 기존 항목 토글(제거)은 true.
    expect(store().toggle(fav('0'))).toBe(true);
    expect(store().items).toHaveLength(RESTAURANT_FAVORITES_MAX - 1);
    // 자리가 나면 다시 추가 가능.
    expect(store().toggle(fav('9999'))).toBe(true);
  });

  it('remove 는 해당 placeId 만 지우고, clearAll 은 전부 비운다(로그인 sync 후)', () => {
    store().toggle(fav('1'));
    store().toggle(fav('2'));

    store().remove('1');
    expect(store().items.map((i) => i.placeId)).toEqual(['2']);

    store().clearAll();
    expect(store().items).toEqual([]);
  });
});
