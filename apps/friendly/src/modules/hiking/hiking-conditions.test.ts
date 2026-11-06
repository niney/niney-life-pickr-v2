import type { PrismaClient } from '@prisma/client';
import type { WeatherForecastResultType } from '@repo/api-contract';
import { latLngToKmaGrid } from '@repo/utils';
import { describe, expect, it, vi } from 'vitest';
import { HikingApiError, fetchFireRisk, normalizeFireRisk, type FireRiskRow, type HikingApiOptions } from './hiking-api.adapter.js';
import { airRegionOf, courseSigungu, parseSigunguGeo, sigunguAt, sigunguKeyOf } from './hiking-area.js';
import {
  FIRE_DAILY_LIMIT,
  FIRE_FETCH_RETRIES,
  FIRE_FETCH_TIMEOUT_MS,
  FIRE_TTL_MS,
  ForestFireService,
  groupFireRows,
} from './forest-fire.service.js';
import { HikingConditionsService, airForecastByDate } from './hiking-conditions.service.js';
import { RECOMMEND_WEATHER_FETCH_MAX, pickWeatherModes } from './hiking-recommend.service.js';

// 오늘의 조건 부품 — 시군구 키·판정(통계청 2018 경계 → 현행 시도 코드), 산불위험예보 행 정리·캐시, 대기 예보 권역, 항목별
// 시간 예산. 라우트 흐름은 hiking.test.ts.

describe('hiking-area', () => {
  it('통계청 2018 코드 → 현행 시도 코드, 도의 구는 시로, 군위·세종은 옮긴다', () => {
    expect(sigunguKeyOf('32010', '춘천시')).toBe('51:춘천시');
    expect(sigunguKeyOf('31011', '수원시장안구')).toBe('41:수원시');
    expect(sigunguKeyOf('38111', '창원시마산합포구')).toBe('48:창원시');
    expect(sigunguKeyOf('21050', '부산진구')).toBe('26:부산진구');
    expect(sigunguKeyOf('24010', '동구')).toBe('12:동구');
    expect(sigunguKeyOf('36010', '목포시')).toBe('12:목포시');
    expect(sigunguKeyOf('37310', '군위군')).toBe('27:군위군');
    expect(sigunguKeyOf('29010', '세종시')).toBe('36:세종특별자치시');
    expect(sigunguKeyOf('99010', '어디')).toBeNull();
  });

  it('구멍 있는 폴리곤 판정과 코스 500m 표본', () => {
    const shapes = parseSigunguGeo({
      features: [
        {
          properties: { code: '32010', name: '춘천시' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [[127, 37], [127.1, 37], [127.1, 37.1], [127, 37.1], [127, 37]],
              [[127.04, 37.04], [127.06, 37.04], [127.06, 37.06], [127.04, 37.06], [127.04, 37.04]],
            ],
          },
        },
        {
          properties: { code: '32310', name: '홍천군' },
          geometry: { type: 'MultiPolygon', coordinates: [[[[127.1, 37], [127.2, 37], [127.2, 37.1], [127.1, 37.1], [127.1, 37]]]] },
        },
      ],
    });
    expect(sigunguAt(shapes, 37.02, 127.02)).toBe('51:춘천시');
    expect(sigunguAt(shapes, 37.05, 127.05)).toBeNull();
    expect(sigunguAt(shapes, 37.05, 127.15)).toBe('51:홍천군');
    expect(sigunguAt(shapes, 36.5, 127.05)).toBeNull();
    // 동쪽으로 가로지르는 코스 — 시작·끝 사이 표본에서 두 시군구.
    const pt = (lng: number, atM: number) => ({ lat: 37.02, lng, ele: null, atM });
    const course = {
      start: pt(127.02, 0),
      end: pt(127.18, 14_000),
      top: null,
      pieces: [Array.from({ length: 29 }, (_, i) => pt(127.02 + (0.16 * i) / 28, i * 500))],
    };
    expect(courseSigungu(course, shapes)).toEqual(['51:춘천시', '51:홍천군']);
  });

  it('대기 예보 권역 — 경기 남북·강원 영동영서·광주/전남', () => {
    expect(airRegionOf('41:포천시')).toBe('경기북부');
    expect(airRegionOf('41:양평군')).toBe('경기남부');
    expect(airRegionOf('51:속초시')).toBe('영동');
    expect(airRegionOf('51:인제군')).toBe('영서');
    expect(airRegionOf('12:동구')).toBe('광주');
    expect(airRegionOf('12:구례군')).toBe('전남');
    expect(airRegionOf('48:산청군')).toBe('경남');
  });

  it('예보통보 → 날짜별 나쁜 쪽 등급("영서"·"강원영서" 모두)', () => {
    const items = [
      { code: 'PM10', targetDate: '2026-10-26', grades: [{ region: '영서', grade: '보통' }, { region: '영동', grade: '나쁨' }] },
      { code: 'PM25', targetDate: '2026-10-26', grades: [{ region: '강원영서', grade: '좋음' }] },
      { code: 'O3', targetDate: '2026-10-26', grades: [{ region: '영서', grade: '매우나쁨' }] },
      { code: 'PM10', targetDate: '2026-10-25', grades: [{ region: '서울', grade: '나쁨' }] },
    ] as Parameters<typeof airForecastByDate>[0];
    expect(airForecastByDate(items, ['영서', '영동'])).toEqual([
      { date: '2026-10-25', pm10Grade: null, pm25Grade: null },
      { date: '2026-10-26', pm10Grade: 3, pm25Grade: 1 },
    ]);
  });
});

describe('산불위험예보', () => {
  it('행 정리 — 시각 ISO·현행 키, 묵은 칸은 버리고 시각 순', () => {
    const row = normalizeFireRisk({ analdate: '2026-10-25 15', upplocalcd: 51, sigun: '춘천시', doname: '강원특별자치도', d1: 77, d2: '23', d3: 0, d4: 0, meanavg: 52, maxi: 61, area: '111,562' });
    expect(row).toEqual({ key: '51:춘천시', sido: '강원특별자치도', name: '춘천시', at: '2026-10-25T15:00:00+09:00', d1: 77, d2: 23, d3: 0, d4: 0, mean: 52, max: 61 });
    expect(normalizeFireRisk({ analdate: '2026-10-25', upplocalcd: 51, sigun: '춘천시' })).toBeNull();
    const now = new Date('2026-10-25T12:00:00+09:00');
    const g = groupFireRows(
      [
        { ...row!, at: '2026-10-25T18:00:00+09:00' },
        row!,
        { ...row!, at: '2026-10-25T06:00:00+09:00' },
        { ...row!, key: '47:울릉군', name: '울릉군', at: '2026-03-04T09:00:00+09:00' },
      ],
      now,
    );
    expect(g.get('51:춘천시')!.slots.map((s) => s.at)).toEqual(['2026-10-25T15:00:00+09:00', '2026-10-25T18:00:00+09:00']);
    expect(g.has('47:울릉군')).toBe(false);
  });

  it('3시간 캐시·동시 요청 합류, 만료 뒤 갱신이 실패하면 마지막 성공분을 stale 로, 쿨다운 동안은 다시 부르지 않는다', async () => {
    let nowMs = Date.parse('2026-10-25T12:00:00+09:00');
    const rows: FireRiskRow[] = [{ key: '51:춘천시', sido: '강원', name: '춘천시', at: '2026-10-25T12:00:00+09:00', d1: 100, d2: 0, d3: 0, d4: 0, mean: 20, max: 30 }];
    const fetchFire = vi.fn(async () => rows);
    const svc = new ForestFireService({ serviceKey: 'k', fetchFire, now: () => new Date(nowMs) });
    const [a, b] = await Promise.all([svc.get(), svc.get()]);
    expect(a.byKey.get('51:춘천시')!.slots).toHaveLength(1);
    expect(b.stale).toBe(false);
    expect(fetchFire).toHaveBeenCalledTimes(1);
    nowMs += FIRE_TTL_MS - 1_000;
    await svc.get();
    expect(fetchFire).toHaveBeenCalledTimes(1);

    nowMs += 2_000;
    fetchFire.mockRejectedValueOnce(new HikingApiError('HTTP 502', 'u'));
    const stale = await svc.get();
    expect(stale.stale).toBe(true);
    expect(fetchFire).toHaveBeenCalledTimes(2);
    // 쿨다운(30초) 안 — 업스트림 없이 stale.
    expect((await svc.get()).stale).toBe(true);
    expect(fetchFire).toHaveBeenCalledTimes(2);
  });

  it('키 없음 503, 처음부터 실패하면 502', async () => {
    await expect(new ForestFireService({ serviceKey: '' }).get()).rejects.toMatchObject({ statusCode: 503 });
    const svc = new ForestFireService({ serviceKey: 'k', fetchFire: async () => Promise.reject(new HikingApiError('HTTP 500', 'u')) });
    await expect(svc.get()).rejects.toMatchObject({ statusCode: 502 });
  });

  const rowAt = (at: string): FireRiskRow => ({ key: '51:춘천시', sido: '강원', name: '춘천시', at, d1: 100, d2: 0, d3: 0, d4: 0, mean: 20, max: 30 });

  it('만료 뒤에는 갱신을 기다리지 않고 마지막 성공분을 바로 내며, 갱신은 뒤에서 한 번만 돈다', async () => {
    let nowMs = Date.parse('2026-10-25T12:00:00+09:00');
    const fetchFire = vi.fn(async (): Promise<FireRiskRow[]> => [rowAt('2026-10-25T12:00:00+09:00')]);
    const svc = new ForestFireService({ serviceKey: 'k', fetchFire, now: () => new Date(nowMs) });
    await svc.get();
    nowMs += FIRE_TTL_MS + 1_000;
    let release!: (rows: FireRiskRow[]) => void;
    fetchFire.mockImplementationOnce(() => new Promise<FireRiskRow[]>((r) => (release = r)));
    // 갱신 응답이 오지 않는 동안에도 두 요청 모두 곧바로 stale — 업스트림은 한 번.
    expect((await svc.get()).stale).toBe(true);
    expect((await svc.get()).stale).toBe(true);
    expect(fetchFire).toHaveBeenCalledTimes(2);
    release([rowAt('2026-10-25T15:00:00+09:00')]);
    await vi.waitFor(async () => expect((await svc.get()).stale).toBe(false));
    expect((await svc.get()).byKey.get('51:춘천시')!.slots[0]!.at).toBe('2026-10-25T15:00:00+09:00');
    expect(fetchFire).toHaveBeenCalledTimes(2);
  });

  it('쿨다운은 실패를 안 시각부터 — 오래 걸린 실패 직후 다시 부르지 않는다', async () => {
    let nowMs = Date.parse('2026-10-25T12:00:00+09:00');
    // 타임아웃·재시도로 63초 걸려 실패.
    const fetchFire = vi.fn(async (): Promise<FireRiskRow[]> => {
      nowMs += 63_000;
      throw new HikingApiError('요청 실패: aborted', 'u');
    });
    const svc = new ForestFireService({ serviceKey: 'k', fetchFire, now: () => new Date(nowMs) });
    await expect(svc.get()).rejects.toMatchObject({ statusCode: 502 });
    // 실패 10초 뒤 — 첫 쿨다운(30초) 안이라 업스트림 없이 503. 시작 시각 기준이면 이미 풀려 다시 불렀다.
    nowMs += 10_000;
    await expect(svc.get()).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchFire).toHaveBeenCalledTimes(1);
  });

  it('요청 경로용 타임아웃·재시도를 넘기고, 재시도도 일일 한도에 센다', async () => {
    let nowMs = Date.parse('2026-10-25T09:00:00+09:00');
    const fetchFire = vi.fn(async (opts: HikingApiOptions): Promise<FireRiskRow[]> => {
      // 한 번 받는 동안 재시도가 한도를 다 쓴다(첫 호출 1 + 재시도 47 = 48).
      for (let i = 0; i < FIRE_DAILY_LIMIT - 1; i++) opts.onRetry?.();
      return [rowAt('2026-10-25T09:00:00+09:00')];
    });
    const svc = new ForestFireService({ serviceKey: 'k', fetchFire, now: () => new Date(nowMs) });
    await svc.get();
    expect(fetchFire).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: FIRE_FETCH_TIMEOUT_MS, retries: FIRE_FETCH_RETRIES, onRetry: expect.any(Function) }),
    );
    // 같은 날 만료 뒤 — 한도가 찼으니 업스트림 없이 마지막 성공분.
    nowMs += FIRE_TTL_MS + 1_000;
    expect((await svc.get()).stale).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(fetchFire).toHaveBeenCalledTimes(1);
  });

  it('어댑터 — 재시도 횟수·재시도 알림을 따르고, 본문 읽기 실패도 다시 시도한다', async () => {
    const okBody = JSON.stringify({
      response: {
        header: { resultCode: '00' },
        body: { items: { item: [{ analdate: '2026-10-25 15', upplocalcd: 51, sigun: '춘천시', doname: '강원', d1: 1, d2: 0, d3: 0, d4: 0 }] }, totalCount: 1 },
      },
    });
    const brokenBody = { status: 200, text: () => Promise.reject(new Error('body aborted')) } as unknown as Response;
    let calls = 0;
    const fetchImpl = vi.fn(async (): Promise<Response> => (++calls === 1 ? brokenBody : new Response(okBody, { status: 200 })));
    const onRetry = vi.fn();
    const rows = await fetchFireRisk({ serviceKey: 'k', fetchImpl, retryDelayMs: 0, retries: 1, onRetry });
    expect(rows).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // 재시도 0 — 한 번 실패로 끝(HikingApiError 라 서비스 쿨다운이 센다).
    calls = 0;
    await expect(fetchFireRisk({ serviceKey: 'k', fetchImpl, retryDelayMs: 0, retries: 0 })).rejects.toBeInstanceOf(HikingApiError);
  });
});

describe('HikingConditionsService', () => {
  const course = { id: '1-1', startLat: 37, startLng: 127, startEle: 300, maxEle: 900, sigungu: null as string | null };
  const prisma = (row: typeof course | null) => ({ hikingCourse: { findUnique: async () => row } }) as unknown as PrismaClient;

  it('항목이 예산을 넘기면 그 항목만 빠진다 — 시군구 없는 옛 적재분은 산불 안내', async () => {
    const svc = new HikingConditionsService({
      prisma: prisma(course),
      weather: { getForecast: () => new Promise(() => {}), peekForecast: () => null },
      air: {
        getNearbyStations: async () => ({ center: { lat: 37, lng: 127 }, items: [], total: 0, fetchedAt: 'f', stale: false }),
        getForecast: async () => ({ date: 'd', items: [], fetchedAt: 'f', stale: false }),
      },
      fire: { get: vi.fn() },
      budgetMs: 20,
    });
    const out = (await svc.get('1-1'))!;
    expect(out.weather).toBeNull();
    expect(out.errors.weather).toContain('늦어');
    expect(out.air).toMatchObject({ station: null, regions: [], forecast: [] });
    expect(out.fire).toBeNull();
    expect(out.errors.fire).toContain('다시 적재');
    expect(out.days).toHaveLength(3);
  });

  it('없는 코스는 null', async () => {
    const svc = new HikingConditionsService({
      prisma: prisma(null),
      weather: { getForecast: vi.fn(), peekForecast: vi.fn(() => null) },
      air: { getNearbyStations: vi.fn(), getForecast: vi.fn() },
      fire: { get: vi.fn() },
    });
    expect(await svc.get('1-9')).toBeNull();
  });

  // 날씨 쿼터 몫 — 캐시에 새것이 있으면 업스트림·몫 없이, 없으면 몫 안에서만 받고, peek 는 캐시만.
  const forecastOf = (stale: boolean): WeatherForecastResultType => ({
    grid: { nx: 1, ny: 1 },
    base: null,
    fallback: false,
    hours: [],
    days: [],
    total: 0,
    fetchedAt: '2026-10-25T00:00:00.000Z',
    stale,
  });
  const quietAir = {
    getNearbyStations: async () => ({ center: { lat: 37, lng: 127 }, items: [], total: 0, fetchedAt: 'f', stale: false }),
    getForecast: async () => ({ date: 'd', items: [], fetchedAt: 'f', stale: false }),
  };

  it('날씨 — 캐시에 새것이 있으면 업스트림을 부르지 않고, 없으면 등산 몫 안에서만 받는다', async () => {
    const cached = new Map<string, WeatherForecastResultType>();
    const weather = {
      peekForecast: vi.fn((nx: number, ny: number) => cached.get(`${nx},${ny}`) ?? null),
      getForecast: vi.fn(async (nx: number, ny: number) => {
        const f = forecastOf(false);
        cached.set(`${nx},${ny}`, f);
        return f;
      }),
    };
    const rows = new Map([
      ['a', { ...course, id: 'a', startLat: 37, startLng: 127 }],
      ['b', { ...course, id: 'b', startLat: 35.1, startLng: 129 }],
    ]);
    const svc = new HikingConditionsService({
      prisma: { hikingCourse: { findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null } } as unknown as PrismaClient,
      weather,
      air: quietAir,
      fire: { get: vi.fn() },
      weatherDailyLimit: 1,
    });
    expect(svc.hasFreshWeather(37, 127)).toBe(false);
    expect((await svc.get('a'))!.weather).not.toBeNull();
    expect(svc.hasFreshWeather(37, 127)).toBe(true);
    // 같은 격자는 캐시 — 몫을 쓰지 않는다.
    expect((await svc.get('a'))!.weather).not.toBeNull();
    expect(weather.getForecast).toHaveBeenCalledTimes(1);
    // 다른 격자 — 몫(1)을 이미 써서 업스트림 없이 그 칸만 빈다.
    const b = (await svc.get('b'))!;
    expect(b.weather).toBeNull();
    expect(b.errors.weather).toContain('한도');
    expect(weather.getForecast).toHaveBeenCalledTimes(1);
  });

  it('날씨 — 같은 격자를 동시에 받으면 몫을 한 번만 쓰고 합류한다', async () => {
    let resolve!: (f: WeatherForecastResultType) => void;
    const weather = { peekForecast: vi.fn(() => null), getForecast: vi.fn(() => new Promise<WeatherForecastResultType>((r) => (resolve = r))) };
    const sameGrid = { ...course, startLat: 37.0001 };
    const rows = new Map([
      ['a', { ...course, id: 'a' }],
      ['b', { ...sameGrid, id: 'b' }],
    ]);
    expect(latLngToKmaGrid(37, 127)).toEqual(latLngToKmaGrid(sameGrid.startLat, sameGrid.startLng));
    const svc = new HikingConditionsService({
      prisma: { hikingCourse: { findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null } } as unknown as PrismaClient,
      weather,
      air: quietAir,
      fire: { get: vi.fn() },
      weatherDailyLimit: 1,
    });
    const both = Promise.all([svc.get('a'), svc.get('b')]);
    await vi.waitFor(() => expect(weather.getForecast).toHaveBeenCalledTimes(1));
    resolve(forecastOf(false));
    const [a, b] = await both;
    expect(a!.weather).not.toBeNull();
    expect(b!.weather).not.toBeNull();
    expect(weather.getForecast).toHaveBeenCalledTimes(1);
  });

  it('날씨 — peek 는 캐시(만료분 포함)만 보고, 몫이 바닥나도 만료분은 낸다', async () => {
    const stale = forecastOf(true);
    const weather = { peekForecast: vi.fn(() => stale), getForecast: vi.fn(async () => forecastOf(false)) };
    const svc = new HikingConditionsService({ prisma: prisma(course), weather, air: quietAir, fire: { get: vi.fn() }, weatherDailyLimit: 0 });
    expect((await svc.get('1-1', { weather: 'peek' }))!.weather).toMatchObject({ stale: true });
    // fetch 라도 몫이 없으면 만료분.
    expect((await svc.get('1-1'))!.weather).toMatchObject({ stale: true });
    expect(weather.getForecast).not.toHaveBeenCalled();
    // 캐시에 아무것도 없으면 peek 는 빈 칸(업스트림 없음).
    const empty = new HikingConditionsService({
      prisma: prisma(course),
      weather: { peekForecast: () => null, getForecast: vi.fn() },
      air: quietAir,
      fire: { get: vi.fn() },
    });
    const out = (await empty.get('1-1', { weather: 'peek' }))!;
    expect(out.weather).toBeNull();
    expect(out.errors.weather).toContain('아직 받지 않았습니다');
  });
});

describe('추천 날씨 받기', () => {
  it('캐시에 있으면 peek, 없으면 앞에서부터 서로 다른 격자 상한까지만 fetch(같은 격자 뒤 후보도 fetch)', () => {
    // 격자가 모두 다른 들머리 6곳(위도 0.1° ≈ 11km) + 첫 곳과 같은 격자.
    const starts = [0, 1, 2, 3, 4, 5].map((i) => ({ lat: 36 + i * 0.1, lng: 127.5 }));
    starts.push({ ...starts[0]! });
    expect(new Set(starts.map((p) => JSON.stringify(latLngToKmaGrid(p.lat, p.lng)))).size).toBe(6);
    // 두 번째 들머리만 캐시에 새것이 있다.
    const modes = pickWeatherModes(starts, (p) => p === starts[1]);
    expect(RECOMMEND_WEATHER_FETCH_MAX).toBe(3);
    // 0 fetch · 1 캐시 peek · 2·3 fetch(상한 3 채움) · 4·5 peek · 6(0 과 같은 격자) fetch.
    expect(modes).toEqual(['fetch', 'peek', 'fetch', 'fetch', 'peek', 'peek', 'fetch']);
  });
});
