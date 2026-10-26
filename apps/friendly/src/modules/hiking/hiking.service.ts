// 등산 조회 — 적재본(Hiking*) 읽기만. JSON 열(pieces·profile·surfaces·signposts·guide·images)은 여기서 풀어 계약 모양으로.
// 예상 시간·난이도는 저장된 이동 분·누적 상승·가파름으로 매번 계산한다(@repo/utils — 보정값을 바꿔도 다시 적재 안 함).
// docs/PLAN-hiking.md

import type { HikingCourse, HikingMountain, PrismaClient } from '@prisma/client';
import type {
  HikingCourseDetailType,
  HikingCourseSummaryType,
  HikingMountainDetailType,
  HikingMountainSummaryType,
  HikingMountainsResultType,
  HikingNeighborType,
  HikingParkAreaType,
  HikingParkCourseType,
  HikingPoiType,
  HikingProfileType,
  HikingSignGuideType,
  HikingSignpostType,
  HikingSurfaceType,
} from '@repo/api-contract';
import { haversineM, hikingCourseTimes, hikingDifficulty, isHikingCourseShape, isHikingRoughSurface } from '@repo/utils';

export class HikingNotLoadedError extends Error {
  readonly statusCode = 503;
  constructor() {
    super('등산 데이터가 아직 적재되지 않았습니다(load:hiking).');
    this.name = 'HikingNotLoadedError';
  }
}

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const bboxOf = (r: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => ({
  minLat: r.minLat,
  minLng: r.minLng,
  maxLat: r.maxLat,
  maxLng: r.maxLng,
});

const kindOf = (v: string): 'top100' | 'peak' => (v === 'peak' ? 'peak' : 'top100');
const courseSourceOf = (v: string): HikingCourseSummaryType['source'] => (v === 'network' || v === 'park' || v === 'peak' ? v : 'top100');

// 국립공원 공식 코스 문구(적재 JSON — 순번 seq 는 정렬에만 쓰고 계약에는 없다).
type StoredParkCourse = HikingParkCourseType & { seq?: number };
const parkCourseOf = (raw: string | null): StoredParkCourse | null => parseJson<StoredParkCourse | null>(raw, null);

// park id → 이름(산 요약의 국립공원 이름).
type ParkNames = ReadonlyMap<string, string>;

const toMountainSummary = (m: HikingMountain, parks: ParkNames): HikingMountainSummaryType => ({
  id: m.id,
  name: m.name,
  kind: kindOf(m.kind),
  subtitle: m.subtitle,
  heightM: m.heightM,
  area: m.area,
  regions: m.regions ? m.regions.split(',').filter(Boolean) : [],
  // 정상을 못 고른 산(고도·봉우리 없는 대암산)은 코스 범위 가운데.
  lat: m.summitLat ?? (m.minLat + m.maxLat) / 2,
  lng: m.summitLng ?? (m.minLng + m.maxLng) / 2,
  courseCount: m.courseCount,
  minLengthM: m.minLengthM,
  maxLengthM: m.maxLengthM,
  images: parseJson<number[]>(m.images, []),
  peaks: parseJson<string[]>(m.peaks, []),
  park: m.parkId ? (parks.get(m.parkId) ?? null) : null,
});

// 형태·예상 시간·난이도·험한 노면 — 코스 요약과 추천(hiking-recommend)이 같이 쓴다. 나들이 시간 = 왕복 또는 코스 방향 편도.
export const courseEffort = (c: Pick<HikingCourse, 'surfaces' | 'shape' | 'isLoop' | 'moveMin' | 'moveRevMin' | 'gainM' | 'steepPct'>) => {
  const surfaces = parseJson<HikingSurfaceType[]>(c.surfaces, []);
  const roughSurfaces = [...new Set(surfaces.map((s) => s.type).filter(isHikingRoughSurface))];
  const shape = isHikingCourseShape(c.shape) ? c.shape : c.isLoop ? 'loop' : 'traverse';
  const times = hikingCourseTimes(shape, c.moveMin, c.moveRevMin);
  const outingMin = times ? (times.roundTripMin ?? times.timeMin) : null;
  const difficulty =
    times && outingMin !== null && c.gainM !== null
      ? hikingDifficulty({ outingMin, roundTrip: times.roundTripMin !== null, gainM: c.gainM, steepPct: c.steepPct, roughSurfaces })
      : null;
  return { surfaces, roughSurfaces, shape, times, outingMin, difficulty };
};

const toCourseSummary = (c: HikingCourse): HikingCourseSummaryType => {
  const { roughSurfaces, shape, times, difficulty } = courseEffort(c);
  const park = parkCourseOf(c.park);
  return {
    id: c.id,
    no: c.no,
    name: c.name,
    nameSource: c.nameSource === 'number' ? 'number' : 'points',
    startName: c.startName,
    endName: c.endName,
    peakName: c.peakName,
    lengthM: c.lengthM,
    hasElevation: c.hasElevation,
    gainM: c.gainM,
    lossM: c.lossM,
    minEle: c.minEle,
    maxEle: c.maxEle,
    isLoop: c.isLoop,
    shape,
    timeMin: times?.timeMin ?? null,
    timeRevMin: times?.timeRevMin ?? null,
    roundTripMin: times?.roundTripMin ?? null,
    difficulty,
    steepPct: c.steepPct,
    gapCount: c.gapCount,
    gapM: c.gapM,
    roughSurfaces,
    source: courseSourceOf(c.source),
    park: park
      ? {
          parkName: park.parkName,
          name: park.name,
          sections: park.sections,
          duration: park.duration,
          distance: park.distance,
          difficulty: park.difficulty,
          schedule: park.schedule,
          contact: park.contact,
        }
      : null,
    bbox: bboxOf(c),
    pieces: parseJson<string[]>(c.pieces, []),
  };
};

export class HikingService {
  constructor(private readonly prisma: PrismaClient) {}

  private async parkNames(): Promise<ParkNames> {
    const parks = await this.prisma.hikingPark.findMany({ select: { id: true, name: true } });
    return new Map(parks.map((p) => [p.id, p.name]));
  }

  async listMountains(): Promise<HikingMountainsResultType> {
    const [rows, parks] = await Promise.all([this.prisma.hikingMountain.findMany({ orderBy: { name: 'asc' } }), this.parkNames()]);
    if (rows.length === 0) throw new HikingNotLoadedError();
    const loadedAt = rows.reduce((a, r) => (r.loadedAt > a ? r.loadedAt : a), rows[0]!.loadedAt);
    return { items: rows.map((r) => toMountainSummary(r, parks)), loadedAt: loadedAt.toISOString() };
  }

  async getMountain(id: string): Promise<HikingMountainDetailType | null> {
    const m = await this.prisma.hikingMountain.findUnique({ where: { id }, include: { courses: { orderBy: { no: 'asc' } } } });
    if (!m) return null;
    const [parks, park] = await Promise.all([this.parkNames(), m.parkId ? this.prisma.hikingPark.findUnique({ where: { id: m.parkId } }) : null]);
    const summary = toMountainSummary(m, parks);
    const parkArea: HikingParkAreaType | null = park
      ? { id: park.id, name: park.name, designatedYear: park.designatedYear, polygons: parseJson<string[][]>(park.polygons, []) }
      : null;
    // 국립공원 공식 코스가 먼저(공원 안 순번), 그다음 순번(no).
    const seqOf = (c: HikingCourse): number => parkCourseOf(c.park)?.seq ?? Infinity;
    const courses = [...m.courses].sort((a, b) => {
      const sa = seqOf(a);
      const sb = seqOf(b);
      return sa === sb ? a.no - b.no : sa < sb ? -1 : 1;
    });
    // 이어진 봉우리 — 적재 때 정한 id 순서(정상끼리 가까운 순) 그대로.
    const ids = parseJson<string[]>(m.neighbors, []);
    const rows = ids.length > 0 ? await this.prisma.hikingMountain.findMany({ where: { id: { in: ids } } }) : [];
    const byId = new Map(rows.map((r) => [r.id, toMountainSummary(r, parks)]));
    const neighbors: HikingNeighborType[] = ids
      .map((nid) => byId.get(nid))
      .filter((n): n is HikingMountainSummaryType => n !== undefined)
      .map((n) => ({ id: n.id, name: n.name, kind: n.kind, heightM: n.heightM, lat: n.lat, lng: n.lng, distM: Math.round(haversineM(summary, n)) }));
    return {
      ...summary,
      overview: m.overview,
      details: m.details,
      reason: m.reason,
      officialCourses: m.officialCourses,
      summitName: m.summitName,
      summitEle: m.summitEle,
      bbox: bboxOf(m),
      courses: courses.map(toCourseSummary),
      neighbors,
      parkArea,
    };
  }

  async getCourse(id: string): Promise<HikingCourseDetailType | null> {
    const c = await this.prisma.hikingCourse.findUnique({
      where: { id },
      include: {
        mountain: { select: { id: true, name: true, heightM: true } },
        pois: { include: { poi: true }, orderBy: { atM: 'asc' } },
      },
    });
    if (!c) return null;
    const pois: HikingPoiType[] = c.pois.map(({ poi, atM, guide }) => ({
      id: poi.id,
      category: poi.category,
      name: poi.name,
      description: poi.description,
      lat: poi.lat,
      lng: poi.lng,
      ele: poi.ele,
      signposts: parseJson<HikingSignpostType[]>(poi.signposts, []),
      guide: parseJson<HikingSignGuideType[]>(guide, []),
      atM,
    }));
    return {
      ...toCourseSummary(c),
      mountain: c.mountain,
      start: { lat: c.startLat, lng: c.startLng, ele: c.startEle },
      end: { lat: c.endLat, lng: c.endLng, ele: c.endEle },
      profile: parseJson<HikingProfileType>(c.profile, { d: [], e: [] }),
      surfaces: parseJson<HikingSurfaceType[]>(c.surfaces, []),
      pois,
    };
  }
}
