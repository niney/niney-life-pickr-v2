import type { StateStorage } from 'zustand/middleware';

// persist 용 스토리지 주입 어댑터 — 웹은 localStorage 자동, 앱(RN)은 entry 에서
// AsyncStorage 를 주입하는 패턴의 공용 구현.
//
// 직접 `createJSONStorage(() => resolveStorage())` 로 쓰면 안 된다. zustand 의
// createJSONStorage 는 넘긴 팩토리를 **스토어 정의 시점에 딱 한 번** 호출하고
// 그 결과를 클로저에 캡처하기 때문이다. ESM 은 import 를 먼저 평가하므로 앱
// entry 의 `setXxxStorage(AsyncStorage)` 는 언제나 그 뒤에 실행되고, 결과적으로
// 스토리지는 "주입 전 상태"(RN 이면 NO_OP)로 굳어 저장도 복원도 되지 않는다.
//
// 그래서 팩토리가 돌려주는 어댑터 자체를 지연 위임으로 만든다 — 캡처되는 건 이
// 위임 객체이고 실제 대상은 매 호출 시점에 결정된다.
//
// 주입 전에 persist 가 이미 한 번 rehydrate 를 돌려 "빈 상태" 로 확정하므로,
// 주입 시점에 다시 rehydrate 를 걸어야 저장돼 있던 값이 복원된다. 스토어보다
// 이 객체가 먼저 만들어져야 해서(스토어 옵션에 들어간다) rehydrate 연결은
// bindRehydrate 로 나중에 잇는다.

export interface InjectableStorage {
  /** persist 의 storage 옵션에 넣는 지연 위임 어댑터. */
  readonly storage: StateStorage;
  /** 앱 entry 에서 AsyncStorage 등을 주입한다. 주입 즉시 재복원까지 건다. */
  setStorage(storage: StateStorage): void;
  /** 스토어 정의 직후 persist.rehydrate 를 연결한다. */
  bindRehydrate(rehydrate: () => void): void;
}

export interface InjectableStorageOptions {
  /**
   * 주입이 없을 때 브라우저에서 쓸 스토리지. 기본은 localStorage 이고, 정산
   * draft 처럼 탭 수명만 살아야 하는 데이터는 'session' 을 쓴다.
   */
  web?: 'local' | 'session';
}

const NO_OP_STORAGE: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const createInjectableStorage = (
  options: InjectableStorageOptions = {},
): InjectableStorage => {
  const webKind = options.web ?? 'local';
  let injected: StateStorage | null = null;
  let rehydrate: (() => void) | null = null;

  const resolve = (): StateStorage => {
    if (injected) return injected;
    if (typeof window !== 'undefined') {
      const web = webKind === 'session' ? window.sessionStorage : window.localStorage;
      if (web) return web;
    }
    return NO_OP_STORAGE;
  };

  return {
    storage: {
      getItem: (name) => resolve().getItem(name),
      setItem: (name, value) => resolve().setItem(name, value),
      removeItem: (name) => resolve().removeItem(name),
    },
    setStorage(storage) {
      injected = storage;
      // 주입 전 rehydrate 는 빈 스토리지에서 읽었으므로 여기서 다시 읽는다.
      rehydrate?.();
    },
    bindRehydrate(fn) {
      rehydrate = fn;
    },
  };
};
