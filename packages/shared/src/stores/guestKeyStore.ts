import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { createInjectableStorage } from './injectableStorage.js';

// 공용 게스트 키 — 로그인 없이 쓰는 기능(타로 등)의 기기 단위 식별. 서버는 X-Guest-Key 헤더로
// 받아 기기 일일 한도·오늘의 카드 잠금에 쓴다. 투표의 voterKey 와 같은 원리(추측 불가 UUID,
// 클라 선언값이라 완벽한 식별이 아님을 제품 결정으로 수용)지만 기능 간 공유하려고 분리했다.
// 재생성 API 는 두지 않는다 — 한도 우회를 UI 가 부추기지 않게. localStorage 초기화 = 새 기기.
//
// storage 어댑터는 다른 persist 스토어와 같은 주입 패턴 — 웹 localStorage 자동, 앱은 entry 에서
// setGuestKeyStorage(AsyncStorage) 주입.

const guestStorage = createInjectableStorage();

export const setGuestKeyStorage = (storage: StateStorage): void => {
  guestStorage.setStorage(storage);
};

const newGuestKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

interface GuestKeyState {
  guestKey: string;
}

export const useGuestKeyStore = create<GuestKeyState>()(
  persist(() => ({ guestKey: newGuestKey() }), {
    name: 'guest-key-v1',
    version: 1,
    storage: createJSONStorage(() => guestStorage.storage),
  }),
);

guestStorage.bindRehydrate(() => {
  void useGuestKeyStore.persist.rehydrate();
});

// 훅 밖(API 함수·이벤트 핸들러)에서 읽을 때.
export const getGuestKey = (): string => useGuestKeyStore.getState().guestKey;
