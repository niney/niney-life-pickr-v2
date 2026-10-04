import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import {
  getRestaurantTourMatchInfo,
  isTourMatchAccepted,
  loadTourMatchPlaceIndex,
  matchRestaurantTour,
  tourMatchPlacesNear,
  tourPlaceNameScore,
} from './restaurant-tour-match.service.js';

// 맛집 ↔ 여행로그 장소 매칭 — ① 점수·수락 규칙(100m·0.5 / 완전일치 300m / 별칭) ② 격리 DB 로 생성 → 유지 → 장소 1:1
// (다른 canonical 이 가진 장소는 건너뜀) → 사라짐(missing) → 복귀 흐름, 식당 행 없는 고아 canonical 제외, dry-run 무쓰기
// ③ 후보 격자(PLAN-perf-2 D-V2)가 예전 장소 bbox 조회와 같은 후보·순서.

describe('tourPlaceNameScore / isTourMatchAccepted', () => {
  it('이름 또는 별칭 중 최고 점수', () => {
    expect(tourPlaceNameScore('우진해장국', '우진해장국', null)).toBe(1);
    expect(tourPlaceNameScore('우진해장국', '우진 해장국', null)).toBe(1);
    expect(tourPlaceNameScore('우진해장국', '제주우진', '우진 해장국 | 우진해장국본점')).toBe(1);
    expect(tourPlaceNameScore('우진해장국', '명동칼국수', null)).toBeLessThan(0.5);
  });
  it('100m 안 0.5 이상, 완전일치는 300m 까지', () => {
    expect(isTourMatchAccepted(80, 0.6)).toBe(true);
    expect(isTourMatchAccepted(120, 0.6)).toBe(false);
    expect(isTourMatchAccepted(250, 1)).toBe(true);
    expect(isTourMatchAccepted(320, 1)).toBe(false);
  });
});

describe('matchRestaurantTour (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let prisma: PrismaClient;
  // 제주시청 근방. 0.0001° ≈ 11m(위도).
  const BASE = { lat: 33.4996, lng: 126.5312 };
  const place = (id: string, name: string, dLat: number, dLng: number, over: { aliases?: string; typeShort?: string; nTravelers?: number } = {}) => ({
    id,
    name,
    aliases: over.aliases ?? null,
    typeCd: '11',
    typeNm: '식당/카페',
    typeShort: over.typeShort ?? '식당',
    isJeju: true,
    isIsland: false,
    lat: BASE.lat + dLat,
    lng: BASE.lng + dLng,
    nVisits: 12,
    nTravelers: over.nTravelers ?? 10,
    nRated: 12,
    bayesScore: 4.4,
    meanDgstfn: 4.5,
    revisitRate: 0.3,
    stayMedian: 60,
    spendPpMedian: 10000,
    topReasonNm: '온라인 평가',
    nPhotos: 0,
    spendN: 10,
    nActivities: 12,
    nLodging: 0,
  });
  const restaurant = (id: string, canonicalId: string, name: string) => ({
    source: 'naver',
    sourceId: id,
    placeId: id,
    canonicalId,
    name,
    rawSourceUrl: `https://m.place.naver.com/restaurant/${id}`,
    snapshotJson: '{}',
  });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.canonicalRestaurant.createMany({
      data: [
        { id: 'C-a', name: '우진해장국', latitude: BASE.lat, longitude: BASE.lng },
        { id: 'C-b', name: '우진 해장국', latitude: BASE.lat, longitude: BASE.lng + 0.0001 },
        { id: 'C-far', name: '우진해장국', latitude: BASE.lat + 0.01, longitude: BASE.lng },
        { id: 'C-orphan', name: '우진해장국', latitude: BASE.lat, longitude: BASE.lng },
      ],
    });
    await prisma.restaurant.createMany({
      data: [restaurant('n-a', 'C-a', '우진해장국'), restaurant('n-b', 'C-b', '우진 해장국'), restaurant('n-far', 'C-far', '우진해장국')],
    });
    await prisma.tourPlace.createMany({
      data: [
        place('P1', '우진해장국', 0.0002, 0), // ≈22m 완전일치
        place('P2', '우진해장국', 0.0022, 0, { aliases: '우진 해장국' }), // ≈245m 완전일치 → 300m 규칙
        place('P-noodle', '명동칼국수', 0.0001, 0), // 상호 점수 < 0.5
        place('P-lodge', '우진해장국', 0.0001, 0, { typeShort: '숙소' }), // 유형 밖
      ],
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  it('첫 실행 — 식당 행 있는 canonical 만 검토, 가까운 장소부터 1:1 로 붙는다', async () => {
    const r = await matchRestaurantTour(prisma, { now: () => new Date('2026-09-13T00:00:00Z') });
    expect(r).toMatchObject({ scanned: 3, created: 2, rematched: 0, kept: 0, newlyMissing: 0, unmatched: 1 });
    const a = await prisma.restaurantTourMatch.findUnique({ where: { canonicalId: 'C-a' } });
    const b = await prisma.restaurantTourMatch.findUnique({ where: { canonicalId: 'C-b' } });
    expect(a).toMatchObject({ tourPlaceId: 'P1', placeName: '우진해장국', nameScore: 1, status: 'matched' });
    expect(a!.distM).toBeLessThanOrEqual(30);
    // P1 은 C-a 가 가졌으므로 C-b 는 완전일치 300m 규칙으로 P2.
    expect(b).toMatchObject({ tourPlaceId: 'P2', status: 'matched' });
    expect(await prisma.restaurantTourMatch.findUnique({ where: { canonicalId: 'C-orphan' } })).toBeNull();
    expect(await prisma.restaurantTourMatch.count()).toBe(2);
  });

  it('상세 응답 — 장소 집계와 사업자 상태가 붙는다', async () => {
    expect(await getRestaurantTourMatchInfo(prisma, 'C-a')).toMatchObject({ tourPlaceId: 'P1', nTravelers: 10, bayesScore: 4.4, revisitRate: 0.3, bizStatus: null, status: 'matched' });
    await prisma.tourPlaceBizStatus.create({ data: { placeId: 'P1', brno: '1234567890', bStt: '폐업자', endDt: '2024-03-01', checkedAt: new Date('2026-09-13T00:00:00Z') } });
    expect((await getRestaurantTourMatchInfo(prisma, 'C-a'))!.bizStatus).toMatchObject({ bStt: '폐업자', endDt: '2024-03-01' });
    expect(await getRestaurantTourMatchInfo(prisma, 'C-far')).toBeNull();
  });

  it('재실행은 유지(kept); 장소가 사라지면 다른 canonical 이 가진 장소는 못 가져가 missing, 돌아오면 recovered', async () => {
    expect(await matchRestaurantTour(prisma)).toMatchObject({ kept: 2, created: 0, rematched: 0 });

    await prisma.tourPlace.delete({ where: { id: 'P1' } });
    const gone = await matchRestaurantTour(prisma);
    expect(gone).toMatchObject({ newlyMissing: 1, kept: 1 });
    expect((await prisma.restaurantTourMatch.findUnique({ where: { canonicalId: 'C-a' } }))!.status).toBe('missing');
    expect((await prisma.restaurantTourMatch.findUnique({ where: { canonicalId: 'C-b' } }))!.tourPlaceId).toBe('P2');

    await prisma.tourPlace.create({ data: place('P1', '우진해장국', 0.0002, 0) });
    const dry = await matchRestaurantTour(prisma, { dryRun: true });
    expect(dry).toMatchObject({ recovered: 1 });
    expect((await prisma.restaurantTourMatch.findUnique({ where: { canonicalId: 'C-a' } }))!.status).toBe('missing');
    const back = await matchRestaurantTour(prisma);
    expect(back).toMatchObject({ recovered: 1, kept: 1 });
    expect((await prisma.restaurantTourMatch.findUnique({ where: { canonicalId: 'C-a' } }))!.status).toBe('matched');
  });

  it('후보 격자 — 예전 장소 bbox 조회와 같은 장소를 같은 순서(유형·방문자 수·적재 순)로, 0.01° 칸 경계를 넘어서도 낸다', async () => {
    // 서귀포 쪽(위 시나리오와 멀리) — 기준점이 위도·경도 칸 경계 근처라 bbox 가 2×2 칸에 걸친다.
    const O = { lat: 33.2498, lng: 126.5598 };
    const at = (id: string, name: string, lat: number, lng: number, typeShort: string, nTravelers: number) => ({
      ...place(id, name, 0, 0, { typeShort, nTravelers }),
      lat,
      lng,
    });
    await prisma.tourPlace.createMany({
      data: [
        at('G-rest-b', '나', O.lat - 0.001, O.lng - 0.003, '식당', 3),
        at('G-shop', '다', O.lat + 0.0029, O.lng + 0.0034, '상점', 50),
        at('G-mall', '라', O.lat + 0.0005, O.lng + 0.001, '상업', 10),
        at('G-rest-a', '가', O.lat + 0.002, O.lng + 0.002, '식당', 3),
        at('G-edge', '마', O.lat + 0.003, O.lng, '식당', 7),
        at('G-out', '바', O.lat + 0.0031, O.lng, '식당', 1),
        at('G-lodge', '사', O.lat, O.lng, '숙소', 9),
      ],
    });
    const index = await loadTourMatchPlaceIndex(prisma);
    const near = tourMatchPlacesNear(index, O.lat, O.lng).map((p) => p.id);
    const old = await prisma.tourPlace.findMany({
      where: { typeShort: { in: ['식당', '상업', '상점'] }, lat: { gte: O.lat - 0.003, lte: O.lat + 0.003 }, lng: { gte: O.lng - 0.0035, lte: O.lng + 0.0035 } },
      select: { id: true },
    });
    // 예전 조회는 ORDER BY 가 없어 순서가 플래너 통계(ANALYZE 유무)에 따라 바뀐다 — 같은 장소인지만 비교하고,
    // 순서는 아래 명시 순서로 고정한다.
    expect([...near].sort()).toEqual(old.map((p) => p.id).sort());
    // 상업 < 상점 < 식당(바이트 순) → 방문자 수 → 적재 순. bbox 경계(정확히 +0.003)는 포함, 그 밖·숙소는 빠진다.
    expect(near).toEqual(['G-mall', 'G-shop', 'G-rest-b', 'G-rest-a', 'G-edge']);
  });
});
