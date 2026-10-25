import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HikingApiError, normalizeFireRisk, type FireRiskRow } from './hiking-api.adapter.js';
import { airRegionOf, courseSigungu, parseSigunguGeo, sigunguAt, sigunguKeyOf } from './hiking-area.js';
import { FIRE_TTL_MS, ForestFireService, groupFireRows } from './forest-fire.service.js';
import { HikingConditionsService, airForecastByDate } from './hiking-conditions.service.js';

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

  it('3시간 캐시·동시 요청 합류, 실패하면 마지막 성공분을 stale 로, 쿨다운 동안은 다시 부르지 않는다', async () => {
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
});

describe('HikingConditionsService', () => {
  const course = { id: '1-1', startLat: 37, startLng: 127, startEle: 300, maxEle: 900, sigungu: null as string | null };
  const prisma = (row: typeof course | null) => ({ hikingCourse: { findUnique: async () => row } }) as unknown as PrismaClient;

  it('항목이 예산을 넘기면 그 항목만 빠진다 — 시군구 없는 옛 적재분은 산불 안내', async () => {
    const svc = new HikingConditionsService({
      prisma: prisma(course),
      weather: { getForecast: () => new Promise(() => {}) },
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
      weather: { getForecast: vi.fn() },
      air: { getNearbyStations: vi.fn(), getForecast: vi.fn() },
      fire: { get: vi.fn() },
    });
    expect(await svc.get('1-9')).toBeNull();
  });
});
