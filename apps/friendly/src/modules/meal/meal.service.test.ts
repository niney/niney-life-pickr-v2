import { describe, expect, it } from 'vitest';
import { parseTimeOfDay } from '@repo/utils';
import {
  decodeMealEntryCursor,
  encodeMealEntryCursor,
  medianSlotTime,
  minutesOfDayInSeoul,
} from './meal.service.js';

describe('minutesOfDayInSeoul', () => {
  it('+9시간 산술이 Asia/Seoul 포매터(예전 구현)와 같은 분을 낸다 — 자정 경계·초 절삭 포함', () => {
    const viaIntl = (d: Date): number =>
      parseTimeOfDay(
        d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }),
      ) ?? 0;
    const samples = [
      '2026-10-04T14:59:59.999Z', // 23:59 KST
      '2026-10-04T15:00:00.000Z', // 00:00 KST
      '2026-10-04T15:00:59.000Z',
      '2026-03-29T01:30:00.000Z', // 유럽 일광절약 전환일 — 서울과 무관
      '2024-02-29T23:45:30.000Z',
      '1999-12-31T15:00:00.000Z',
    ].map((iso) => new Date(iso));
    // 2년치 37분 간격 표본도 함께 대조한다.
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2027, 0, 1); t += 37 * 60_000 * 97) samples.push(new Date(t));
    for (const d of samples) expect(minutesOfDayInSeoul(d)).toBe(viaIntl(d));
  });
});

// 시간 입력 프리셋의 핵심 계산 — 평균이 아니라 중앙값이고, 야식은 자정을 걸친다.
const at = (h: number, m = 0): number => h * 60 + m;

describe('medianSlotTime', () => {
  it('표본이 3건 미만이면 null — 호출부가 일반 기본값을 쓴다', () => {
    expect(medianSlotTime('lunch', [at(12, 30), at(12, 40)])).toBeNull();
  });

  it('중앙값을 쓴다 — 어쩌다 새벽에 먹은 한 끼가 평균을 끌고 가지 않는다', () => {
    // 평균은 10:50 이지만 중앙값은 12:40 이다.
    const minutes = [at(3, 0), at(12, 30), at(12, 40), at(12, 50), at(13, 0)];
    expect(medianSlotTime('lunch', minutes)).toBe('12:40');
  });

  it('짝수 표본은 가운데 둘의 평균', () => {
    expect(medianSlotTime('dinner', [at(18, 0), at(19, 0), at(19, 30), at(20, 30)])).toBe('19:15');
  });

  it('야식은 자정을 걸쳐도 정오로 튀지 않는다', () => {
    // 23:30 · 00:30 · 23:00 — 단순 중앙값이면 23:00 이 아니라 엉뚱한 값이 나올 수 있다.
    const r = medianSlotTime('late_night', [at(23, 30), at(0, 30), at(23, 0)]);
    expect(r).toBe('23:30');
  });

  it('야식이 새벽에 몰려도 되감아 표시한다', () => {
    expect(medianSlotTime('late_night', [at(0, 30), at(1, 0), at(1, 30)])).toBe('01:00');
  });
});

describe('meal entry cursor', () => {
  it('eatenAt+id 를 opaque 토큰으로 왕복한다', () => {
    const eatenAt = new Date('2026-08-23T03:30:00.000Z');
    const encoded = encodeMealEntryCursor(eatenAt, 'entry-b');
    expect(encoded).not.toContain(eatenAt.toISOString());
    expect(decodeMealEntryCursor(encoded)).toEqual({ eatenAt, id: 'entry-b' });
  });

  it('전환 전 ISO eatenAt 커서를 계속 허용하고 잘못된 값은 무시한다', () => {
    const iso = '2026-08-23T03:30:00.000Z';
    expect(decodeMealEntryCursor(iso)).toEqual({ eatenAt: new Date(iso), id: null });
    expect(decodeMealEntryCursor('not-a-cursor')).toBeNull();
  });
});
