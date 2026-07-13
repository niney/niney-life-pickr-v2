import { describe, expect, it } from 'vitest';
import {
  normalizeBusMasterRows,
  type RawBusStopMasterRow,
} from './bus-master.service.js';

const row = (over: Partial<RawBusStopMasterRow> = {}): RawBusStopMasterRow => ({
  stId: '114000007',
  arsId: '15107',
  name: '목동3단지',
  lat: 37.534747,
  lng: 126.875742,
  stopType: '일반차로',
  ...over,
});

describe('normalizeBusMasterRows', () => {
  it('정상 행 채택 + 유형별 카운트', () => {
    const r = normalizeBusMasterRows([row(), row({ stId: '114000050', stopType: '마을버스' })]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({
      stId: '114000007',
      arsId: '15107',
      name: '목동3단지',
      lat: 37.534747,
      lng: 126.875742,
    });
    expect(r.byType.get('일반차로')).toBe(1);
    expect(r.byType.get('마을버스')).toBe(1);
  });

  it('한강선착장은 비버스 유형으로 drop', () => {
    const r = normalizeBusMasterRows([
      row({ stId: '123000689', arsId: '00001', name: '한강버스.잠실선착장', stopType: '한강선착장' }),
    ]);
    expect(r.rows).toHaveLength(0);
    expect(r.droppedExcludedType).toBe(1);
  });

  it('stId/arsId 형식 이상은 droppedBadId', () => {
    const r = normalizeBusMasterRows([
      row({ stId: null }),
      row({ arsId: '123' }),
      row({ arsId: 'abcde' }),
    ]);
    expect(r.rows).toHaveLength(0);
    expect(r.droppedBadId).toHaveLength(3);
  });

  it('한국 WGS84 범위 밖 좌표는 droppedBadCoord', () => {
    const r = normalizeBusMasterRows([
      row({ lat: 0, lng: 0 }),
      row({ stId: '2', lat: null }),
      // 경위도 뒤바뀜(서울 lng 가 lat 자리) 감지
      row({ stId: '3', lat: 126.87, lng: 37.53 }),
    ]);
    expect(r.rows).toHaveLength(0);
    expect(r.droppedBadCoord).toHaveLength(3);
  });

  it('stId 중복은 첫 행만 채택', () => {
    const r = normalizeBusMasterRows([row(), row({ name: '목동3단지(중복)' })]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.name).toBe('목동3단지');
    expect(r.duplicates).toBe(1);
  });

  it('정류소명 공백/누락은 droppedNoName', () => {
    const r = normalizeBusMasterRows([row({ name: '  ' }), row({ stId: '2', name: null })]);
    expect(r.rows).toHaveLength(0);
    expect(r.droppedNoName).toBe(2);
  });
});
