import { describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

// 게스트 키는 "기기 영속" 이어야 한다 — 서버가 이 키로 기기 단위 한도와 오늘의 카드 잠금을 건다.
// persist 는 저장분이 없으면 초기 상태를 쓰지 않으므로, 스토어가 직접 써 두지 않으면 로드할 때마다
// 새 키가 만들어진다(새로고침으로 한도가 풀리던 결함).

const memoryStorage = (): StateStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => {
      data.set(name, value);
    },
    removeItem: (name) => {
      data.delete(name);
    },
  };
};

// 모듈을 새로 평가한다 = 새로고침(스토어가 다시 만들어진다).
const loadStore = async () => {
  vi.resetModules();
  return import('./guestKeyStore.js');
};

const storedKey = (mem: { data: Map<string, string> }): string | undefined => {
  const raw = mem.data.get('guest-key-v1');
  return raw ? (JSON.parse(raw) as { state: { guestKey: string } }).state.guestKey : undefined;
};

describe('guestKeyStore', () => {
  it('저장분이 없으면 만든 키를 써 두고, 다음 로드는 그 키를 그대로 쓴다', async () => {
    const mem = memoryStorage();

    const first = await loadStore();
    first.setGuestKeyStorage(mem);
    const key = first.getGuestKey();
    expect(key).toBeTruthy();
    expect(storedKey(mem)).toBe(key);

    const second = await loadStore();
    second.setGuestKeyStorage(mem);
    expect(second.getGuestKey()).toBe(key);
  });

  it('저장분이 있으면 그 키를 복원하고 덮어쓰지 않는다', async () => {
    const mem = memoryStorage();
    mem.data.set('guest-key-v1', JSON.stringify({ state: { guestKey: 'saved-key' }, version: 1 }));
    const setItem = vi.spyOn(mem, 'setItem');

    const store = await loadStore();
    store.setGuestKeyStorage(mem);

    expect(store.getGuestKey()).toBe('saved-key');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('비동기 스토리지(앱 AsyncStorage)에서도 저장분이 없으면 써 둔다', async () => {
    const mem = memoryStorage();
    const asyncStorage: StateStorage = {
      getItem: async (name) => mem.getItem(name) as string | null,
      setItem: async (name, value) => {
        mem.setItem(name, value);
      },
      removeItem: async (name) => {
        mem.removeItem(name);
      },
    };

    const store = await loadStore();
    store.setGuestKeyStorage(asyncStorage);
    await vi.waitFor(() => expect(storedKey(mem)).toBe(store.getGuestKey()));
  });
});
