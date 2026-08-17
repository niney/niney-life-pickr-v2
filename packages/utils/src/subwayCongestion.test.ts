import { describe, expect, it } from 'vitest';
import {
  congestionBandLabel,
  congestionDirForUpdn,
  currentSlotKey,
  matchCongestionDir,
  slotLevel,
  timeToSlotKey,
} from './subwayCongestion.js';

// 웹·앱 congestionUtils 중복을 승격하며 처음 붙는 안전망 — 임계 경계와
// 방향 매칭(원문 표기 변형·폴백)이 화면 두 벌의 공통 계약이다.

describe('congestionBandLabel', () => {
  it('임계 경계 — <40 여유 / <80 보통 / <120 붐빔 / ≥120 혼잡', () => {
    expect(congestionBandLabel(0)).toBe('여유');
    expect(congestionBandLabel(39.9)).toBe('여유');
    expect(congestionBandLabel(40)).toBe('보통');
    expect(congestionBandLabel(80)).toBe('붐빔');
    expect(congestionBandLabel(120)).toBe('혼잡');
    expect(congestionBandLabel(250)).toBe('혼잡');
  });
});

describe('슬롯 키', () => {
  it('currentSlotKey — 30분 경계로 :00/:30 스냅', () => {
    expect(currentSlotKey(new Date(2026, 7, 17, 8, 0))).toBe('08:00');
    expect(currentSlotKey(new Date(2026, 7, 17, 8, 29))).toBe('08:00');
    expect(currentSlotKey(new Date(2026, 7, 17, 8, 30))).toBe('08:30');
    expect(currentSlotKey(new Date(2026, 7, 17, 0, 15))).toBe('00:00');
  });

  it('timeToSlotKey — 24+ 익일 표기를 0시대로 접는다(막차 24:46 → 00:30)', () => {
    expect(timeToSlotKey('08:15:00')).toBe('08:00');
    expect(timeToSlotKey('08:45:00')).toBe('08:30');
    expect(timeToSlotKey('24:46:00')).toBe('00:30');
    expect(timeToSlotKey('25:05:00')).toBe('01:00');
  });
});

describe('방향 매칭', () => {
  const dirs = [
    { updn: '상선', slots: [{ time: '08:00', level: 35 }] },
    { updn: '하선', slots: [{ time: '08:00', level: 90 }] },
  ];

  it('도착 updnLine 원문(내선/외선 포함)을 혼잡 방향으로 조인한다', () => {
    expect(matchCongestionDir('상행', dirs)?.updn).toBe('상선');
    expect(matchCongestionDir('내선', dirs)?.updn).toBe('상선');
    expect(matchCongestionDir('하행', dirs)?.updn).toBe('하선');
    expect(matchCongestionDir('외선', dirs)?.updn).toBe('하선');
  });

  it('접미가 붙은 원문은 부분 포함 폴백으로 잡는다', () => {
    const suffixed = [{ updn: '상선(내선)', slots: [] }];
    expect(matchCongestionDir('상행', suffixed)?.updn).toBe('상선(내선)');
  });

  it('congestionDirForUpdn — 시간표 updn(1/2) 기준 조인', () => {
    expect(congestionDirForUpdn('1', dirs)?.updn).toBe('상선');
    expect(congestionDirForUpdn('2', dirs)?.updn).toBe('하선');
    expect(congestionDirForUpdn('1', [])).toBeNull();
  });

  it('slotLevel — 방향 null·슬롯 미스·level null 전부 null', () => {
    expect(slotLevel(dirs[0]!, '08:00')).toBe(35);
    expect(slotLevel(dirs[0]!, '09:00')).toBeNull();
    expect(slotLevel(null, '08:00')).toBeNull();
    expect(slotLevel({ updn: '상선', slots: [{ time: '08:00', level: null }] }, '08:00')).toBeNull();
  });
});
