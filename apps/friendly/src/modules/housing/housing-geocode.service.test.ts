import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { geocodeMissingHousingComplexes, housingJibunVariants } from './housing-geocode.service.js';

// 좌표 보완 — ① 지번 변형 후보 순서 ② 격리 DB(캐시만, offline): 도로명 캐시로 해결·지번 변형 캐시로 해결·전부
// notfound 면 미해결, 좌표 있는 단지는 대상 아님, sync 기록 을 확인한다.

describe('housingJibunVariants', () => {
  it('정규화 → 산 접두 토글 → 부번 제거(원문 제외·중복 제거)', () => {
    expect(housingJibunVariants('0578-0005')).toEqual(['578-5', '산578-5', '578']);
    expect(housingJibunVariants('56-45')).toEqual(['산56-45', '56']);
    expect(housingJibunVariants('산1-8')).toEqual(['1-8', '산1']);
    expect(housingJibunVariants('1')).toEqual(['산1']);
    expect(housingJibunVariants(null)).toEqual([]);
  });
});

describe('geocodeMissingHousingComplexes (격리 DB, 캐시만)', () => {
  let prisma: PrismaClient;
  let isolated: IsolatedDatabase;
  const BASE = { source: 'reb', kind: 'apt', sido: '서울특별시', sgg: '종로구', sggCd: '11110', baseDate: '2025-09-18' };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.housingComplex.createMany({
      data: [
        { ...BASE, id: 'G1', name: '도로명으로', addr: '서울특별시 종로구 내수동 73', umd: '내수동', jibun: '73', roadAddr: '서울특별시 종로구 사직로9길 20' },
        { ...BASE, id: 'G2', name: '변형으로', addr: '서울특별시 종로구 창신동 0702', umd: '창신동', jibun: '0702' },
        { ...BASE, id: 'G3', name: '못찾음', addr: '서울특별시 종로구 없는동 1', umd: '없는동', jibun: '1' },
        { ...BASE, id: 'G4', name: '이미있음', addr: '서울특별시 종로구 청운동 1', umd: '청운동', jibun: '1', lat: 37.5, lng: 127.0, geoSource: 'parcel' },
      ],
    });
    await prisma.lifeGeocodeCache.createMany({
      data: [
        { type: 'road', address: '서울특별시 종로구 사직로9길 20', status: 'ok', lat: 37.5741, lng: 126.9712, refined: null },
        { type: 'parcel', address: '서울특별시 종로구 창신동 0702', status: 'notfound', lat: null, lng: null, refined: null },
        { type: 'parcel', address: '서울특별시 종로구 창신동 702', status: 'ok', lat: 37.5758, lng: 127.0092, refined: null },
        { type: 'parcel', address: '서울특별시 종로구 없는동 1', status: 'notfound', lat: null, lng: null, refined: null },
        { type: 'parcel', address: '서울특별시 종로구 없는동 산1', status: 'notfound', lat: null, lng: null, refined: null },
      ],
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  it('도로명·지번·지번 변형 순으로 채우고 미해결은 남긴다', async () => {
    const logs: string[] = [];
    const r = await geocodeMissingHousingComplexes(prisma, { geocode: { key: '', offline: true }, log: (m) => logs.push(m) });
    expect(r).toMatchObject({ targets: 3, resolved: 2, resolvedByVariant: 1, unresolved: 1, apiCalls: 0, stoppedBy: 'offline' });
    expect(r.passes.length).toBeGreaterThanOrEqual(2);
    expect(logs[0]).toContain('도로명·지번');
    const g1 = await prisma.housingComplex.findUnique({ where: { id: 'G1' } });
    expect(g1).toMatchObject({ lat: 37.5741, lng: 126.9712, geoSource: 'road' });
    const g2 = await prisma.housingComplex.findUnique({ where: { id: 'G2' } });
    expect(g2).toMatchObject({ lat: 37.5758, lng: 127.0092, geoSource: 'parcel' });
    expect((await prisma.housingComplex.findUnique({ where: { id: 'G3' } }))?.lat).toBeNull();
    expect((await prisma.housingComplex.findUnique({ where: { id: 'G4' } }))?.lat).toBe(37.5);
    expect(await prisma.housingSync.findFirst({ where: { kind: 'geocode' } })).toMatchObject({ count: 3, geocoded: 2 });

    // 재실행 — 남은 G3 만 대상.
    const again = await geocodeMissingHousingComplexes(prisma, { geocode: { key: '', offline: true }, skipVariants: true });
    expect(again).toMatchObject({ targets: 1, resolved: 0, unresolved: 1 });
  });
});
