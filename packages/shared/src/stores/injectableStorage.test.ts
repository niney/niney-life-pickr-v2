import { describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import { createInjectableStorage } from './injectableStorage.js';

// 이 헬퍼가 존재하는 이유가 곧 여기서 지키는 계약이다 — zustand 의
// createJSONStorage 는 팩토리를 스토어 정의 시점에 한 번만 부르고 결과를
// 캡처하는데, 앱의 주입은 항상 그 뒤에 온다(ESM 이 import 를 먼저 평가).
// 그래서 "캡처된 어댑터로도 나중 주입이 반영되는가" 가 핵심 검증이다.

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

describe('createInjectableStorage', () => {
  it('주입도 window 도 없으면 no-op — 써도 남지 않고 읽으면 null', () => {
    const injectable = createInjectableStorage();

    injectable.storage.setItem('k', 'v');

    expect(injectable.storage.getItem('k')).toBeNull();
  });

  it('어댑터를 미리 캡처해 둬도 나중에 주입한 스토리지로 위임된다', () => {
    const injectable = createInjectableStorage();
    // zustand 가 하는 일을 그대로 흉내낸다 — 주입 전에 어댑터를 붙잡아 둔다.
    const captured = injectable.storage;
    const mem = memoryStorage();

    injectable.setStorage(mem);

    captured.setItem('k', 'v');
    expect(mem.data.get('k')).toBe('v');
    expect(captured.getItem('k')).toBe('v');

    captured.removeItem('k');
    expect(mem.data.has('k')).toBe(false);
  });

  it('주입 시점에 재복원(rehydrate)을 건다', () => {
    const injectable = createInjectableStorage();
    const rehydrate = vi.fn();
    injectable.bindRehydrate(rehydrate);

    injectable.setStorage(memoryStorage());

    // 주입 전 rehydrate 는 빈 스토리지를 읽었으므로, 여기서 다시 읽지 않으면
    // 앱에 저장돼 있던 값이 영영 복원되지 않는다.
    expect(rehydrate).toHaveBeenCalledTimes(1);
  });

  it('rehydrate 를 연결하지 않아도 주입 자체는 실패하지 않는다', () => {
    const injectable = createInjectableStorage();
    const mem = memoryStorage();

    expect(() => injectable.setStorage(mem)).not.toThrow();

    injectable.storage.setItem('k', 'v');
    expect(mem.data.get('k')).toBe('v');
  });
});
