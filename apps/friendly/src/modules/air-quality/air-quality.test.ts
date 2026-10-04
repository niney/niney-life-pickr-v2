import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// env.ts 는 모듈 로드 시점에 process.env 를 파싱한다 — buildApp import 전에 키를
// 주입해야 라우트의 AirQualityService 가 503 으로 죽지 않는다(어댑터는 mock 이라
// 실제 호출은 없다).
vi.hoisted(() => {
  process.env.DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY || 'test-air-key';
});

// 실 에어코리아 호출 차단 — 타입드 래퍼만 mock, 에러 클래스 등은 실구현 유지.
// getBadStations 는 서비스가 더 부르지 않는다(전국 실시간에서 파생) — 호출 0 을 단언하려고 남긴다.
const mocks = vi.hoisted(() => ({
  getSidoRealtime: vi.fn(),
  getStationRealtime: vi.fn(),
  getBadStations: vi.fn(),
  getDustForecast: vi.fn(),
  getWeeklyForecast: vi.fn(),
  getStationList: vi.fn(),
}));
vi.mock('./airkorea-api.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./airkorea-api.adapter.js')>();
  return { ...actual, ...mocks };
});

import type {
  AirBadStationsResultType,
  AirForecastResultType,
  AirNearbyResultType,
  AirSidoRealtimeResultType,
  AirStationHistoryResultType,
  AirStationSearchResultType,
  AirStationsResultType,
  AirWeeklyForecastResultType,
} from '@repo/api-contract';
import { seoulDateKey } from '../../lib/upstream-guard.js';
import { buildApp } from '../../app.js';
import {
  AirKoreaApiAuthError,
  AirKoreaApiError,
  type AirKoreaApiRequestOptions,
  type RawAirForecastRow,
  type RawAirMeasureRow,
  type RawAirStationRow,
  type RawAirWeeklyRow,
} from './airkorea-api.adapter.js';
import {
  AIR_FORECAST_TTL_MS,
  AIR_HISTORY_CACHE_MAX,
  AIR_MEASURE_STALE_MAX_MS,
  AIR_MEASURE_TTL_MS,
  AirQualityService,
  clampAirDate,
  deriveBadStations,
  forecastTtlMs,
  measureTtlMs,
  toMeasureItem,
  weeklyTtlMs,
} from './air-quality.service.js';

// 픽스처(실응답 축약본) → 어댑터 원시 행. 어댑터 파싱은 adapter.test 가 검증하므로
// 여기서는 JSON 값을 그대로 문자열/null 로 옮긴다.
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureItems = (name: string): Record<string, unknown>[] => {
  const json = JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as {
    response: { body: { items: Record<string, unknown>[] } };
  };
  return json.response.body.items;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const MEASURE_KEYS: (keyof RawAirMeasureRow)[] = [
  'stationName', 'stationCode', 'sidoName', 'mangName', 'dataTime',
  'so2Value', 'coValue', 'o3Value', 'no2Value', 'pm10Value', 'pm10Value24',
  'pm25Value', 'pm25Value24', 'khaiValue', 'khaiGrade', 'so2Grade', 'coGrade',
  'o3Grade', 'no2Grade', 'pm10Grade', 'pm25Grade', 'pm10Grade1h', 'pm25Grade1h',
  'so2Flag', 'coFlag', 'o3Flag', 'no2Flag', 'pm10Flag', 'pm25Flag',
];
const rawMeasureRows = (name: string): RawAirMeasureRow[] =>
  fixtureItems(name).map((o) => {
    const row = {} as Record<keyof RawAirMeasureRow, string | null>;
    for (const k of MEASURE_KEYS) row[k] = str(o[k]);
    return row;
  });
const rawForecastRows = (): RawAirForecastRow[] =>
  fixtureItems('forecast.json').map((o) => ({
    dataTime: str(o['dataTime']),
    informCode: str(o['informCode']),
    informData: str(o['informData']),
    informOverall: str(o['informOverall']),
    informCause: str(o['informCause']),
    informGrade: str(o['informGrade']),
    actionKnack: str(o['actionKnack']),
    imageUrls: Array.from({ length: 9 }, (_, i) => str(o[`imageUrl${i + 1}`])).filter(
      (u): u is string => u !== null,
    ),
  }));
const rawWeeklyRows = (): RawAirWeeklyRow[] =>
  fixtureItems('weekly.json').map((o) => ({
    presnatnDt: str(o['presnatnDt']),
    gwthcnd: str(o['gwthcnd']),
    days: (['One', 'Two', 'Three', 'Four'] as const).map((s) => ({
      date: str(o[`frcst${s}Dt`]),
      text: str(o[`frcst${s}Cn`]),
    })),
  }));
// 측정소정보 — 문서 샘플 기반 합성 픽스처(실응답 미관측). 축 뒤집힌 행(과천시청)과
// 좌표 결측 행(이도동)을 일부러 넣어 정규화 분기를 고정한다.
const rawStationRows = (): RawAirStationRow[] =>
  fixtureItems('msrstn-list.synthetic.json').map((o) => ({
    stationName: str(o['stationName']),
    addr: str(o['addr']),
    year: str(o['year']),
    mangName: str(o['mangName']),
    item: str(o['item']),
    dmX: str(o['dmX']),
    dmY: str(o['dmY']),
    stationCode: str(o['stationCode']),
  }));
const sidoAll = () => ({ rows: rawMeasureRows('sido-all.json'), pages: 1 });
const stationList = () => ({ rows: rawStationRows(), totalCount: 5, pages: 1 });
// 측정 시각만 바꾼 '전국' 행 — 측정 TTL(늦게 올라오는 중) 분기용.
const sidoAllAt = (dataTime: string) => ({
  rows: rawMeasureRows('sido-all.json').map((r) => ({ ...r, dataTime })),
  pages: 1,
});

const sidoUrl = (sido: string): string => `/api/v1/air/sido/${encodeURIComponent(sido)}`;
const historyUrl = (station: string, term?: string): string =>
  `/api/v1/air/stations/${encodeURIComponent(station)}/history${term ? `?term=${term}` : ''}`;
const DAY_MS = 86_400_000;
// 라우트 서비스는 실제 시계 — clamp 기대값도 실제 오늘 기준.
const kstDay = (offsetDays: number): string => seoulDateKey(new Date(Date.now() + offsetDays * DAY_MS));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
});

describe('GET /api/v1/air/sido/:sidoName — 시도별 실시간', () => {
  it('전국 1콜을 캐시하고 요청 시도로 거른다(서울 3·광주→전남광주 2·전국 8), 값은 숫자/등급으로 정규화', async () => {
    mocks.getSidoRealtime.mockResolvedValue(sidoAll());

    const seoul = await app.inject({ url: sidoUrl('서울') });
    expect(seoul.statusCode).toBe(200);
    const sb = seoul.json() as AirSidoRealtimeResultType;
    expect(sb.sidoName).toBe('서울');
    expect(sb.total).toBe(3);
    expect(sb.stale).toBe(false);
    expect(sb.items.map((i) => i.stationName)).toEqual(['강남구', '서초구', '금천구']);
    expect(sb.items[0]).toMatchObject({
      stationCode: '111261',
      sidoName: '서울',
      mangName: '도시대기',
      dataTime: '2026-08-21 12:00',
      measuredAt: '2026-08-21T12:00:00+09:00',
      pm10: 35,
      pm25: 28,
      o3: 0.0109,
      so2: 0.0022,
      pm10Avg24: 39,
      khai: 82,
      khaiGrade: 2,
      pm10Grade1h: 2,
      flags: { so2: null, co: null, o3: null, no2: null, pm10: null, pm25: null },
    });
    // 통신장애 행 — 농도 "-" → null, 등급 null, Flag 보존.
    const broken = sb.items.find((i) => i.stationName === '금천구');
    expect(broken).toMatchObject({ pm10: null, khai: null, khaiGrade: null, pm10Grade: null });
    expect(broken?.flags.pm10).toBe('통신장애');

    // 2026-07 통합 라벨 '전남광주' — 구 라벨 '광주' 요청에 매칭.
    const gwangju = await app.inject({ url: sidoUrl('광주') });
    const gb = gwangju.json() as AirSidoRealtimeResultType;
    expect(gb.items.map((i) => i.stationName)).toEqual(['서석동', '치평동']);
    expect(gb.items.every((i) => i.sidoName === '전남광주')).toBe(true);

    const all = await app.inject({ url: sidoUrl('전국') });
    expect((all.json() as AirSidoRealtimeResultType).total).toBe(8);

    // 세 요청 모두 캐시된 '전국' 1콜 — 업스트림은 1회만.
    expect(mocks.getSidoRealtime).toHaveBeenCalledTimes(1);
    expect(mocks.getSidoRealtime.mock.calls[0]?.[0]).toBe('전국');
  });

  it('매칭 0건은 404 가 아니라 빈 items', async () => {
    mocks.getSidoRealtime.mockResolvedValue(sidoAll());
    const res = await app.inject({ url: sidoUrl('화성') });
    expect(res.statusCode).toBe(200);
    expect((res.json() as AirSidoRealtimeResultType).items).toEqual([]);
  });
});

describe('GET /api/v1/air/stations/:stationName/history — 측정소별 시계열', () => {
  // 측정소 화이트리스트(목록 ∪ 전국 실시간)가 이름을 확인한다 — 둘 다 픽스처로.
  beforeEach(() => {
    mocks.getSidoRealtime.mockResolvedValue(sidoAll());
    mocks.getStationList.mockResolvedValue(stationList());
  });

  it('DAILY: 시간 오름차순 포인트, "24:00" → 익일 00:00 ISO, latest 는 최신 행, 결측은 null', async () => {
    mocks.getStationRealtime.mockResolvedValue({
      rows: rawMeasureRows('station-daily.json'),
      totalCount: 7,
      pages: 1,
    });
    const res = await app.inject({ url: historyUrl('강남구', 'DAILY') });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AirStationHistoryResultType;
    expect(body).toMatchObject({ stationName: '강남구', term: 'DAILY', unit: 'hour', total: 7, stale: false });
    expect(body.points.map((p) => p.time)).toEqual([
      '2026-08-20 15:00',
      '2026-08-20 17:00',
      '2026-08-20 19:00',
      '2026-08-20 24:00',
      '2026-08-21 01:00',
      '2026-08-21 11:00',
      '2026-08-21 12:00',
    ]);
    expect(body.points[3]?.measuredAt).toBe('2026-08-21T00:00:00+09:00');
    // 통신장애 시각(17:00) 은 전 항목 null, 19:00 은 khai 만 결측.
    expect(body.points[1]).toMatchObject({ pm10: null, pm25: null, o3: null, khai: null });
    expect(body.points[2]).toMatchObject({ pm10: 53, khai: null });
    expect(body.latest?.dataTime).toBe('2026-08-21 12:00');
    expect(body.latest?.khaiGrade).toBe(2);
    expect(mocks.getStationRealtime).toHaveBeenCalledWith('강남구', 'DAILY', expect.anything());
  });

  it('MONTH: dataTime 날짜 기준 일평균(24:00 은 전일 묶음), 결측 제외 평균, 날짜 오름차순', async () => {
    mocks.getStationRealtime.mockResolvedValue({
      rows: rawMeasureRows('station-daily.json'),
      totalCount: 7,
      pages: 1,
    });
    const res = await app.inject({ url: historyUrl('강남구', 'MONTH') });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AirStationHistoryResultType;
    expect(body.unit).toBe('day');
    expect(body.points.map((p) => p.time)).toEqual(['2026-08-20', '2026-08-21']);
    // 08-20: pm10 41(24:00)·53(19:00)·56(15:00), 17:00 결측 제외 → 50.0
    expect(body.points[0]?.pm10).toBe(50);
    // 08-21: 35·39·43 → 39
    expect(body.points[1]?.pm10).toBe(39);
    expect(body.points[0]?.measuredAt).toBeNull();
    expect(mocks.getStationRealtime).toHaveBeenCalledWith('강남구', 'MONTH', expect.anything());
  });

  it('term 기본값 DAILY, 허용 외 term 은 400', async () => {
    mocks.getStationRealtime.mockResolvedValue({ rows: [], totalCount: 0, pages: 1 });
    // 서초구 — 전국 실시간에만 있는 이름(목록엔 없음)도 화이트리스트를 통과한다.
    const ok = await app.inject({ url: historyUrl('서초구') });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as AirStationHistoryResultType).term).toBe('DAILY');
    expect((ok.json() as AirStationHistoryResultType).latest).toBeNull();

    const bad = await app.inject({ url: historyUrl('강남구', 'WEEK') });
    expect(bad.statusCode).toBe(400);
    expect(mocks.getStationRealtime).toHaveBeenCalledTimes(1);
  });

  it('모르는 측정소명은 404 — 업스트림 시계열 0콜(E-2 화이트리스트)', async () => {
    const res = await app.inject({ url: historyUrl('없는측정소이름', '3MONTH') });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: 'Not Found' });
    expect(mocks.getStationRealtime).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/air/bad-stations', () => {
  it('전국 실시간의 khaiGrade 3 이상에서 파생 — 나쁨 오퍼레이션 0콜, 주소는 측정소 목록에서', async () => {
    // '전국' 은 앞 describe 의 캐시가 살아 있을 수 있어(라우트 서비스 공유) 파생 규칙은 아래 단위 테스트가
    // 맡고, 여기서는 라우트 봉투·업스트림 나쁨 목록 미호출만 본다.
    mocks.getSidoRealtime.mockResolvedValue(sidoAll());
    mocks.getStationList.mockResolvedValue(stationList());
    const res = await app.inject({ url: '/api/v1/air/bad-stations' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AirBadStationsResultType;
    expect(body.total).toBe(body.items.length);
    expect(body.stale).toBe(false);
    expect(mocks.getBadStations).not.toHaveBeenCalled();
  });

  it('deriveBadStations — 나쁨(3)·매우나쁨(4)만, 주소·시도는 목록에서(동명은 시도로), 목록에 없으면 빈 주소+측정 시도', () => {
    const measures = rawMeasureRows('sido-all.json')
      .map((r) =>
        r.stationName === '강남구'
          ? { ...r, khaiGrade: '3' }
          : r.stationName === '서석동'
            ? { ...r, khaiGrade: '4' }
            : r,
      )
      .map(toMeasureItem);
    const stations = rawStationRows().map((r) => ({
      stationName: r.stationName ?? '',
      addr: r.addr ?? '',
      sidoName: r.addr?.startsWith('서울') ? '서울' : null,
      mangName: null,
      year: null,
      items: [],
      lat: null,
      lng: null,
    }));
    expect(deriveBadStations(measures, stations)).toEqual([
      { stationName: '강남구', addr: '서울 강남구 학동로 426 강남구청 별관 1동', sidoName: '서울' },
      { stationName: '서석동', addr: '', sidoName: '전남광주' },
    ]);
    // 목록이 없으면(측정소정보 장애) 이름·측정 시도만.
    expect(deriveBadStations(measures, null)[0]).toEqual({ stationName: '강남구', addr: '', sidoName: '서울' });
  });
});

describe('GET /api/v1/air/forecast', () => {
  it('오늘 날짜로 조회, 코드별 정렬, 권역 등급 분해, 빈 이미지 슬롯 제거 + 파일명 라벨', async () => {
    mocks.getDustForecast.mockResolvedValue(rawForecastRows());
    const res = await app.inject({ url: '/api/v1/air/forecast' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AirForecastResultType;
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mocks.getDustForecast).toHaveBeenCalledWith(body.date, expect.anything());
    expect(body.items.map((i) => `${i.code}/${i.targetDate}`)).toEqual([
      'PM10/2026-08-21',
      'PM25/2026-08-21',
      'O3/2026-08-21',
      'O3/2026-08-22',
    ]);
    const first = body.items[0]!;
    expect(first.announced).toBe('2026-08-21 11시 발표');
    expect(first.announcedAt).toBe('2026-08-21T11:00:00+09:00');
    expect(first.grades).toHaveLength(19);
    expect(first.grades[0]).toEqual({ region: '서울', grade: '좋음' });
    expect(first.overall).toContain("'좋음'∼'보통'");
    // imageUrl1~7 유효, 8·9(디렉터리) 제거.
    expect(first.images).toHaveLength(7);
    expect(first.images[0]).toEqual({
      url: 'https://www.airkorea.or.kr/dustImage/2026/08/21/11/09km/AQF.20260820.NIER_09_01.PM10.1hsp.2026082103.png',
      pollutant: 'PM10',
      at: '8/21 03시',
      animated: false,
    });
    expect(first.images[6]).toMatchObject({ pollutant: 'PM10', animated: true, at: null });
  });

  it('?date= 명시 조회는 오늘-2~오늘+1 로 맞춘다(먼 과거 → 오늘-2, 폴백 없음) / 형식 불일치 400', async () => {
    mocks.getDustForecast.mockResolvedValue([]);
    const ok = await app.inject({ url: '/api/v1/air/forecast?date=2026-08-19' });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as AirForecastResultType).date).toBe(kstDay(-2));
    expect(mocks.getDustForecast).toHaveBeenCalledWith(kstDay(-2), expect.anything());
    // 명시 date 는 빈 결과여도 전일 폴백 없음.
    expect(mocks.getDustForecast).toHaveBeenCalledTimes(1);
    // 서로 다른 먼 날짜도 같은 키로 모인다 — 날짜 순회가 쿼터를 못 태운다.
    await app.inject({ url: '/api/v1/air/forecast?date=2001-01-01' });
    expect(mocks.getDustForecast).toHaveBeenCalledTimes(1);

    const bad = await app.inject({ url: '/api/v1/air/forecast?date=20260819' });
    expect(bad.statusCode).toBe(400);
  });
});

describe('GET /api/v1/air/forecast/weekly', () => {
  it('발표일·전망·4일치(날짜 오름차순)·신뢰도 분리', async () => {
    mocks.getWeeklyForecast.mockResolvedValue(rawWeeklyRows());
    const res = await app.inject({ url: '/api/v1/air/forecast/weekly?date=2026-08-20' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AirWeeklyForecastResultType;
    expect(body.presentedAt).toBe('2026-08-20');
    expect(body.outlook).toContain('[8월 23일~8월 26일]');
    expect(body.days.map((d) => d.date)).toEqual(['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26']);
    expect(body.days[0]?.grades).toHaveLength(19);
    expect(body.days[0]?.grades[0]).toEqual({ region: '서울', grade: '낮음' });
    expect(body.days[0]?.reliability).toBe('높음');
    expect(body.days[0]?.grades.some((g) => g.region === '신뢰도')).toBe(false);
    // 먼 과거 date 는 오늘-2 로 맞춰 조회.
    expect(mocks.getWeeklyForecast).toHaveBeenCalledWith(kstDay(-2), expect.anything());
  });
});

describe('측정소 정보 — /air/stations · /nearby · /search (측정소정보 API)', () => {
  it('목록: dmX/dmY 값 범위로 위·경도 판정(뒤집힘 교정·결측 null), 주소→시도, 측정항목 배열, 24h 캐시', async () => {
    mocks.getStationList.mockResolvedValue(stationList());
    const res = await app.inject({ url: '/api/v1/air/stations' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AirStationsResultType;
    expect(body.total).toBe(5);
    const byName = Object.fromEntries(body.items.map((s) => [s.stationName, s]));
    expect(byName['종로구']).toMatchObject({
      lat: 37.572025,
      lng: 127.005028,
      sidoName: '서울',
      mangName: '도시대기',
      year: '1997',
      items: ['SO2', 'CO', 'O3', 'NO2', 'PM10', 'PM2.5'],
    });
    // dmX/dmY 가 뒤집힌 행 — 값 범위로 교정.
    expect(byName['과천시청']).toMatchObject({ lat: 37.429118, lng: 127.000172, sidoName: '경기' });
    // 좌표 결측 "-" — null, 목록에는 남는다.
    expect(byName['이도동']).toMatchObject({ lat: null, lng: null, sidoName: '제주', items: ['SO2', 'CO', 'O3', 'NO2', 'PM10'] });

    // 앞 describe(화이트리스트)가 이미 목록을 캐시했을 수 있다 — 어느 쪽이든 업스트림은 많아야 1콜.
    await app.inject({ url: '/api/v1/air/stations' });
    expect(mocks.getStationList.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('내 주변: 반경 내 거리순 + 현재 측정값 조인(전국 캐시), limit/total, 좌표 범위 400', async () => {
    mocks.getStationList.mockResolvedValue(stationList());
    mocks.getSidoRealtime.mockResolvedValue(sidoAll());
    // 종로구 근처(약 450m) — 기본 반경 10km 안에 종로구·강남구, 과천(≈16km)·송도(≈37km)는 밖.
    const res = await app.inject({ url: '/api/v1/air/stations/nearby?lat=37.57&lng=127.0' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AirNearbyResultType;
    expect(body.center).toEqual({ lat: 37.57, lng: 127.0 });
    expect(body.items.map((i) => i.stationName)).toEqual(['종로구', '강남구']);
    expect(body.total).toBe(2);
    expect(body.items[0]!.dist).toBeLessThan(1000);
    expect(body.items[1]!.dist).toBeGreaterThan(body.items[0]!.dist);
    // 강남구는 전국 실시간 픽스처에 있어 조인, 종로구는 없어 null.
    expect(body.items[1]!.measure).toMatchObject({ stationName: '강남구', pm10: 35, khaiGrade: 2 });
    expect(body.items[0]!.measure).toBeNull();

    const wide = await app.inject({ url: '/api/v1/air/stations/nearby?lat=37.57&lng=127.0&radius=50000&limit=2' });
    const wb = wide.json() as AirNearbyResultType;
    expect(wb.total).toBe(4);
    expect(wb.items).toHaveLength(2);

    const bad = await app.inject({ url: '/api/v1/air/stations/nearby?lat=45&lng=127.0' });
    expect(bad.statusCode).toBe(400);
    const badLimit = await app.inject({ url: '/api/v1/air/stations/nearby?lat=37.57&lng=127.0&limit=0' });
    expect(badLimit.statusCode).toBe(400);
  });

  it('검색: 이름 앞머리 → 이름 포함 → 주소 포함 순, 빈 검색어 400', async () => {
    mocks.getStationList.mockResolvedValue(stationList());
    const byName = await app.inject({ url: '/api/v1/air/stations/search?q=%EA%B0%95%EB%82%A8' });
    expect(byName.statusCode).toBe(200);
    const b1 = byName.json() as AirStationSearchResultType;
    expect(b1.items.map((s) => s.stationName)).toEqual(['강남구']);
    expect(b1.total).toBe(1);

    // '서울' 은 이름엔 없고 주소에만 — 종로구·강남구(주소 포함) 이름순.
    const byAddr = await app.inject({ url: '/api/v1/air/stations/search?q=%EC%84%9C%EC%9A%B8' });
    const b2 = byAddr.json() as AirStationSearchResultType;
    expect(b2.items.map((s) => s.stationName)).toEqual(['강남구', '종로구']);

    const empty = await app.inject({ url: '/api/v1/air/stations/search?q=%20' });
    expect(empty.statusCode).toBe(400);
  });
});

// 라우트 서비스는 파일 공유 — 인증 오류는 그 API 를 5분 막으므로(E-V2) 이 describe 를 라우트 테스트 맨 끝에 둔다.
describe('업스트림 에러 → 502/503 (replyUpstreamError)', () => {
  it('AirKoreaApiError → 502 Bad Gateway', async () => {
    // 오늘+1 로 맞춰지는 먼 미래 날짜 — 앞 테스트가 캐시한 키와 겹치지 않는다.
    mocks.getDustForecast.mockRejectedValue(
      new AirKoreaApiError('에어코리아 api 게이트웨이 오류(05: 서비스 연결실패 에러)', {
        code: '05',
        requestUrl: 'https://apis.data.go.kr/x?serviceKey=***',
      }),
    );
    const res = await app.inject({ url: '/api/v1/air/forecast?date=9999-12-31' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ statusCode: 502, error: 'Bad Gateway' });
  });

  it('AirKoreaApiAuthError(키 미등록) → 503 Service Unavailable', async () => {
    mocks.getWeeklyForecast.mockRejectedValue(
      new AirKoreaApiAuthError('에어코리아 api 인증 실패(30: 등록되지 않은 서비스키)', { code: '30' }),
    );
    const res = await app.inject({ url: '/api/v1/air/forecast/weekly?date=9999-12-31' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ statusCode: 503, error: 'Service Unavailable' });
    expect((res.json() as { message: string }).message).toContain('30');
  });
});

// 캐시 TTL/stale/쿼터/폴백 경계는 서비스를 직접 만들어 now 주입으로 제어한다
// (라우트는 env 단일 로드라 키를 비우거나 시간을 돌릴 수 없다).
describe('AirQualityService — 캐시·stale·쿼터·폴백', () => {
  const T0 = new Date('2026-08-21T03:00:00.000Z'); // KST 12:00 — 픽스처 측정 시각과 같다

  it('빈 키면 503 (업스트림 호출 없음)', async () => {
    const adapter = { getSidoRealtime: vi.fn() };
    const svc = new AirQualityService({ serviceKey: '', adapter });
    await expect(svc.getSidoRealtime('서울')).rejects.toMatchObject({ statusCode: 503 });
    expect(adapter.getSidoRealtime).not.toHaveBeenCalled();
  });

  it('측정 캐시는 다음 HH:20 까지 — 12:00 자료를 12:00 에 받으면 12:20 까지 0콜, 그 뒤 재호출', async () => {
    const adapter = { getSidoRealtime: vi.fn(async () => sidoAll()) };
    let nowMs = T0.getTime();
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => new Date(nowMs) });
    const a = await svc.getSidoRealtime('서울');
    nowMs += 20 * 60_000 - 1000; // 12:19:59
    const b = await svc.getSidoRealtime('서울');
    expect(adapter.getSidoRealtime).toHaveBeenCalledTimes(1);
    expect(b.fetchedAt).toBe(a.fetchedAt);
    nowMs += 2000; // 12:20:01
    await svc.getSidoRealtime('서울');
    expect(adapter.getSidoRealtime).toHaveBeenCalledTimes(2);
  });

  it('업스트림 실패 시 stale 상한 내 last-known 을 stale:true 로, 쿨다운 중엔 업스트림 0콜, 상한 초과면 throw', async () => {
    const adapter = {
      getSidoRealtime: vi
        .fn()
        .mockResolvedValueOnce(sidoAll())
        .mockRejectedValue(new AirKoreaApiError('down')),
    };
    let nowMs = T0.getTime();
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => new Date(nowMs) });
    const fresh = await svc.getSidoRealtime('서울');
    expect(fresh.stale).toBe(false);

    nowMs += 21 * 60_000; // 12:21 — 만료 후 업스트림 실패 → last-known
    const stale = await svc.getSidoRealtime('서울');
    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(fresh.fetchedAt);
    expect(stale.items).toHaveLength(3);
    expect(adapter.getSidoRealtime).toHaveBeenCalledTimes(2);

    // 쿨다운(30초) 안의 재요청은 업스트림을 부르지 않고 last-known.
    nowMs += 10_000;
    expect((await svc.getSidoRealtime('서울')).stale).toBe(true);
    expect(adapter.getSidoRealtime).toHaveBeenCalledTimes(2);

    nowMs += AIR_MEASURE_STALE_MAX_MS + 1000;
    await expect(svc.getSidoRealtime('서울')).rejects.toBeInstanceOf(AirKoreaApiError);
  });

  it('일일 쿼터는 오퍼레이션별 — 시계열이 바닥나도 공용 키(전국)는 산다, 3MONTH 는 3콜', async () => {
    const adapter = {
      getSidoRealtime: vi.fn(async () => sidoAll()),
      getStationList: vi.fn(async () => stationList()),
      getStationRealtime: vi.fn(async () => ({ rows: [], totalCount: 0, pages: 3 })),
    };
    let nowMs = T0.getTime();
    const svc = new AirQualityService({
      serviceKey: 'k',
      adapter,
      now: () => new Date(nowMs),
      dailyLimits: { history: 2 },
    });
    await expect(svc.getStationHistory('강남구', '3MONTH')).rejects.toMatchObject({ statusCode: 503 });
    expect(adapter.getStationRealtime).not.toHaveBeenCalled();
    await svc.getStationHistory('강남구', 'DAILY'); // 1
    await svc.getStationHistory('서초구', 'DAILY'); // 2 — 한도 내
    await expect(svc.getStationHistory('금천구', 'DAILY')).rejects.toMatchObject({ statusCode: 503 });
    expect(svc.quotaUsed('history')).toBe(2);
    // 시계열 버킷이 바닥나도 전국 실시간은 자기 버킷으로 새로 받는다.
    nowMs += 21 * 60_000;
    expect((await svc.getSidoRealtime('서울')).stale).toBe(false);
    expect(adapter.getSidoRealtime).toHaveBeenCalledTimes(2);
  });

  it('측정소 화이트리스트(E-2) — 목록∪전국에 없는 이름은 404·쿼터 0, 목록이 죽으면 전국 이름으로, 둘 다 죽으면 에러', async () => {
    const adapter = {
      getSidoRealtime: vi.fn(async () => sidoAll()),
      getStationList: vi.fn(async () => stationList()),
      getStationRealtime: vi.fn(async () => ({ rows: [], totalCount: 0, pages: 1 })),
    };
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => T0 });
    for (let i = 0; i < 20; i++) {
      await expect(svc.getStationHistory(`가짜측정소${i}`, '3MONTH')).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(adapter.getStationRealtime).not.toHaveBeenCalled();
    expect(svc.quotaUsed('history')).toBe(0);
    // 목록·전국은 각 1콜(캐시) — 가짜 이름 20개가 업스트림을 더 부르지 않는다.
    expect(adapter.getStationList).toHaveBeenCalledTimes(1);
    expect(adapter.getSidoRealtime).toHaveBeenCalledTimes(1);
    // 목록에만 있는 이름(종로구)·전국에만 있는 이름(서초구) 모두 통과. NFC 정규화.
    await svc.getStationHistory('종로구', 'DAILY');
    await svc.getStationHistory(' 서초구 '.normalize('NFD'), 'DAILY');
    expect(adapter.getStationRealtime).toHaveBeenCalledTimes(2);

    // 측정소정보 API 장애 — 전국 이름만으로 판정.
    const listDown = new AirQualityService({
      serviceKey: 'k',
      now: () => T0,
      adapter: {
        getSidoRealtime: vi.fn(async () => sidoAll()),
        getStationList: vi.fn(async () => {
          throw new AirKoreaApiAuthError('인증 실패(30)', { code: '30' });
        }),
        getStationRealtime: vi.fn(async () => ({ rows: [], totalCount: 0, pages: 1 })),
      },
    });
    await listDown.getStationHistory('강남구', 'DAILY');
    await expect(listDown.getStationHistory('종로구', 'DAILY')).rejects.toMatchObject({ statusCode: 404 });

    // 둘 다 장애 — 판정 불가라 업스트림 에러 그대로(시계열은 부르지 않는다).
    const bothDown = new AirQualityService({
      serviceKey: 'k',
      now: () => T0,
      adapter: {
        getSidoRealtime: vi.fn(async () => {
          throw new AirKoreaApiError('down');
        }),
        getStationList: vi.fn(async () => {
          throw new AirKoreaApiError('down');
        }),
        getStationRealtime: vi.fn(),
      },
    });
    await expect(bothDown.getStationHistory('강남구', 'DAILY')).rejects.toBeInstanceOf(AirKoreaApiError);
  });

  it('시계열 캐시는 서빙 형태만(E-3) — 원본 행 없이 points·latest, 개수 상한 유지', async () => {
    // 상한 + 20 개의 서로 다른 실재 측정소(합성 목록).
    const n = AIR_HISTORY_CACHE_MAX + 20;
    const names = Array.from({ length: n }, (_, i) => `측정소${i}`);
    const adapter = {
      getSidoRealtime: vi.fn(async () => sidoAll()),
      getStationList: vi.fn(async () => ({
        rows: names.map((stationName) => ({ ...rawStationRows()[0]!, stationName })),
        totalCount: n,
        pages: 1,
      })),
      getStationRealtime: vi.fn(async () => ({
        rows: rawMeasureRows('station-daily.json'),
        totalCount: 7,
        pages: 1,
      })),
    };
    const svc = new AirQualityService({
      serviceKey: 'k',
      adapter,
      now: () => T0,
      dailyLimits: { history: 10_000 },
    });
    const first = await svc.getStationHistory(names[0]!, 'MONTH');
    for (const name of names.slice(1)) await svc.getStationHistory(name, 'MONTH');
    const history = (svc as unknown as { history: { size: number; get: (k: string) => { data: unknown } | undefined } })
      .history;
    expect(history.size).toBe(AIR_HISTORY_CACHE_MAX);
    const entry = history.get(`station:${names[n - 1]}:MONTH`)!;
    expect(Object.keys(entry.data as object).sort()).toEqual(['latest', 'points', 'total']);
    // 같은 응답 — 히트에서도 접은 결과 그대로(일평균 2점, latest 최신 행).
    const again = await svc.getStationHistory(names[n - 1]!, 'MONTH');
    expect(again.points.map((p) => p.time)).toEqual(first.points.map((p) => p.time));
    expect(again.latest?.dataTime).toBe('2026-08-21 12:00');
  });

  it('예보: 당일 발표분이 없으면 전일로 1회 폴백(명시 date 는 폴백 없음)', async () => {
    const adapter = {
      getDustForecast: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(rawForecastRows()),
    };
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => T0 });
    const res = await svc.getForecast();
    expect(adapter.getDustForecast).toHaveBeenCalledTimes(2);
    expect(adapter.getDustForecast.mock.calls[0]?.[0]).toBe('2026-08-21');
    expect(adapter.getDustForecast.mock.calls[1]?.[0]).toBe('2026-08-20');
    expect(res.date).toBe('2026-08-20');
    expect(res.items).toHaveLength(4);
  });

  it('주간예보: 당일 미발표 → 전일 폴백, 둘 다 없으면 presentedAt null·days []', async () => {
    const adapter = {
      getWeeklyForecast: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(rawWeeklyRows()),
    };
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => T0 });
    const res = await svc.getWeeklyForecast();
    expect(res.presentedAt).toBe('2026-08-20');
    expect(adapter.getWeeklyForecast.mock.calls.map((c) => c[0])).toEqual(['2026-08-21', '2026-08-20']);

    const empty = new AirQualityService({
      serviceKey: 'k',
      adapter: { getWeeklyForecast: vi.fn(async () => []) },
      now: () => T0,
    });
    const none = await empty.getWeeklyForecast();
    expect(none.presentedAt).toBeNull();
    expect(none.days).toEqual([]);
  });

  it('같은 키 동시 요청은 in-flight 합류로 업스트림 1콜', async () => {
    let resolveRows: ((v: { rows: RawAirMeasureRow[]; pages: number }) => void) | null = null;
    const adapter = {
      getSidoRealtime: vi.fn(
        () =>
          new Promise<{ rows: RawAirMeasureRow[]; pages: number }>((r) => {
            resolveRows = r;
          }),
      ),
    };
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => T0 });
    const p1 = svc.getSidoRealtime('서울');
    const p2 = svc.getSidoRealtime('부산');
    expect(adapter.getSidoRealtime).toHaveBeenCalledTimes(1);
    resolveRows!(sidoAll());
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.items.map((i) => i.stationName)).toEqual(['강남구', '서초구', '금천구']);
    expect(b.items).toEqual([]);
  });

  it('나쁨 목록은 전국 캐시에서 파생 — 전국을 이미 받았으면 업스트림 0콜, 재시도도 쿼터에 센다', async () => {
    const adapter = {
      // 어댑터가 재시도 1회(05)를 했다고 알린다 — 같은 버킷에 1 가산.
      getSidoRealtime: vi.fn(async (_s: string, opts: AirKoreaApiRequestOptions) => {
        opts.onRetry?.();
        return sidoAll();
      }),
      getStationList: vi.fn(async () => stationList()),
    };
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => T0 });
    await svc.getSidoRealtime('서울');
    const bad = await svc.getBadStations();
    expect(bad.items).toEqual([]); // 픽스처 khaiGrade 는 1·2 뿐
    expect(adapter.getSidoRealtime).toHaveBeenCalledTimes(1);
    expect(svc.quotaUsed('realtime')).toBe(2);
  });

  it('실패 쿨다운(E-V2) — 키는 30초→1분 백오프, 성공하면 리셋 / 인증·한도(22)는 그 API 전체를 막고 다른 API 는 산다', async () => {
    let nowMs = T0.getTime();
    const sido = vi.fn(async () => {
      throw new AirKoreaApiError('down', { code: '05' });
    });
    const svc = new AirQualityService({
      serviceKey: 'k',
      now: () => new Date(nowMs),
      adapter: { getSidoRealtime: sido, getStationList: vi.fn(async () => stationList()) },
    });
    await expect(svc.getSidoRealtime('서울')).rejects.toBeInstanceOf(AirKoreaApiError);
    // 30초 안 — 업스트림·쿼터 없이 503.
    nowMs += 29_000;
    await expect(svc.getSidoRealtime('서울')).rejects.toMatchObject({ statusCode: 503 });
    expect(sido).toHaveBeenCalledTimes(1);
    expect(svc.quotaUsed('realtime')).toBe(1);
    // 30초 뒤 1회 재시도 → 또 실패 → 이번엔 60초.
    nowMs += 2_000;
    await expect(svc.getSidoRealtime('서울')).rejects.toBeInstanceOf(AirKoreaApiError);
    nowMs += 59_000;
    await expect(svc.getSidoRealtime('서울')).rejects.toMatchObject({ statusCode: 503 });
    expect(sido).toHaveBeenCalledTimes(2);
    // 복구 — 성공하면 리셋.
    sido.mockImplementation(async () => sidoAll());
    nowMs += 2_000;
    expect((await svc.getSidoRealtime('서울')).stale).toBe(false);

    // 일일한도 초과(22) — 대기오염정보 API 전체 차단(다른 키도), 측정소정보 API 는 영향 없음.
    const weekly = vi.fn(async () => {
      throw new AirKoreaApiAuthError('인증 실패(22: LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR)', { code: '22' });
    });
    const forecast = vi.fn(async () => rawForecastRows());
    const blocked = new AirQualityService({
      serviceKey: 'k',
      now: () => new Date(nowMs),
      adapter: { getWeeklyForecast: weekly, getDustForecast: forecast, getStationList: vi.fn(async () => stationList()) },
    });
    await expect(blocked.getWeeklyForecast()).rejects.toMatchObject({ statusCode: 503 });
    await expect(blocked.getForecast()).rejects.toMatchObject({ statusCode: 503 });
    expect(forecast).not.toHaveBeenCalled();
    expect((await blocked.getStations()).total).toBe(5);
  });

  it('24시간 정상 트래픽(매분 /air 화면 = 전국·나쁨·예보·주간·목록) — 공용 키 하루 업스트림 ≤ 80콜(이전 388)', async () => {
    let nowMs = new Date('2026-08-21T00:00:00+09:00').getTime();
    // 측정은 정시+15분에, 예보는 발표+10분에, 주간예보는 17시+10분에 올라온다고 가정한 가짜 업스트림.
    const hourOf = (ms: number) => Math.floor((ms - 15 * 60_000) / 3_600_000) * 3_600_000;
    const kstStr = (ms: number) => {
      const d = new Date(ms + 9 * 3_600_000);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:00`;
    };
    const calls = { realtime: 0, forecast: 0, weekly: 0, list: 0 };
    const adapter = {
      getSidoRealtime: vi.fn(async () => {
        calls.realtime += 1;
        return sidoAllAt(kstStr(hourOf(nowMs)));
      }),
      getStationList: vi.fn(async () => {
        calls.list += 1;
        return stationList();
      }),
      getDustForecast: vi.fn(async (date: string) => {
        calls.forecast += 1;
        const kst = new Date(nowMs + 9 * 3_600_000);
        const today = seoulDateKey(new Date(nowMs));
        const h = kst.getUTCHours() + kst.getUTCMinutes() / 60;
        const published = [5, 11, 17, 23].filter((s) => date < today || h >= s + 10 / 60);
        if (published.length === 0) return [];
        const last = published[published.length - 1]!;
        return rawForecastRows().map((r) => ({ ...r, dataTime: `${date} ${String(last).padStart(2, '0')}시 발표` }));
      }),
      getWeeklyForecast: vi.fn(async (date: string) => {
        calls.weekly += 1;
        const kst = new Date(nowMs + 9 * 3_600_000);
        const today = seoulDateKey(new Date(nowMs));
        const ready = date < today || kst.getUTCHours() * 60 + kst.getUTCMinutes() >= 17 * 60 + 10;
        return ready ? rawWeeklyRows() : [];
      }),
    };
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => new Date(nowMs) });
    for (let minute = 0; minute < 24 * 60; minute++) {
      await svc.getSidoRealtime('서울');
      await svc.getBadStations();
      await svc.getForecast();
      await svc.getWeeklyForecast();
      await svc.getStations();
      nowMs += 60_000;
    }
    const total = calls.realtime + calls.forecast + calls.weekly + calls.list;
    expect(total).toBeLessThanOrEqual(80);
    // 시간당 1콜 안팎(정시+20분 마크) — 이전 10분 TTL 은 131콜.
    expect(calls.realtime).toBeLessThanOrEqual(30);
    expect(calls.list).toBe(1);
  });
});

describe('발표 주기 TTL·날짜 clamp', () => {
  const at = (iso: string) => new Date(iso);

  it('measureTtlMs — 다음 HH:20 까지, 직전 정시 자료가 아직 없으면 10분', () => {
    // 12:05 에 11:00 자료 → 정상(12:00 분은 12:20 전엔 기대하지 않음) → 12:20 까지 15분.
    expect(measureTtlMs(at('2026-08-21T12:05:00+09:00'), '2026-08-21T11:00:00+09:00')).toBe(15 * 60_000);
    // 12:25 에 12:00 자료 → 13:20 까지 55분.
    expect(measureTtlMs(at('2026-08-21T12:25:00+09:00'), '2026-08-21T12:00:00+09:00')).toBe(55 * 60_000);
    // 12:25 인데 아직 11:00 자료 → 늦게 올라오는 중 → 10분.
    expect(measureTtlMs(at('2026-08-21T12:25:00+09:00'), '2026-08-21T11:00:00+09:00')).toBe(AIR_MEASURE_TTL_MS);
    expect(measureTtlMs(at('2026-08-21T12:25:00+09:00'), null)).toBe(AIR_MEASURE_TTL_MS);
    // 마크 직전에도 0 이 되지 않는다(하한 30초).
    expect(measureTtlMs(at('2026-08-21T12:19:55+09:00'), '2026-08-21T11:00:00+09:00')).toBe(30_000);
  });

  it('forecastTtlMs — 다음 발표(05/11/17/23시)+15분까지, 지난 발표분이 없으면 20분', () => {
    // 11:30 에 11시 발표 자료 → 17:15 까지.
    expect(forecastTtlMs(at('2026-08-21T11:30:00+09:00'), '2026-08-21T11:00:00+09:00')).toBe(
      5 * 3_600_000 + 45 * 60_000,
    );
    // 11:30 인데 05시 발표뿐 → 20분 뒤 다시.
    expect(forecastTtlMs(at('2026-08-21T11:30:00+09:00'), '2026-08-21T05:00:00+09:00')).toBe(AIR_FORECAST_TTL_MS);
    // 00:30 에 전날 23시 발표 → 05:15 까지(밤새 0콜).
    expect(forecastTtlMs(at('2026-08-21T00:30:00+09:00'), '2026-08-20T23:00:00+09:00')).toBe(
      4 * 3_600_000 + 45 * 60_000,
    );
  });

  it('weeklyTtlMs — 오늘분 있으면 자정까지, 없으면 정오 전엔 정오까지·이후 60분', () => {
    expect(weeklyTtlMs(at('2026-08-21T18:00:00+09:00'), true)).toBe(6 * 3_600_000);
    expect(weeklyTtlMs(at('2026-08-21T09:00:00+09:00'), false)).toBe(3 * 3_600_000);
    expect(weeklyTtlMs(at('2026-08-21T14:00:00+09:00'), false)).toBe(60 * 60_000);
  });

  it('clampAirDate — 오늘-2~오늘+1 실제 날짜만, 밖은 가까운 끝, 범위 안의 없는 날짜는 오늘', () => {
    const now = at('2026-10-01T12:00:00+09:00');
    expect(clampAirDate('2026-10-01', now)).toBe('2026-10-01');
    expect(clampAirDate('2026-09-29', now)).toBe('2026-09-29');
    expect(clampAirDate('2026-10-02', now)).toBe('2026-10-02');
    expect(clampAirDate('2000-01-01', now)).toBe('2026-09-29');
    expect(clampAirDate('9999-12-31', now)).toBe('2026-10-02');
    // 월 경계 사이의 가짜 날짜(09-31·09-45) — 문자열로는 범위 안이지만 실제 날짜가 아니다.
    expect(clampAirDate('2026-09-31', now)).toBe('2026-10-01');
    expect(clampAirDate('2026-09-45', now)).toBe('2026-10-01');
  });
});
