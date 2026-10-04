import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';

// 게스트 공유 발급 장부(perf-2 F-6) — 타로·사주(C)·사주(G) 게스트 공유는 같은 입력을 다시 보내도 매번 새 행·새 토큰을
// 만들어, 분당 10회(레이트리밋)면 사주는 하루 1.4만 행(약 105MB)이 IP 하나로 쌓일 수 있었다.
// - (기기 키|IP, 입력·본문 해시, 포함 옵션) → 앞서 만든 공유를 메모리에서 돌려준다. 본문까지 키에 넣어, 그사이 풀이가
//   바뀌었으면(정적 → LLM 등) 예전처럼 새 공유를 만든다.
// - 새로 만들 때만 IP 하루 발급 수를 센다. 넘으면 GuestShareLimitError(429).
// - DB 정리는 하지 않는다 — 공유 링크는 영구라는 제품 결정. 메모리라 재시작하면 비워진다(그만큼 느슨한 상한).

/** 게스트 공유 IP 하루 발급 상한(모듈마다) — CGNAT(한 IP 뒤 여러 사람)를 고려해 넉넉히. */
export const GUEST_SHARE_IP_PER_DAY = 200;

const DAY_MS = 24 * 60 * 60_000;

export class GuestShareLimitError extends Error {
  // 전역 에러 핸들러가 statusCode 를 그대로 응답 코드로 쓴다.
  readonly statusCode = 429;

  constructor() {
    super('오늘 이 네트워크에서 만들 수 있는 공유 링크 수를 넘었어요. 내일 다시 시도해 주세요.');
    this.name = 'TooManyRequestsError';
  }
}

export class GuestShareLedger<T extends NonNullable<unknown>> {
  private readonly issued = new LRUCache<string, T>({ max: 5_000, ttl: DAY_MS });
  private readonly perIp = new LRUCache<string, number>({ max: 20_000, ttl: DAY_MS });

  constructor(
    // KST 날짜(YYYY-MM-DD) — 하루 상한의 경계.
    private readonly today: () => string,
    private readonly ipPerDay: number = GUEST_SHARE_IP_PER_DAY,
  ) {}

  /** 재사용 키 — 발급 주체·입력·포함 옵션·본문을 한 해시로. */
  static keyOf(parts: unknown): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
  }

  /** 같은 키로 앞서 만든 공유(호출부가 행이 아직 있는지 확인한다 — 취소된 공유를 되살리지 않게). */
  find(key: string): T | undefined {
    return this.issued.get(key);
  }

  forget(key: string): void {
    this.issued.delete(key);
  }

  /** 새 발급 직전 — 이 IP 의 오늘 발급 수가 상한이면 GuestShareLimitError, 아니면 1 센다. */
  claim(ip: string): void {
    const key = `${this.today()}|${ip}`;
    const used = this.perIp.get(key) ?? 0;
    if (used >= this.ipPerDay) throw new GuestShareLimitError();
    this.perIp.set(key, used + 1);
  }

  remember(key: string, value: T): void {
    this.issued.set(key, value);
  }
}
