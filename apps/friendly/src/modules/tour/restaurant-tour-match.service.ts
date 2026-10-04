// 맛집(CanonicalRestaurant) ↔ 여행로그 장소(TourPlace, 식당·상업·상점) 매칭 — restaurant-store-match 와 같은 골격.
// 좌표 근접(≤ 100m) + 상호 유사도(≥ 0.5), 정규화 이름이 완전일치하면 300m 까지(여행자 입력 좌표·POI 좌표가 상가정보
// 보다 거칠다 — tour-c 의 장소 병합 반경도 300m). 장소는 한 맛집에만 붙는다(tourPlaceId unique): 이미 다른
// canonical 이 가진 장소는 후보에서 제외. 재실행 시 이전 장소가 아직 후보면 유지(안정성), 후보에서 사라지면
// status=missing(재적재로 장소 키가 바뀐 경우 — 목록엔 그대로).
//
// 매칭 대상은 "좌표가 있고 식당 행이 1개 이상인 canonical" — dev.db 의 테스트 잔재 고아 canonical(7,969건)이
// 상가 매칭을 훑던 문제를 여기선 처음부터 막는다. 점수 함수는 상가 매칭의 storeNameScore 를 재사용하고 별칭
// (aliases ' | ' 구분)까지 본다. 실행: scripts/match-restaurant-tour.ts · 어드민 /admin/tour/match/run.

import { Prisma, type PrismaClient, type RestaurantTourMatch, type TourPlace, type TourPlaceBizStatus } from '@prisma/client';
import type { RestaurantTourMatchInfoType } from '@repo/api-contract';
import { TOUR_RESTAURANT_TYPE_SHORTS, TOUR_SAMPLE_LABEL, haversineM } from '@repo/utils';
import { storeNameScore } from '../restaurant/restaurant-store-match.service.js';

export const TOUR_MATCH_MAX_DIST_M = 100;
export const TOUR_MATCH_EXACT_MAX_DIST_M = 300;
export const TOUR_MATCH_MIN_SCORE = 0.5;
// 후보 bbox 반폭(도) — 위도 0.003 ≈ 330m, 경도 0.0035 ≈ 320m(제주 위도). 실제 판정은 haversine.
const BBOX_HALF_LAT = 0.003;
const BBOX_HALF_LNG = 0.0035;
const BATCH = 500;
// 후보 격자 칸(도) — bbox 폭(0.006·0.007)보다 커서 canonical 하나가 최대 2×2 칸만 본다.
const GRID_DEG = 0.01;

// 맛집 이름 ↔ 장소 이름·별칭 최고 점수.
export const tourPlaceNameScore = (restaurantName: string, placeName: string, aliases: string | null): number => {
  const names = [placeName, ...(aliases ? aliases.split(' | ') : [])].map((s) => s.trim()).filter(Boolean);
  let best = 0;
  for (const n of names) best = Math.max(best, storeNameScore(restaurantName, n, null));
  return best;
};

// 수락 규칙 — 100m 안 0.5 이상, 또는 완전일치(정규화 후) 300m 안.
export const isTourMatchAccepted = (distM: number, score: number): boolean =>
  (distM <= TOUR_MATCH_MAX_DIST_M && score >= TOUR_MATCH_MIN_SCORE) || (score >= 0.999 && distM <= TOUR_MATCH_EXACT_MAX_DIST_M);

export interface TourMatchReport {
  scanned: number;
  created: number;
  rematched: number;
  kept: number;
  newlyMissing: number;
  stillMissing: number;
  recovered: number;
  unmatched: number;
}

export interface TourMatchOptions {
  dryRun?: boolean;
  now?: () => Date;
  onProgress?: (done: number, total: number) => void;
}

interface Candidate {
  id: string;
  name: string;
  typeShort: string;
  distM: number;
  score: number;
}

// 좌표 있고 식당 행이 있는 canonical 의 where — 상태 API 의 "매칭 대상" 수와 같은 정의.
export const TOUR_MATCH_CANONICAL_WHERE = {
  latitude: { not: null },
  longitude: { not: null },
  restaurants: { some: {} },
} as const;

interface TourMatchPlace {
  id: string;
  name: string;
  aliases: string | null;
  typeShort: string;
  lat: number;
  lng: number;
}
export interface TourMatchPlaceIndex {
  places: TourMatchPlace[];
  // 칸(cy·cx) → places 의 순번(오름차순).
  cells: Map<number, number[]>;
}
// 위도 칸은 4천 미만이라 cy * 1e5 + cx 가 한국 좌표에서 겹치지 않는다.
const cellKey = (cy: number, cx: number): number => cy * 100_000 + cx;

// 식당류 장소(좌표 있음)를 한 번 읽어 격자로 — 예전엔 canonical 마다 장소 bbox 조회를 돌렸는데(N+1) 플래너가 typeShort 인덱스를
// 골라 좌표 범위를 못 써 건당 ~74ms 였다(PLAN-perf-2 D-V2). 읽는 순서는 그 조회가 돌려주던 순서(typeShort 인덱스 = 유형·방문자 수·
// rowid)와 같게 두고, 칸에서 모은 후보도 그 순번으로 되돌린다 — 점수·거리가 같은 후보 중 무엇을 고르는지까지 예전과 같다.
export const loadTourMatchPlaceIndex = async (prisma: PrismaClient): Promise<TourMatchPlaceIndex> => {
  const places = await prisma.$queryRaw<TourMatchPlace[]>`
    SELECT id, name, aliases, typeShort, lat, lng FROM tour_places
    WHERE typeShort IN (${Prisma.join([...TOUR_RESTAURANT_TYPE_SHORTS])}) AND lat IS NOT NULL AND lng IS NOT NULL
    ORDER BY typeShort, nTravelers, rowid`;
  const cells = new Map<number, number[]>();
  places.forEach((p, i) => {
    const k = cellKey(Math.floor(p.lat / GRID_DEG), Math.floor(p.lng / GRID_DEG));
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  });
  return { places, cells };
};

// 좌표 주변 bbox(예전 조회와 같은 경계·같은 비교) 안의 장소 — 예전 조회 결과와 같은 순서.
export const tourMatchPlacesNear = (index: TourMatchPlaceIndex, lat: number, lng: number): TourMatchPlace[] => {
  const minLat = lat - BBOX_HALF_LAT;
  const maxLat = lat + BBOX_HALF_LAT;
  const minLng = lng - BBOX_HALF_LNG;
  const maxLng = lng + BBOX_HALF_LNG;
  const hits: number[] = [];
  for (let cy = Math.floor(minLat / GRID_DEG); cy <= Math.floor(maxLat / GRID_DEG); cy++) {
    for (let cx = Math.floor(minLng / GRID_DEG); cx <= Math.floor(maxLng / GRID_DEG); cx++) {
      for (const i of index.cells.get(cellKey(cy, cx)) ?? []) {
        const p = index.places[i]!;
        if (p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng) hits.push(i);
      }
    }
  }
  return hits.sort((a, b) => a - b).map((i) => index.places[i]!);
};

export const matchRestaurantTour = async (prisma: PrismaClient, opts: TourMatchOptions = {}): Promise<TourMatchReport> => {
  const now = opts.now ?? (() => new Date());
  const report: TourMatchReport = { scanned: 0, created: 0, rematched: 0, kept: 0, newlyMissing: 0, stillMissing: 0, recovered: 0, unmatched: 0 };
  const total = await prisma.canonicalRestaurant.count({ where: TOUR_MATCH_CANONICAL_WHERE });
  const placeIndex = await loadTourMatchPlaceIndex(prisma);
  const existing = new Map<string, RestaurantTourMatch>();
  // 장소 → 그 장소를 가진 canonical. unique 제약을 코드에서도 지켜 "먼저 온 canonical 이 가져가는" 순서 의존을 피한다.
  const claimed = new Map<string, string>();
  for (const m of await prisma.restaurantTourMatch.findMany()) {
    existing.set(m.canonicalId, m);
    claimed.set(m.tourPlaceId, m.canonicalId);
  }

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.canonicalRestaurant.findMany({
      where: TOUR_MATCH_CANONICAL_WHERE,
      select: { id: true, name: true, latitude: true, longitude: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    for (const c of batch) {
      report.scanned += 1;
      const lat = c.latitude!;
      const lng = c.longitude!;
      const candidates: Candidate[] = [];
      for (const p of tourMatchPlacesNear(placeIndex, lat, lng)) {
        const distM = Math.round(haversineM({ lat, lng }, { lat: p.lat, lng: p.lng }));
        const score = tourPlaceNameScore(c.name, p.name, p.aliases);
        if (!isTourMatchAccepted(distM, score)) continue;
        candidates.push({ id: p.id, name: p.name, typeShort: p.typeShort, distM, score });
      }
      candidates.sort((a, b) => b.score - a.score || a.distM - b.distM);
      const prev = existing.get(c.id);
      // 이전 장소가 아직 후보면 그대로. 아니면 다른 canonical 이 안 가진 첫 후보.
      const best = (prev && candidates.find((k) => k.id === prev.tourPlaceId)) ?? candidates.find((k) => !claimed.has(k.id) || claimed.get(k.id) === c.id) ?? null;
      const at = now();

      if (best) {
        const data = {
          tourPlaceId: best.id,
          placeName: best.name,
          typeShort: best.typeShort,
          distM: best.distM,
          nameScore: Math.round(best.score * 1000) / 1000,
          status: 'matched',
          lastSeenAt: at,
        };
        if (!prev) {
          report.created += 1;
          if (!opts.dryRun) await prisma.restaurantTourMatch.create({ data: { canonicalId: c.id, ...data, matchedAt: at } });
        } else if (prev.tourPlaceId !== best.id) {
          report.rematched += 1;
          claimed.delete(prev.tourPlaceId);
          if (!opts.dryRun) await prisma.restaurantTourMatch.update({ where: { canonicalId: c.id }, data: { ...data, matchedAt: at } });
        } else {
          if (prev.status === 'missing') report.recovered += 1;
          else report.kept += 1;
          if (!opts.dryRun) await prisma.restaurantTourMatch.update({ where: { canonicalId: c.id }, data });
        }
        claimed.set(best.id, c.id);
      } else if (prev) {
        if (prev.status === 'missing') report.stillMissing += 1;
        else {
          report.newlyMissing += 1;
          if (!opts.dryRun) await prisma.restaurantTourMatch.update({ where: { canonicalId: c.id }, data: { status: 'missing' } });
        }
      } else {
        report.unmatched += 1;
      }
    }
    cursor = batch[batch.length - 1]!.id;
    opts.onProgress?.(report.scanned, total);
    if (batch.length < BATCH) break;
  }
  return report;
};

// ── 상세 응답용 ─────────────────────────────────────────────────────────────
export const toRestaurantTourMatchInfo = (m: RestaurantTourMatch, place: TourPlace, biz: TourPlaceBizStatus | null): RestaurantTourMatchInfoType => ({
  tourPlaceId: m.tourPlaceId,
  placeName: m.placeName,
  typeShort: m.typeShort,
  distM: m.distM,
  nameScore: m.nameScore,
  status: m.status === 'missing' ? 'missing' : 'matched',
  matchedAt: m.matchedAt.toISOString(),
  nTravelers: place.nTravelers,
  nVisits: place.nVisits,
  nRated: place.nRated,
  bayesScore: place.bayesScore,
  meanDgstfn: place.meanDgstfn,
  revisitRate: place.revisitRate,
  stayMedian: place.stayMedian,
  spendPpMedian: place.spendPpMedian,
  topReasonNm: place.topReasonNm,
  sampleLabel: TOUR_SAMPLE_LABEL,
  bizStatus: biz ? { bStt: biz.bStt, endDt: biz.endDt, checkedAt: biz.checkedAt.toISOString() } : null,
});

// canonical 의 여행로그 매칭 → 어드민 상세 필드. 매칭 없거나 장소가 재적재로 사라졌으면 null.
export const getRestaurantTourMatchInfo = async (prisma: PrismaClient, canonicalId: string): Promise<RestaurantTourMatchInfoType | null> => {
  const m = await prisma.restaurantTourMatch.findUnique({ where: { canonicalId } });
  if (!m) return null;
  const [place, biz] = await Promise.all([
    prisma.tourPlace.findUnique({ where: { id: m.tourPlaceId } }),
    prisma.tourPlaceBizStatus.findUnique({ where: { placeId: m.tourPlaceId } }),
  ]);
  if (!place) return null;
  return toRestaurantTourMatchInfo(m, place, biz);
};
