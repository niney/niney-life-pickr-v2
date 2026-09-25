import { describe, expect, it } from 'vitest';
import { normalizeEvChargerItems } from './ev-master.service.js';
import { parseEvStatusRows } from './ev-status.service.js';
import { airportLotKey, buildAirportList, kstToIso, parseIncheonRows, parseKacRows, parseSeoulLiveRows } from './parking-live.service.js';

// 실시간 행 해석(서울 시영·한국공항공사·인천공항)·공항 목록 조립·충전기 정규화/상태 행 — 순수 함수만. 폴링·이력 누적은
// 라우트 테스트(격리 DB)에서 본다.

const FETCHED = '2026-09-25T07:05:00.000Z';

describe('kstToIso', () => {
  it('서울·공항·인천·환경공단 시각 형식', () => {
    expect(kstToIso('2026-09-25 15:02:43')).toBe('2026-09-25T06:02:43.000Z');
    expect(kstToIso('20260925160346.000')).toBe('2026-09-25T07:03:46.000Z');
    expect(kstToIso('20260925153403')).toBe('2026-09-25T06:34:03.000Z');
    expect(kstToIso('')).toBeNull();
    expect(kstToIso('abc')).toBeNull();
  });
});

describe('parseSeoulLiveRows', () => {
  it('연계(1·2)만, 현재 대수·면수로 여석·단계, 버스전용 제외', () => {
    const m = parseSeoulLiveRows(
      [
        { PKLT_CD: '171721', PRK_STTS_YN: '1', TPKCT: 1260, NOW_PRK_VHCL_CNT: 384, NOW_PRK_VHCL_UPDT_TM: '2026-09-25 15:02:43', OPER_SE_NM: '시간제 주차장' },
        { PKLT_CD: '2', PRK_STTS_YN: '0', TPKCT: 10, NOW_PRK_VHCL_CNT: 0 },
        { PKLT_CD: '3', PRK_STTS_YN: '1', TPKCT: 50, NOW_PRK_VHCL_CNT: 50, OPER_SE_NM: '버스전용 주차장' },
      ],
      FETCHED,
    );
    expect([...m.keys()]).toEqual(['seoul:171721']);
    expect(m.get('seoul:171721')).toMatchObject({ total: 1260, occupied: 384, available: 876, level: 'free', updatedAt: '2026-09-25T06:02:43.000Z' });
  });
});

describe('공항', () => {
  it('한국공항공사 — 공항명으로 코드, 면수 0 은 값 없음', () => {
    const lots = parseKacRows(
      [
        { airportKor: '김포국제공항', parkingAirportCodeName: '국내선 제1주차장', parkingOccupiedSpace: 2279, parkingTotalSpace: 2279, sysGetdate: '2026-09-25', sysGettime: '16:03:03' },
        { airportKor: '청주국제공항', parkingAirportCodeName: '여객 제4주차장', parkingOccupiedSpace: 0, parkingTotalSpace: 0 },
        { airportKor: '없는공항', parkingAirportCodeName: 'P1' },
      ],
      FETCHED,
    );
    expect(lots).toHaveLength(2);
    expect(lots[0]).toMatchObject({ airportCode: 'GMP', level: 'full', rate: 1, updatedAt: '2026-09-25T07:03:03.000Z' });
    expect(lots[1]).toMatchObject({ airportCode: 'CJJ', total: null, level: null, rate: null });
  });

  it('인천 — 초과 주차(면수보다 많음)도 만차, 여석 0', () => {
    const lots = parseIncheonRows([{ floor: 'T1 단기주차장지하1층', parking: '534', parkingarea: '520', datetm: '20260925160346.000' }], FETCHED);
    expect(lots[0]).toMatchObject({ airportCode: 'ICN', name: 'T1 단기주차장지하1층', occupied: 534, total: 520, available: 0, level: 'full' });
  });

  it('공항 목록 — 상수 14곳 순서, 면수 있는 주차장 합으로 대표 단계, 평소 점유율 붙이기', () => {
    const kac = parseKacRows(
      [
        { airportKor: '김포국제공항', parkingAirportCodeName: 'A', parkingOccupiedSpace: 50, parkingTotalSpace: 100 },
        { airportKor: '김포국제공항', parkingAirportCodeName: 'B', parkingOccupiedSpace: 40, parkingTotalSpace: 100 },
      ],
      FETCHED,
    );
    const list = buildAirportList(kac, new Map([[airportLotKey('GMP', 'A'), 0.8]]));
    expect(list).toHaveLength(14);
    expect(list[0]!.code).toBe('ICN');
    const gmp = list.find((a) => a.code === 'GMP')!;
    expect(gmp).toMatchObject({ total: 200, occupied: 90, level: 'free' });
    expect(gmp.lots.map((l) => l.usualOcc)).toEqual([0.8, null]);
    expect(list.find((a) => a.code === 'ICN')!.lots).toEqual([]);
  });
});

describe('전기차 충전기', () => {
  const charger = (p: Record<string, unknown>): Record<string, unknown> => ({
    statNm: '중문 관광단지',
    statId: 'ME174050',
    chgerId: '01',
    chgerType: '06',
    addr: '제주특별자치도 서귀포시 색달동 2889-1',
    lat: '33.2461812',
    lng: '126.4143365',
    useTime: '24시간 이용가능',
    busiId: 'ME',
    busiNm: '기후에너지환경부',
    busiCall: '1661-9408',
    stat: '2',
    output: '50',
    method: '단독',
    kind: 'D0',
    kindDetail: 'D007',
    parkingFree: 'Y',
    limitYn: 'N',
    delYn: 'N',
    floorType: 'F',
    ...p,
  });

  it('충전소로 접고 급속·사용 가능·충전 중을 센다, 삭제·버스 전용·좌표 없음 제외', () => {
    const rep = normalizeEvChargerItems([
      charger({}),
      charger({ chgerId: '02', chgerType: '02', output: '7', stat: '3' }),
      charger({ chgerId: '03', delYn: 'Y' }),
      charger({ chgerId: '04', chgerType: '11' }),
      charger({ chgerId: '01' }),
      charger({ statId: 'X1', chgerId: '01', lat: '0', lng: '0' }),
    ]);
    expect(rep.stations).toHaveLength(1);
    expect(rep.stations[0]).toMatchObject({
      id: 'ME174050',
      chargerCount: 2,
      fastCount: 1,
      availableCount: 1,
      chargingCount: 1,
      hasFast: true,
      parkingFree: true,
      limited: false,
      operator: '기후에너지환경부',
    });
    expect(rep.chargers.map((c) => [c.chgerId, c.fast, c.outputKw])).toEqual([
      ['01', true, 50],
      ['02', false, 7],
    ]);
    expect(rep).toMatchObject({ droppedDeleted: 1, droppedBusOnly: 1, duplicates: 1, droppedBadCoord: 1 });
  });

  it('상태 행 — 같은 충전기는 늦은 갱신 쪽, 식별자·상태 없는 행 제외', () => {
    const rows = parseEvStatusRows([
      { statId: 'A', chgerId: '01', stat: '2', statUpdDt: '20260925150000' },
      { statId: 'A', chgerId: '01', stat: '3', statUpdDt: '20260925150500', nowTsdt: '20260925150500' },
      { statId: 'B', chgerId: '01', stat: '' },
      { chgerId: '01', stat: '2' },
    ]);
    expect(rows).toEqual([{ statId: 'A', chgerId: '01', stat: 3, statUpdDt: '20260925150500', lastTedt: null, nowTsdt: '20260925150500' }]);
  });
});
