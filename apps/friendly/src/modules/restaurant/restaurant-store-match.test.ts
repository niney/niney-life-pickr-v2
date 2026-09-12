import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import {
  STORE_MATCH_MAX_DIST_M,
  bigramDice,
  getRestaurantStoreInfo,
  matchRestaurantStores,
  storeNameScore,
} from './restaurant-store-match.service.js';

// 맛집 ↔ 상가업소 매칭 — ① 점수 함수(완전일치·포함·바이그램) ② 격리 DB 로 생성 → 유지 → 사라짐(폐업 의심)
// → 복귀 흐름과 80m·0.5 임계, 이전 업소 우선(안정성), dry-run 무쓰기, 상세 응답 필드.

describe('storeNameScore', () => {
  it('정규화 후 완전일치 1 — 지점명·법인 표기·공백 무시', () => {
    expect(storeNameScore('명동교자', '명동교자', '본점')).toBe(1);
    expect(storeNameScore('맘스터치 세종보람점', '맘스터치', '세종보람점')).toBe(1);
    expect(storeNameScore('스타벅스', '(주)스타벅스', null)).toBe(1);
  });
  it('한쪽이 다른 쪽을 포함하면 0.85, 아니면 바이그램 Dice', () => {
    expect(storeNameScore('본죽', '본죽&비빔밥카페', null)).toBe(0.85);
    expect(storeNameScore('교자', '명동교자', null)).toBe(0.85);
    expect(storeNameScore('명동교자', '명동칼국수', null)).toBeCloseTo(bigramDice('명동교자', '명동칼국수'), 5);
    expect(storeNameScore('명동교자', '명동칼국수', null)).toBeLessThan(0.5);
    expect(storeNameScore('', '명동교자', null)).toBe(0);
  });
  it('bigramDice — 동일 1, 무관 0, 1글자는 유니그램', () => {
    expect(bigramDice('abc', 'abc')).toBe(1);
    expect(bigramDice('abc', 'xyz')).toBe(0);
    expect(bigramDice('a', 'a')).toBe(1);
    expect(bigramDice('한식당', '한식집')).toBeCloseTo(0.5, 5);
  });
});

describe('matchRestaurantStores (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let prisma: PrismaClient;
  // 서울시청 근방. 0.0005° ≈ 55m(위도).
  const BASE = { lat: 37.5665, lng: 126.978 };
  const store = (id: string, name: string, dLat: number, dLng: number, over: Partial<{ branch: string | null; kind: string; sclsName: string }> = {}) => ({
    id,
    name,
    branch: over.branch ?? null,
    kind: over.kind ?? 'food',
    mclsCd: 'I201',
    sclsCd: 'I20105',
    sclsName: over.sclsName ?? '국수/칼국수',
    ksicName: '한식 면 요리 전문점',
    sggCd: '11140',
    sggName: '중구',
    umdName: '태평로1가',
    roadAddr: '서울특별시 중구 세종대로 110',
    lotAddr: null,
    bldName: null,
    floor: '1',
    lat: BASE.lat + dLat,
    lng: BASE.lng + dLng,
  });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.canonicalRestaurant.createMany({
      data: [
        { id: 'C-jongno', name: '명동교자 본점', latitude: BASE.lat, longitude: BASE.lng },
        { id: 'C-far', name: '명동교자', latitude: BASE.lat + 0.01, longitude: BASE.lng },
        { id: 'C-nocoord', name: '좌표없음', latitude: null, longitude: null },
        { id: 'C-unlike', name: '피자헛', latitude: BASE.lat, longitude: BASE.lng },
      ],
    });
    await prisma.lifeStore.createMany({
      data: [
        store('S-1', '명동교자', 0.0002, 0), // ≈22m, 완전일치
        store('S-2', '명동교자', 0.0004, 0.0003), // ≈52m, 완전일치 — 더 멀어 후순위
        store('S-pharm', '명동교자약국', 0.0001, 0, { kind: 'pharmacy', sclsName: '약국' }), // kind 밖
        store('S-noodle', '명동칼국수', 0.0001, 0), // 이름 점수 < 0.5
      ],
    });
    await prisma.lifeMasterSync.create({ data: { layer: 'store', count: 4, baseDate: '2026-06-30', sourceFile: 'store-202606.zip' } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  it('첫 실행 — 80m 안 완전일치 중 가까운 업소로 생성, 멀거나 이름 다르면 미매칭, 좌표 없으면 검토 제외', async () => {
    const r = await matchRestaurantStores(prisma, { now: () => new Date('2026-09-01T00:00:00Z') });
    expect(r).toMatchObject({ scanned: 3, created: 1, rematched: 0, kept: 0, newlyMissing: 0, stillMissing: 0, recovered: 0, unmatched: 2 });
    const m = await prisma.restaurantStoreMatch.findUnique({ where: { canonicalId: 'C-jongno' } });
    expect(m).toMatchObject({ bizesId: 'S-1', storeName: '명동교자', kind: 'food', sclsName: '국수/칼국수', nameScore: 1, status: 'matched', missingSince: null });
    expect(m!.distM).toBeLessThanOrEqual(STORE_MATCH_MAX_DIST_M);
    expect(m!.matchedAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(await prisma.restaurantStoreMatch.count()).toBe(1);
  });

  it('상세 응답 필드 — 적재 기준일이 붙고 closedSuspect=false', async () => {
    const info = await getRestaurantStoreInfo(prisma, 'C-jongno');
    expect(info).toMatchObject({ bizesId: 'S-1', name: '명동교자', industry: '국수/칼국수', ksicName: '한식 면 요리 전문점', closedSuspect: false, missingSince: null, baseDate: '2026-06-30' });
    expect(await getRestaurantStoreInfo(prisma, 'C-far')).toBeNull();
  });

  it('재실행 — 이전 업소가 남아 있으면 더 가까운 후보가 생겨도 유지(kept), lastSeenAt 갱신', async () => {
    await prisma.lifeStore.create({ data: store('S-0', '명동교자', 0.00005, 0) }); // ≈5m
    const r = await matchRestaurantStores(prisma, { now: () => new Date('2026-09-02T00:00:00Z') });
    expect(r).toMatchObject({ created: 0, rematched: 0, kept: 1, newlyMissing: 0 });
    const m = await prisma.restaurantStoreMatch.findUnique({ where: { canonicalId: 'C-jongno' } });
    expect(m!.bizesId).toBe('S-1');
    expect(m!.lastSeenAt.toISOString()).toBe('2026-09-02T00:00:00.000Z');
    expect(m!.matchedAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('이전 업소가 사라지면 다른 후보로 옮기고(rematched), 후보가 아예 없으면 missing + missingSince 1회', async () => {
    await prisma.lifeStore.delete({ where: { id: 'S-1' } });
    const r1 = await matchRestaurantStores(prisma, { now: () => new Date('2026-09-03T00:00:00Z') });
    expect(r1).toMatchObject({ rematched: 1, newlyMissing: 0 });
    let m = await prisma.restaurantStoreMatch.findUnique({ where: { canonicalId: 'C-jongno' } });
    expect(m!.bizesId).toBe('S-0');
    expect(m!.matchedAt.toISOString()).toBe('2026-09-03T00:00:00.000Z');

    await prisma.lifeStore.deleteMany({ where: { id: { in: ['S-0', 'S-2'] } } });
    const r2 = await matchRestaurantStores(prisma, { now: () => new Date('2026-09-04T00:00:00Z') });
    expect(r2).toMatchObject({ newlyMissing: 1, stillMissing: 0, unmatched: 2 });
    m = await prisma.restaurantStoreMatch.findUnique({ where: { canonicalId: 'C-jongno' } });
    expect(m).toMatchObject({ bizesId: 'S-0', status: 'missing' });
    expect(m!.missingSince!.toISOString()).toBe('2026-09-04T00:00:00.000Z');
    const info = await getRestaurantStoreInfo(prisma, 'C-jongno');
    expect(info).toMatchObject({ closedSuspect: true, missingSince: '2026-09-04T00:00:00.000Z' });

    // 한 번 더 — missingSince 는 그대로(계속 사라진 상태).
    const r3 = await matchRestaurantStores(prisma, { now: () => new Date('2026-09-05T00:00:00Z') });
    expect(r3).toMatchObject({ newlyMissing: 0, stillMissing: 1 });
    m = await prisma.restaurantStoreMatch.findUnique({ where: { canonicalId: 'C-jongno' } });
    expect(m!.missingSince!.toISOString()).toBe('2026-09-04T00:00:00.000Z');
  });

  it('다시 나타나면 matched 로 복귀(recovered)·missingSince 해제; dry-run 은 쓰지 않는다', async () => {
    await prisma.lifeStore.create({ data: store('S-0', '명동교자', 0.00005, 0) });
    const dry = await matchRestaurantStores(prisma, { dryRun: true, now: () => new Date('2026-09-06T00:00:00Z') });
    expect(dry).toMatchObject({ recovered: 1 });
    expect((await prisma.restaurantStoreMatch.findUnique({ where: { canonicalId: 'C-jongno' } }))!.status).toBe('missing');

    const r = await matchRestaurantStores(prisma, { now: () => new Date('2026-09-06T00:00:00Z') });
    expect(r).toMatchObject({ recovered: 1, stillMissing: 0 });
    const m = await prisma.restaurantStoreMatch.findUnique({ where: { canonicalId: 'C-jongno' } });
    expect(m).toMatchObject({ bizesId: 'S-0', status: 'matched', missingSince: null });
    expect(m!.lastSeenAt.toISOString()).toBe('2026-09-06T00:00:00.000Z');
  });
});
