// 코스 주변(4차) — 들머리(편도면 날머리도) 근처 정류장·주차·화장실과 하산 후 맛집. 로컬 DB 만(업스트림 0콜).
// 실측(2026-10-25, 들머리 기준 산 수 /100): 버스 정류장 1km 4(버스 DB 가 수도권만)·지하철 3km 7·주차장 2km 63·공중화장실 1km 82·
// 크롤 맛집 5km 3·상가정보 음식점 2km 98 → 등산 지점(GPX·등산트레킹의 교통·주차·화장실)을 먼저 놓고 다른 원천을 더한다.
// 하산 후 맛집은 사용자 결정(2026-10-25): 크롤 맛집(공개 네이버 행) 먼저, 없으면 상가정보 음식점. docs/PLAN-hiking.md §4차

import type { HikingPoi, PrismaClient } from '@prisma/client';
import type { HikingAroundPlaceType, HikingAroundType } from '@repo/api-contract';
import {
  PARKING_FEE_TYPE_LABEL,
  PARKING_OWNERSHIP_LABEL,
  haversineM,
  hikingPoiLabel,
  isHikingCourseShape,
  type LatLng,
  type ParkingFeeType,
  type ParkingOwnership,
} from '@repo/utils';
import { cleanPlaceName, isJunkPlaceName } from './hiking-gpx.js';

export const AROUND_RADIUS = {
  trail: 1_000,
  bus: 500,
  subway: 1_500,
  lot: 1_500,
  toilet: 1_000,
  restaurant: 5_000,
  store: 2_000,
} as const;
const CAP = { transit: 6, parking: 5, toilets: 4, food: 6 } as const;
// 하산 후 맛집 후보 — 가까운 크롤 맛집 이만큼만 네이버 행을 찾는다(공개 행이 없는 곳이 섞여 cap 보다 넉넉히).
const FOOD_CANDIDATES = 200;

type Anchor = 'start' | 'end';
type Place = HikingAroundPlaceType;

export const aroundBbox = (c: LatLng, r: number) => {
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  return { gte: { lat: c.lat - dLat, lng: c.lng - dLng }, lte: { lat: c.lat + dLat, lng: c.lng + dLng } };
};

// 등산 지점 이름 — 비었거나 깨진 이름("주차자ㅇ에서 600m")·분류만 적은 이름("버스"·"비스"·"버스정류장")은 분류 이름(정류장·
// 주차장·화장실)으로.
const TRAIL_FALLBACK: Record<string, string> = { TRANS: '정류장' };
const BARE_NAME = /^(버스|비스|대중교통|정류[장소]|버스\s?정류[장소]|지하철역|주차장?|화장실|공중화장실)$/;
export const trailPlaceName = (p: Pick<HikingPoi, 'name' | 'category'>): string => {
  const cleaned = p.name ? cleanPlaceName(p.name) : '';
  return cleaned && !isJunkPlaceName(cleaned) && !BARE_NAME.test(cleaned) ? cleaned : (TRAIL_FALLBACK[p.category] ?? hikingPoiLabel(p.category));
};

const byDist = (a: Place, b: Place) => a.distM - b.distM;
const within = <T extends LatLng>(rows: readonly T[], c: LatLng, r: number) =>
  rows.flatMap((row) => {
    const d = Math.round(haversineM(c, row));
    return d <= r ? [{ row, d }] : [];
  });

// 겹침 걷어 내기 — 거리순으로 보며 이미 고른 곳과 같으면 뺀 뒤 cap 개. 정류장·주차·화장실은 20m 안이면 같은 자리(등산 지점과
// 다른 원천이 같은 곳을 따로 갖는다), 음식점은 한 건물에 여러 가게가 있어 이름까지 같아야 같은 가게(상가정보에 두 번 있는 가게).
const SAME_SPOT_M = 20;
const SAME_SHOP_M = 100;
const sameSpot = (a: Place, b: Place) => a.at === b.at && haversineM(a, b) < SAME_SPOT_M;
const sameShop = (a: Place, b: Place) => a.name.replace(/\s+/g, '') === b.name.replace(/\s+/g, '') && haversineM(a, b) < SAME_SHOP_M;
export const pickPlaces = (places: readonly Place[], cap: number, same: (a: Place, b: Place) => boolean = sameSpot): Place[] => {
  const out: Place[] = [];
  for (const p of [...places].sort(byDist)) {
    if (out.some((q) => same(q, p))) continue;
    out.push(p);
    if (out.length >= cap) break;
  }
  return out;
};

const lotDetail = (l: { ownership: string | null; feeType: string | null; totalSpaces: number | null }): string | null =>
  [
    l.ownership ? (PARKING_OWNERSHIP_LABEL[l.ownership as ParkingOwnership] ?? null) : null,
    l.feeType ? (PARKING_FEE_TYPE_LABEL[l.feeType as ParkingFeeType] ?? null) : null,
    l.totalSpaces ? `${l.totalSpaces}면` : null,
  ]
    .filter(Boolean)
    .join(' · ') || null;

export class HikingAroundService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(courseId: string): Promise<HikingAroundType | null> {
    const c = await this.prisma.hikingCourse.findUnique({
      where: { id: courseId },
      select: { id: true, mountainId: true, shape: true, isLoop: true, startLat: true, startLng: true, endLat: true, endLng: true, startName: true, endName: true },
    });
    if (!c) return null;
    const shape = isHikingCourseShape(c.shape) ? c.shape : c.isLoop ? 'loop' : 'traverse';
    const start = { lat: c.startLat, lng: c.startLng };
    const end = shape === 'traverse' ? { lat: c.endLat, lng: c.endLng } : null;
    const anchors: [Anchor, LatLng][] = end ? [['start', start], ['end', end]] : [['start', start]];
    const trail = await this.prisma.hikingPoi.findMany({
      where: { mountainId: c.mountainId, category: { in: ['TRANS', 'PARK', 'TOILET'] } },
    });
    const trailNear = (category: string, at: Anchor, p: LatLng): Place[] =>
      within(trail.filter((t) => t.category === category), p, AROUND_RADIUS.trail).map(({ row, d }) => ({
        kind: 'trail',
        name: trailPlaceName(row),
        distM: d,
        at,
        lat: row.lat,
        lng: row.lng,
        detail: null,
        refId: null,
      }));

    const transit: Place[] = [];
    const toilets: Place[] = [];
    for (const [at, p] of anchors) {
      const [bus, subway, publicToilets] = await Promise.all([
        this.prisma.busStation.findMany({ where: this.where(p, AROUND_RADIUS.bus) }),
        this.prisma.subwayStation.findMany({ where: this.where(p, AROUND_RADIUS.subway) }),
        this.prisma.lifeToilet.findMany({ where: this.where(p, AROUND_RADIUS.toilet) }),
      ]);
      const group: Place[] = [
        ...trailNear('TRANS', at, p),
        ...within(bus, p, AROUND_RADIUS.bus).map(({ row, d }): Place => ({ kind: 'bus', name: row.name, distM: d, at, lat: row.lat, lng: row.lng, detail: row.arsId ? `정류소 ${row.arsId}` : null, refId: row.stId })),
        ...within(subway, p, AROUND_RADIUS.subway).map(({ row, d }): Place => ({ kind: 'subway', name: `${row.name}역`, distM: d, at, lat: row.lat, lng: row.lng, detail: row.lineName, refId: row.id })),
      ];
      transit.push(...pickPlaces(group, CAP.transit));
      const tGroup: Place[] = [
        ...trailNear('TOILET', at, p),
        ...within(
          publicToilets.flatMap((t) => (t.lat !== null && t.lng !== null ? [{ ...t, lat: t.lat, lng: t.lng }] : [])),
          p,
          AROUND_RADIUS.toilet,
        ).map(({ row, d }): Place => ({ kind: 'public', name: row.name, distM: d, at, lat: row.lat, lng: row.lng, detail: row.open24 ? '24시간' : (row.openDetail ?? null), refId: null })),
      ];
      toilets.push(...pickPlaces(tGroup, CAP.toilets));
    }

    // 주차는 들머리만(차를 두고 오르는 곳).
    const lots = await this.prisma.parkingLot.findMany({ where: this.where(start, AROUND_RADIUS.lot) });
    const parking = pickPlaces(
      [
        ...trailNear('PARK', 'start', start),
        ...within(
          lots.flatMap((l) => (l.lat !== null && l.lng !== null ? [{ ...l, lat: l.lat, lng: l.lng }] : [])),
          start,
          AROUND_RADIUS.lot,
        ).map(({ row, d }): Place => ({ kind: 'lot', name: row.name, distM: d, at: 'start', lat: row.lat, lng: row.lng, detail: lotDetail(row), refId: row.id })),
      ],
      CAP.parking,
    );

    const foodAt: Anchor = end ? 'end' : 'start';
    const food = await this.food(end ?? start, foodAt);
    return {
      courseId: c.id,
      start: { ...start, name: c.startName },
      end: end ? { ...end, name: c.endName } : null,
      transit,
      parking,
      toilets,
      food,
    };
  }

  // lat·lng 열 이름이 같은 표(정류장·역·화장실·주차장)용 bbox 조건.
  private where(c: LatLng, r: number) {
    const b = aroundBbox(c, r);
    return { lat: { gte: b.gte.lat, lte: b.lte.lat }, lng: { gte: b.gte.lng, lte: b.lte.lng } };
  }

  // 하산 후 맛집 — 공개 네이버 맛집(5km) 먼저, 없으면 상가정보 음식점(2km).
  private async food(p: LatLng, at: Anchor): Promise<HikingAroundType['food']> {
    const b = aroundBbox(p, AROUND_RADIUS.restaurant);
    const canon = await this.prisma.canonicalRestaurant.findMany({
      where: { latitude: { gte: b.gte.lat, lte: b.lte.lat }, longitude: { gte: b.gte.lng, lte: b.lte.lng } },
      select: { id: true, latitude: true, longitude: true },
    });
    // 가까운 FOOD_CANDIDATES 곳만 묻는다 — 도시 안 봉우리(5차)는 5km 안 맛집이 수천이라 id 목록이 SQLite 파라미터 한도를 넘었다.
    const near = within(
      canon.flatMap((x) => (x.latitude !== null && x.longitude !== null ? [{ id: x.id, lat: x.latitude, lng: x.longitude }] : [])),
      p,
      AROUND_RADIUS.restaurant,
    )
      .sort((a, b) => a.d - b.d)
      .slice(0, FOOD_CANDIDATES);
    if (near.length > 0) {
      const rows = await this.prisma.restaurant.findMany({
        where: { canonicalId: { in: near.map((n) => n.row.id) }, source: 'naver', placeId: { not: null } },
        select: { canonicalId: true, placeId: true, name: true, category: true, rating: true },
      });
      const distOf = new Map(near.map((n) => [n.row.id, n]));
      const items = pickPlaces(
        rows.flatMap((r): Place[] => {
          const n = distOf.get(r.canonicalId);
          if (!n || !r.placeId) return [];
          const detail = [r.category, r.rating ? `평점 ${r.rating}` : null].filter(Boolean).join(' · ') || null;
          return [{ kind: 'restaurant', name: r.name, distM: n.d, at, lat: n.row.lat, lng: n.row.lng, detail, refId: r.placeId }];
        }),
        CAP.food,
        sameShop,
      );
      if (items.length > 0) return { source: 'restaurants', items };
    }
    const sb = aroundBbox(p, AROUND_RADIUS.store);
    const stores = await this.prisma.lifeStore.findMany({
      where: { kind: 'food', lat: { gte: sb.gte.lat, lte: sb.lte.lat }, lng: { gte: sb.gte.lng, lte: sb.lte.lng } },
      select: { id: true, name: true, branch: true, sclsName: true, lat: true, lng: true },
    });
    const items = pickPlaces(
      within(stores, p, AROUND_RADIUS.store).map(({ row, d }): Place => ({
        kind: 'store',
        name: row.branch ? `${row.name} ${row.branch}` : row.name,
        distM: d,
        at,
        lat: row.lat,
        lng: row.lng,
        detail: row.sclsName,
        refId: null,
      })),
      CAP.food,
      sameShop,
    );
    return { source: items.length > 0 ? 'stores' : null, items };
  }
}
