import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRealtimeArrivals,
  getRealtimePositions,
  getStationMaster,
  SubwayApiAuthError,
  SubwayApiError,
} from './subway-api.adapter.js';

// __fixtures__/*.json — arrival/position/master 는 data/subway-probe 실덤프
// 축약본(행 2~3개), info-200/error-500 은 실덤프 그대로, info-100 은 공식 문서
// 형식 합성(실환경 미관측 — 파일이 그 사실을 주석 대신 값으로 드러낸다).
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

const fetchedUrl = (fn: ReturnType<typeof vi.fn>): string => String(fn.mock.calls[0]?.[0]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStationMaster — 역사마스터 파싱 (openapi)', () => {
  it('row 배열을 파싱하고 좌표 문자열을 숫자로 변환한다', async () => {
    const fn = stubFetch(fixture('master.json'));
    const rows = await getStationMaster({ apiKey: 'plain-key' });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      bldnId: '0150',
      name: '서울역',
      route: '1호선',
      // LAT/LOT 이 "37.556228" 문자열로 와도 numOrNull 이 숫자화한다.
      lat: 37.556228,
      lng: 126.972135,
    });
    // subwayStationMaster/1/1000 경로.
    expect(fetchedUrl(fn)).toContain('subwayStationMaster/1/1000');
  });

  it('단건 row 객체도 배열 1건으로 정규화한다', async () => {
    stubFetch(fixture('master-single-row.json'));
    const rows = await getStationMaster({ apiKey: 'plain-key' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('서울역');
  });

  it('ERROR-500(톱레벨 RESULT) → SubwayApiError(502)', async () => {
    stubFetch(fixture('error-500.json'));
    const err = await getStationMaster({ apiKey: 'plain-key' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubwayApiError);
    expect(err).not.toBeInstanceOf(SubwayApiAuthError);
    const apiErr = err as SubwayApiError;
    expect(apiErr.statusCode).toBe(502);
    expect(apiErr.code).toBe('ERROR-500');
  });
});

describe('getRealtimeArrivals — 도착정보 파싱 (swopen)', () => {
  it('realtimeArrivalList 를 파싱하고 barvlDt 문자열을 숫자로 변환한다', async () => {
    const fn = stubFetch(fixture('arrival.json'));
    const rows = await getRealtimeArrivals('강남', { apiKey: 'plain-key' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      subwayId: '1002',
      statnId: '1002000222',
      statnNm: '강남',
      updnLine: '외선',
      // "90"(초) → 90 숫자.
      barvlDt: 90,
      btrainNo: '2293',
    });
    expect(rows[1]?.subwayId).toBe('1077');
    // realtimeStationArrival/0/30/{역명} — 한글 역명은 encodeURIComponent.
    expect(fetchedUrl(fn)).toContain('realtimeStationArrival/0/30/');
    expect(fetchedUrl(fn)).toContain(encodeURIComponent('강남'));
  });

  it('INFO-200(데이터 없음)은 에러가 아니라 빈 배열로 반환', async () => {
    stubFetch(fixture('info-200.json'));
    const rows = await getRealtimeArrivals('존재하지않는역', { apiKey: 'plain-key' });
    expect(rows).toEqual([]);
  });

  it('INFO-100(인증 실패) → SubwayApiAuthError(503)', async () => {
    stubFetch(fixture('info-100.json'));
    const err = await getRealtimeArrivals('강남', { apiKey: 'plain-key' }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SubwayApiAuthError);
    const authErr = err as SubwayApiAuthError;
    expect(authErr.statusCode).toBe(503);
    expect(authErr.code).toBe('INFO-100');
  });
});

describe('getRealtimePositions — 실시간 위치 파싱 (swopen)', () => {
  it('realtimePositionList 를 파싱하고 updnLine 숫자문자열을 원문 보존한다', async () => {
    const fn = stubFetch(fixture('position.json'));
    const rows = await getRealtimePositions('2호선', { apiKey: 'plain-key' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      subwayId: '1002',
      subwayNm: '2호선',
      statnNm: '신설동',
      trainNo: '1626',
      // 위치의 updnLine 은 도착('외선')과 달리 '0'/'1' — 문자열 그대로.
      updnLine: '0',
      trainSttus: '1',
    });
    expect(fetchedUrl(fn)).toContain('realtimePosition/0/100/');
    expect(fetchedUrl(fn)).toContain(encodeURIComponent('2호선'));
  });
});

describe('에러/URL 에 apiKey 미노출 (마스킹)', () => {
  const SECRET = 'super-secret-subway-key';

  it('네트워크 실패 시 message/requestUrl 에 키가 없다 (마스킹 ***)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed: socket hang up');
      }),
    );
    const err = await getRealtimeArrivals('강남', { apiKey: SECRET }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubwayApiError);
    const apiErr = err as SubwayApiError;
    expect(apiErr.message).not.toContain(SECRET);
    expect(apiErr.requestUrl).toContain('/***/');
    expect(apiErr.requestUrl).not.toContain(SECRET);
  });

  it('업스트림 에러(ERROR-500) 시에도 requestUrl 에 키가 없다', async () => {
    stubFetch(fixture('error-500.json'));
    const err = await getStationMaster({ apiKey: SECRET }).catch((e: unknown) => e);
    const apiErr = err as SubwayApiError;
    expect(apiErr.message).not.toContain(SECRET);
    expect(apiErr.requestUrl).toContain('/***/');
    expect(apiErr.requestUrl).not.toContain(SECRET);
  });
});
