import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { KhoaApiError, callKhoaAll, interpretKhoaResponse, type KhoaPage } from './khoa.adapter.js';
import { SEA_FORECAST_TTL_MS, SeaService, groupSeaSpots, latestRip, toSeaSlot } from './sea.service.js';

// 바다 예보 — ① 봉투 해석(정상·데이터 없음·필수값 누락·미신청 403) ② 페이지 순회 ③ 활동별 정규화·지점 묶음(동명 지점
// 좌표 구분·슬롯 정렬) ④ 캐시·stale 폴백 ⑤ 이안류(제공 기간만, 이름 매칭) ⑥ 물때(가까운 지점·만조/간조) ⑦ 계약 400.
// 행은 2026-09-24 실측 응답을 줄인 것.

const beachRow = (over: Record<string, unknown> = {}) => ({
  bbchNm: '대천해수욕장',
  lat: 36.30555,
  lot: 126.51601,
  predcYmd: '2026-09-24',
  predcNoonSeCd: '오전',
  maxWvhgt: '0.1',
  avgWtem: '22.9',
  avgArtmp: '22.9',
  maxWspd: '3.5',
  opnStat: '폐장',
  totalIndex: '매우좋음',
  ...over,
});

describe('interpretKhoaResponse', () => {
  it('정상 봉투 — items.item 배열·단건 모두 배열로, totalCount', () => {
    const ok = interpretKhoaResponse(200, JSON.stringify({ header: { resultCode: '00' }, body: { items: { item: { a: 1 } }, totalCount: 1 } }), 'u');
    expect(ok).toEqual({ page: { items: [{ a: 1 }], totalCount: 1 } });
  });
  it('03 데이터 없음은 빈 결과, 11 필수값 누락은 502, 게이트웨이 30 은 503', () => {
    expect(interpretKhoaResponse(200, JSON.stringify({ header: { resultCode: '03' } }), 'u')).toEqual({ page: { items: [], totalCount: 0 } });
    const missing = interpretKhoaResponse(200, JSON.stringify({ header: { resultCode: '11', resultMsg: 'NO_MANDATORY' } }), 'u');
    expect('error' in missing && missing.error.statusCode).toBe(502);
    const unreg = interpretKhoaResponse(
      403,
      JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '30', returnAuthMsg: '등록되지 않은 서비스키' } } }),
      'u',
    );
    expect('error' in unreg && unreg.error.statusCode).toBe(503);
  });
});

describe('callKhoaAll', () => {
  it('totalCount 까지 300행 단위로 넘긴다', async () => {
    const seen: string[] = [];
    const rows = await callKhoaAll('p', {}, { serviceKey: 'k' }, async (_path, params): Promise<KhoaPage> => {
      seen.push(params.pageNo!);
      const n = params.pageNo === '3' ? 50 : 300;
      return { items: Array.from({ length: n }, (_, i) => ({ i })), totalCount: 650 };
    });
    expect(rows).toHaveLength(650);
    expect(seen).toEqual(['1', '2', '3']);
  });
});

describe('정규화', () => {
  it('활동별 필드 → 공통 슬롯(해수욕 개장·서핑 등급·낚시 어종·갯벌 체험시각)', () => {
    expect(toSeaSlot('beach', beachRow())).toMatchObject({ period: 'am', level: 5, label: '매우좋음', waveM: 0.1, waterTempC: 22.9, windMs: 3.5, openStatus: '폐장' });
    expect(
      toSeaSlot('surf', { predcYmd: '2026-09-24', predcNoonSeCd: '오후', avgWvhgt: '0.4', avgWvpd: '6.0', avgWspd: '2.7', avgWtem: '22.3', grdCn: '초급', totalIndex: '나쁨' }),
    ).toMatchObject({ period: 'pm', variants: [{ name: '초급', level: 2, label: '나쁨' }], level: 2, waveM: 0.4, wavePeriodS: 6 });
    expect(
      toSeaSlot('fishing', { predcYmd: '2026-09-24', predcNoonSeCd: '오전', seafsTgfshNm: '감성돔', tdlvHrCn: '중조기', minWtem: 24.0, maxWtem: 24.1, minCrsp: 0.2, maxCrsp: 0.2, totalIndex: '좋음' }),
    ).toMatchObject({ variants: [{ name: '감성돔', level: 4, label: '좋음' }], tidePhase: '중조기', waterTempC: 24.1, currentMs: 0.2, level: 4 });
    expect(
      toSeaSlot('mudflat', { predcYmd: '2026-09-24', mdftExprnBgngTm: '9:00', mdftExprnEndTm: '11:40', weather: '맑음', totalIndex: '체험불가' }),
    ).toMatchObject({ period: null, timeFrom: '09:00', timeTo: '11:40', weather: '맑음', level: 0 });
    expect(toSeaSlot('beach', beachRow({ predcYmd: '' }))).toBeNull();
    // D+3 이후 원문 '일'(하루) → period null.
    expect(toSeaSlot('beach', beachRow({ predcNoonSeCd: '일' }))!.period).toBeNull();
  });

  it('지점 묶음 — 동명 지점은 좌표로 구분, 슬롯은 날짜 → 오전·오후 → 원문 순, 날짜 목록', () => {
    const rows = [
      beachRow({ predcYmd: '2026-09-25', predcNoonSeCd: '오후' }),
      beachRow({ predcYmd: '2026-09-25', predcNoonSeCd: '오전' }),
      beachRow(),
      beachRow({ bbchNm: '같은이름', lat: 35.1, lot: 129.1 }),
      beachRow({ bbchNm: '같은이름', lat: 34.1, lot: 128.1 }),
      beachRow({ lat: null }),
    ];
    const g = groupSeaSpots('beach', rows);
    expect(g.dates).toEqual(['2026-09-24', '2026-09-25']);
    const daecheon = g.spots.find((s) => s.name === '대천해수욕장')!;
    expect(daecheon.id).toBe('대천해수욕장');
    expect(daecheon.slots.map((s) => `${s.date}:${s.period}`)).toEqual(['2026-09-24:am', '2026-09-25:am', '2026-09-25:pm']);
    expect(g.spots.filter((s) => s.name === '같은이름').map((s) => s.id).sort()).toEqual(['같은이름@34.100,128.100', '같은이름@35.100,129.100']);
  });

  it('세부(어종) 행은 날짜·시간대당 한 슬롯으로 — variants 원문 순, 슬롯 지수는 가장 좋은 세부', () => {
    const fish = (tgfsh: string, idx: string) => ({ seafsPstnNm: '가거도', lat: 34.07, lot: 125.08, predcYmd: '2026-09-24', predcNoonSeCd: '오전', seafsTgfshNm: tgfsh, maxWvhgt: 0.1, totalIndex: idx });
    const g = groupSeaSpots('fishing', [fish('감성돔', '보통'), fish('농어', '매우좋음'), fish('참돔', '나쁨')]);
    expect(g.spots[0]!.slots).toHaveLength(1);
    expect(g.spots[0]!.slots[0]).toMatchObject({
      level: 5,
      label: '매우좋음',
      waveM: 0.1,
      variants: [
        { name: '감성돔', level: 3, label: '보통' },
        { name: '농어', level: 5, label: '매우좋음' },
        { name: '참돔', level: 2, label: '나쁨' },
      ],
    });
  });

  it('이안류 — 관측 시각이 가장 늦은 행', () => {
    const rip = latestRip('HAE', [
      { obsrvnDt: '2026-09-24 00:00', lastScrCn: '관심', wvhgt: 0.2 },
      { obsrvnDt: '2026-09-24 00:05', lastScrCn: '경계', wvhgt: 0.4 },
    ]);
    expect(rip).toEqual({ code: 'HAE', level: 3, label: '경계', observedAt: '2026-09-24 00:05', waveM: 0.4 });
    expect(latestRip('HAE', [])).toBeNull();
  });
});

describe('SeaService', () => {
  const at = (iso: string) => () => new Date(iso);

  it('키가 없으면 503', async () => {
    await expect(new SeaService({ serviceKey: '' }).getForecast('beach')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('활동 캐시(TTL 안 재호출 없음) + 업스트림 실패 시 stale, 바다낚시는 gubun 한 번', async () => {
    let calls = 0;
    let fail = false;
    let nowIso = '2026-10-10T00:00:00Z';
    const svc = new SeaService({
      serviceKey: 'k',
      now: () => new Date(nowIso),
      callPage: async (path, params) => {
        calls += 1;
        if (fail) throw new KhoaApiError('down', { statusCode: 502 });
        if (path.startsWith('fcstFishing')) expect(params.gubun).toBe('갯바위');
        return { items: [beachRow()], totalCount: 1 };
      },
    });
    const a = await svc.getForecast('beach');
    expect(a).toMatchObject({ activity: 'beach', dates: ['2026-09-24'], stale: false });
    expect(a.spots[0]!.rip).toBeNull(); // 10월 — 이안류 기간 밖(호출 없음)
    await svc.getForecast('beach');
    expect(calls).toBe(1);
    await svc.getForecast('fishing');
    expect(calls).toBe(2);

    fail = true;
    nowIso = new Date(Date.parse(nowIso) + SEA_FORECAST_TTL_MS + 1000).toISOString();
    const b = await svc.getForecast('beach');
    expect(b.stale).toBe(true);
    await expect(svc.getForecast('surf')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('이안류 — 6~9월이면 해수욕장 이름으로 붙이고, 한 곳 실패는 무시', async () => {
    const svc = new SeaService({
      serviceKey: 'k',
      now: at('2026-09-24T03:00:00Z'),
      callPage: async (path, params) => {
        if (path.startsWith('ripCurrent')) {
          if (params.beachCode === 'GORAEBUL') throw new KhoaApiError('x');
          return { items: [{ obsrvnDt: '2026-09-24 11:55', lastScrCn: params.beachCode === 'HAE' ? '경계' : '관심', wvhgt: 0.4 }], totalCount: 1 };
        }
        return {
          items: [beachRow({ bbchNm: '해운대해수욕장', lat: 35.1586, lot: 129.1603 }), beachRow({ bbchNm: '이름없는해변', lat: 37.0, lot: 129.9 })],
          totalCount: 2,
        };
      },
    });
    const res = await svc.getForecast('beach');
    expect(res.spots.find((s) => s.name === '해운대해수욕장')!.rip).toMatchObject({ code: 'HAE', level: 3, label: '경계' });
    expect(res.spots.find((s) => s.name === '이름없는해변')!.rip).toBeNull();
  });

  it('물때 — 가장 가까운 예보지점, 날짜 외 행 제외, 홀수 만조·짝수 간조, 시각순', async () => {
    const seen: Record<string, string>[] = [];
    const svc = new SeaService({
      serviceKey: 'k',
      callPage: async (_path, params) => {
        seen.push(params);
        return {
          items: [
            { predcDt: '2026-09-24 15:34', predcTdlvVl: 732, extrSe: '3' },
            { predcDt: '2026-09-24 03:18', predcTdlvVl: 754, extrSe: '1' },
            { predcDt: '2026-09-24 09:45', predcTdlvVl: 231, extrSe: '2' },
            { predcDt: '2026-09-25 03:50', predcTdlvVl: 740, extrSe: '1' },
          ],
          totalCount: 4,
        };
      },
    });
    const t = await svc.getTide(37.452, 126.592, '2026-09-24');
    expect(seen[0]).toMatchObject({ obsCode: 'DT_0001', reqDate: '20260924' });
    expect(t.station).toMatchObject({ code: 'DT_0001', name: '인천' });
    expect(t.extremes).toEqual([
      { time: '03:18', kind: 'high', levelCm: 754 },
      { time: '09:45', kind: 'low', levelCm: 231 },
      { time: '15:34', kind: 'high', levelCm: 732 },
    ]);
    await svc.getTide(37.452, 126.592, '2026-09-24');
    expect(seen).toHaveLength(1);
  });
});

describe('sea routes — 계약', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('없는 활동·좌표 범위 밖·날짜 형식 오류는 400', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/sea/forecast?activity=ski' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/sea/tide?lat=10&lng=126&date=2026-09-24' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/sea/tide?lat=37.4&lng=126.5&date=20260924' })).statusCode).toBe(400);
  });
});
