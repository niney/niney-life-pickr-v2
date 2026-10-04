import { describe, expect, it } from 'vitest';
import { GUEST_SHARE_IP_PER_DAY, GuestShareLedger, GuestShareLimitError } from './guest-share.js';

// 게스트 공유 발급 장부(perf-2 F-6) — 재사용 키·IP 하루 발급 상한.

describe('GuestShareLedger', () => {
  it('키는 입력이 같으면 같고, 포함 옵션·본문·발급 주체가 다르면 다르다', () => {
    const base = ['guest-1', { birth: '1990-05-15' }, false, { body: 'x' }];
    expect(GuestShareLedger.keyOf(base)).toBe(GuestShareLedger.keyOf(structuredClone(base)));
    expect(GuestShareLedger.keyOf(['guest-1', { birth: '1990-05-15' }, true, { body: 'x' }])).not.toBe(GuestShareLedger.keyOf(base));
    expect(GuestShareLedger.keyOf(['guest-1', { birth: '1990-05-15' }, false, { body: 'y' }])).not.toBe(GuestShareLedger.keyOf(base));
    expect(GuestShareLedger.keyOf(['guest-2', { birth: '1990-05-15' }, false, { body: 'x' }])).not.toBe(GuestShareLedger.keyOf(base));
  });

  it('기억한 공유를 돌려주고, forget 하면 잊는다', () => {
    const ledger = new GuestShareLedger<string>(() => '2026-10-05');
    expect(ledger.find('k')).toBeUndefined();
    ledger.remember('k', 'tok1234567');
    expect(ledger.find('k')).toBe('tok1234567');
    ledger.forget('k');
    expect(ledger.find('k')).toBeUndefined();
  });

  it('IP 하루 발급 상한 — 넘으면 429 오류, 다른 IP·다음 날은 따로 센다', () => {
    let day = '2026-10-05';
    const ledger = new GuestShareLedger<string>(() => day, 3);
    for (let i = 0; i < 3; i++) ledger.claim('1.1.1.1');
    let caught: unknown;
    try {
      ledger.claim('1.1.1.1');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GuestShareLimitError);
    expect((caught as GuestShareLimitError).statusCode).toBe(429);
    expect(() => ledger.claim('2.2.2.2')).not.toThrow();
    day = '2026-10-06';
    expect(() => ledger.claim('1.1.1.1')).not.toThrow();
  });

  it('기본 상한은 CGNAT 를 고려한 넉넉한 값', () => {
    expect(GUEST_SHARE_IP_PER_DAY).toBeGreaterThanOrEqual(100);
  });
});
