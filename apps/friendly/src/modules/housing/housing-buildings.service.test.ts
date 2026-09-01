import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { loadHousingBuildings, normalizeBldgDate, summarizeBldgRecords } from './housing-buildings.service.js';

// 건축물대장 보강 — ① 요약 규칙(총괄 우선·주거동만·최빈 구조·승강기 합·날짜) ② 격리 DB 적재(덮어쓰는 열과
// 비어 있을 때만 채우는 열, 0건도 장부 기록, PNU 이상, --max-calls 중단, 인증 오류 중단) 을 fetch 목으로 확인.

const ok = (items: unknown, totalCount: number): string =>
  JSON.stringify({ response: { header: { resultCode: '00' }, body: { items, totalCount, pageNo: 1, numOfRows: 100 } } });
const res = (body: string, status = 200): Response => new Response(body, { status });

describe('summarizeBldgRecords', () => {
  it('총괄표제부 우선 + 표제부 주거동만으로 층·구조·승강기', () => {
    const recap = [{ totPkngCnt: '120', hhldCnt: '168', mainBldCnt: '3', useAprDay: '20200115', newPlatPlc: '서울특별시 중구 정동길 1', indrAutoUtcnt: '100', oudrAutoUtcnt: '20' }];
    const titles = [
      { dongNm: '101', mainPurpsCdNm: '아파트', grndFlrCnt: '15', ugrndFlrCnt: '2', strctCdNm: '철근콘크리트구조', rideUseElvtCnt: '2', emgenUseElvtCnt: '1', hhldCnt: '84', useAprDay: '20200115' },
      { dongNm: '102', mainPurpsCdNm: '아파트', grndFlrCnt: 20, strctCdNm: '철근콘크리트구조', rideUseElvtCnt: 2, emgenUseElvtCnt: 0, hhldCnt: 84, useAprDay: '20200120' },
      { dongNm: '상가', mainPurpsCdNm: '제1종근린생활시설', grndFlrCnt: '30', strctCdNm: '철골구조', rideUseElvtCnt: '9', hhldCnt: '0' },
    ];
    expect(summarizeBldgRecords(recap, titles)).toEqual({
      hasData: true,
      parkingCount: 120,
      floorsMax: 20,
      structure: '철근콘크리트구조',
      elevatorCount: 5,
      roadAddr: '서울특별시 중구 정동길 1',
      households: 168,
      dongCount: 3,
      approvedDate: '2020-01-15',
    });
  });

  it('총괄이 없으면 표제부 합·최댓값·주차 4종 합, 전부 없으면 hasData=false', () => {
    const titles = [
      { mainPurpsCdNm: '공동주택', grndFlrCnt: '5', strctCdNm: '벽돌구조', hhldCnt: '20', useAprDay: '19951231', indrAutoUtcnt: '3', oudrAutoUtcnt: '4', newPlatPlc: '경기도 성남시 분당구 정자로 1' },
      { mainPurpsCdNm: '공동주택', grndFlrCnt: '7', strctCdNm: '철근콘크리트구조', hhldCnt: '30', useAprDay: '19960301', indrMechUtcnt: '1' },
      { mainPurpsCdNm: '공동주택', grndFlrCnt: '6', strctCdNm: '철근콘크리트구조', hhldCnt: '10', useAprDay: '19960301' },
    ];
    expect(summarizeBldgRecords([], titles)).toEqual({
      hasData: true,
      parkingCount: 8,
      floorsMax: 7,
      structure: '철근콘크리트구조',
      elevatorCount: null,
      roadAddr: '경기도 성남시 분당구 정자로 1',
      households: 60,
      dongCount: 3,
      approvedDate: '1996-03-01',
    });
    expect(summarizeBldgRecords([], []).hasData).toBe(false);
    expect(normalizeBldgDate('2020-01-15')).toBe('2020-01-15');
    expect(normalizeBldgDate('20201340')).toBeNull();
    expect(normalizeBldgDate(null)).toBeNull();
  });
});

describe('loadHousingBuildings (격리 DB)', () => {
  let prisma: PrismaClient;
  let isolated: IsolatedDatabase;
  const BASE = { source: 'reb', kind: 'apt', sido: '서울특별시', sgg: '종로구', sggCd: '11110', umd: '청운동', baseDate: '2025-09-18' };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.housingComplex.createMany({
      data: [
        { ...BASE, id: 'A', name: '큰단지', addr: '서울특별시 종로구 청운동 56-45', jibun: '56-45', pnu: '1111010100100560045', households: 500, elevatorCount: 9, roadAddr: null, dongCount: null },
        { ...BASE, id: 'B', name: '없는단지', addr: '서울특별시 종로구 청운동 1', jibun: '1', pnu: '1111010100100010000', households: 100 },
        { ...BASE, id: 'C', name: 'PNU이상', addr: '서울특별시 종로구 청운동 2', jibun: '2', pnu: 'bad', households: 50 },
        { ...BASE, id: 'D', name: 'PNU없음', addr: '서울특별시 종로구 청운동 3', jibun: '3', pnu: null, households: 999 },
      ],
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  const fetchImpl = vi.fn(async (url: string) => {
    const u = new URL(url);
    const bun = u.searchParams.get('bun');
    const op = u.pathname.endsWith('getBrRecapTitleInfo') ? 'recap' : 'title';
    if (bun === '0056') {
      return res(
        op === 'recap'
          ? ok({ item: [{ totPkngCnt: '300', hhldCnt: '520', mainBldCnt: '4', useAprDay: '20050101', newPlatPlc: '서울특별시 종로구 자하문로 1' }] }, 1)
          : ok({ item: [{ mainPurpsCdNm: '아파트', grndFlrCnt: '25', strctCdNm: '철근콘크리트구조', rideUseElvtCnt: '4', emgenUseElvtCnt: '0' }] }, 1),
      );
    }
    return res(JSON.stringify({ response: { header: { resultCode: '03', resultMsg: 'NODATA_ERROR' }, body: { items: '', totalCount: 0 } } }));
  });

  it('세대수 큰 순으로 처리, 덮어쓰기/비어 있을 때만, 0건·PNU 이상도 장부 기록', async () => {
    const now = new Date('2026-08-30T10:00:00.000Z');
    const r = await loadHousingBuildings(prisma, { serviceKey: 'k', fetchImpl, pauseMs: 0, now: () => now });
    expect(r).toMatchObject({ targets: 3, done: 3, calls: 4, withData: 1, empty: 2, transientErrors: 0, stoppedBy: null, authError: null });
    // 큰 단지(A)가 먼저 — 첫 두 호출이 0056.
    expect((fetchImpl.mock.calls[0]![0] as string)).toContain('bun=0056');
    const a = await prisma.housingComplex.findUnique({ where: { id: 'A' } });
    expect(a).toMatchObject({
      parkingCount: 300,
      floorsMax: 25,
      structure: '철근콘크리트구조',
      elevatorCount: 9, // 이미 있던 값 유지
      roadAddr: '서울특별시 종로구 자하문로 1',
      households: 500, // 이미 있던 값 유지
      dongCount: 4,
      approvedDate: '2005-01-01',
    });
    expect(a?.buildingFetchedAt?.toISOString()).toBe(now.toISOString());
    const b = await prisma.housingComplex.findUnique({ where: { id: 'B' } });
    expect(b).toMatchObject({ parkingCount: null, floorsMax: null });
    expect(b?.buildingFetchedAt).not.toBeNull();
    expect((await prisma.housingComplex.findUnique({ where: { id: 'C' } }))?.buildingFetchedAt).not.toBeNull();
    expect((await prisma.housingComplex.findUnique({ where: { id: 'D' } }))?.buildingFetchedAt).toBeNull();
    expect(await prisma.housingSync.findFirst({ where: { kind: 'buildings' } })).toMatchObject({ count: 3 });

    // 재실행은 대상 0 — 장부 덕.
    const again = await loadHousingBuildings(prisma, { serviceKey: 'k', fetchImpl, pauseMs: 0 });
    expect(again.targets).toBe(0);
    // --only-missing 은 주차·층·구조가 전부 빈 B·C 만 다시.
    const retry = await loadHousingBuildings(prisma, { serviceKey: 'k', fetchImpl, pauseMs: 0, retryEmpty: true, maxCalls: 2 });
    expect(retry.targets).toBe(2);
    expect(retry.done).toBe(1);
    expect(retry.stoppedBy).toBe('max-calls');
  });

  it('인증 오류(30) 는 즉시 중단·장부 미기록', async () => {
    await prisma.housingComplex.update({ where: { id: 'B' }, data: { buildingFetchedAt: null } });
    const auth = vi.fn(async () =>
      res(JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnAuthMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnReasonCode: '30' } } })),
    );
    const r = await loadHousingBuildings(prisma, { serviceKey: 'k', fetchImpl: auth, pauseMs: 0 });
    expect(r.targets).toBe(1);
    expect(r.done).toBe(0);
    expect(r.authError?.code).toBe('30');
    expect(r.stoppedBy).toContain('30');
    expect((await prisma.housingComplex.findUnique({ where: { id: 'B' } }))?.buildingFetchedAt).toBeNull();
  });
});
