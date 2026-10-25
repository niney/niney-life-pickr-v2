// 등산 "오늘 어느 산" 추천(4차) — ① 607코스를 조건 없이 점수(산행 시간·난이도·거리·해 지기 전 하산·이동 수단 접근·계절, @repo/utils
// hikingRecommend) → 산마다 가장 좋은 코스 → 상위 max(12, limit)산 ② 그 코스만 오늘의 조건(3차 HikingConditionsService — 날씨 격자·
// 대기·산불 캐시)을 받아 주의할 점까지 넣어 다시 점수 → 상위 limit. 항목마다 추천 이유 문장.
// 접근(들머리 근처 주차·정류장)은 코스 색인을 만들 때 한 번 — 등산 지점(주차·교통 1km) 먼저, 없으면 주차장 1km·버스 500m·지하철
// 1.5km(버스·지하철은 수도권만). 색인은 적재 이력 id 가 같은 동안 6시간 들고 있다. docs/PLAN-hiking.md §4차

import type { PrismaClient } from '@prisma/client';
import type { HikingConditionsType, HikingRecommendItemType, HikingRecommendQueryType, HikingRecommendResultType } from '@repo/api-contract';
import {
  estimateDriveMinutes,
  haversineM,
  hikingAccessCautions,
  hikingCautions,
  hikingDaylight,
  hikingFireInWindow,
  hikingRecommendReason,
  hikingRecommendScore,
  hikingSeasonKeywords,
  kmaPtyLabel,
  kmaSkyLabel,
  kmaTodayIsoDate,
  summarizeHikingWeather,
  sunTimes,
  type AirGradeLevel,
  type HikingCourseShape,
  type HikingDaylight,
  type HikingDifficulty,
  type LatLng,
} from '@repo/utils';
import { trailPlaceName } from './hiking-around.service.js';
import type { HikingConditionsService } from './hiking-conditions.service.js';
import { HikingNotLoadedError, courseEffort } from './hiking.service.js';

export const RECOMMEND_CHECK_TOP = 12;
const INDEX_TTL_MS = 6 * 60 * 60_000;
const ACCESS_RADIUS = { trail: 1_000, lot: 1_000, bus: 500, subway: 1_500 } as const;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
// 예상 시간이 없는 코스(고도 없음)는 날씨만 출발 뒤 이만큼 본다.
const FALLBACK_WINDOW_MIN = 240;
const DEFAULT_START = '08:00';

export class HikingRecommendError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'HikingRecommendError';
  }
}

interface IndexedCourse {
  id: string;
  no: number;
  name: string;
  shape: HikingCourseShape;
  lengthM: number;
  outingMin: number | null;
  difficulty: HikingDifficulty | null;
  start: LatLng;
  parking: string | null;
  transit: string | null;
  transitEnd: string | null;
}
interface IndexedMountain extends LatLng {
  id: string;
  name: string;
  heightM: number | null;
  images: number[];
  // 계절 키워드를 찾는 산 소개(부제·선정 이유·개관).
  text: string;
  courses: IndexedCourse[];
}

// 0.01° 칸 격자 — 반경 1.5km 안 가장 가까운 점을 이웃 칸에서만 찾는다.
const CELL = 0.01;
class PointGrid<T extends LatLng> {
  private readonly cells = new Map<string, T[]>();
  constructor(points: readonly T[]) {
    for (const p of points) {
      const k = `${Math.floor(p.lat / CELL)},${Math.floor(p.lng / CELL)}`;
      const list = this.cells.get(k);
      if (list) list.push(p);
      else this.cells.set(k, [p]);
    }
  }
  nearest(c: LatLng, r: number): T | null {
    const reach = Math.ceil(r / 800);
    const ci = Math.floor(c.lat / CELL);
    const cj = Math.floor(c.lng / CELL);
    let best: T | null = null;
    let bestD = r;
    for (let i = ci - reach; i <= ci + reach; i++) {
      for (let j = cj - reach; j <= cj + reach; j++) {
        for (const p of this.cells.get(`${i},${j}`) ?? []) {
          const d = haversineM(c, p);
          if (d <= bestD) [best, bestD] = [p, d];
        }
      }
    }
    return best;
  }
}

const parseImages = (raw: string): number[] => {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
};

const kstHm = (ms: number): string => {
  const d = new Date(ms + 9 * HOUR_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

const worstGrade = (...gs: (number | null | undefined)[]): AirGradeLevel | null => {
  const v = gs.filter((g): g is number => typeof g === 'number');
  return v.length > 0 ? (Math.max(...v) as AirGradeLevel) : null;
};

export interface HikingRecommendDeps {
  prisma: PrismaClient;
  conditions: Pick<HikingConditionsService, 'get'>;
  now?: () => Date;
}

interface Candidate {
  m: IndexedMountain;
  c: IndexedCourse;
  straightM: number | null;
  driveMin: number | null;
  daylight: HikingDaylight | null;
  sunset: Date | null;
  season: string[];
  score: number;
}

export class HikingRecommendService {
  private index: { syncId: number; at: number; mountains: IndexedMountain[] } | null = null;
  private building: Promise<IndexedMountain[]> | null = null;

  constructor(private readonly deps: HikingRecommendDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private async mountains(): Promise<IndexedMountain[]> {
    const sync = await this.deps.prisma.hikingSync.findFirst({ orderBy: { loadedAt: 'desc' }, select: { id: true } });
    if (!sync) throw new HikingNotLoadedError();
    const nowMs = this.now().getTime();
    if (this.index && this.index.syncId === sync.id && nowMs - this.index.at < INDEX_TTL_MS) return this.index.mountains;
    if (!this.building) {
      this.building = this.build()
        .then((mountains) => {
          this.index = { syncId: sync.id, at: nowMs, mountains };
          return mountains;
        })
        .finally(() => {
          this.building = null;
        });
    }
    return this.building;
  }

  private async build(): Promise<IndexedMountain[]> {
    const p = this.deps.prisma;
    const [rows, trail, lots, bus, subway] = await Promise.all([
      p.hikingMountain.findMany({
        select: {
          id: true,
          name: true,
          heightM: true,
          summitLat: true,
          summitLng: true,
          minLat: true,
          minLng: true,
          maxLat: true,
          maxLng: true,
          images: true,
          subtitle: true,
          reason: true,
          overview: true,
          courses: {
            orderBy: { no: 'asc' },
            select: {
              id: true,
              no: true,
              name: true,
              shape: true,
              isLoop: true,
              lengthM: true,
              moveMin: true,
              moveRevMin: true,
              gainM: true,
              steepPct: true,
              surfaces: true,
              startLat: true,
              startLng: true,
              endLat: true,
              endLng: true,
            },
          },
        },
      }),
      p.hikingPoi.findMany({ where: { category: { in: ['PARK', 'TRANS'] } }, select: { category: true, name: true, lat: true, lng: true } }),
      p.parkingLot.findMany({ select: { name: true, lat: true, lng: true } }),
      p.busStation.findMany({ select: { name: true, lat: true, lng: true } }),
      p.subwayStation.findMany({ select: { name: true, lat: true, lng: true } }),
    ]);
    const trailPark = new PointGrid(trail.filter((t) => t.category === 'PARK').map((t) => ({ ...t, label: trailPlaceName(t) })));
    const trailTrans = new PointGrid(trail.filter((t) => t.category === 'TRANS').map((t) => ({ ...t, label: trailPlaceName(t) })));
    const lotGrid = new PointGrid(lots.flatMap((l) => (l.lat !== null && l.lng !== null ? [{ label: l.name, lat: l.lat, lng: l.lng }] : [])));
    const busGrid = new PointGrid(bus.map((b) => ({ label: b.name, lat: b.lat, lng: b.lng })));
    const subwayGrid = new PointGrid(subway.map((s) => ({ label: `${s.name}역`, lat: s.lat, lng: s.lng })));
    const transitNear = (c: LatLng): string | null =>
      trailTrans.nearest(c, ACCESS_RADIUS.trail)?.label ??
      busGrid.nearest(c, ACCESS_RADIUS.bus)?.label ??
      subwayGrid.nearest(c, ACCESS_RADIUS.subway)?.label ??
      null;

    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      heightM: m.heightM,
      lat: m.summitLat ?? (m.minLat + m.maxLat) / 2,
      lng: m.summitLng ?? (m.minLng + m.maxLng) / 2,
      images: parseImages(m.images),
      text: [m.subtitle, m.reason, m.overview].filter(Boolean).join(' '),
      courses: m.courses.map((c) => {
        const e = courseEffort(c);
        const start = { lat: c.startLat, lng: c.startLng };
        return {
          id: c.id,
          no: c.no,
          name: c.name,
          shape: e.shape,
          lengthM: c.lengthM,
          outingMin: e.outingMin,
          difficulty: e.difficulty,
          start,
          parking: trailPark.nearest(start, ACCESS_RADIUS.trail)?.label ?? lotGrid.nearest(start, ACCESS_RADIUS.lot)?.label ?? null,
          transit: transitNear(start),
          transitEnd: e.shape === 'traverse' ? transitNear({ lat: c.endLat, lng: c.endLng }) : null,
        };
      }),
    }));
  }

  async recommend(q: HikingRecommendQueryType): Promise<HikingRecommendResultType> {
    const mountains = await this.mountains();
    const now = this.now();
    const dates = [0, 1, 2].map((i) => kmaTodayIsoDate(new Date(now.getTime() + i * DAY_MS)));
    const date = q.date ?? dates[0]!;
    if (!dates.includes(date)) throw new HikingRecommendError(`날짜는 오늘·내일·모레(${dates.join(', ')}) 중 하나여야 합니다.`, 400);
    const start = q.start ?? DEFAULT_START;
    const startAt = Date.parse(`${date}T${start}:00+09:00`);
    const month = Number(date.slice(5, 7));
    const origin = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
    const wants = { duration: q.duration, level: q.level, mode: q.mode };

    // ① 조건 없이 — 산마다 가장 좋은 코스.
    const best: Candidate[] = [];
    for (const m of mountains) {
      const season = hikingSeasonKeywords(m.text, month);
      let top: Candidate | null = null;
      for (const c of m.courses) {
        const straightM = origin ? Math.round(haversineM(origin, c.start)) : null;
        const driveMin = straightM !== null ? estimateDriveMinutes(straightM) : null;
        const sun = sunTimes(date, c.start.lat, c.start.lng);
        const daylight = c.outingMin !== null ? hikingDaylight(new Date(startAt), c.outingMin, sun) : null;
        const score = hikingRecommendScore(
          {
            outingMin: c.outingMin,
            difficulty: c.difficulty,
            shape: c.shape,
            driveMin,
            parking: c.parking !== null,
            transitStart: c.transit !== null,
            transitEnd: c.transitEnd !== null,
            daylight: daylight?.status ?? null,
            cautions: null,
            season,
          },
          wants,
        );
        if (!top || score > top.score) top = { m, c, straightM, driveMin, daylight, sunset: sun.sunset, season, score };
      }
      if (top) best.push(top);
    }
    best.sort((a, b) => b.score - a.score);
    const checkTop = best.slice(0, Math.max(RECOMMEND_CHECK_TOP, q.limit));

    // ② 상위만 오늘의 조건을 받아 다시 매긴다.
    const checked = await Promise.all(
      checkTop.map(async (cand) => {
        const cond = await this.deps.conditions.get(cand.c.id).catch(() => null);
        return this.toItem(cand, cond, { date, start, startAt, mode: q.mode, wants, isToday: date === dates[0] });
      }),
    );
    const items = checked
      .sort((a, b) => b.score - a.score)
      .slice(0, q.limit)
      .map((it, i) => ({ ...it, rank: i + 1 }));
    return {
      items,
      query: { date, start, duration: q.duration, level: q.level, mode: q.mode, origin },
      generatedAt: now.toISOString(),
    };
  }

  private toItem(
    cand: Candidate,
    cond: HikingConditionsType | null,
    ctx: { date: string; start: string; startAt: number; mode: 'car' | 'transit'; wants: Parameters<typeof hikingRecommendScore>[1]; isToday: boolean },
  ): HikingRecommendItemType {
    const { m, c } = cand;
    const from = ctx.startAt;
    const to = from + (c.outingMin ?? FALLBACK_WINDOW_MIN) * 60_000;
    const weather = cond?.weather ? summarizeHikingWeather(cond.weather.hours, from, to) : null;
    const fire = cond?.fire ? hikingFireInWindow(cond.fire.areas, from, to) : null;
    const forecast = cond?.air?.forecast.find((f) => f.date === ctx.date) ?? null;
    const airGrade =
      ctx.isToday && cond?.air?.station
        ? worstGrade(cond.air.pm10Grade, cond.air.pm25Grade)
        : forecast
          ? worstGrade(forecast.pm10Grade, forecast.pm25Grade)
          : null;
    const checked = cond !== null && (cond.weather !== null || cond.fire !== null || cond.air !== null);
    // 점수엔 해 지기 전 하산을 따로 넣었으니 조건 주의에선 뺀다. 화면 주의 목록엔 함께.
    const conditionCautions = checked ? hikingCautions({ weather, fire, airGrade, daylight: null }) : null;
    const score = hikingRecommendScore(
      {
        outingMin: c.outingMin,
        difficulty: c.difficulty,
        shape: c.shape,
        driveMin: cand.driveMin,
        parking: c.parking !== null,
        transitStart: c.transit !== null,
        transitEnd: c.transitEnd !== null,
        daylight: cand.daylight?.status ?? null,
        cautions: conditionCautions,
        season: cand.season,
      },
      ctx.wants,
    );
    const weatherText =
      weather && (weather.pty || weather.sky)
        ? `${weather.pty ? kmaPtyLabel(weather.pty) : kmaSkyLabel(weather.sky)}${weather.topTmpMin !== null ? `·가장 높은 곳 ${weather.topTmpMin}°C(추정)` : ''}`
        : null;
    const reason = hikingRecommendReason({
      mode: ctx.mode,
      straightM: cand.straightM,
      driveMin: cand.driveMin,
      shape: c.shape,
      outingMin: c.outingMin,
      difficulty: c.difficulty,
      startHm: ctx.start,
      endHm: cand.daylight ? kstHm(cand.daylight.endAt.getTime()) : null,
      sunsetHm: cand.sunset ? kstHm(cand.sunset.getTime()) : null,
      daylight: cand.daylight?.status ?? null,
      weather: weatherText,
      parkingName: c.parking,
      transitName: c.transit,
      season: cand.season,
    });
    return {
      rank: 0,
      score,
      mountain: { id: m.id, name: m.name, heightM: m.heightM, lat: m.lat, lng: m.lng, images: m.images },
      course: { id: c.id, no: c.no, name: c.name, shape: c.shape, lengthM: c.lengthM, outingMin: c.outingMin, difficulty: c.difficulty, start: c.start },
      straightM: cand.straightM,
      driveMin: cand.driveMin,
      access: { parking: c.parking, transit: c.transit, transitEnd: c.transitEnd },
      startAt: new Date(from).toISOString(),
      endAt: cand.daylight ? cand.daylight.endAt.toISOString() : null,
      sunset: cand.sunset ? cand.sunset.toISOString() : null,
      daylight: cand.daylight?.status ?? null,
      weather: weather
        ? { sky: weather.sky, pty: weather.pty, tmpMax: weather.tmpMax, topTmpMin: weather.topTmpMin, popMax: weather.popMax, windMax: weather.windMax }
        : null,
      fireLevel: fire?.level ?? null,
      airGrade,
      conditionsChecked: checked,
      season: cand.season,
      reason,
      cautions: [
        ...hikingCautions({ weather, fire, airGrade, daylight: cand.daylight }),
        ...hikingAccessCautions(ctx.mode, { shape: c.shape, parking: c.parking !== null, transitStart: c.transit !== null, transitEnd: c.transitEnd !== null }),
      ],
    };
  }
}
