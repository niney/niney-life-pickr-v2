// 백그라운드 판정(LLM 매칭·세트 분해·웹 추정)이 실패한 이름의 재시도 간격.
//
// 성공·부정 결과는 DB 에 어휘 단위로 영구 저장되지만, 실패(타임아웃·429·파싱 실패)는 저장하지 않아 공개 메뉴 탭을
// 열 때마다(클라이언트 3초 폴링 최대 10회) 같은 이름으로 LLM·웹을 다시 불렀다. 실패한 이름은 backoffMs 동안
// "물어봤고 결과 없음"으로 취급해 다시 묻지 않고, 그 뒤 한 번 더 시도한다. 응답 해석 실패처럼 이름에 묶인
// 실패(strike)가 MENU_FAILURE_GIVE_UP_AFTER 번 쌓이면 호출자가 '포기'를 영구 저장한다. 업스트림 장애(타임아웃·
// 비200)는 이름 탓이 아니므로 간격만 두고 strike 로 세지 않는다 — 장애가 길어도 정상 이름을 포기하지 않는다.

import { LRUCache } from 'lru-cache';

// strike 는 하루 동안 기억한다(재시도 간격보다 길게 — 간격이 지나도 횟수가 이어진다).
const ATTEMPT_MEMORY_MS = 24 * 60 * 60 * 1000;

export const MENU_FAILURE_BACKOFF_MS = 30 * 60 * 1000;
export const MENU_FAILURE_GIVE_UP_AFTER = 3;

export class FailureBackoff {
  private readonly entries: LRUCache<string, { strikes: number; retryAt: number }>;

  constructor(
    private readonly opts: { backoffMs?: number; max?: number; now?: () => number } = {},
  ) {
    this.entries = new LRUCache({ max: opts.max ?? 5_000, ttl: ATTEMPT_MEMORY_MS });
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  /** 재시도 간격 안이면 true — 호출자는 이 이름을 "결과 없음"으로 보고 묻지 않는다. */
  isBackingOff(key: string): boolean {
    const entry = this.entries.get(key);
    return entry !== undefined && this.now() < entry.retryAt;
  }

  /** 실패를 기록하고 누적 strike 를 돌려준다. strike=false 면 간격만 두고 횟수는 그대로. */
  record(key: string, strike: boolean): number {
    const strikes = (this.entries.get(key)?.strikes ?? 0) + (strike ? 1 : 0);
    this.entries.set(key, { strikes, retryAt: this.now() + (this.opts.backoffMs ?? MENU_FAILURE_BACKOFF_MS) });
    return strikes;
  }

  clear(key: string): void {
    this.entries.delete(key);
  }
}
