import { describe, expect, it } from 'vitest';
import {
  congestionDayType,
  congestionLineId,
  normalizeCongestionRow,
  parseCongestionSlots,
} from './subway-congestion.service.js';

describe('congestionDayType / congestionLineId', () => {
  it('요일구분 → dayType 코드', () => {
    expect(congestionDayType('평일')).toBe('1');
    expect(congestionDayType('토요일')).toBe('2');
    expect(congestionDayType('일요일')).toBe('3');
    expect(congestionDayType('휴일')).toBeNull();
  });
  it('호선 → lineId (1~8호선만)', () => {
    expect(congestionLineId('1호선')).toBe('1001');
    expect(congestionLineId('8호선')).toBe('1008');
    expect(congestionLineId('9호선')).toBeNull(); // 데이터에 없음
    expect(congestionLineId('경의중앙선')).toBeNull();
  });
});

describe('parseCongestionSlots', () => {
  it('time 순 정렬 — 자정 이후(00시)는 23:30 뒤로, 값 numOrNull', () => {
    // 삽입 순서를 섞고 00시를 앞에 둬 정렬을 검증.
    const slots = parseCongestionSlots({
      '00시00분': '5.90',
      '00시30분': '1.30',
      '23시30분': '9.20',
      '5시30분': '8.0',
      '6시00분': '',
      호선: '1호선',
      역번호: 150,
    });
    expect(slots.map((s) => s.time)).toEqual(['05:30', '06:00', '23:30', '00:00', '00:30']);
    expect(slots[0]).toEqual({ time: '05:30', level: 8 });
    expect(slots[1]).toEqual({ time: '06:00', level: null }); // 공백 → null
    expect(slots.at(-1)).toEqual({ time: '00:30', level: 1.3 });
  });
});

describe('normalizeCongestionRow', () => {
  it('정상 행 — lineId·stationCd(zero-pad)·dayType·updn·slots', () => {
    const n = normalizeCongestionRow({
      요일구분: '평일',
      호선: '1호선',
      역번호: 150,
      출발역: '서울역',
      상하구분: '상선',
      '5시30분': '8.0',
      '6시00분': '20.70',
    });
    expect(n).not.toBeNull();
    expect(n).toMatchObject({
      lineId: '1001',
      stationName: '서울역',
      stationCd: '0150', // 역번호 150 → 4자리
      dayType: '1',
      updn: '상선',
    });
    expect(n!.slots).toEqual([
      { time: '05:30', level: 8 },
      { time: '06:00', level: 20.7 },
    ]);
  });

  it('2호선 내선(순환) 원문 보존', () => {
    const n = normalizeCongestionRow({
      요일구분: '토요일',
      호선: '2호선',
      역번호: 222,
      출발역: '강남',
      상하구분: '내선',
      '8시30분': '90.70',
    });
    expect(n).toMatchObject({ lineId: '1002', stationCd: '0222', dayType: '2', updn: '내선' });
  });

  it('매핑 불가(9호선/누락) → null', () => {
    expect(
      normalizeCongestionRow({ 요일구분: '평일', 호선: '9호선', 역번호: 1, 출발역: 'X', 상하구분: '상선' }),
    ).toBeNull();
    expect(
      normalizeCongestionRow({ 요일구분: '평일', 호선: '1호선', 역번호: 1, 상하구분: '상선' }),
    ).toBeNull(); // 출발역 누락
  });
});
