import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_BASE_MS,
  COOLDOWN_MAX_MS,
  DailyQuota,
  PerClientDailyBudget,
  SERVICE_BLOCK_BASE_MS,
  SERVICE_BLOCK_MAX_MS,
  UpstreamCooldown,
  retryAfterSec,
  seoulDateKey,
} from './upstream-guard.js';

const KST_NOON = new Date('2026-10-05T12:00:00+09:00');

describe('DailyQuota', () => {
  it('버킷별로 따로 센다 — 한 버킷이 바닥나도 다른 버킷은 산다, calls 는 한 번에 확보(일부 소비 없음)', () => {
    const q = new DailyQuota({ a: 3, b: 1 }, (bucket) => new Error(`full:${bucket}`));
    q.consume('a', KST_NOON, 2);
    expect(() => q.consume('a', KST_NOON, 2)).toThrow('full:a');
    expect(q.used('a', KST_NOON)).toBe(2); // 실패한 확보는 소비하지 않는다
    q.consume('b', KST_NOON);
    expect(() => q.consume('b', KST_NOON)).toThrow('full:b');
    q.consume('a', KST_NOON);
    expect(q.used('a', KST_NOON)).toBe(3);
  });

  it('record 는 한도와 무관하게 가산(재시도), KST 자정에 리셋', () => {
    const q = new DailyQuota({ a: 1 }, () => new Error('full'));
    q.consume('a', KST_NOON);
    q.record('a', KST_NOON);
    expect(q.used('a', KST_NOON)).toBe(2);
    // KST 23:59 → 같은 날, 00:00 → 리셋.
    expect(q.used('a', new Date('2026-10-05T23:59:00+09:00'))).toBe(2);
    expect(q.used('a', new Date('2026-10-06T00:00:00+09:00'))).toBe(0);
    expect(seoulDateKey(new Date('2026-10-05T15:30:00Z'))).toBe('2026-10-06');
  });
});

describe('UpstreamCooldown', () => {
  it('키 백오프 30초→1분→2분→4분→5분(상한), 성공하면 리셋, 다른 키는 무관', () => {
    const c = new UpstreamCooldown();
    let t = 1_000_000;
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) waits.push(c.failure('svc', 'k', t, false) - t);
    expect(waits).toEqual([
      COOLDOWN_BASE_MS,
      COOLDOWN_BASE_MS * 2,
      COOLDOWN_BASE_MS * 4,
      COOLDOWN_BASE_MS * 8,
      COOLDOWN_MAX_MS,
      COOLDOWN_MAX_MS,
    ]);
    expect(c.blockedUntil('svc', 'k', t)).toBe(t + COOLDOWN_MAX_MS);
    expect(c.blockedUntil('svc', 'other', t)).toBeNull();
    t += COOLDOWN_MAX_MS;
    expect(c.blockedUntil('svc', 'k', t)).toBeNull();
    c.success('svc', 'k');
    expect(c.failure('svc', 'k', t, false) - t).toBe(COOLDOWN_BASE_MS);
  });

  it('서비스 차단(인증·한도) — 그 서비스의 모든 키를 5분→…→1시간 막고 다른 서비스는 산다', () => {
    const c = new UpstreamCooldown();
    const t = 5_000_000;
    expect(c.failure('svcA', 'k1', t, true) - t).toBe(SERVICE_BLOCK_BASE_MS);
    expect(c.blockedUntil('svcA', 'anything', t)).toBe(t + SERVICE_BLOCK_BASE_MS);
    expect(c.blockedUntil('svcB', 'anything', t)).toBeNull();
    let last = 0;
    for (let i = 0; i < 10; i++) last = c.failure('svcA', 'k1', t, true) - t;
    expect(last).toBe(SERVICE_BLOCK_MAX_MS);
    // 성공 한 번이면 서비스 차단도 풀린다.
    c.success('svcA', 'k1');
    expect(c.blockedUntil('svcA', 'anything', t)).toBeNull();
    expect(retryAfterSec(t + 1_500, t)).toBe(2);
    expect(retryAfterSec(t, t)).toBe(1);
  });
});

describe('PerClientDailyBudget', () => {
  it('클라이언트별 하루 예산 — 바닥나면 false(소비 없음), 다른 클라이언트·다음 날은 새로', () => {
    const b = new PerClientDailyBudget(2);
    expect(b.take('ip1', KST_NOON)).toBe(true);
    expect(b.take('ip1', KST_NOON)).toBe(true);
    expect(b.take('ip1', KST_NOON)).toBe(false);
    expect(b.take('ip2', KST_NOON)).toBe(true);
    expect(b.take('ip1', new Date('2026-10-06T00:00:01+09:00'))).toBe(true);
  });
});
