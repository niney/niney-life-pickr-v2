import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// env.ts 는 모듈 로드 시점에 process.env 를 파싱한다 — buildApp import 전에 키를 주입해야
// 라우트의 WeatherService 가 503 으로 죽지 않는다(어댑터는 mock 이라 실호출 없음).
vi.hoisted(() => {
  process.env.DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY || 'test-kma-key';
});

const mocks = vi.hoisted(() => ({
  getUltraSrtNcst: vi.fn(),
  getUltraSrtFcst: vi.fn(),
  getVilageFcst: vi.fn(),
  getFcstVersion: vi.fn(),
  getMidFcst: vi.fn(),
  getMidLandFcst: vi.fn(),
  getMidTa: vi.fn(),
  getMidSeaFcst: vi.fn(),
}));
vi.mock('./kma-api.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./kma-api.adapter.js')>();
  return { ...actual, ...mocks };
});

import type {
  WeatherForecastResultType,
  WeatherMidResultType,
  WeatherMidSeaResultType,
  WeatherNowcastResultType,
  WeatherVersionsResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { KmaApiAuthError, KmaApiError, type RawKmaFcstRow, type RawKmaMidRow } from './kma-api.adapter.js';
import { WEATHER_SHORT_TTL_MS, WeatherService, foldForecastDays, toForecastHours } from './weather.service.js';

// 픽스처(2026-08-21 16:05 KST 실응답 원문) → 어댑터 원시 행. 어댑터 파싱은 별도 테스트가
// 맡고 여기서는 JSON 값을 그대로 문자열/null 로 옮긴다.
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureItems = (name: string): Record<string, unknown>[] => {
  const json = JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as {
    response: { body?: { items?: { item?: Record<string, unknown>[] } } };
  };
  return json.response.body?.items?.item ?? [];
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null);
const fcstRows = (name: string): RawKmaFcstRow[] =>
  fixtureItems(name).map((o) => ({
    baseDate: str(o['baseDate']),
    baseTime: str(o['baseTime']),
    category: str(o['category']),
    nx: typeof o['nx'] === 'number' ? o['nx'] : null,
    ny: typeof o['ny'] === 'number' ? o['ny'] : null,
    obsrValue: str(o['obsrValue']),
    fcstDate: str(o['fcstDate']),
    fcstTime: str(o['fcstTime']),
    fcstValue: str(o['fcstValue']),
  }));
const midRows = (name: string): RawKmaMidRow[] =>
  fixtureItems(name).map((o) => {
    const fields: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'regId') continue;
      fields[k] = typeof v === 'number' ? v : typeof v === 'string' ? v : null;
    }
    return { regId: str(o['regId']), fields };
  });

// 픽스처 발표 시각 — 실황 1500 / 초단기 1530 / 단기 1400 / 중기 202608210600.
const AT_1605 = new Date('2026-08-21T16:05:00+09:00');

const primeAdapters = (): void => {
  mocks.getUltraSrtNcst.mockResolvedValue({ rows: fcstRows('ultra-ncst.json'), noData: false });
  mocks.getUltraSrtFcst.mockResolvedValue({ rows: fcstRows('ultra-fcst.json'), noData: false });
  mocks.getVilageFcst.mockResolvedValue({ rows: fcstRows('vilage.json'), noData: false, totalCount: 798 });
  mocks.getFcstVersion.mockImplementation(async (ftype: string) => {
    const name = ftype === 'ODAM' ? 'version-odam.json' : ftype === 'VSRT' ? 'version-vsrt.json' : 'version-shrt.json';
    return fixtureItems(name).map((o) => ({ filetype: str(o['filetype']), version: str(o['version']) }));
  });
  mocks.getMidFcst.mockResolvedValue({ rows: midRows('mid-fcst.json'), noData: false });
  mocks.getMidLandFcst.mockResolvedValue({ rows: midRows('mid-land.json'), noData: false });
  mocks.getMidTa.mockResolvedValue({ rows: midRows('mid-ta.json'), noData: false });
  mocks.getMidSeaFcst.mockResolvedValue({ rows: midRows('mid-sea.json'), noData: false });
};

describe('weather routes', () => {
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
    primeAdapters();
  });

  it('GET /weather/nowcast — 실황 8항목 + 초단기 6시각(11항목)을 가로로 접어 내려준다', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/weather/nowcast?nx=60&ny=127' });
    expect(res.statusCode).toBe(200);
    const body = res.json<WeatherNowcastResultType>();
    expect(body.grid).toEqual({ nx: 60, ny: 127 });
    expect(body.now).toEqual({ t1h: 27.9, rn1: 0, reh: 73, pty: 0, vec: 187, wsd: 0.8, uuu: 0.1, vvv: 0.8 });
    expect(body.ncstBase?.date).toBe('20260821');
    expect(body.ncstBase?.time).toBe('1500');
    expect(body.ncstBase?.at).toBe('2026-08-21T15:00:00+09:00');
    expect(body.hours).toHaveLength(6);
    expect(body.hours[0]?.at).toBe('2026-08-21T16:00:00+09:00');
    expect(body.hours[5]?.at).toBe('2026-08-21T21:00:00+09:00');
    // 초단기 RN1 은 범주 문자열 → 구조화. 낙뢰·강수확률 포함.
    expect(body.hours[0]?.rn1).toEqual({ text: '강수없음', value: 0, none: true });
    expect(body.hours[0]?.lgt).toBe(0);
    expect(typeof body.hours[0]?.pop).toBe('number');
    expect(body.stale).toBe(false);
  });

  it('GET /weather/forecast — 798행을 시각별 66+행으로 접고 일별 요약(TMN/TMX·오전/오후·강수확률)을 만든다', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/weather/forecast?nx=60&ny=127' });
    expect(res.statusCode).toBe(200);
    const body = res.json<WeatherForecastResultType>();
    expect(body.total).toBe(798);
    expect(body.hours.length).toBeGreaterThanOrEqual(66);
    expect(body.hours[0]?.at).toBe('2026-08-21T15:00:00+09:00');
    expect(body.hours[0]?.tmp).toBe(29);
    expect(body.hours[0]?.pcp.text).toBeTruthy();
    // 일별: 오늘(부분) + 22/23/24일 — 마지막 25일 00시 한 칸은 일별에서 제외.
    const dates = body.days.map((d) => d.date);
    expect(dates).toEqual(['2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24']);
    const today = body.days[0]!;
    expect(today.partial).toBe(true);
    expect(today.tmxFromHours).toBe(true);
    const tomorrow = body.days[1]!;
    expect(tomorrow.partial).toBe(false);
    expect(tomorrow.hours).toBe(24);
    expect(tomorrow.tmnFromHours).toBe(false);
    expect(tomorrow.tmxFromHours).toBe(false);
    expect(tomorrow.tmn).toBeTypeOf('number');
    expect(tomorrow.tmx).toBeTypeOf('number');
    expect(tomorrow.am?.hours).toBe(12);
    expect(tomorrow.pm?.hours).toBe(12);
    expect(tomorrow.popMax).toBeTypeOf('number');
  });

  it('GET /weather/versions — ODAM/VSRT/SHRT 세 버전과 각 기준 시각', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/weather/versions' });
    expect(res.statusCode).toBe(200);
    const body = res.json<WeatherVersionsResultType>();
    expect(body.items.map((i) => i.ftype)).toEqual(['ODAM', 'VSRT', 'SHRT']);
    const odam = body.items[0]!;
    expect(odam.version).toBe('20260821155556');
    expect(odam.versionAt).toBe('2026-08-21T15:55:56+09:00');
    expect(odam.base.at).toMatch(/\+09:00$/);
  });

  it('GET /weather/mid — 중기육상(D+4~D+10 오전/오후·하루) + 중기기온(오차 범위) + 전망 원문', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/weather/mid?land=11B00000&ta=11B10101&stn=108' });
    expect(res.statusCode).toBe(200);
    const body = res.json<WeatherMidResultType>();
    expect(body.tmFc).toMatch(/^\d{12}$/);
    expect(body.land?.regId).toBe('11B00000');
    expect(body.land?.days.map((d) => d.day)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    const d4 = body.land!.days[0]!;
    expect(d4.am).toEqual({ wf: '구름많음', rnSt: 20 });
    expect(d4.pm?.wf).toBe('구름많음');
    expect(d4.all).toBeNull();
    const d8 = body.land!.days[4]!;
    expect(d8.am).toBeNull();
    expect(d8.all?.rnSt).toBe(20);
    expect(body.ta?.days[0]).toMatchObject({ day: 4, taMin: 25, taMinLow: 1, taMinHigh: 1, taMax: 32 });
    // 날짜는 발표일 + n 일.
    expect(body.ta?.days[0]?.date).toBe(`${body.tmFc.slice(0, 4)}-${body.tmFc.slice(4, 6)}-${String(Number(body.tmFc.slice(6, 8)) + 4).padStart(2, '0')}`);
    expect(body.outlook?.stnId).toBe('108');
    expect(body.outlook?.text).toContain('하늘상태');
    expect(mocks.getMidFcst).toHaveBeenCalledTimes(1);
  });

  it('GET /weather/mid 는 stn 없이도 되고(전망 null), regId 형식이 틀리면 400', async () => {
    const ok = await app.inject({ method: 'GET', url: '/api/v1/weather/mid?land=11B00000&ta=11B10101' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<WeatherMidResultType>().outlook).toBeNull();
    expect(mocks.getMidFcst).not.toHaveBeenCalled();
    const bad = await app.inject({ method: 'GET', url: '/api/v1/weather/mid?land=seoul&ta=11B10101' });
    expect(bad.statusCode).toBe(400);
  });

  it('GET /weather/mid/sea — 해역 파고(최저/최고)와 날씨', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/weather/mid/sea?regId=12A20000' });
    expect(res.statusCode).toBe(200);
    const body = res.json<WeatherMidSeaResultType>();
    expect(body.regId).toBe('12A20000');
    expect(body.days[0]).toMatchObject({ day: 4, am: { wf: '구름많음', whMin: 1, whMax: 2 } });
    expect(body.days[6]).toMatchObject({ day: 10, all: { wf: '구름많음', whMin: 1, whMax: 2 }, am: null });
  });

  it('격자 범위 밖(nx=0, ny=300)은 400', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/weather/nowcast?nx=0&ny=127' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/weather/forecast?nx=60&ny=300' })).statusCode).toBe(400);
  });

  it('업스트림 게이트웨이 오류는 502, 인증(키 미등록 30)은 503 으로 내린다', async () => {
    mocks.getVilageFcst.mockRejectedValue(new KmaApiError('기상청 api 게이트웨이 오류(05: SERVICETIMEOUT)', { code: '05' }));
    const r502 = await app.inject({ method: 'GET', url: '/api/v1/weather/forecast?nx=1&ny=1' });
    expect(r502.statusCode).toBe(502);
    mocks.getMidSeaFcst.mockRejectedValue(new KmaApiAuthError('기상청 api 인증 실패(30: 등록되지 않은 서비스키)', { code: '30' }));
    const r503 = await app.inject({ method: 'GET', url: '/api/v1/weather/mid/sea?regId=12A10000' });
    expect(r503.statusCode).toBe(503);
    expect(r503.json<{ message: string }>().message).toContain('30');
  });
});

describe('WeatherService — 슬롯 폴백·캐시·stale', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    primeAdapters();
  });

  it('기준 시각은 KST 로 계산한다(16:05 → 실황 1500 · 초단기 1530 · 단기 1400 · 중기 0600)', async () => {
    const svc = new WeatherService({ serviceKey: 'k', now: () => AT_1605 });
    await svc.getNowcast(60, 127);
    expect(mocks.getUltraSrtNcst).toHaveBeenCalledWith({ baseDate: '20260821', baseTime: '1500', nx: 60, ny: 127 }, expect.anything());
    expect(mocks.getUltraSrtFcst).toHaveBeenCalledWith({ baseDate: '20260821', baseTime: '1530', nx: 60, ny: 127 }, expect.anything());
    await svc.getForecast(60, 127);
    expect(mocks.getVilageFcst).toHaveBeenCalledWith({ baseDate: '20260821', baseTime: '1400', nx: 60, ny: 127 }, expect.anything());
    await svc.getMid('11B00000', '11B10101', '109');
    expect(mocks.getMidLandFcst).toHaveBeenCalledWith('11B00000', '202608210600', expect.anything());
    expect(mocks.getMidTa).toHaveBeenCalledWith('11B10101', '202608210600', expect.anything());
    expect(mocks.getMidFcst).toHaveBeenCalledWith('109', '202608210600', expect.anything());
  });

  it('새 슬롯이 NO_DATA 면 한 슬롯 이전으로 1회 폴백하고 fallback=true, 짧은 TTL 로 캐시한다', async () => {
    // 16:12 — 실황 1600 슬롯이 아직 없음.
    let now = new Date('2026-08-21T16:12:00+09:00');
    mocks.getUltraSrtNcst.mockImplementation(async (p: { baseTime: string }) =>
      p.baseTime === '1600' ? { rows: [], noData: true } : { rows: fcstRows('ultra-ncst.json'), noData: false },
    );
    const svc = new WeatherService({ serviceKey: 'k', now: () => now });
    const first = await svc.getNowcast(60, 127);
    expect(first.ncstFallback).toBe(true);
    expect(first.ncstBase?.time).toBe('1500');
    expect(first.ultraFallback).toBe(false);
    expect(mocks.getUltraSrtNcst).toHaveBeenCalledTimes(2);
    // 짧은 TTL 안에는 캐시 히트(업스트림 0콜).
    now = new Date(now.getTime() + WEATHER_SHORT_TTL_MS - 1000);
    await svc.getNowcast(60, 127);
    expect(mocks.getUltraSrtNcst).toHaveBeenCalledTimes(2);
    // TTL 이 지나면 다시 묻는다 — 이제 1600 이 있으면 폴백 없이.
    mocks.getUltraSrtNcst.mockResolvedValue({ rows: fcstRows('ultra-ncst.json'), noData: false });
    now = new Date(now.getTime() + 2000);
    const third = await svc.getNowcast(60, 127);
    expect(third.ncstFallback).toBe(false);
    expect(mocks.getUltraSrtNcst).toHaveBeenLastCalledWith(
      { baseDate: '20260821', baseTime: '1600', nx: 60, ny: 127 },
      expect.anything(),
    );
  });

  it('정상 응답은 다음 슬롯 제공 시각까지 캐시한다(단기예보 14시 발표분은 17:10 까지)', async () => {
    let now = AT_1605;
    const svc = new WeatherService({ serviceKey: 'k', now: () => now });
    await svc.getForecast(60, 127);
    now = new Date('2026-08-21T17:09:00+09:00');
    await svc.getForecast(60, 127);
    expect(mocks.getVilageFcst).toHaveBeenCalledTimes(1);
    now = new Date('2026-08-21T17:10:30+09:00');
    await svc.getForecast(60, 127);
    expect(mocks.getVilageFcst).toHaveBeenCalledTimes(2);
    expect(mocks.getVilageFcst).toHaveBeenLastCalledWith({ baseDate: '20260821', baseTime: '1700', nx: 60, ny: 127 }, expect.anything());
  });

  it('업스트림 실패 시 last-known 을 stale=true 로 서빙, 같은 키 동시 요청은 업스트림 1콜', async () => {
    let now = AT_1605;
    const svc = new WeatherService({ serviceKey: 'k', now: () => now });
    const [a, b] = await Promise.all([svc.getMid('11B00000', '11B10101'), svc.getMid('11B00000', '11B10101')]);
    expect(a.stale).toBe(false);
    expect(b.stale).toBe(false);
    expect(mocks.getMidLandFcst).toHaveBeenCalledTimes(1);
    // 다음 발표(18:00) 뒤 업스트림 장애 → 06시 발표분을 stale 로.
    now = new Date('2026-08-21T18:30:00+09:00');
    mocks.getMidLandFcst.mockRejectedValue(new KmaApiError('down'));
    mocks.getMidTa.mockRejectedValue(new KmaApiError('down'));
    const c = await svc.getMid('11B00000', '11B10101');
    expect(c.stale).toBe(true);
    expect(c.tmFc).toBe('202608210600');
  });

  it('중기: 최신 발표분이 비어 있으면 이전 발표분(06시→전날 18시)으로 폴백한다', async () => {
    const now = new Date('2026-08-21T06:02:00+09:00');
    mocks.getMidLandFcst.mockImplementation(async (_r: string, tmFc: string) =>
      tmFc === '202608210600' ? { rows: [], noData: true } : { rows: midRows('mid-land.json'), noData: false },
    );
    mocks.getMidTa.mockImplementation(async (_r: string, tmFc: string) =>
      tmFc === '202608210600' ? { rows: [], noData: true } : { rows: midRows('mid-ta.json'), noData: false },
    );
    const svc = new WeatherService({ serviceKey: 'k', now: () => now });
    const res = await svc.getMid('11B00000', '11B10101');
    expect(res.fallback).toBe(true);
    expect(res.tmFc).toBe('202608201800');
    expect(res.land?.days[0]?.date).toBe('2026-08-24');
  });

  it('키가 없으면 503, 일일 한도를 넘기면 503(호출 전 차단)', async () => {
    const noKey = new WeatherService({ serviceKey: '' });
    await expect(noKey.getVersions()).rejects.toMatchObject({ statusCode: 503 });
    const tiny = new WeatherService({ serviceKey: 'k', now: () => AT_1605, dailyLimit: 0 });
    await expect(tiny.getNowcast(60, 127)).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.getUltraSrtNcst).not.toHaveBeenCalled();
  });
});

describe('foldForecastDays', () => {
  it('오전/오후 대표는 강수형태(최빈, 0 제외) 우선 · 하늘은 가장 흐린 값 · 강수확률 최대', () => {
    const hours = toForecastHours(fcstRows('vilage.json'));
    const days = foldForecastDays(hours);
    const d = days.find((x) => x.date === '2026-08-22')!;
    expect(d.am && d.pm).toBeTruthy();
    // 픽스처 22일은 오전에 비(PTY 1) 시각이 있다 — 대표 강수형태 1, 오후는 없음 0.
    const amHours = hours.filter((h) => h.fcstDate === '20260822' && Number(h.fcstTime.slice(0, 2)) < 12);
    const amHasRain = amHours.some((h) => h.pty === 1);
    expect(d.am!.pty).toBe(amHasRain ? 1 : 0);
    expect(d.am!.pop).toBe(Math.max(...amHours.map((h) => h.pop ?? 0)));
    expect(d.am!.sky).toBe(Math.max(...amHours.map((h) => h.sky ?? 0)));
  });
});
