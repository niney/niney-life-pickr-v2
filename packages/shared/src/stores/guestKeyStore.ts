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

const STORAGE_NAME = 'guest-key-v1';

export const useGuestKeyStore = create<GuestKeyState>()(
  persist(() => ({ guestKey: newGuestKey() }), {
    name: STORAGE_NAME,
    version: 1,
    storage: createJSONStorage(() => guestStorage.storage),
  }),
);

// persist 는 저장분이 없을 때 초기 상태를 스토리지에 쓰지 않는다(set 이 불릴 때만 쓴다). 이 스토어는
// set 을 부르는 곳이 없어, 그대로 두면 키가 한 번도 저장되지 않고 새로고침마다 새 키가 만들어진다 —
// "기기 영속" 이 깨져 기기 단위 한도와 오늘의 카드 잠금이 새로고침으로 풀린다. 그래서 복원이 끝날
// 때마다 저장분이 없으면 지금 키를 써 둔다. 앱은 AsyncStorage 주입 뒤 다시 복원하므로 그때도 이 길로
// 저장된다(주입 전의 no-op 스토리지에는 써도 남지 않는다).
const persistKeyIfMissing = (): void => {
  const writeIfMissing = (stored: string | null): void => {
    if (stored !== null) return;
    useGuestKeyStore.setState({ guestKey: useGuestKeyStore.getState().guestKey });
  };
  try {
    const stored = guestStorage.storage.getItem(STORAGE_NAME);
    if (stored instanceof Promise) void stored.then(writeIfMissing).catch(() => undefined);
    else writeIfMissing(stored);
  } catch {
    // 스토리지를 못 쓰는 환경(프라이빗 모드 등) — 이번 세션의 키만 쓴다.
  }
};
useGuestKeyStore.persist.onFinishHydration(persistKeyIfMissing);
// 동기 스토리지(웹 localStorage)는 스토어를 만드는 순간 복원이 끝나 위 리스너가 못 듣는다.
if (useGuestKeyStore.persist.hasHydrated()) persistKeyIfMissing();

guestStorage.bindRehydrate(() => {
  void useGuestKeyStore.persist.rehydrate();
});

// 훅 밖(API 함수·이벤트 핸들러)에서 읽을 때.
export const getGuestKey = (): string => useGuestKeyStore.getState().guestKey;
