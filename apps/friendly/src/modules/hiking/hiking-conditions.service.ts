// 등산 오늘의 조건 — 코스 하나의 오늘·내일·모레 원자료를 모은다(접기는 @repo/utils hikingConditions, 웹이 날짜·출발 시각마다).
//   - 날씨: 들머리 격자 단기예보(app.weather — 날씨 화면과 같은 캐시·쿼터) + 시각마다 가장 높은 곳 추정 기온.
//   - 대기: 들머리에서 가까운 측정소 지금 값 + 코스 시군구의 예보 권역 등급(app.airQuality — 대기 화면과 같은 캐시).
//   - 산불: 코스 시군구의 산불위험예보 칸(ForestFireService — 전국 1콜 3시간 캐시).
//   - 해: 들머리 좌표로 계산(업스트림 없음).
// 세 업스트림은 따로 받아 하나가 실패하거나 늦어도(SECTION_BUDGET_MS) 나머지는 낸다. 늦은 호출은 끊지 않고 캐시를 채우게
// 둔다(다음 요청부터 즉시). docs/PLAN-hiking.md §3차

import type { PrismaClient } from '@prisma/client';
import type {
  AirForecastItemType,
  HikingConditionDayType,
  HikingConditionsType,
  HikingFireAreaType,
} from '@repo/api-contract';
import { airGradeFromText, estimateTopTemp, kmaTodayIsoDate, latLngToKmaGrid, sunTimes } from '@repo/utils';
import type { AirQualityService } from '../air-quality/air-quality.service.js';
import type { WeatherService } from '../weather/weather.service.js';
import type { ForestFireService } from './forest-fire.service.js';
import { airRegionOf } from './hiking-area.js';

export const CONDITION_DAYS = 3;
export const SECTION_BUDGET_MS = 6_000;
// 가까운 측정소 — 들머리에서 이 안, 앞에서부터 측정값이 있는 첫 곳.
const AIR_STATION_RADIUS_M = 30_000;
const AIR_STATION_CANDIDATES = 3;
const DAY_MS = 86_400_000;

export interface HikingConditionsDeps {
  prisma: PrismaClient;
  weather: Pick<WeatherService, 'getForecast'>;
  air: Pick<AirQualityService, 'getNearbyStations' | 'getForecast'>;
  fire: Pick<ForestFireService, 'get'>;
  now?: () => Date;
  budgetMs?: number;
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

const errorText = (e: unknown, what: string): string => (e instanceof Error && e.message ? e.message : `${what}을(를) 받지 못했습니다.`);

const settle = async <T>(p: Promise<T>, budgetMs: number, what: string): Promise<Settled<T>> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Settled<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: `${what} 응답이 늦어 이번에는 빠졌습니다. 잠시 뒤 다시 열어 보세요.` }), budgetMs);
  });
  try {
    return await Promise.race([p.then((value): Settled<T> => ({ ok: true, value })), late]);
  } catch (e) {
    return { ok: false, error: errorText(e, what) };
  } finally {
    clearTimeout(timer);
  }
};

const parseKeys = (raw: string | null): string[] | null => {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// 예보통보 → 날짜별 등급(권역 여럿이면 나쁜 쪽). 강원 권역은 "영서"·"강원영서" 둘 다 받는다.
type AirForecastDay = NonNullable<HikingConditionsType['air']>['forecast'][number];
type Grade = AirForecastDay['pm10Grade'];

export const airForecastByDate = (items: readonly AirForecastItemType[], regions: readonly string[]): AirForecastDay[] => {
  const want = new Set(regions.flatMap((r) => (r === '영서' || r === '영동' ? [r, `강원${r}`] : [r])));
  const byDate = new Map<string, { pm10Grade: Grade; pm25Grade: Grade }>();
  for (const it of items) {
    if (it.code !== 'PM10' && it.code !== 'PM25') continue;
    let worst: Grade = null;
    for (const g of it.grades) {
      if (!want.has(g.region)) continue;
      const v = airGradeFromText(g.grade);
      if (v !== null && (worst === null || v > worst)) worst = v;
    }
    const cur = byDate.get(it.targetDate) ?? { pm10Grade: null, pm25Grade: null };
    if (it.code === 'PM10') cur.pm10Grade = worst ?? cur.pm10Grade;
    else cur.pm25Grade = worst ?? cur.pm25Grade;
    byDate.set(it.targetDate, cur);
  }
  return [...byDate].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, g]) => ({ date, ...g }));
};

export class HikingConditionsService {
  constructor(private readonly deps: HikingConditionsDeps) {}

  async get(courseId: string): Promise<HikingConditionsType | null> {
    const c = await this.deps.prisma.hikingCourse.findUnique({
      where: { id: courseId },
      select: { id: true, startLat: true, startLng: true, startEle: true, maxEle: true, sigungu: true },
    });
    if (!c) return null;
    const now = this.deps.now?.() ?? new Date();
    const budget = this.deps.budgetMs ?? SECTION_BUDGET_MS;
    const dates = Array.from({ length: CONDITION_DAYS }, (_, i) => kmaTodayIsoDate(new Date(now.getTime() + i * DAY_MS)));
    const keys = parseKeys(c.sigungu);
    const regions = [...new Set((keys ?? []).map(airRegionOf).filter((r): r is string => r !== null))];
    const grid = latLngToKmaGrid(c.startLat, c.startLng);

    const [w, near, fc, f] = await Promise.all([
      settle(this.deps.weather.getForecast(grid.nx, grid.ny), budget, '날씨'),
      settle(this.deps.air.getNearbyStations(c.startLat, c.startLng, AIR_STATION_RADIUS_M, AIR_STATION_CANDIDATES), budget, '대기'),
      regions.length > 0 ? settle(this.deps.air.getForecast(), budget, '대기 예보') : Promise.resolve(null),
      keys && keys.length > 0 ? settle(this.deps.fire.get(), budget, '산불위험예보') : Promise.resolve(null),
    ]);

    const days: HikingConditionDayType[] = dates.map((date) => {
      const s = sunTimes(date, c.startLat, c.startLng);
      return { date, dawn: iso(s.dawn), sunrise: iso(s.sunrise), sunset: iso(s.sunset), dusk: iso(s.dusk) };
    });
    const dateSet = new Set(dates);

    let weather: HikingConditionsType['weather'] = null;
    if (w.ok) {
      const f0 = w.value;
      weather = {
        grid: f0.grid,
        base: f0.base,
        hours: f0.hours
          .filter((h) => dateSet.has(`${h.fcstDate.slice(0, 4)}-${h.fcstDate.slice(4, 6)}-${h.fcstDate.slice(6, 8)}`))
          .map((h) => ({
            at: h.at,
            tmp: h.tmp,
            topTmp: estimateTopTemp(h.tmp, c.startEle, c.maxEle),
            sky: h.sky,
            pty: h.pty,
            pop: h.pop,
            pcp: h.pcp,
            sno: h.sno,
            reh: h.reh,
            wsd: h.wsd,
            vec: h.vec,
          })),
        fetchedAt: f0.fetchedAt,
        stale: f0.stale,
      };
    }

    let air: HikingConditionsType['air'] = null;
    let airError: string | null = null;
    if (near.ok) {
      const station = near.value.items.find((s) => s.measure && (s.measure.pm10 !== null || s.measure.pm25 !== null)) ?? null;
      const m = station?.measure ?? null;
      air = {
        station: station ? { name: station.stationName, distM: station.dist } : null,
        measuredAt: m?.measuredAt ?? null,
        pm10: m?.pm10 ?? null,
        pm10Grade: m?.pm10Grade ?? null,
        pm25: m?.pm25 ?? null,
        pm25Grade: m?.pm25Grade ?? null,
        regions,
        forecast: fc?.ok ? airForecastByDate(fc.value.items, regions).filter((d) => dateSet.has(d.date)) : [],
        fetchedAt: near.value.fetchedAt,
        stale: near.value.stale || (fc?.ok === true && fc.value.stale),
      };
      if (fc && !fc.ok) airError = fc.error;
    } else airError = near.error;

    let fire: HikingConditionsType['fire'] = null;
    let fireError: string | null = null;
    if (keys === null) fireError = '코스 시군구가 아직 정해지지 않았습니다(다시 적재가 필요합니다).';
    else if (keys.length === 0) fireError = '코스가 걸친 시군구를 찾지 못했습니다.';
    else if (f && !f.ok) fireError = f.error;
    else if (f?.ok) {
      const areas: HikingFireAreaType[] = keys.flatMap((key) => {
        const a = f.value.byKey.get(key);
        return a ? [{ key, sido: a.sido, name: a.name, slots: a.slots }] : [];
      });
      fire = { areas, fetchedAt: f.value.fetchedAt.toISOString(), stale: f.value.stale };
      if (areas.length === 0) fireError = '이 시군구의 산불위험예보가 없습니다.';
    }

    return {
      courseId: c.id,
      ref: { lat: c.startLat, lng: c.startLng, ele: c.startEle },
      topEle: c.maxEle,
      days,
      weather,
      air,
      fire,
      errors: { weather: w.ok ? null : w.error, air: airError, fire: fireError },
      generatedAt: now.toISOString(),
    };
  }
}
