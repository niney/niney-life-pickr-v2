import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AirKoreaApiAuthError,
  AirKoreaApiError,
  callAirKoreaApi,
  getBadStations,
  getDustForecast,
  getSidoRealtime,
  getStationRealtime,
  getWeeklyForecast,
} from './airkorea-api.adapter.js';

// __fixtures__/*.json — 2026-08-21 실응답 덤프 축약본(sido-all 8행·station-daily 7행
// 등). gateway-* 는 실관측 게이트웨이 오류 본문, empty 는 주간예보 당일 미발표 실응답.
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const stubFetch = (body: string, status = 200) => {
  const fn = vi.fn(
    async () =>
      new Response(body, { status, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
};
// 호출 순서대로 다른 응답을 주는 스텁(재시도 검증용).
const stubFetchSequence = (responses: Array<{ body: string; status?: number }>) => {
  let i = 0;
  const fn = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return new Response(r.body, {
      status: r.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

const fetchedUrl = (fn: ReturnType<typeof vi.fn>, call = 0): string =>
  String(fn.mock.calls[call]?.[0]);

const OPTS = { serviceKey: 'plain-key' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callAirKoreaApi — URL 조립/키 처리', () => {
  it('returnType=json 을 강제하고 serviceKey 는 첫 파라미터로 평문 키를 encodeURIComponent 한다', async () => {
    const fn = stubFetch(fixture('empty.json'));
    await callAirKoreaApi('getMinuDustWeekFrcstDspth', { searchDate: '2026-08-21' }, {
      serviceKey: 'a b/c',
    });
    const url = fetchedUrl(fn);
    expect(url).toContain('/ArpltnInforInqireSvc/getMinuDustWeekFrcstDspth?serviceKey=a%20b%2Fc&');
    expect(url).toContain('returnType=json');
    expect(url).toContain('searchDate=2026-08-21');
  });

  it('Encoding 키(%XX 포함)는 그대로 붙여 이중 인코딩하지 않는다', async () => {
    const fn = stubFetch(fixture('empty.json'));
    await callAirKoreaApi('getUnityAirEnvrnIdexSnstiveAboveMsrstnList', {}, {
      serviceKey: 'abc%2Fdef%3D%3D',
    });
    expect(fetchedUrl(fn)).toContain('serviceKey=abc%2Fdef%3D%3D');
    expect(fetchedUrl(fn)).not.toContain('%252F');
  });

  it('빈 결과(totalCount 0, items [])는 에러가 아니라 빈 배열', async () => {
    stubFetch(fixture('empty.json'));
    const res = await callAirKoreaApi('getMinuDustWeekFrcstDspth', { searchDate: 'x' }, OPTS);
    expect(res.items).toEqual([]);
    expect(res.totalCount).toBe(0);
    expect(res.requestUrl).toContain('serviceKey=***');
    expect(res.requestUrl).not.toContain('plain-key');
  });
});

describe('게이트웨이 오류 분류/재시도', () => {
  it('returnReasonCode 30(미등록 키) → AirKoreaApiAuthError(503), 재시도 없음', async () => {
    const fn = stubFetch(fixture('gateway-auth-error.json'));
    const err = await callAirKoreaApi('getUnityAirEnvrnIdexSnstiveAboveMsrstnList', {}, OPTS).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AirKoreaApiAuthError);
    const apiErr = err as AirKoreaApiAuthError;
    expect(apiErr.statusCode).toBe(503);
    expect(apiErr.code).toBe('30');
    expect(apiErr.requestUrl).toContain('***');
    expect(apiErr.message).not.toContain('plain-key');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('SERVICETIMEOUT(05, HTTP 504) 는 1회 재시도 후 성공하면 정상 반환', async () => {
    const fn = stubFetchSequence([
      { body: fixture('gateway-timeout.json'), status: 504 },
      { body: fixture('bad-stations.json') },
    ]);
    const rows = await getBadStations(OPTS);
    expect(rows).toHaveLength(3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('재시도도 타임아웃이면 AirKoreaApiError(502, code 05) — 총 2회 호출', async () => {
    const fn = stubFetch(fixture('gateway-timeout.json'), 504);
    const err = await getBadStations(OPTS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AirKoreaApiError);
    expect(err).not.toBeInstanceOf(AirKoreaApiAuthError);
    expect((err as AirKoreaApiError).statusCode).toBe(502);
    expect((err as AirKoreaApiError).code).toBe('05');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('JSON 이 아닌 본문 — 5xx 면 1회 재시도, 200 이면 즉시 파싱 실패 에러', async () => {
    const fn5xx = stubFetch('<html>Bad Gateway</html>', 502);
    const e1 = await getBadStations(OPTS).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(AirKoreaApiError);
    expect(fn5xx).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();

    const fn200 = stubFetch('not json', 200);
    const e2 = await getBadStations(OPTS).catch((e: unknown) => e);
    expect(e2).toBeInstanceOf(AirKoreaApiError);
    expect((e2 as AirKoreaApiError).message).toContain('파싱 실패');
    expect(fn200).toHaveBeenCalledTimes(1);
  });
});

describe('getSidoRealtime — 시도별 실시간(ver 1.5)', () => {
  it('전국 8행을 원문 문자열 그대로 돌려주고 결측 "-"/Flag 를 보존한다', async () => {
    const fn = stubFetch(fixture('sido-all.json'));
    const { rows, pages } = await getSidoRealtime('전국', OPTS);
    expect(pages).toBe(1);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({
      stationName: '강남구',
      sidoName: '서울',
      stationCode: '111261',
      mangName: '도시대기',
      dataTime: '2026-08-21 12:00',
      pm10Value: '35',
      o3Value: '0.0109',
      khaiGrade: '2',
      pm10Flag: null,
    });
    const broken = rows.find((r) => r.stationName === '금천구');
    expect(broken).toMatchObject({ pm10Value: '-', khaiValue: '-', pm10Flag: '통신장애', khaiGrade: null });
    const url = fetchedUrl(fn);
    expect(url).toContain('sidoName=%EC%A0%84%EA%B5%AD');
    expect(url).toContain('ver=1.5');
    expect(url).toContain('numOfRows=1000');
    expect(url).toContain('pageNo=1');
  });
});

describe('getStationRealtime — 측정소별 시계열', () => {
  it('DAILY 7행, "24:00" 표기와 통신장애 행을 원문으로 보존, dataTerm 파라미터 전달', async () => {
    const fn = stubFetch(fixture('station-daily.json'));
    const { rows, totalCount } = await getStationRealtime('강남구', 'DAILY', OPTS);
    expect(totalCount).toBe(7);
    expect(rows.map((r) => r.dataTime)).toEqual([
      '2026-08-21 12:00',
      '2026-08-21 11:00',
      '2026-08-21 01:00',
      '2026-08-20 24:00',
      '2026-08-20 19:00',
      '2026-08-20 17:00',
      '2026-08-20 15:00',
    ]);
    expect(rows[5]).toMatchObject({ pm10Value: '-', so2Flag: '통신장애' });
    const url = fetchedUrl(fn);
    expect(url).toContain('stationName=%EA%B0%95%EB%82%A8%EA%B5%AC');
    expect(url).toContain('dataTerm=DAILY');
  });
});

describe('getBadStations / getDustForecast / getWeeklyForecast', () => {
  it('나쁨 이상 측정소 — stationName/addr', async () => {
    stubFetch(fixture('bad-stations.json'));
    const rows = await getBadStations(OPTS);
    expect(rows[0]).toEqual({ stationName: '송도', addr: '인천 연수구 갯벌로 12 테크노파크 3층 옥상' });
  });

  it('예보 — ver=1.1, InformCode 미전송, imageUrl1~9 비어있지 않은 값은 전부 수집(유효성은 서비스)', async () => {
    const fn = stubFetch(fixture('forecast.json'));
    const rows = await getDustForecast('2026-08-21', OPTS);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      dataTime: '2026-08-21 11시 발표',
      informCode: 'PM10',
      informData: '2026-08-21',
      actionKnack: null,
    });
    expect(rows[0]?.informGrade).toContain('서울 : 좋음');
    // 1~7 유효 + 8·9 디렉터리 슬롯(비어있지 않음) = 9.
    expect(rows[0]?.imageUrls).toHaveLength(9);
    const url = fetchedUrl(fn);
    expect(url).toContain('searchDate=2026-08-21');
    expect(url).toContain('ver=1.1');
    expect(url).not.toContain('InformCode');
  });

  it('주간예보 — 발표일·전망·4일치 슬롯', async () => {
    stubFetch(fixture('weekly.json'));
    const rows = await getWeeklyForecast('2026-08-20', OPTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.presnatnDt).toBe('2026-08-20');
    expect(rows[0]?.gwthcnd).toContain('[8월 23일~8월 26일]');
    expect(rows[0]?.days.map((d) => d.date)).toEqual([
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
    expect(rows[0]?.days[0]?.text).toContain('신뢰도 : 높음');
  });
});
