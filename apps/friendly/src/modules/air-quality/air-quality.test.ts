import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// env.ts 는 모듈 로드 시점에 process.env 를 파싱한다 — buildApp import 전에 키를
// 주입해야 라우트의 AirQualityService 가 503 으로 죽지 않는다(어댑터는 mock 이라
// 실제 호출은 없다).
vi.hoisted(() => {
  process.env.AIRKOREA_API_KEY = process.env.AIRKOREA_API_KEY || 'test-air-key';
});

// 실 에어코리아 호출 차단 — 타입드 래퍼만 mock, 에러 클래스 등은 실구현 유지.
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
import { buildApp } from '../../app.js';
import {
  AirKoreaApiAuthError,
  AirKoreaApiError,
  type RawAirForecastRow,
  type RawAirMeasureRow,
  type RawAirStationRow,
  type RawAirWeeklyRow,
} from './airkorea-api.adapter.js';
import {
  AIR_MEASURE_STALE_MAX_MS,
  AIR_MEASURE_TTL_MS,
  AirQualityService,
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
const rawBadRows = () =>
  fixtureItems('bad-stations.json').map((o) => ({
    stationName: str(o['stationName']),
    addr: str(o['addr']),
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

const sidoUrl = (sido: string): string => `/api/v1/air/sido/${encodeURIComponent(sido)}`;
const historyUrl = (station: string, term?: string): string =>
  `/api/v1/air/stations/${encodeURIComponent(station)}/history${term ? `?term=${term}` : ''}`;

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
    mocks.getSidoRealtime.mockResolvedValue({ rows: rawMeasureRows('sido-all.json'), pages: 1 });

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
    mocks.getSidoRealtime.mockResolvedValue({ rows: rawMeasureRows('sido-all.json'), pages: 1 });
    const res = await app.inject({ url: sidoUrl('화성') });
    expect(res.statusCode).toBe(200);
    expect((res.json() as AirSidoRealtimeResultType).items).toEqual([]);
  });
});

describe('GET /api/v1/air/stations/:stationName/history — 측정소별 시계열', () => {
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
    const ok = await app.inject({ url: historyUrl('테스트측정소') });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as AirStationHistoryResultType).term).toBe('DAILY');
    expect((ok.json() as AirStationHistoryResultType).latest).toBeNull();

    const bad = await app.inject({ url: historyUrl('강남구', 'WEEK') });
    expect(bad.statusCode).toBe(400);
    expect(mocks.getStationRealtime).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/air/bad-stations', () => {
  it('stationName/addr + addr 에서 추정한 sidoName', async () => {
    mocks.getBadStations.mockResolvedValue(rawBadRows());
    const res = await app.inject({ url: '/api/v1/air/bad-stations' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AirBadStationsResultType;
    expect(body.total).toBe(3);
    expect(body.items[0]).toEqual({
      stationName: '송도',
      addr: '인천 연수구 갯벌로 12 테크노파크 3층 옥상',
      sidoName: '인천',
    });
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

  it('?date= 명시 조회 / 형식 불일치 400', async () => {
    mocks.getDustForecast.mockResolvedValue([]);
    const ok = await app.inject({ url: '/api/v1/air/forecast?date=2026-08-19' });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as AirForecastResultType).date).toBe('2026-08-19');
    expect(mocks.getDustForecast).toHaveBeenCalledWith('2026-08-19', expect.anything());
    // 명시 date 는 빈 결과여도 전일 폴백 없음.
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
  });
});

describe('측정소 정보 — /air/stations · /nearby · /search (측정소정보 API)', () => {
  // 캐시 전(첫 테스트)에 인증 실패를 검증해야 stale 폴백이 끼어들지 않는다.
  it('활용신청 전(게이트웨이 30) → 503, 메시지에 코드 30', async () => {
    mocks.getStationList.mockRejectedValue(
      new AirKoreaApiAuthError('에어코리아 api 인증 실패(30: 등록되지 않은 서비스키)', { code: '30' }),
    );
    const res = await app.inject({ url: '/api/v1/air/stations' });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { message: string }).message).toContain('30');
  });

  it('목록: dmX/dmY 값 범위로 위·경도 판정(뒤집힘 교정·결측 null), 주소→시도, 측정항목 배열, 24h 캐시', async () => {
    mocks.getStationList.mockResolvedValue({ rows: rawStationRows(), totalCount: 5, pages: 1 });
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

    await app.inject({ url: '/api/v1/air/stations' });
    expect(mocks.getStationList).toHaveBeenCalledTimes(1);
  });

  it('내 주변: 반경 내 거리순 + 현재 측정값 조인(전국 캐시), limit/total, 좌표 범위 400', async () => {
    mocks.getStationList.mockResolvedValue({ rows: rawStationRows(), totalCount: 5, pages: 1 });
    mocks.getSidoRealtime.mockResolvedValue({ rows: rawMeasureRows('sido-all.json'), pages: 1 });
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
    mocks.getStationList.mockResolvedValue({ rows: rawStationRows(), totalCount: 5, pages: 1 });
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

describe('업스트림 에러 → 502/503 (replyUpstreamError)', () => {
  it('AirKoreaApiError → 502 Bad Gateway', async () => {
    mocks.getBadStations.mockRejectedValue(
      new AirKoreaApiError('에어코리아 api 게이트웨이 오류(05: 서비스 연결실패 에러)', {
        code: '05',
        requestUrl: 'https://apis.data.go.kr/x?serviceKey=***',
      }),
    );
    // 캐시 키가 앞 테스트와 겹치지 않도록 서비스 인스턴스 분리는 불가(라우트 단일) —
    // bad-stations 는 앞 describe 에서 성공본이 캐시돼 있어 stale 로 돌아올 수 있으므로
    // 여기서는 별도 키(예보 명시 날짜)로 502 를 검증한다.
    mocks.getDustForecast.mockRejectedValue(
      new AirKoreaApiError('에어코리아 api 게이트웨이 오류(05: 서비스 연결실패 에러)', {
        code: '05',
      }),
    );
    const res = await app.inject({ url: '/api/v1/air/forecast?date=2000-01-01' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ statusCode: 502, error: 'Bad Gateway' });
  });

  it('AirKoreaApiAuthError(키 미등록) → 503 Service Unavailable', async () => {
    mocks.getWeeklyForecast.mockRejectedValue(
      new AirKoreaApiAuthError('에어코리아 api 인증 실패(30: 등록되지 않은 서비스키)', { code: '30' }),
    );
    const res = await app.inject({ url: '/api/v1/air/forecast/weekly?date=2000-01-02' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ statusCode: 503, error: 'Service Unavailable' });
  });
});

// 캐시 TTL/stale/쿼터/폴백 경계는 서비스를 직접 만들어 now 주입으로 제어한다
// (라우트는 env 단일 로드라 키를 비우거나 시간을 돌릴 수 없다).
describe('AirQualityService — 캐시·stale·쿼터·폴백', () => {
  const T0 = new Date('2026-08-21T03:00:00.000Z'); // KST 12:00

  it('빈 키면 503 (업스트림 호출 없음)', async () => {
    const adapter = { getSidoRealtime: vi.fn() };
    const svc = new AirQualityService({ serviceKey: '', adapter });
    await expect(svc.getSidoRealtime('서울')).rejects.toMatchObject({ statusCode: 503 });
    expect(adapter.getSidoRealtime).not.toHaveBeenCalled();
  });

  it('TTL 내 재호출은 업스트림 0콜, TTL 경과 시 재호출', async () => {
    const adapter = {
      getBadStations: vi.fn(async () => rawBadRows()),
    };
    let nowMs = T0.getTime();
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => new Date(nowMs) });
    const a = await svc.getBadStations();
    nowMs += AIR_MEASURE_TTL_MS - 1000;
    const b = await svc.getBadStations();
    expect(adapter.getBadStations).toHaveBeenCalledTimes(1);
    expect(b.fetchedAt).toBe(a.fetchedAt);
    nowMs += 2000;
    await svc.getBadStations();
    expect(adapter.getBadStations).toHaveBeenCalledTimes(2);
  });

  it('업스트림 실패 시 stale 상한 내 last-known 을 stale:true 로, 상한 초과면 throw', async () => {
    const adapter = {
      getBadStations: vi
        .fn()
        .mockResolvedValueOnce(rawBadRows())
        .mockRejectedValue(new AirKoreaApiError('down')),
    };
    let nowMs = T0.getTime();
    const svc = new AirQualityService({ serviceKey: 'k', adapter, now: () => new Date(nowMs) });
    const fresh = await svc.getBadStations();
    expect(fresh.stale).toBe(false);

    nowMs += AIR_MEASURE_TTL_MS + 1000;
    const stale = await svc.getBadStations();
    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(fresh.fetchedAt);
    expect(stale.items).toHaveLength(3);

    nowMs += AIR_MEASURE_STALE_MAX_MS + 1000;
    await expect(svc.getBadStations()).rejects.toBeInstanceOf(AirKoreaApiError);
  });

  it('일일 쿼터 — 한도 초과 시 캐시 없으면 503, 3MONTH 는 3콜로 계산', async () => {
    const adapter = {
      getBadStations: vi.fn(async () => rawBadRows()),
      getStationRealtime: vi.fn(async () => ({ rows: [], totalCount: 0, pages: 3 })),
    };
    const svc = new AirQualityService({ serviceKey: 'k', adapter, dailyLimit: 2 });
    await svc.getBadStations(); // 1
    await expect(svc.getStationHistory('강남구', '3MONTH')).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(adapter.getStationRealtime).not.toHaveBeenCalled();
    await svc.getStationHistory('강남구', 'DAILY'); // 2 — 한도 내
    await expect(svc.getStationHistory('서초구', 'DAILY')).rejects.toMatchObject({
      statusCode: 503,
    });
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
    resolveRows!({ rows: rawMeasureRows('sido-all.json'), pages: 1 });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.items.map((i) => i.stationName)).toEqual(['강남구', '서초구', '금천구']);
    expect(b.items).toEqual([]);
  });
});
