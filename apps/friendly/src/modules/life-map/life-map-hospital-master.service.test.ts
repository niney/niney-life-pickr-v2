import { describe, expect, it } from 'vitest';
import { HiraApiAuthError, fetchHiraHospPage } from './hira-hospital.adapter.js';
import { fetchAllHiraHospitals, normalizeLifeHospitalRows } from './life-map-hospital-master.service.js';

// 병의원 마스터 — 정규화(순수 함수)와 어댑터 파싱(가짜 fetch)만. 전량 교체·라우트는 life-map.test 가 본다.

const raw = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ykiho: 'YK-1',
  yadmNm: '시청내과의원',
  clCd: 31,
  clCdNm: '의원',
  sidoCdNm: '서울',
  sgguCdNm: '중구',
  emdongNm: '태평로1가',
  postNo: 4524,
  addr: '서울특별시 중구 세종대로 110',
  telno: '02-1111-2222',
  hospUrl: 'www.example.com',
  estbDd: 20101103,
  drTotCnt: 3,
  XPos: '126.9783',
  YPos: '37.5667',
  ...over,
});

describe('normalizeLifeHospitalRows', () => {
  it('정상 행 — 좌표 채택(geoSource=api)·종별 정규화·개설일/우편번호/URL 정리', () => {
    const report = normalizeLifeHospitalRows([raw()]);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      id: 'YK-1',
      name: '시청내과의원',
      kindName: '의원',
      category: '의원',
      postNo: '4524',
      phone: '02-1111-2222',
      url: 'http://www.example.com',
      openedDate: '2010-11-03',
      doctorCount: 3,
      lat: 37.5667,
      lng: 126.9783,
      geoSource: 'api',
    });
    expect(report.coordMissing).toBe(0);
  });

  it('종별 → 카테고리 — 상급종합=종합병원, 치과·한방·보건 묶음, 모르는 값은 기타', () => {
    const kinds: [string, string][] = [
      ['상급종합병원', '종합병원'],
      ['요양병원', '병원'],
      ['치과병원', '치과'],
      ['한의원', '한방'],
      ['보건진료소', '보건기관'],
      ['조산원', '기타'],
    ];
    const report = normalizeLifeHospitalRows(kinds.map(([k], i) => raw({ ykiho: `YK-${i}`, clCdNm: k })));
    expect(report.rows.map((r) => [r.kindName, r.category])).toEqual(kinds);
  });

  it('좌표 결측·한국 밖 — drop 대신 null 적재(coordMissing 집계), 지오코딩 보완 대상', () => {
    const report = normalizeLifeHospitalRows([
      raw({ ykiho: 'YK-A', XPos: '', YPos: '' }),
      raw({ ykiho: 'YK-B', XPos: '0', YPos: '0' }),
      raw({ ykiho: 'YK-C' }),
    ]);
    expect(report.coordMissing).toBe(2);
    expect(report.rows.filter((r) => r.lat === null).map((r) => r.id).sort()).toEqual(['YK-A', 'YK-B']);
    expect(report.rows.find((r) => r.id === 'YK-A')).toMatchObject({ geoSource: null });
  });

  it('요양기호/기관명 누락 drop·중복 접힘·쓰레기 URL 버림', () => {
    const report = normalizeLifeHospitalRows([
      raw(),
      raw(), // 중복
      raw({ ykiho: '' }),
      raw({ ykiho: 'YK-2', yadmNm: '' }),
      raw({ ykiho: 'YK-3', hospUrl: 'http' }),
    ]);
    expect(report.rows.map((r) => r.id)).toEqual(['YK-1', 'YK-3']);
    expect(report.duplicates).toBe(1);
    expect(report.droppedBadId).toBe(2);
    expect(report.rows.find((r) => r.id === 'YK-3')!.url).toBeNull();
  });
});

describe('hira-hospital.adapter + fetchAllHiraHospitals (가짜 fetch)', () => {
  const jsonRes = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
  const page = (items: unknown, totalCount: number, pageNo: number) =>
    jsonRes({ response: { header: { resultCode: '00' }, body: { totalCount, pageNo, numOfRows: 2, items } } });

  it('items 게이트웨이 버릇 — 배열/단일 객체/빈 문자열 셋 다 흡수', async () => {
    const arr = await fetchHiraHospPage(
      { pageNo: 1, numOfRows: 2 },
      { serviceKey: 'k', fetchImpl: async () => page({ item: [raw(), raw({ ykiho: 'YK-2' })] }, 2, 1) },
    );
    expect(arr.items).toHaveLength(2);
    const single = await fetchHiraHospPage(
      { pageNo: 1, numOfRows: 2 },
      { serviceKey: 'k', fetchImpl: async () => page({ item: raw() }, 1, 1) },
    );
    expect(single.items).toHaveLength(1);
    const empty = await fetchHiraHospPage(
      { pageNo: 1, numOfRows: 2 },
      { serviceKey: 'k', fetchImpl: async () => page('', 0, 1) },
    );
    expect(empty.items).toEqual([]);
    expect(empty.totalCount).toBe(0);
  });

  it('게이트웨이 30(키 미등록) — HiraApiAuthError, 마스킹 URL 만 보존', async () => {
    const err = await fetchHiraHospPage(
      { pageNo: 1, numOfRows: 2 },
      {
        serviceKey: 'secret-key',
        fetchImpl: async () =>
          jsonRes({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE ERROR', returnAuthMsg: '등록되지 않은 서비스키', returnReasonCode: '30' } } }),
      },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HiraApiAuthError);
    expect((err as HiraApiAuthError).code).toBe('30');
    expect((err as HiraApiAuthError).requestUrl).toContain('serviceKey=***');
    expect((err as HiraApiAuthError).requestUrl).not.toContain('secret-key');
  });

  it('전량 페이징 — totalCount 까지 순차 수집 후 중단', async () => {
    const pages = [
      [raw({ ykiho: 'A' }), raw({ ykiho: 'B' })],
      [raw({ ykiho: 'C' })],
    ];
    let calls = 0;
    const result = await fetchAllHiraHospitals({
      serviceKey: 'k',
      pageSize: 2,
      fetchImpl: async () => {
        calls += 1;
        return page({ item: pages[calls - 1] ?? [] }, 3, calls);
      },
    });
    expect(calls).toBe(2);
    expect(result.items.map((i) => i['ykiho'])).toEqual(['A', 'B', 'C']);
    expect(result.totalCount).toBe(3);
  });
});
