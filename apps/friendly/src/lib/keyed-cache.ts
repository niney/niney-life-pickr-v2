import { LRUCache } from 'lru-cache';

// 키(가게 placeId 등)별로 만든 값을 잠깐 들고 있는 캐시 — 같은 키 동시 요청 합류, 바이트 상한 LRU, 만료 직후 SWR.
//   - 들고 있는 동안(ttl)은 그대로 낸다.
//   - 만료 뒤 ttl 안(합쳐 2×ttl)이면 지난 값을 바로 내고 뒤에서 한 번 다시 만든다. 그보다 오래됐으면 새로 만들 때까지 기다린다.
//   - load 가 null 이면(없는 가게) 들고 있지 않는다. 실패는 그대로 던지고 들고 있지 않는다(뒤에서 갱신하다 실패하면 지난 값 유지).
//   - invalidateAll 뒤에는 그 전에 시작한 load 의 결과를 담지 않는다(세대 번호).
// 단일 인스턴스 전제(CLAUDE.md) — 프로세스 메모리. 공개 응답의 Cache-Control 과 같은 길이로 두면 체감 신선도는 그대로다.

export interface KeyedCacheOptions {
  ttlMs: number;
  // 값 크기 추정 합계 상한(바이트) — 넘치면 오래 안 쓴 키부터 버린다.
  maxBytes: number;
  now?: () => number;
}

interface Slot<T> {
  value: T;
  bytes: number;
  expiresAt: number;
}

export interface KeyedLoaded<T> {
  value: T;
  // 대략의 메모리 크기(바이트). 문자열은 길이 × 2 로 잡으면 된다.
  bytes: number;
}

export class KeyedCache<T> {
  private readonly slots: LRUCache<string, Slot<T>>;
  private readonly inflight = new Map<string, { promise: Promise<T | null>; generation: number }>();
  private generation = 0;

  constructor(private readonly opts: KeyedCacheOptions) {
    this.slots = new LRUCache<string, Slot<T>>({
      maxSize: opts.maxBytes,
      sizeCalculation: (slot) => Math.max(1, Math.min(Math.ceil(slot.bytes), opts.maxBytes)),
    });
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  async get(key: string, load: () => Promise<KeyedLoaded<T> | null>): Promise<T | null> {
    const slot = this.slots.get(key);
    if (slot) {
      const now = this.now();
      if (now < slot.expiresAt) return slot.value;
      if (now < slot.expiresAt + this.opts.ttlMs) {
        this.refresh(key, load).catch(() => undefined);
        return slot.value;
      }
    }
    return this.refresh(key, load);
  }

  invalidateAll(): void {
    this.generation += 1;
    this.slots.clear();
    this.inflight.clear();
  }

  private refresh(key: string, load: () => Promise<KeyedLoaded<T> | null>): Promise<T | null> {
    const pending = this.inflight.get(key);
    if (pending && pending.generation === this.generation) return pending.promise;
    const generation = this.generation;
    const promise = load()
      .then((loaded) => {
        if (!loaded) {
          // 그사이 없어진 키(삭제된 가게) — 지난 값도 버린다.
          if (generation === this.generation) this.slots.delete(key);
          return null;
        }
        if (generation === this.generation) {
          this.slots.set(key, { value: loaded.value, bytes: loaded.bytes, expiresAt: this.now() + this.opts.ttlMs });
        }
        return loaded.value;
      })
      .finally(() => {
        if (this.inflight.get(key)?.promise === promise) this.inflight.delete(key);
      });
    this.inflight.set(key, { promise, generation });
    return promise;
  }
}
