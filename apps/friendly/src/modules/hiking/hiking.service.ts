// 등산 조회 — 적재본(Hiking*) 읽기만. JSON 열(pieces·profile·surfaces·signposts·images)은 여기서 풀어 계약 모양으로.
// docs/PLAN-hiking.md

import type { HikingCourse, HikingMountain, PrismaClient } from '@prisma/client';
import type {
  HikingCourseDetailType,
  HikingCourseSummaryType,
  HikingMountainDetailType,
  HikingMountainSummaryType,
  HikingMountainsResultType,
  HikingPoiType,
  HikingProfileType,
  HikingSignpostType,
  HikingSurfaceType,
} from '@repo/api-contract';
import { isHikingRoughSurface } from '@repo/utils';

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

const toMountainSummary = (m: HikingMountain): HikingMountainSummaryType => ({
  id: m.id,
  name: m.name,
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
});

const toCourseSummary = (c: HikingCourse): HikingCourseSummaryType => {
  const surfaces = parseJson<HikingSurfaceType[]>(c.surfaces, []);
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
    gapCount: c.gapCount,
    gapM: c.gapM,
    roughSurfaces: [...new Set(surfaces.map((s) => s.type).filter(isHikingRoughSurface))],
    bbox: bboxOf(c),
    pieces: parseJson<string[]>(c.pieces, []),
  };
};

export class HikingService {
  constructor(private readonly prisma: PrismaClient) {}

  async listMountains(): Promise<HikingMountainsResultType> {
    const rows = await this.prisma.hikingMountain.findMany({ orderBy: { name: 'asc' } });
    if (rows.length === 0) throw new HikingNotLoadedError();
    const loadedAt = rows.reduce((a, r) => (r.loadedAt > a ? r.loadedAt : a), rows[0]!.loadedAt);
    return { items: rows.map(toMountainSummary), loadedAt: loadedAt.toISOString() };
  }

  async getMountain(id: string): Promise<HikingMountainDetailType | null> {
    const m = await this.prisma.hikingMountain.findUnique({ where: { id }, include: { courses: { orderBy: { no: 'asc' } } } });
    if (!m) return null;
    return {
      ...toMountainSummary(m),
      overview: m.overview,
      details: m.details,
      reason: m.reason,
      officialCourses: m.officialCourses,
      summitName: m.summitName,
      summitEle: m.summitEle,
      bbox: bboxOf(m),
      courses: m.courses.map(toCourseSummary),
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
    const pois: HikingPoiType[] = c.pois.map(({ poi, atM }) => ({
      id: poi.id,
      category: poi.category,
      name: poi.name,
      description: poi.description,
      lat: poi.lat,
      lng: poi.lng,
      ele: poi.ele,
      signposts: parseJson<HikingSignpostType[]>(poi.signposts, []),
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
