import { describe, expect, it } from 'vitest';
import {
  collectKotsaSigungu,
  dedupeKotsaRows,
  emptyKotsaReport,
  kotsaOperationFields,
  markKotsaPlaceholderCoords,
  normalizeKotsaSigungu,
  slimKotsaCollected,
} from './kotsa-master.service.js';
import type { ParkingLotRow } from './parking-master.service.js';

// 한국교통안전공단 주차정보(15099883) 정규화·수집 — 실측 응답(2026-10-05, 종로·광주 북구) 모양을 줄여 쓴다.

const fac = (p: Record<string, unknown> = {}): Record<string, unknown> => ({
  prk_center_id: '03119-11191-00001-00-1',
  prk_plce_nm: '청계7',
  prk_plce_adres: '서울특별시 종로구 청계천로 400',
  prk_plce_adres_sido: '서울특별시',
  prk_plce_adres_sigungu: '종로구',
  prk_plce_entrc_la: '37.5699701',
  prk_plce_entrc_lo: '127.0141458',
  prk_cmprt_co: '39',
  parkng_chrge_se: '2',
  parkng_chrge_se_nm: '유료',
  prk_manage_agent: '1',
  prk_manage_agent_nm: '공영',
  ...p,
});
const day = (start: string, end: string) => ({ opertn_start_time: start, opertn_end_time: end });
const opr = (p: Record<string, unknown> = {}): Record<string, unknown> => ({
  prk_center_id: '03119-11191-00001-00-1',
  opertn_bs_free_time: '0',
  Monday: day('090000', '190000'),
  Tuesday: day('090000', '190000'),
  Wednesday: day('090000', '190000'),
  Thursday: day('090000', '190000'),
  Friday: day('090000', '190000'),
  Saturday: day('090000', '150000'),
  Sunday: day('000000', '000000'),
  Holiday: day('000000', '000000'),
  basic_info: { parking_chrge_bs_time: '30', parking_chrge_bs_chrge: '900', parking_chrge_adit_unit_time: '10', parking_chrge_adit_unit_chrge: '0' },
  fxamt_info: { parking_chrge_one_day_chrge: '0', parking_chrge_mon_unit_chrge: '100000' },
  ...p,
});

describe('normalizeKotsaSigungu', () => {
  it('공영 + 요금 구분 있는 행 — 운영정보 매핑(추가 요금 0 은 정보 없음), 도로명 칸, 원천 접두 id', () => {
    const rep = normalizeKotsaSigungu({ sigunguCd: '11110', facility: [fac()], operation: [opr()] }, '2026-10-05');
    expect(rep.rows).toHaveLength(1);
    expect(rep.rows[0]).toMatchObject({
      id: 'kotsa:03119-11191-00001-00-1',
      source: 'kotsa',
      name: '청계7',
      ownership: 'public',
      feeType: 'paid',
      roadAddr: '서울특별시 종로구 청계천로 400',
      lotAddr: null,
      totalSpaces: 39,
      wdOpen: '09:00',
      wdClose: '19:00',
      satOpen: '09:00',
      satClose: '15:00',
      holOpen: '00:00',
      holClose: '00:00',
      baseMin: 30,
      baseFee: 900,
      addMin: null,
      addFee: null,
      dayPassFee: null,
      monthlyFee: 100000,
      liveKey: null,
      lat: 37.5699701,
      lng: 127.0141458,
      geoSource: 'source',
      baseDate: '2026-10-05',
    });
    expect(rep).toMatchObject({ facilityRows: 1, publicRows: 1, withOperation: 1 });
  });

  it('민영은 보지 않고, 공영이라도 요금 구분 없음·좌표 없음·이름 없음·쓰레기 ID 는 사유별로 뺀다', () => {
    const junk = Array.from({ length: 10 }, (_, i) => fac({ prk_center_id: '11812-99999-00019-00-1', prk_plce_nm: `노상${i}` }));
    const rep = normalizeKotsaSigungu(
      {
        sigunguCd: '29170',
        facility: [
          fac({ prk_center_id: 'a', prk_manage_agent: '2', prk_manage_agent_nm: '민영', parkng_chrge_se: '', parkng_chrge_se_nm: '' }),
          // 광주 북구 실측 — '공영'인데 개인 주택·업체, 요금 구분이 비어 있다.
          fac({ prk_center_id: 'b', prk_plce_nm: '고려택배', parkng_chrge_se: '', parkng_chrge_se_nm: '' }),
          // 좌표 없음 — 주소가 있으면 지오코딩 대상(lat/lng null)으로 남기고, 주소도 없으면 뺀다.
          fac({ prk_center_id: 'c', prk_plce_entrc_la: '', prk_plce_entrc_lo: '', prk_plce_adres: '대전광역시 중구 유천동 100-1' }),
          fac({ prk_center_id: 'c2', prk_plce_entrc_la: '0', prk_plce_entrc_lo: '0', prk_plce_adres: '' }),
          fac({ prk_center_id: 'd', prk_plce_nm: ' ' }),
          ...junk,
          fac({ prk_center_id: 'e', prk_plce_nm: '월산동 노상' }),
        ],
        operation: [],
      },
      '2026-10-05',
    );
    expect(rep.rows.map((r) => r.id)).toEqual(['kotsa:c', 'kotsa:e']);
    expect(rep.rows[0]).toMatchObject({ lat: null, lng: null, geoSource: null, roadAddr: null, lotAddr: '대전광역시 중구 유천동 100-1' });
    expect(rep.rows[1]!.lotType).toBe('street');
    expect(rep).toMatchObject({
      facilityRows: 16,
      publicRows: 15,
      droppedNoFeeType: 1,
      droppedNoLocation: 1,
      needGeocode: 1,
      droppedNoName: 1,
      droppedJunkId: 10,
      withOperation: 0,
    });
  });

  it('같은 관리 ID 가 좌표 없는 행 → 좌표 있는 행 순이면 좌표 있는 행으로 바꾸고, 반대 순서면 먼저 것을 둔다', () => {
    const noCoord = { prk_plce_entrc_la: '', prk_plce_entrc_lo: '', prk_plce_adres: '울산광역시 중구 남외동 983-14' };
    const swapped = normalizeKotsaSigungu(
      { sigunguCd: '31110', facility: [fac({ prk_center_id: 'x', ...noCoord }), fac({ prk_center_id: 'x', prk_plce_nm: '약사복개천' })], operation: [opr({ prk_center_id: 'x' })] },
      '2026-10-05',
    );
    expect(swapped.rows).toHaveLength(1);
    expect(swapped.rows[0]).toMatchObject({ id: 'kotsa:x', name: '약사복개천', lat: 37.5699701, geoSource: 'source' });
    expect(swapped).toMatchObject({ needGeocode: 0, droppedDupId: 1, withOperation: 1 });

    const kept = normalizeKotsaSigungu(
      { sigunguCd: '31110', facility: [fac({ prk_center_id: 'y' }), fac({ prk_center_id: 'y', ...noCoord })], operation: [] },
      '2026-10-05',
    );
    expect(kept.rows.map((r) => r.lat)).toEqual([37.5699701]);
    expect(kept).toMatchObject({ needGeocode: 0, droppedDupId: 1 });
  });

  it('시군구를 넘어 같은 관리 ID 는 한 번만, 가이드 필드명(prk_chrge_se)도 읽고 무료는 요금 칸을 비운다', () => {
    const rep = emptyKotsaReport();
    normalizeKotsaSigungu({ sigunguCd: '11110', facility: [fac()], operation: [] }, '2026-10-05', rep);
    normalizeKotsaSigungu(
      {
        sigunguCd: '11140',
        facility: [
          fac(),
          fac({ prk_center_id: 'f', parkng_chrge_se: undefined, prk_chrge_se: '1', prk_plce_adres: '서울특별시 중구 을지로동 100-1' }),
        ],
        operation: [opr({ prk_center_id: 'f' })],
      },
      '2026-10-05',
      rep,
    );
    expect(rep.rows.map((r) => r.id)).toEqual(['kotsa:03119-11191-00001-00-1', 'kotsa:f']);
    expect(rep.droppedDupId).toBe(1);
    expect(rep.rows[1]).toMatchObject({ feeType: 'free', baseMin: null, baseFee: null, dayPassFee: null, monthlyFee: 100000, roadAddr: null, lotAddr: '서울특별시 중구 을지로동 100-1' });
  });
});

describe('normalizeKotsaSigungu — 거주자 구획', () => {
  it('주거지·업무지 N구간·거주자우선주차장은 빼고 업무지구 공영은 남긴다', () => {
    const rep = normalizeKotsaSigungu(
      {
        sigunguCd: '26170',
        facility: [
          fac({ prk_center_id: 'r1', prk_plce_nm: '수5-5(주거지)' }),
          fac({ prk_center_id: 'r2', prk_plce_nm: '초량3동-업무지7구간' }),
          fac({ prk_center_id: 'r3', prk_plce_nm: '태평2동거주자우선주차장' }),
          fac({ prk_center_id: 'ok', prk_plce_nm: '동편업무지구(공영)' }),
        ],
        operation: [],
      },
      '2026-10-05',
    );
    expect(rep.rows.map((r) => r.name)).toEqual(['동편업무지구(공영)']);
    expect(rep.droppedResidentOnly).toBe(3);
  });
});

describe('kotsaOperationFields', () => {
  it('추가 요금이 있으면 둘 다, 기본 요금 0 은 정보 없음, 1일 요금은 1일권', () => {
    const withAdd = kotsaOperationFields(
      opr({
        basic_info: { parking_chrge_bs_time: '30', parking_chrge_bs_chrge: '1500', parking_chrge_adit_unit_time: '10', parking_chrge_adit_unit_chrge: '500' },
        fxamt_info: { parking_chrge_one_day_chrge: '15000', parking_chrge_mon_unit_chrge: '0' },
      }),
      'paid',
    );
    expect(withAdd).toMatchObject({ baseMin: 30, baseFee: 1500, addMin: 10, addFee: 500, dayPassFee: 15000, monthlyFee: null });
    const noBase = kotsaOperationFields(
      opr({ basic_info: { parking_chrge_bs_time: '30', parking_chrge_bs_chrge: '0', parking_chrge_adit_unit_time: '10', parking_chrge_adit_unit_chrge: '500' } }),
      'paid',
    );
    expect(noBase).toMatchObject({ baseMin: null, baseFee: null, addMin: null, addFee: null });
    // 정수 최댓값·월정액 오입력 — 1만 원(30분) 넘는 기본요금은 정보 없음.
    for (const bad of ['2147483647', '40000']) {
      const out = kotsaOperationFields(
        opr({ basic_info: { parking_chrge_bs_time: '30', parking_chrge_bs_chrge: bad, parking_chrge_adit_unit_time: '10', parking_chrge_adit_unit_chrge: '500' } }),
        'paid',
      );
      expect(out).toMatchObject({ baseMin: null, baseFee: null, addMin: null, addFee: null, monthlyFee: 100000 });
    }
  });

  it('평일 요일마다 다르면 월요일 기준 + 참고, 회차 무료 분, 일요일이 비면 휴일 시간', () => {
    const out = kotsaOperationFields(
      opr({ Friday: day('090000', '220000'), opertn_bs_free_time: '10', Sunday: {}, Holiday: day('100000', '180000') }),
      'paid',
    );
    expect(out).toMatchObject({ wdOpen: '09:00', wdClose: '19:00', holOpen: '10:00', holClose: '18:00' });
    expect(out.note).toBe('평일 요일마다 운영시간이 다름(월요일 기준 표시) · 기본 회차 10분 무료');
    expect(kotsaOperationFields(undefined, 'paid')).toMatchObject({ wdOpen: null, baseFee: null, note: null });
  });
});

// 오퍼레이션별 응답을 URL 로 골라 주는 가짜 fetch.
const kotsaFetch = (pages: { facility: Record<string, unknown>[][]; facilityTotal: number; operation: Record<string, unknown>[] }) => {
  const urls: string[] = [];
  const impl = async (url: string): Promise<Response> => {
    urls.push(url);
    const q = new URL(url).searchParams;
    if (url.includes('/PrkSttusInfo_v1')) {
      const items = pages.facility[Number(q.get('pageNo')) - 1] ?? [];
      return new Response(JSON.stringify({ resultCode: '0', totalCount: String(pages.facilityTotal), PrkSttusInfo: items }));
    }
    const n = Number(q.get('numOfRows'));
    return new Response(JSON.stringify({ resultCode: '0', totalCount: String(pages.operation.length), PrkOprInfo: pages.operation.slice(0, n) }));
  };
  return { impl, urls };
};
const space = <T>(fn: () => Promise<T>): Promise<T> => fn();
const priv = (id: string) => fac({ prk_center_id: id, prk_manage_agent: '2', parkng_chrge_se: '' });

describe('collectKotsaSigungu', () => {
  it('시설 첫 페이지 + 운영정보는 공영이 끝나는 위치 + 여유(50)만', async () => {
    const facility = [fac({ prk_center_id: 'p1' }), fac({ prk_center_id: 'p2' }), priv('m1'), priv('m2')];
    const f = kotsaFetch({ facility: [facility], facilityTotal: 4, operation: [opr({ prk_center_id: 'p1' }), opr({ prk_center_id: 'p2' })] });
    const c = await collectKotsaSigungu('k', '11110', { space, fetchImpl: f.impl });
    expect(c).toMatchObject({ sigunguCd: '11110', facilityTotal: 4, calls: 2 });
    expect(c.facility).toHaveLength(4);
    expect(c.operation.map((o) => o['prk_center_id'])).toEqual(['p1', 'p2']);
    expect(new URL(f.urls[1]!).searchParams.get('numOfRows')).toBe('52');
  });

  it('운영정보에 빠진 공영이 있으면 첫 페이지 전체로 한 번 더', async () => {
    const operation = [...Array.from({ length: 60 }, (_, i) => opr({ prk_center_id: `x${i}` })), opr({ prk_center_id: 'p1' })];
    const f = kotsaFetch({ facility: [[fac({ prk_center_id: 'p1' })]], facilityTotal: 1, operation });
    const c = await collectKotsaSigungu('k', '11110', { space, fetchImpl: f.impl });
    expect(c.calls).toBe(3);
    expect(new URL(f.urls[2]!).searchParams.get('numOfRows')).toBe('10000');
    expect(c.operation.some((o) => o['prk_center_id'] === 'p1')).toBe(true);
  });

  it('첫 페이지가 가득 차고 끝부분에도 공영이 있으면 다음 페이지까지, 목록이 비면(원천 결함) 운영은 안 부른다', async () => {
    const full = [...Array.from({ length: 9_500 }, (_, i) => priv(`m${i}`)), ...Array.from({ length: 500 }, (_, i) => fac({ prk_center_id: `p${i}` }))];
    const f = kotsaFetch({ facility: [full, [fac({ prk_center_id: 'q' }), priv('z')]], facilityTotal: 10_002, operation: [] });
    const c = await collectKotsaSigungu('k', '41360', { space, fetchImpl: f.impl });
    expect(c.facility).toHaveLength(10_002);
    expect(f.urls.filter((u) => u.includes('/PrkSttusInfo_v1'))).toHaveLength(2);

    const broken = kotsaFetch({ facility: [[]], facilityTotal: 13_817, operation: [] });
    const b = await collectKotsaSigungu('k', '42110', { space, fetchImpl: broken.impl });
    expect(b).toMatchObject({ facility: [], operation: [], facilityTotal: 13_817, calls: 1 });
  });

  it('저장본은 공영 시설과 그 운영정보만', () => {
    const slim = slimKotsaCollected({
      sigunguCd: '11110',
      facility: [fac({ prk_center_id: 'p1' }), priv('m1')],
      operation: [opr({ prk_center_id: 'p1' }), opr({ prk_center_id: 'm1' })],
      facilityTotal: 2,
      calls: 2,
    });
    expect(slim.facility.map((r) => r['prk_center_id'])).toEqual(['p1']);
    expect(slim.operation.map((o) => o['prk_center_id'])).toEqual(['p1']);
  });
});

describe('markKotsaPlaceholderCoords · dedupeKotsaRows', () => {
  const row = (id: string, name: string, lat: number | null, lng: number | null, geoSource: ParkingLotRow['geoSource'] = 'source'): ParkingLotRow =>
    ({ id: `kotsa:${id}`, source: 'kotsa', name, lat, lng, geoSource }) as ParkingLotRow;

  it('이름 다른 3곳 이상이 한 좌표에 몰리면 좌표를 지운다(2곳·같은 이름·지오코딩 좌표는 그대로)', () => {
    // 구미 실측 — 시민행복주차장·택지개발·이계천이 한 점.
    const spot = { lat: 36.115722, lng: 128.424778 };
    const rows = [
      row('a', '시민행복주차장', spot.lat, spot.lng),
      row('b', '택지개발', spot.lat, spot.lng),
      row('c', '이계천(삼성전자 옆)', spot.lat, spot.lng),
      row('p1', '압구정고가1', 37.527, 127.028),
      row('p2', '압구정고가2', 37.527, 127.028),
      row('s1', '대학로8가길', 37.58, 127.0),
      row('s2', '대학로8가길', 37.58, 127.0),
      row('s3', '대학로8가길', 37.58, 127.0),
      row('g1', '가', 35.1, 129.0, 'parcel'),
      row('g2', '나', 35.1, 129.0, 'parcel'),
      row('g3', '다', 35.1, 129.0, 'parcel'),
    ];
    expect(markKotsaPlaceholderCoords(rows)).toBe(3);
    expect(rows.filter((r) => r.lat === null).map((r) => r.id)).toEqual(['kotsa:a', 'kotsa:b', 'kotsa:c']);
    expect(rows.find((r) => r.id === 'kotsa:a')!.geoSource).toBeNull();
    // 지오코딩 뒤 — 주소도 뭉뚱그려져 한 점에 모인 행(g1~g3)까지.
    expect(markKotsaPlaceholderCoords(rows, { includeGeocoded: true })).toBe(3);
    expect(rows.filter((r) => r.lat === null).map((r) => r.id)).toEqual(['kotsa:a', 'kotsa:b', 'kotsa:c', 'kotsa:g1', 'kotsa:g2', 'kotsa:g3']);
  });

  it('이름이 같고 300m 안이면 하나만 — 원천 좌표 행을 주소로 찾은 행보다 먼저 남긴다', () => {
    // 원서공원앞 실측 — 주소로 찾은 필지 중심과 원천 입구 좌표가 151m.
    const rows = [row('geo', '원서공원앞', 37.5800, 126.9890, 'parcel'), row('src', '원서공원앞', 37.5813, 126.9893)];
    const { kept, dropped } = dedupeKotsaRows(rows);
    expect(dropped).toBe(1);
    expect(kept.map((r) => r.id)).toEqual(['kotsa:src']);
  });

  it('이름이 같고 가까우면 앞 행만, 이름이 다르거나 멀거나 좌표가 없으면 남긴다', () => {
    const rows = [
      row('a', '대학로8가길', 37.58, 127.0),
      row('b', '대학로 8가길', 37.5801, 127.0),
      row('c', '대학로8가길', 37.59, 127.0),
      row('d', '이화장길', 37.58, 127.0),
      row('e', '대학로8가길', null, null, null),
    ];
    const { kept, dropped } = dedupeKotsaRows(rows);
    expect(dropped).toBe(1);
    expect(kept.map((r) => r.id)).toEqual(['kotsa:a', 'kotsa:c', 'kotsa:d', 'kotsa:e']);
  });
});
