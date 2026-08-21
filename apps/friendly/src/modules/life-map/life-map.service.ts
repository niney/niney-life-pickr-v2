import { Prisma, type LifeCctv, type LifeToilet, type PrismaClient } from '@prisma/client';
import type {
  LifeCctvItemType,
  LifeMapItemType,
  LifeMapLayerType,
  LifeMapNearbyItemType,
  LifeMapNearbyQueryType,
  LifeMapNearbyResultType,
  LifeMapPointsQueryType,
  LifeMapPointsResultType,
  LifeMapStatusResultType,
  LifeToiletItemType,
} from '@repo/api-contract';
import {
  LIFE_CELL_ORIGIN,
  LIFE_MAP_LAYERS,
  LIFE_MAP_LAYER_LABEL,
  LIFE_MAP_POINTS_MAX,
  LIFE_MAP_POINT_MIN_ZOOM,
  haversineM,
  lifeCellSizeDeg,
  parseLifeCctvPurposes,
} from '@repo/utils';
import { LRUCache } from 'lru-cache';

// 일상지도 조회 — 로컬 SQLite(LifeCctv 377k / LifeToilet 53k)만 읽는다. 업스트림 없음.
//
// 뷰포트 조회는 두 모드: 줌이 레이어 임계 이상이고 bbox 가 좁으면 개별 점(인덱스 범위 조회,
// 상한 LIFE_MAP_POINTS_MAX + truncated), 아니면 전국 고정 원점의 도(°) 격자로 GROUP BY 집계한
// 셀(버블). 셀 조회는 bbox 를 셀 경계로 바깥 정렬한 키로 LRU 캐시(10분) — 전국 줌의 377k 행
// 집계(수십 ms)가 패닝마다 반복되지 않게. 적재가 새로 되면 sync id 가 바뀌어 키가 갈린다.
// 필터(CCTV 목적·화장실 편의)는 두 모드와 주변 목록에 똑같이 걸린다.

export class LifeMapServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'LifeMapServiceError';
  }
}

const LOAD_COMMAND: Record<LifeMapLayerType, string> = {
  cctv: 'load:life-cctv',
  toilet: 'load:life-toilets',
};
// 점 모드를 허용하는 bbox 최대 폭(도) — 줌 값을 속여 전국 bbox 로 점을 긁는 요청을 셀로 강등.
const POINTS_MAX_SPAN_DEG = 1.5;
const CELL_CACHE_TTL_MS = 10 * 60_000;
const CELL_CACHE_MAX = 300;

interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}
// "minLng,minLat,maxLng,maxLat" — 뒤집힌 값은 정렬(계약은 형식만 본다).
const parseBbox = (s: string): Bbox => {
  const [a, b, c, d] = s.split(',').map(Number) as [number, number, number, number];
  return { minLng: Math.min(a, c), maxLng: Math.max(a, c), minLat: Math.min(b, d), maxLat: Math.max(b, d) };
};

interface Filters {
  purposes: string[];
  open24: boolean;
  disabled: boolean;
  kids: boolean;
  diaper: boolean;
  bell: boolean;
}
type FilterQuery = Pick<LifeMapPointsQueryType, 'purpose' | 'open24' | 'disabled' | 'kids' | 'diaper' | 'bell'>;
const toFilters = (q: FilterQuery): Filters => ({
  purposes: parseLifeCctvPurposes(q.purpose),
  open24: q.open24,
  disabled: q.disabled,
  kids: q.kids,
  diaper: q.diaper,
  bell: q.bell,
});
const filtersKey = (f: Filters): string =>
  `${f.purposes.join(',')}|${Number(f.open24)}${Number(f.disabled)}${Number(f.kids)}${Number(f.diaper)}${Number(f.bell)}`;

const toCctvItem = (r: LifeCctv): LifeCctvItemType => ({
  layer: 'cctv',
  id: r.id,
  lat: r.lat,
  lng: r.lng,
  purpose: r.purpose,
  orgCode: r.orgCode,
  orgName: r.orgName,
  roadAddr: r.roadAddr,
  lotAddr: r.lotAddr,
  cameraCount: r.cameraCount,
  pixels: r.pixels,
  direction: r.direction,
  keepDays: r.keepDays,
  installedYm: r.installedYm,
  phone: r.phone,
  baseDate: r.baseDate,
});

const toToiletItem = (r: LifeToilet): LifeToiletItemType => ({
  layer: 'toilet',
  id: r.id,
  lat: r.lat,
  lng: r.lng,
  name: r.name,
  kind: r.kind,
  roadAddr: r.roadAddr,
  lotAddr: r.lotAddr,
  orgName: r.orgName,
  phone: r.phone,
  openType: r.openType,
  openDetail: r.openDetail,
  open24: r.open24,
  fixtures: {
    maleToilet: r.maleToilet,
    maleUrinal: r.maleUrinal,
    maleDisabledToilet: r.maleDisabledToilet,
    maleDisabledUrinal: r.maleDisabledUrinal,
    maleKidsToilet: r.maleKidsToilet,
    maleKidsUrinal: r.maleKidsUrinal,
    femaleToilet: r.femaleToilet,
    femaleDisabledToilet: r.femaleDisabledToilet,
    femaleKidsToilet: r.femaleKidsToilet,
  },
  disabled: r.disabled,
  kids: r.kids,
  ownerType: r.ownerType,
  disposal: r.disposal,
  safetyTarget: r.safetyTarget,
  bell: r.bell,
  bellPlace: r.bellPlace,
  entranceCctv: r.entranceCctv,
  diaper: r.diaper,
  diaperPlace: r.diaperPlace,
  installedYm: r.installedYm,
  remodeledYm: r.remodeledYm,
  baseDate: r.baseDate,
  geoSource: r.geoSource === 'road' || r.geoSource === 'parcel' ? r.geoSource : null,
});

export interface LifeMapServiceDeps {
  prisma: PrismaClient;
  now?: () => Date;
}

export class LifeMapService {
  private readonly cellCache = new LRUCache<string, LifeMapPointsResultType>({
    max: CELL_CACHE_MAX,
    ttl: CELL_CACHE_TTL_MS,
  });

  constructor(private readonly deps: LifeMapServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private latestSync(layer: LifeMapLayerType) {
    return this.deps.prisma.lifeMasterSync.findFirst({ where: { layer }, orderBy: { loadedAt: 'desc' } });
  }

  // 미적재 = 503 + 적재 명령 안내(지하철 마스터와 같은 규약).
  private async requireSync(layer: LifeMapLayerType) {
    const sync = await this.latestSync(layer);
    if (!sync) {
      throw new LifeMapServiceError(
        `일상지도 ${LIFE_MAP_LAYER_LABEL[layer]} 데이터가 적재되지 않았습니다 — pnpm --filter friendly ${LOAD_COMMAND[layer]} <csv> 실행 필요`,
        503,
      );
    }
    return sync;
  }

  async getStatus(): Promise<LifeMapStatusResultType> {
    const layers = await Promise.all(
      LIFE_MAP_LAYERS.map(async (layer) => {
        const s = await this.latestSync(layer);
        return {
          layer,
          loaded: s !== null,
          count: s?.count ?? 0,
          geocoded: layer === 'toilet' && s ? (s.geocoded ?? 0) : null,
          baseDate: s?.baseDate ?? null,
          loadedAt: s?.loadedAt.toISOString() ?? null,
        };
      }),
    );
    return { layers, fetchedAt: this.now().toISOString() };
  }

  private cctvWhere(b: Bbox, f: Filters): Prisma.LifeCctvWhereInput {
    return {
      lat: { gte: b.minLat, lte: b.maxLat },
      lng: { gte: b.minLng, lte: b.maxLng },
      ...(f.purposes.length > 0 ? { purpose: { in: f.purposes } } : {}),
    };
  }

  // 좌표 null(지오코딩 실패) 행은 범위 비교에서 자연히 빠진다.
  private toiletWhere(b: Bbox, f: Filters): Prisma.LifeToiletWhereInput {
    return {
      lat: { gte: b.minLat, lte: b.maxLat },
      lng: { gte: b.minLng, lte: b.maxLng },
      ...(f.open24 ? { open24: true } : {}),
      ...(f.disabled ? { disabled: true } : {}),
      ...(f.kids ? { kids: true } : {}),
      ...(f.diaper ? { diaper: true } : {}),
      ...(f.bell ? { bell: true } : {}),
    };
  }

  async getPoints(q: LifeMapPointsQueryType): Promise<LifeMapPointsResultType> {
    const sync = await this.requireSync(q.layer);
    const bbox = parseBbox(q.bbox);
    const filters = toFilters(q);
    const zoom = Math.floor(q.zoom);
    const minPointZoom = LIFE_MAP_POINT_MIN_ZOOM[q.layer];
    const narrow =
      bbox.maxLat - bbox.minLat <= POINTS_MAX_SPAN_DEG && bbox.maxLng - bbox.minLng <= POINTS_MAX_SPAN_DEG;
    const fetchedAt = sync.loadedAt.toISOString();
    if (zoom >= minPointZoom && narrow) {
      return q.layer === 'cctv'
        ? this.cctvPoints(bbox, filters, fetchedAt)
        : this.toiletPoints(bbox, filters, fetchedAt);
    }
    return this.cells(q.layer, zoom, bbox, filters, sync.id, fetchedAt);
  }

  private async cctvPoints(bbox: Bbox, f: Filters, fetchedAt: string): Promise<LifeMapPointsResultType> {
    const where = this.cctvWhere(bbox, f);
    const rows = await this.deps.prisma.lifeCctv.findMany({
      where,
      select: { id: true, lat: true, lng: true, purpose: true },
      take: LIFE_MAP_POINTS_MAX + 1,
    });
    const truncated = rows.length > LIFE_MAP_POINTS_MAX;
    const items = (truncated ? rows.slice(0, LIFE_MAP_POINTS_MAX) : rows).map((r) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      purpose: r.purpose,
    }));
    const total = truncated ? await this.deps.prisma.lifeCctv.count({ where }) : items.length;
    return {
      layer: 'cctv',
      mode: 'points',
      items,
      cells: [],
      total,
      truncated,
      minPointZoom: LIFE_MAP_POINT_MIN_ZOOM.cctv,
      fetchedAt,
    };
  }

  private async toiletPoints(bbox: Bbox, f: Filters, fetchedAt: string): Promise<LifeMapPointsResultType> {
    const where = this.toiletWhere(bbox, f);
    const rows = await this.deps.prisma.lifeToilet.findMany({
      where,
      select: { id: true, lat: true, lng: true, name: true, open24: true },
      take: LIFE_MAP_POINTS_MAX + 1,
    });
    const truncated = rows.length > LIFE_MAP_POINTS_MAX;
    const items = (truncated ? rows.slice(0, LIFE_MAP_POINTS_MAX) : rows).flatMap((r) =>
      r.lat !== null && r.lng !== null
        ? [{ id: r.id, lat: r.lat, lng: r.lng, name: r.name, open24: r.open24 }]
        : [],
    );
    const total = truncated ? await this.deps.prisma.lifeToilet.count({ where }) : items.length;
    return {
      layer: 'toilet',
      mode: 'points',
      items,
      cells: [],
      total,
      truncated,
      minPointZoom: LIFE_MAP_POINT_MIN_ZOOM.toilet,
      fetchedAt,
    };
  }

  // 집계 셀 — 전국 고정 원점(LIFE_CELL_ORIGIN) 기준 도(°) 격자. bbox 를 셀 경계로 바깥 정렬해
  // (a) 경계 셀도 온전히 집계되고 (b) 셀 하나 안의 패닝은 같은 캐시 키를 맞춘다.
  private async cells(
    layer: LifeMapLayerType,
    zoom: number,
    bbox: Bbox,
    f: Filters,
    syncId: number,
    fetchedAt: string,
  ): Promise<LifeMapPointsResultType> {
    const { dLng, dLat } = lifeCellSizeDeg(zoom);
    const o = LIFE_CELL_ORIGIN;
    const q: Bbox = {
      minLng: o.lng + Math.floor((bbox.minLng - o.lng) / dLng) * dLng,
      maxLng: o.lng + Math.ceil((bbox.maxLng - o.lng) / dLng) * dLng,
      minLat: o.lat + Math.floor((bbox.minLat - o.lat) / dLat) * dLat,
      maxLat: o.lat + Math.ceil((bbox.maxLat - o.lat) / dLat) * dLat,
    };
    const key = `${layer}|${zoom}|${q.minLng.toFixed(6)},${q.minLat.toFixed(6)},${q.maxLng.toFixed(6)},${q.maxLat.toFixed(6)}|${filtersKey(f)}|${syncId}`;
    const hit = this.cellCache.get(key);
    if (hit) return hit;

    const table = layer === 'cctv' ? Prisma.raw('"life_cctvs"') : Prisma.raw('"life_toilets"');
    const conds: Prisma.Sql[] = [
      Prisma.sql`"lat" >= ${q.minLat}`,
      Prisma.sql`"lat" <= ${q.maxLat}`,
      Prisma.sql`"lng" >= ${q.minLng}`,
      Prisma.sql`"lng" <= ${q.maxLng}`,
    ];
    if (layer === 'cctv') {
      if (f.purposes.length > 0) conds.push(Prisma.sql`"purpose" IN (${Prisma.join(f.purposes)})`);
    } else {
      if (f.open24) conds.push(Prisma.sql`"open24" = 1`);
      if (f.disabled) conds.push(Prisma.sql`"disabled" = 1`);
      if (f.kids) conds.push(Prisma.sql`"kids" = 1`);
      if (f.diaper) conds.push(Prisma.sql`"diaper" = 1`);
      if (f.bell) conds.push(Prisma.sql`"bell" = 1`);
    }
    const rows = await this.deps.prisma.$queryRaw<{ cx: unknown; cy: unknown; n: unknown; lat: unknown; lng: unknown }[]>(
      Prisma.sql`SELECT CAST(("lng" - ${o.lng}) / ${dLng} AS INTEGER) AS cx,
                        CAST(("lat" - ${o.lat}) / ${dLat} AS INTEGER) AS cy,
                        COUNT(*) AS n, AVG("lat") AS lat, AVG("lng") AS lng
                 FROM ${table}
                 WHERE ${Prisma.join(conds, ' AND ')}
                 GROUP BY cx, cy`,
    );
    // COUNT 는 SQLite 드라이버가 BigInt 로 돌려준다 — Number 로 접는다. 표시 좌표는 무게중심을
    // 셀 중심 ±15% 안으로 눌러 둔다 — 이웃 셀의 무게중심이 경계 쪽으로 몰리면 버블이 겹쳐
    // 숫자가 안 읽히는데, 셀 중심에 고정하면 격자 느낌이 강해 그 사이를 택했다.
    const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
    const cells = rows
      .map((r) => {
        const cx = Number(r.cx);
        const cy = Number(r.cy);
        const centerLng = o.lng + (cx + 0.5) * dLng;
        const centerLat = o.lat + (cy + 0.5) * dLat;
        return {
          lat: clamp(Number(r.lat), centerLat - 0.15 * dLat, centerLat + 0.15 * dLat),
          lng: clamp(Number(r.lng), centerLng - 0.15 * dLng, centerLng + 0.15 * dLng),
          count: Number(r.n),
        };
      })
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.count > 0);
    const result: LifeMapPointsResultType = {
      layer,
      mode: 'cells',
      items: [],
      cells,
      total: cells.reduce((acc, c) => acc + c.count, 0),
      truncated: false,
      minPointZoom: LIFE_MAP_POINT_MIN_ZOOM[layer],
      fetchedAt,
    };
    this.cellCache.set(key, result);
    return result;
  }

  // 좌표 기준 거리순 — 등거리 근사 bbox 로 후보를 좁힌 뒤 하버사인 거리로 반경 필터·정렬.
  async getNearby(q: LifeMapNearbyQueryType): Promise<LifeMapNearbyResultType> {
    const sync = await this.requireSync(q.layer);
    const center = { lat: q.lat, lng: q.lng };
    const degLat = q.radius / 111_320;
    const degLng = q.radius / (111_320 * Math.cos((q.lat * Math.PI) / 180));
    const bbox: Bbox = {
      minLat: q.lat - degLat,
      maxLat: q.lat + degLat,
      minLng: q.lng - degLng,
      maxLng: q.lng + degLng,
    };
    const f = toFilters(q);
    let withDist: LifeMapNearbyItemType[];
    if (q.layer === 'cctv') {
      const rows = await this.deps.prisma.lifeCctv.findMany({ where: this.cctvWhere(bbox, f) });
      withDist = rows.map((r) => ({ ...toCctvItem(r), dist: Math.round(haversineM(center, { lat: r.lat, lng: r.lng })) }));
    } else {
      const rows = await this.deps.prisma.lifeToilet.findMany({ where: this.toiletWhere(bbox, f) });
      withDist = rows.flatMap((r) =>
        r.lat !== null && r.lng !== null
          ? [{ ...toToiletItem(r), dist: Math.round(haversineM(center, { lat: r.lat, lng: r.lng })) }]
          : [],
      );
    }
    const inRadius = withDist.filter((it) => it.dist <= q.radius).sort((a, b) => a.dist - b.dist);
    return {
      layer: q.layer,
      center,
      items: inRadius.slice(0, q.limit),
      total: inRadius.length,
      fetchedAt: sync.loadedAt.toISOString(),
    };
  }

  async getDetail(layer: LifeMapLayerType, id: string): Promise<LifeMapItemType> {
    if (layer === 'cctv') {
      const row = await this.deps.prisma.lifeCctv.findUnique({ where: { id } });
      if (!row) throw new LifeMapServiceError('해당 CCTV 를 찾을 수 없습니다.', 404);
      return toCctvItem(row);
    }
    const row = await this.deps.prisma.lifeToilet.findUnique({ where: { id } });
    if (!row) throw new LifeMapServiceError('해당 화장실을 찾을 수 없습니다.', 404);
    return toToiletItem(row);
  }
}
