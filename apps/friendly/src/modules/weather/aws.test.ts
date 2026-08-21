import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// API허브 어댑터는 mock — 실호출 없음. 텍스트 표 파서는 실구현으로 검증(픽스처 = 2026-08-21
// 실응답을 EUC-KR 디코드해 축약한 것).
vi.hoisted(() => {
  process.env.KMA_APIHUB_KEY = process.env.KMA_APIHUB_KEY || 'test-apihub-key';
});
const mocks = vi.hoisted(() => ({
  getAwsStations: vi.fn(),
  getAwsMinute: vi.fn(),
}));
vi.mock('./kma-apihub.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./kma-apihub.adapter.js')>();
  return { ...actual, ...mocks };
});

import type { WeatherAwsResultType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { KmaApiHubAuthError, KmaApiHubError, kmaNumOrNull, parseKmaTextTable } from './kma-apihub.adapter.js';
import { AWS_MINUTE_TTL_MS, AwsService, toKstMinute } from './aws.service.js';

// stn_inf: 설명 줄("#   STN_ID : 지점번호") 뒤 열 이름 줄(STN 이 두 번: 지점번호·관할 지점) +
// 공백 구분 행(끝 LAW_ADDR 에 공백 포함).
const STATIONS_TEXT = `#START7777
#--------------------------------------------------------------------------------------------------
#   STN_ID : 지점번호
#      LON : 경도(degree) / LAT : 위도(degree)
#   STN_KO : 지점명(한글)
#--------------------------------------------------------------------------------------------------
# STN           LON           LAT STN_SP          HT     HT_WD  LAU STN STN_KO               STN_EN               FCT_ID   LAW_ID    BASIN LAW_ADDR
     400  126.87600000   37.52200000 01111000     10.50     10.00    0 108 양천구               ----                 11B10101 1147000000 ---- 서울특별시 양천구 목동
     401  127.01500000   37.57800000 01111000     25.00     10.00    0 108 종로                 ----                 11B10101 1111000000 ---- 서울특별시 종로구 송월동
     887  126.94500000   37.49500000 01111000     33.00     10.00    0 108 관악                 *                    11B10101 1162000000 ---- 서울특별시 관악구 신림동
#7777END
`;

// nph-aws2_min: 열 이름 줄 + 단위 줄("# KST ID deg m/s …") + 콤마 구분 행(끝 ",="). 아직 없는 분을
// 물으면 전 지점이 -99.9 센티널인 자리표시 행이 온다.
const minuteText = (tm: string, placeholder = false): string =>
  placeholder
    ? `#START7777
# YYMMDDHHMI   STN    WD1    WS1    WDS    WSS   WD10   WS10     TA     RE RN-15m RN-60m RN-12H RN-DAY     HM     PA     PS     TD
#        KST    ID    deg    m/s    deg    m/s    deg    m/s      C      1     mm     mm     mm     mm      %    hPa    hPa     C
${tm},400,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-999.0,-999.0,-99.9,=
${tm},401,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-999.0,-999.0,-99.9,=
${tm},887,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-999.0,-999.0,-99.9,=
#7777END
`
    : `#START7777
#--------------------------------------------------------------------------------------------------
#  WD1    : 1분 평균 풍향 (degree) : 0-N, 90-E, 180-S, 270-W, 360-무풍
#  TA     : 1분 평균 기온 (C)
#--------------------------------------------------------------------------------------------------
# YYMMDDHHMI   STN    WD1    WS1    WDS    WSS   WD10   WS10     TA     RE RN-15m RN-60m RN-12H RN-DAY     HM     PA     PS     TD
#        KST    ID    deg    m/s    deg    m/s    deg    m/s      C      1     mm     mm     mm     mm      %    hPa    hPa     C
${tm},400,225.0,1.2,230.0,2.1,227.0,1.4,27.4,-99.9,0.0,0.0,0.0,3.5,70.0,1004.2,1005.5,21.6,=
${tm},401,180.0,0.8,190.0,1.5,185.0,0.9,27.9,1,0.5,1.5,2.0,5.0,73.0,1002.0,1005.0,22.5,=
${tm},887,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-99.9,-999.0,-999.0,-99.9,=
#7777END
`;

describe('API허브 텍스트 표 파서', () => {
  it("열 이름 줄을 고르고(단위 줄·설명 줄 제외, 중복 STN 은 #2), 콤마/공백 행을 위치로 매핑, 결측 센티널은 null", () => {
    const t = parseKmaTextTable(minuteText('202608211810'));
    expect(t.columns.slice(0, 4)).toEqual(['YYMMDDHHMI', 'STN', 'WD1', 'WS1']);
    expect(t.rows).toHaveLength(3);
    expect(t.rows[0]).toMatchObject({ YYMMDDHHMI: '202608211810', STN: '400', TA: '27.4', 'RN-15m': '0.0', TD: '21.6' });
    const s = parseKmaTextTable(STATIONS_TEXT);
    expect(s.columns).toEqual(['STN', 'LON', 'LAT', 'STN_SP', 'HT', 'HT_WD', 'LAU', 'STN#2', 'STN_KO', 'STN_EN', 'FCT_ID', 'LAW_ID', 'BASIN', 'LAW_ADDR']);
    expect(s.rows[0]).toMatchObject({ STN: '400', 'STN#2': '108', STN_KO: '양천구', LAT: '37.52200000' });
    expect(kmaNumOrNull('27.4')).toBe(27.4);
    expect(kmaNumOrNull('-99.0')).toBeNull();
    expect(kmaNumOrNull('-99.9')).toBeNull();
    expect(kmaNumOrNull('-999.0')).toBeNull();
    expect(kmaNumOrNull('-9')).toBeNull();
    expect(kmaNumOrNull('-3.5')).toBe(-3.5); // 영하 기온은 결측이 아니다
    expect(kmaNumOrNull('-19.9')).toBe(-19.9);
    expect(kmaNumOrNull(undefined)).toBeNull();
  });
  it('헤더가 없으면 fallback 열을 쓴다', () => {
    const t = parseKmaTextTable('1 2 3\n', ['A', 'B', 'C']);
    expect(t.rows[0]).toEqual({ A: '1', B: '2', C: '3' });
  });
});

const rawStations = () => {
  const t = parseKmaTextTable(STATIONS_TEXT);
  return t.rows.map((row) => ({
    stn: row['STN'] ?? null,
    lon: kmaNumOrNull(row['LON']),
    lat: kmaNumOrNull(row['LAT']),
    ht: kmaNumOrNull(row['HT']),
    name: row['STN_KO'] ?? null,
    raw: row,
  }));
};
const rawMinute = (tm: string, placeholder = false) => {
  const t = parseKmaTextTable(minuteText(tm, placeholder));
  return t.rows.map((row) => ({
    tm: row['YYMMDDHHMI'] ?? null,
    stn: row['STN'] ?? null,
    wd1: kmaNumOrNull(row['WD1']),
    ws1: kmaNumOrNull(row['WS1']),
    wd10: kmaNumOrNull(row['WD10']),
    ws10: kmaNumOrNull(row['WS10']),
    ta: kmaNumOrNull(row['TA']),
    re: kmaNumOrNull(row['RE']),
    rn15m: kmaNumOrNull(row['RN-15m']),
    rn60m: kmaNumOrNull(row['RN-60m']),
    rn12h: kmaNumOrNull(row['RN-12H']),
    rnDay: kmaNumOrNull(row['RN-DAY']),
    hm: kmaNumOrNull(row['HM']),
    pa: kmaNumOrNull(row['PA']),
    ps: kmaNumOrNull(row['PS']),
    td: kmaNumOrNull(row['TD']),
    raw: row,
  }));
};
const minusMin = (at: Date, min: number): string => toKstMinute(new Date(at.getTime() - min * 60_000));

describe('GET /weather/aws', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.getAwsStations.mockResolvedValue({ rows: rawStations(), columns: [] });
    // 라우트는 실제 시계를 쓰므로 관측 시각도 지금(−2분)으로 — 20분 신선도 창 안.
    mocks.getAwsMinute.mockImplementation(async (tm2: string) => ({ rows: rawMinute(tm2), columns: [] }));
  });

  // 앱의 AwsService 는 전국 자료를 2분 캐시하므로 실패 분기는 성공 호출보다 먼저(캐시 비어 있을 때).
  it('활용신청/키 오류(403)는 503, 업스트림 장애는 502', async () => {
    mocks.getAwsMinute.mockRejectedValue(new KmaApiHubAuthError('기상청 API허브 인증/활용신청 오류(403: 활용신청이 필요한 API 입니다.)'));
    const r503 = await app.inject({ method: 'GET', url: '/api/v1/weather/aws?lat=37.5&lng=126.9' });
    expect(r503.statusCode).toBe(503);
    mocks.getAwsMinute.mockRejectedValue(new KmaApiHubError('기상청 API허브 HTTP 502'));
    const r502 = await app.inject({ method: 'GET', url: '/api/v1/weather/aws?lat=36.5&lng=127.9' });
    expect(r502.statusCode).toBe(502);
  });

  it('좌표 기준 가까운 관측소를 거리순으로, 관측값은 결측 null 로, 관측 시각은 현재−2분', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/weather/aws?lat=37.523&lng=126.859&limit=2' });
    expect(res.statusCode).toBe(200);
    const body = res.json<WeatherAwsResultType>();
    expect(body.enabled).toBe(true);
    expect(body.items.map((i) => i.name)).toEqual(['양천구', '관악']);
    const first = body.items[0]!;
    expect(first.dist).toBeLessThan(3000);
    expect(first.ta).toBe(27.4);
    expect(first.rn15m).toBe(0);
    expect(first.hm).toBe(70);
    expect(first.tm).toBe(body.tm);
    expect(first.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/);
    // 관악(887)은 전 항목 결측.
    expect(body.items[1]).toMatchObject({ ta: null, hm: null, rn15m: null });
    expect(mocks.getAwsMinute).toHaveBeenCalledWith(expect.stringMatching(/^\d{12}$/), '0', expect.anything());
  });

  it('좌표 범위 밖·limit 초과는 400', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/weather/aws?lat=20&lng=126.8' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/weather/aws?lat=37.5&lng=126.8&limit=99' })).statusCode).toBe(400);
  });
});

// 픽스처 관측 시각 18:10 KST = 18:12 의 −2분.
const AT_1812 = new Date('2026-08-21T18:12:00+09:00');

describe('AwsService', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.getAwsStations.mockResolvedValue({ rows: rawStations(), columns: [] });
    mocks.getAwsMinute.mockImplementation(async (tm2: string) => ({ rows: rawMinute(tm2), columns: [] }));
  });

  it('키가 없으면 업스트림 호출 없이 enabled=false 빈 결과', async () => {
    const svc = new AwsService({ authKey: '', now: () => AT_1812 });
    const r = await svc.getNearby(37.5, 126.9, 15_000, 3);
    expect(r).toMatchObject({ enabled: false, items: [], tm: null });
    expect(mocks.getAwsStations).not.toHaveBeenCalled();
  });

  it('현재−2분을 묻고, 전국 1콜을 2분 캐시 — 다른 좌표 요청도 추가 호출 없음, TTL 뒤 재조회', async () => {
    let now = AT_1812;
    const svc = new AwsService({ authKey: 'k', now: () => now });
    const r = await svc.getNearby(37.523, 126.859, 15_000, 3);
    expect(r.tm).toBe('202608211810');
    expect(r.items[0]).toMatchObject({ name: '양천구', ta: 27.4, observedAt: '2026-08-21T18:10:00+09:00' });
    await svc.getNearby(37.578, 127.015, 15_000, 3);
    expect(mocks.getAwsStations).toHaveBeenCalledTimes(1);
    expect(mocks.getAwsMinute).toHaveBeenCalledTimes(1);
    expect(mocks.getAwsMinute).toHaveBeenLastCalledWith(minusMin(AT_1812, 2), '0', expect.anything());
    now = new Date(AT_1812.getTime() + AWS_MINUTE_TTL_MS + 1000);
    await svc.getNearby(37.523, 126.859, 15_000, 3);
    expect(mocks.getAwsMinute).toHaveBeenCalledTimes(2);
    expect(mocks.getAwsStations).toHaveBeenCalledTimes(1);
  });

  it('−2분이 센티널(자리표시) 행뿐이면 −5분, −8분으로 물러나고, 20분 넘은 관측은 값을 비운다', async () => {
    mocks.getAwsMinute.mockImplementation(async (tm2: string) => ({
      rows: rawMinute(tm2, tm2 === minusMin(AT_1812, 2) || tm2 === minusMin(AT_1812, 5)),
      columns: [],
    }));
    const svc = new AwsService({ authKey: 'k', now: () => AT_1812 });
    const r = await svc.getNearby(37.523, 126.859, 15_000, 1);
    expect(mocks.getAwsMinute).toHaveBeenCalledTimes(3);
    expect(mocks.getAwsMinute).toHaveBeenNthCalledWith(3, minusMin(AT_1812, 8), '0', expect.anything());
    expect(r.tm).toBe(minusMin(AT_1812, 8));
    expect(r.items[0]?.ta).toBe(27.4);

    // 전부 자리표시면 마지막 응답을 쓰되 값은 null.
    mocks.getAwsMinute.mockImplementation(async (tm2: string) => ({ rows: rawMinute(tm2, true), columns: [] }));
    const empty = new AwsService({ authKey: 'k', now: () => AT_1812 });
    const r2 = await empty.getNearby(37.523, 126.859, 15_000, 1);
    expect(r2.items[0]?.ta).toBeNull();

    // 관측이 20분 넘게 오래됐으면(업스트림이 옛 시각을 주면) 값 비움.
    mocks.getAwsMinute.mockResolvedValue({ rows: rawMinute('202608211740'), columns: [] });
    const late = new AwsService({ authKey: 'k', now: () => AT_1812 });
    const r3 = await late.getNearby(37.523, 126.859, 15_000, 1);
    expect(r3.items[0]?.ta).toBeNull();
    expect(r3.items[0]?.observedAt).toBeNull();
  });

  it('업스트림 실패 시 last-known 을 stale 로', async () => {
    let now = AT_1812;
    const svc = new AwsService({ authKey: 'k', now: () => now });
    await svc.getNearby(37.523, 126.859, 15_000, 1);
    now = new Date(AT_1812.getTime() + AWS_MINUTE_TTL_MS + 1000);
    mocks.getAwsMinute.mockRejectedValue(new KmaApiHubError('down'));
    const r = await svc.getNearby(37.523, 126.859, 15_000, 1);
    expect(r.stale).toBe(true);
    expect(r.items[0]?.ta).toBe(27.4);
  });
});
