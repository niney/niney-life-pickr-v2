// 여행로그 관리자 시드 콘솔 — 적재·매칭·폐업 조회 상태, 시드 목록(장소 단위 집계 + 매칭·사업자 상태), 네이버 검색
// 후보 찾기, 후보 등록(기존 크롤 파이프라인), 매칭·폐업 조회 실행. 원본 행(개별 방문)은 이 서비스에 없다 — 3차의
// allowlist 층이 따로 든다. docs/PLAN-tour-log.md
//
// 등록 흐름: discover(네이버 검색, 장소 좌표 주변 bbox) → 어드민이 후보를 고름 → register(startCrawl) → 크롤 잡이 끝나면
// 매칭 전체 재실행(잡 레지스트리 구독). 매칭은 전 canonical 을 도는 데 수 초라 부분 실행을 따로 두지 않는다.

import { existsSync } from 'node:fs';
import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  TourAdminStatusType,
  TourBizCheckBodyType,
  TourBizCheckResultType,
  TourMatchRunResultType,
  TourSeedDiscoverResultType,
  TourSeedItemType,
  TourSeedListType,
  TourSeedQueryType,
  TourSeedRegisterResultType,
} from '@repo/api-contract';
import { TOUR_RESTAURANT_TYPE_SHORTS, computeBboxAround, formatBbox, haversineM } from '@repo/utils';
import type { CrawlService } from '../crawl/crawl.service.js';
import type { JobRegistry } from '../crawl/job-registry.js';
import type { RestaurantService } from '../restaurant/restaurant.service.js';
import { checkTourBizStatus } from './tour-biz-status.service.js';
import { getTourLoadStatus, resolveTourThumbsDir } from './tour-master.service.js';
import { TOUR_MATCH_CANONICAL_WHERE, isTourMatchAccepted, matchRestaurantTour, tourPlaceNameScore } from './restaurant-tour-match.service.js';

export interface TourAdminDeps {
  prisma: PrismaClient;
  restaurants: RestaurantService;
  // 네이버 검색·크롤 — 지연 생성(상태·목록 라우트는 크롤 의존이 없다).
  crawl: () => CrawlService;
  jobRegistry: JobRegistry;
  serviceKey: () => string;
  exportDir: () => string | null;
}

interface SeedRow {
  placeId: string;
  name: string;
  typeShort: string;
  roadAddr: string | null;
  sigungu: string | null;
  emd: string | null;
  lat: number | null;
  lng: number | null;
  poiId: string | null;
  nTravelers: number;
  nVisits: number;
  nRated: number;
  bayesScore: number | null;
  spendPpMedian: number | null;
  canonicalId: string | null;
  naverPlaceId: string | null;
  restaurantName: string | null;
  distM: number | null;
  nameScore: number | null;
  matchStatus: string | null;
  brno: string | null;
  bStt: string | null;
  endDt: string | null;
  checkedAt: Date | string | null;
}

const NOT_FOUND = 'TOUR_PLACE_NOT_FOUND';
export class TourPlaceNotFoundError extends Error {
  constructor(placeId: string) {
    super(`${NOT_FOUND}: ${placeId}`);
    this.name = 'TourPlaceNotFoundError';
  }
}

// 매칭 전체 재실행 — 동시에 두 번 돌지 않게 진행 중 프로미스를 공유한다.
let matchInFlight: Promise<TourMatchRunResultType> | null = null;

export class TourAdminService {
  constructor(private readonly deps: TourAdminDeps) {}

  async status(): Promise<TourAdminStatusType> {
    const { prisma } = this.deps;
    const load = await getTourLoadStatus(prisma);
    const restaurantWhere: Prisma.TourPlaceWhereInput = { typeShort: { in: [...TOUR_RESTAURANT_TYPE_SHORTS] }, isJeju: true };
    const [matched, missing, candidates, bizRows, lastBiz, restaurantsJeju, t5, t3, unmatchedT5] = await Promise.all([
      prisma.restaurantTourMatch.count({ where: { status: 'matched' } }),
      prisma.restaurantTourMatch.count({ where: { status: 'missing' } }),
      prisma.canonicalRestaurant.count({ where: TOUR_MATCH_CANONICAL_WHERE }),
      prisma.tourPlaceBizStatus.groupBy({ by: ['bStt'], _count: { _all: true } }),
      prisma.tourPlaceBizStatus.findFirst({ orderBy: { checkedAt: 'desc' }, select: { checkedAt: true } }),
      prisma.tourPlace.count({ where: restaurantWhere }),
      prisma.tourPlace.count({ where: { ...restaurantWhere, nTravelers: { gte: 5 } } }),
      prisma.tourPlace.count({ where: { ...restaurantWhere, nTravelers: { gte: 3 } } }),
      prisma.$queryRaw<Array<{ n: number | bigint }>>`
        SELECT count(*) AS n FROM tour_places p
        LEFT JOIN restaurant_tour_matches m ON m.tourPlaceId = p.id
        WHERE p.isJeju = 1 AND p.nTravelers >= 5 AND p.typeShort IN (${Prisma.join([...TOUR_RESTAURANT_TYPE_SHORTS])}) AND m.canonicalId IS NULL`,
    ]);
    const biz = { checked: 0, open: 0, suspended: 0, closed: 0, unknown: 0 };
    for (const r of bizRows) {
      const n = r._count._all;
      biz.checked += n;
      if (r.bStt === '계속사업자') biz.open += n;
      else if (r.bStt === '휴업자') biz.suspended += n;
      else if (r.bStt === '폐업자') biz.closed += n;
      else biz.unknown += n;
    }
    const thumbsDir = resolveTourThumbsDir(this.deps.exportDir());
    return {
      loaded: load.loaded,
      places: load.places,
      baseDate: load.baseDate,
      sourceFile: load.sourceFile,
      loadedAt: load.loadedAt?.toISOString() ?? null,
      counts: load.counts,
      match: { matched, missing, candidates },
      biz: { ...biz, lastCheckedAt: lastBiz?.checkedAt.toISOString() ?? null, keyConfigured: this.deps.serviceKey().length > 0 },
      seeds: { restaurantsJeju, t5, t3, unmatchedT5: Number(unmatchedT5[0]?.n ?? 0) },
      thumbsDir,
      thumbsExists: thumbsDir !== null && existsSync(thumbsDir),
    };
  }

  // 시드 목록 — 장소 집계 + 매칭(+네이버 placeId) + 사업자 상태를 한 SQL 로. 정렬은 방문자 수 내림차순 고정.
  async listSeeds(q: TourSeedQueryType): Promise<TourSeedListType> {
    const conds: Prisma.Sql[] = [
      Prisma.sql`p.typeShort IN (${Prisma.join([...TOUR_RESTAURANT_TYPE_SHORTS])})`,
      Prisma.sql`p.nTravelers >= ${q.minTravelers}`,
    ];
    if (q.region === 'jeju') conds.push(Prisma.sql`p.isJeju = 1`);
    if (q.status === 'unmatched') conds.push(Prisma.sql`m.canonicalId IS NULL`);
    else if (q.status === 'matched') conds.push(Prisma.sql`m.canonicalId IS NOT NULL`);
    else if (q.status === 'closed') conds.push(Prisma.sql`b.bStt IN ('폐업자', '휴업자')`);
    if (q.q) conds.push(Prisma.sql`(p.name LIKE ${`%${q.q}%`} OR p.aliases LIKE ${`%${q.q}%`})`);
    const where = Prisma.join(conds, ' AND ');
    const from = Prisma.sql`
      FROM tour_places p
      LEFT JOIN restaurant_tour_matches m ON m.tourPlaceId = p.id
      LEFT JOIN tour_place_biz_statuses b ON b.placeId = p.id
      LEFT JOIN restaurants r ON r.canonicalId = m.canonicalId AND r.source = 'naver'
      WHERE ${where}`;
    const [rows, countRows] = await Promise.all([
      this.deps.prisma.$queryRaw<SeedRow[]>`
        SELECT p.id AS placeId, p.name, p.typeShort, p.roadAddr, p.sigungu, p.emd, p.lat, p.lng, p.poiId,
               p.nTravelers, p.nVisits, p.nRated, p.bayesScore, p.spendPpMedian,
               m.canonicalId, r.placeId AS naverPlaceId, r.name AS restaurantName, m.distM, m.nameScore, m.status AS matchStatus,
               b.brno, b.bStt, b.endDt, b.checkedAt
        ${from}
        ORDER BY p.nTravelers DESC, p.id
        LIMIT ${q.limit} OFFSET ${q.offset}`,
      this.deps.prisma.$queryRaw<Array<{ n: number | bigint }>>`SELECT count(*) AS n ${from}`,
    ]);
    return {
      items: rows.map(toSeedItem),
      total: Number(countRows[0]?.n ?? 0),
      limit: q.limit,
      offset: q.offset,
    };
  }

  // 네이버 검색 후보 — 장소 좌표 ±1km bbox 안에서 이름으로 검색, 거리·상호 점수·수락·등록 여부를 얹는다.
  async discover(placeId: string): Promise<TourSeedDiscoverResultType> {
    const place = await this.deps.prisma.tourPlace.findUnique({ where: { id: placeId } });
    if (!place) throw new TourPlaceNotFoundError(placeId);
    const hasCoord = place.lat !== null && place.lng !== null;
    const query = hasCoord ? place.name : [place.sigungu, place.name].filter(Boolean).join(' ');
    const bbox = hasCoord ? formatBbox(computeBboxAround({ lat: place.lat!, lng: place.lng! }, 1)) : undefined;
    const res = await this.deps.crawl().searchPlaces(query, bbox);
    const registered = await this.deps.restaurants.findRegisteredByPlaceIds(res.items.map((it) => it.placeId));
    const candidates = res.items.map((it) => {
      const distM = hasCoord && it.lat !== null && it.lng !== null ? Math.round(haversineM({ lat: place.lat!, lng: place.lng! }, { lat: it.lat, lng: it.lng })) : null;
      const nameScore = Math.round(tourPlaceNameScore(it.name, place.name, place.aliases) * 1000) / 1000;
      return {
        placeId: it.placeId,
        name: it.name,
        category: it.category,
        address: it.address,
        roadAddress: it.roadAddress,
        lat: it.lat,
        lng: it.lng,
        thumbnailUrl: it.thumbnailUrl,
        reviewCount: it.reviewCount,
        rawSourceUrl: it.rawSourceUrl,
        distM,
        nameScore,
        accepted: distM !== null && isTourMatchAccepted(distM, nameScore),
        registered: registered.has(it.placeId),
      };
    });
    candidates.sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.nameScore - a.nameScore || (a.distM ?? 1e9) - (b.distM ?? 1e9));
    return { tourPlaceId: placeId, query, candidates, source: res.source };
  }

  // 후보 등록 — 기존 크롤 파이프라인(startCrawl). 잡이 끝나면 매칭을 다시 돌려 시드 목록에서 빠지게 한다.
  async register(placeId: string, rawSourceUrl: string, actorId: string): Promise<TourSeedRegisterResultType> {
    const place = await this.deps.prisma.tourPlace.findUnique({ where: { id: placeId }, select: { id: true } });
    if (!place) throw new TourPlaceNotFoundError(placeId);
    const start = await this.deps.crawl().startCrawl(rawSourceUrl, actorId, 'create');
    if (start.ok) this.matchAfterJob(start.jobId);
    return { tourPlaceId: placeId, start };
  }

  private matchAfterJob(jobId: string): void {
    const job = this.deps.jobRegistry.get(jobId);
    if (!job) return;
    const run = (): void => {
      void this.runMatch().catch(() => undefined);
    };
    // 이미 끝난 잡(중복 제거로 기존 잡을 돌려받은 경우)이면 바로.
    if (job.status !== 'running') {
      run();
      return;
    }
    const unsubscribe = this.deps.jobRegistry.subscribe(jobId, (ev) => {
      if (ev.type === 'done' || ev.type === 'error') {
        unsubscribe();
        if (ev.type === 'done') run();
      }
    });
  }

  runMatch(): Promise<TourMatchRunResultType> {
    if (matchInFlight) return matchInFlight;
    const t0 = Date.now();
    matchInFlight = matchRestaurantTour(this.deps.prisma)
      .then((r) => ({ ...r, durationMs: Date.now() - t0 }))
      .finally(() => {
        matchInFlight = null;
      });
    return matchInFlight;
  }

  runBizCheck(body: TourBizCheckBodyType): Promise<TourBizCheckResultType> {
    return checkTourBizStatus(this.deps.prisma, {
      serviceKey: this.deps.serviceKey(),
      maxCalls: body.maxCalls,
      minTravelers: body.minTravelers,
      region: body.region,
      force: body.force,
    });
  }
}

const toSeedItem = (r: SeedRow): TourSeedItemType => ({
  placeId: r.placeId,
  name: r.name,
  typeShort: r.typeShort,
  roadAddr: r.roadAddr,
  sigungu: r.sigungu,
  emd: r.emd,
  lat: r.lat,
  lng: r.lng,
  poiId: r.poiId,
  nTravelers: Number(r.nTravelers),
  nVisits: Number(r.nVisits),
  nRated: Number(r.nRated),
  bayesScore: r.bayesScore,
  spendPpMedian: r.spendPpMedian,
  match:
    r.canonicalId !== null
      ? {
          canonicalId: r.canonicalId,
          naverPlaceId: r.naverPlaceId,
          restaurantName: r.restaurantName,
          distM: Number(r.distM ?? 0),
          nameScore: Number(r.nameScore ?? 0),
          status: r.matchStatus === 'missing' ? 'missing' : 'matched',
        }
      : null,
  biz:
    r.bStt !== null && r.brno !== null
      ? {
          brno: r.brno,
          bStt: r.bStt === '계속사업자' || r.bStt === '휴업자' || r.bStt === '폐업자' ? r.bStt : 'unknown',
          endDt: r.endDt,
          checkedAt: toIso(r.checkedAt),
        }
      : null,
});

// $queryRaw 의 DateTime 은 드라이버에 따라 Date 또는 문자열(SQLite 는 ms 정수/ISO)로 온다.
const toIso = (v: Date | string | null): string => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  if (typeof v === 'number') return new Date(v).toISOString();
  return '';
};
