import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BusApiAuthError,
  BusApiError,
  callBusApi,
  getBusPositionsByRouteSt,
  getRouteInfo,
  getRoutePath,
  getStationArrivals,
  getStationsByName,
  getStationsByRoute,
  toLatLng,
} from './bus-api.adapter.js';

// __fixtures__/*.xml — 검색 다건/단건/결과없음/headerCd7 은 2026-07-02
// probe:bus 실응답 기반. header-error/auth-error(cmmMsgHeader)는 공식 문서
// 형식 합성 (실환경에서 재현 어려운 케이스 — 각 파일 상단 주석 참조).
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const stubFetch = (body: string, status = 200) => {
  const fn = vi.fn(
    async () =>
      new Response(body, { status, headers: { 'Content-Type': 'text/xml;charset=UTF-8' } }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
};

const fetchedUrl = (fn: ReturnType<typeof vi.fn>): string => String(fn.mock.calls[0]?.[0]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callBusApi / getStationsByName — 응답 파싱', () => {
  it('다건 itemList 를 배열로 파싱하고 필드를 보존한다 (실응답 발췌)', async () => {
    stubFetch(fixture('stations-multi.xml'));
    const items = await getStationsByName('강남', { serviceKey: 'plain-key' });
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      stId: '122000175',
      stNm: 'KT강남지사',
      arsId: '23278',
      // tmX/tmY 필드에 WGS84 값이 실려오는 실구조 (probe:bus 확정).
      tmX: 127.0419791463,
      tmY: 37.5047549674,
    });
    // 가상정류장("(미정차)") — arsId '0'.
    expect(items[2]?.arsId).toBe('0');
  });

  it('단건 응답도 isArray 옵션으로 배열 1건이 된다 (arsId 선행 0 보존)', async () => {
    stubFetch(fixture('station-single.xml'));
    const items = await getStationsByName('창경궁', { serviceKey: 'plain-key' });
    expect(items).toHaveLength(1);
    expect(items[0]?.stId).toBe('101000004');
    // parseTagValue: false 가 아니면 '02013' 이 2013 으로 깨진다.
    expect(items[0]?.arsId).toBe('02013');
  });

  it('headerCd != 0 → BusApiError (headerCd/statusCode 보존)', async () => {
    stubFetch(fixture('header-error.xml'));
    const err = await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: 'plain-key',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BusApiError);
    const busErr = err as BusApiError;
    expect(busErr.headerCd).toBe('8');
    expect(busErr.statusCode).toBe(502);
    expect(busErr.message).toContain('운영시스템 오류');
  });

  it('cmmMsgHeader 인증 실패 → BusApiAuthError (returnAuthMsg/returnReasonCode 보존)', async () => {
    stubFetch(fixture('auth-error.xml'));
    const err = await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: 'plain-key',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BusApiAuthError);
    const authErr = err as BusApiAuthError;
    expect(authErr.returnReasonCode).toBe('30');
    expect(authErr.returnAuthMsg).toBe('SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
    // 키 인증 실패는 업스트림 장애(502)가 아니라 설정 이슈 — 503.
    expect(authErr.statusCode).toBe(503);
  });

  it('headerCd 7 (Key인증실패) 도 BusApiAuthError — 인증모듈 에러코드 추출', async () => {
    stubFetch(fixture('auth-error-headercd7.xml'));
    const err = await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: 'plain-key',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BusApiAuthError);
    const authErr = err as BusApiAuthError;
    expect(authErr.headerCd).toBe('7');
    expect(authErr.returnReasonCode).toBe('20');
    expect(authErr.returnAuthMsg).toContain('Key인증실패');
    expect(authErr.statusCode).toBe(503);
  });

  it("'결과 없음' headerCd(4) 는 에러가 아니라 items: [] 로 정상 반환", async () => {
    stubFetch(fixture('no-result.xml'));
    const res = await callBusApi('stationinfo/getStationByName', { stSrch: '없는정류장' }, {
      serviceKey: 'plain-key',
    });
    expect(res.headerCd).toBe('4');
    expect(res.items).toEqual([]);
  });
});

describe('getStationArrivals — 정류소 도착정보 파싱', () => {
  it('노선별 도착 행을 파싱한다 (staOrd 숫자 변환, vehId/arrmsg 원문 보존)', async () => {
    stubFetch(fixture('arrivals.xml'));
    const items = await getStationArrivals('23278', { serviceKey: 'plain-key' });
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      busRouteId: '100100020',
      rtNm: '141',
      staOrd: 65,
      vehId1: '109042241',
      arrmsg1: '곧 도착',
      vehId2: '109042059',
      arrmsg2: '8분후[2번째 전]',
    });
    // vehId '0'(도착예정 차량 없음) → null 정규화는 서비스 책임 — 어댑터는 원문 보존.
    expect(items[1]).toMatchObject({ vehId1: '0', arrmsg1: '운행종료', staOrd: 71 });
  });

  it('arsId 가 쿼리스트링에 실린다', async () => {
    const fn = stubFetch(fixture('arrivals.xml'));
    await getStationArrivals('23278', { serviceKey: 'plain-key' });
    expect(fetchedUrl(fn)).toContain('stationinfo/getStationByUid');
    expect(fetchedUrl(fn)).toContain('arsId=23278');
  });
});

describe('getBusPositionsByRouteSt — 노선 구간 버스 위치 파싱', () => {
  it('차량 행을 파싱한다 (sectOrd 숫자 변환, tmX/tmY 에 WGS84 실구조)', async () => {
    const fn = stubFetch(fixture('buspos-route-st.xml'));
    const items = await getBusPositionsByRouteSt('100100020', 62, 65, {
      serviceKey: 'plain-key',
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      vehId: '109042059',
      plainNo: '서울74사6477',
      sectOrd: 62,
      stopFlag: '1',
      dataTm: '20260702102707',
      tmX: 127.047265,
      tmY: 37.493328,
    });
    // 값-범위 판정이 tmX/tmY(WGS84)를 채택하고 posX/posY(TM)는 건너뛴다.
    expect(toLatLng(items[0]!)).toEqual({ lat: 37.493328, lng: 127.047265 });
    // startOrd/endOrd 가 숫자 → 문자열로 쿼리스트링에 실린다.
    expect(fetchedUrl(fn)).toContain('buspos/getBusPosByRouteSt');
    expect(fetchedUrl(fn)).toContain('busRouteId=100100020');
    expect(fetchedUrl(fn)).toContain('startOrd=62');
    expect(fetchedUrl(fn)).toContain('endOrd=65');
  });
});

describe('getRoutePath — 노선 형상 파싱 (5차)', () => {
  it('no/gpsX/gpsY 를 파싱하고 tmX/tmY 는 없어 null (toLatLng 는 gpsX/gpsY 채택)', async () => {
    const fn = stubFetch(fixture('route-path.xml'));
    const items = await getRoutePath('100100020', { serviceKey: 'plain-key' });
    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({
      no: 1,
      tmX: null,
      tmY: null,
      gpsX: 127.039507,
      gpsY: 37.686917,
    });
    // 형상 점도 값-범위 판정으로 gpsX/gpsY(WGS84)를 채택한다.
    expect(toLatLng(items[0]!)).toEqual({ lat: 37.686917, lng: 127.039507 });
    expect(fetchedUrl(fn)).toContain('busRouteInfo/getRoutePath');
    expect(fetchedUrl(fn)).toContain('busRouteId=100100020');
  });
});

describe('getStationsByRoute — 경유 정류소 파싱 (5차)', () => {
  it("'station'→stId 매핑, seq 숫자 변환, direction/transYn 원문 보존", async () => {
    const fn = stubFetch(fixture('route-stations.xml'));
    const items = await getStationsByRoute('100100020', { serviceKey: 'plain-key' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      seq: 1,
      stId: '109000068',
      arsId: '10153',
      stNm: '도봉산입구',
      direction: '염곡동',
      transYn: 'N',
      gpsX: 127.040722,
      gpsY: 37.687083,
    });
    expect(toLatLng(items[0]!)).toEqual({ lat: 37.687083, lng: 127.040722 });
    // 서울시 원문 오타 'Staion' 을 그대로 호출한다.
    expect(fetchedUrl(fn)).toContain('busRouteInfo/getStaionByRoute');
    expect(fetchedUrl(fn)).toContain('busRouteId=100100020');
  });
});

describe('getRouteInfo — 노선 기본정보 파싱 (5차)', () => {
  it('단건 원문 보존 — corpNm 연속 공백/length·term 문자열은 서비스가 정규화', async () => {
    stubFetch(fixture('route-info.xml'));
    const info = await getRouteInfo('100100020', { serviceKey: 'plain-key' });
    expect(info).not.toBeNull();
    expect(info).toMatchObject({
      busRouteId: '100100020',
      busRouteAbrv: '141',
      busRouteNm: '141',
      length: '54.1',
      routeType: '3',
      stStationNm: '도봉산',
      edStationNm: '염곡동',
      term: '11',
      firstBusTm: '20260704040000',
      lastBusTm: '20260704224000',
      // 어댑터는 원문 보존 — 연속 공백은 서비스가 접는다.
      corpNm: '아진교통  02-955-2321',
    });
  });

  it('결과 없음(headerCd 4) → null', async () => {
    stubFetch(fixture('no-result.xml'));
    const info = await getRouteInfo('999999999', { serviceKey: 'plain-key' });
    expect(info).toBeNull();
  });
});

describe('toLatLng — 필드명이 아닌 값 범위로 좌표 판정', () => {
  const base = { tmX: null, tmY: null, gpsX: null, gpsY: null, posX: null, posY: null };

  it('tmX/tmY 에 WGS84 값이 들어있으면 채택 (알려진 사례)', () => {
    expect(toLatLng({ ...base, tmX: 127.0276, tmY: 37.4979 })).toEqual({
      lat: 37.4979,
      lng: 127.0276,
    });
  });

  it('tmX/tmY 가 TM 값이면 건너뛰고 WGS84 범위인 gpsX/gpsY 를 채택', () => {
    expect(
      toLatLng({ ...base, tmX: 200228.41, tmY: 443382.21, gpsX: 127.0276, gpsY: 37.4979 }),
    ).toEqual({ lat: 37.4979, lng: 127.0276 });
  });

  it('모든 후보 쌍이 WGS84 범위 밖이면 null (TM 판명 시 proj4 변환 예정)', () => {
    expect(toLatLng({ ...base, tmX: 200228.41, tmY: 443382.21 })).toBeNull();
    expect(toLatLng(base)).toBeNull();
  });
});

describe('serviceKey URL 조립 — 이중 인코딩 회피', () => {
  it('%XX 포함 Encoding 키는 raw 그대로 이어붙인다', async () => {
    const fn = stubFetch(fixture('station-single.xml'));
    const encodingKey = 'abc%2Bxyz%3D%3D';
    await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: encodingKey,
    });
    const url = fetchedUrl(fn);
    expect(url).toContain(`serviceKey=${encodingKey}&`);
    // 이중 인코딩(%25XX)이 없어야 한다.
    expect(url).not.toContain('%252B');
  });

  it('평문(Decoding) 키는 encodeURIComponent 1회만 적용한다', async () => {
    const fn = stubFetch(fixture('station-single.xml'));
    await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: 'abc+xyz==',
    });
    expect(fetchedUrl(fn)).toContain('serviceKey=abc%2Bxyz%3D%3D&');
  });

  it('일반 파라미터(stSrch)는 URLSearchParams 로 UTF-8 인코딩된다', async () => {
    const fn = stubFetch(fixture('station-single.xml'));
    await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: 'plain-key',
    });
    expect(fetchedUrl(fn)).toContain('stSrch=%EA%B0%95%EB%82%A8');
  });

  it('extraParams 가 쿼리스트링에 합쳐진다', async () => {
    const fn = stubFetch(fixture('station-single.xml'));
    await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: 'plain-key',
      extraParams: { resultType: 'json' },
    });
    expect(fetchedUrl(fn)).toContain('resultType=json');
  });
});

describe('에러에 serviceKey 미노출', () => {
  const SECRET = 'super-secret-bus-key';

  it('네트워크 실패 시 message/requestUrl 에 키가 없다 (마스킹 ***)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed: socket hang up');
      }),
    );
    const err = await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: SECRET,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BusApiError);
    const busErr = err as BusApiError;
    expect(busErr.message).not.toContain(SECRET);
    expect(busErr.requestUrl).toContain('serviceKey=***');
    expect(busErr.requestUrl).not.toContain(SECRET);
  });

  it('본문 읽기(res.text()) 실패도 BusApiError 로 래핑 — requestUrl 마스킹 유지', async () => {
    // 헤더는 정상 수신, 본문이 끊긴 케이스 (undici terminated 등).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          text: async () => {
            throw new TypeError('terminated');
          },
        }) as unknown as Response,
      ),
    );
    const err = await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: SECRET,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BusApiError);
    const busErr = err as BusApiError;
    expect(busErr.message).toContain('본문 읽기 실패');
    expect(busErr.message).not.toContain(SECRET);
    expect(busErr.requestUrl).toContain('serviceKey=***');
    expect(busErr.requestUrl).not.toContain(SECRET);
  });

  it('headerCd 에러 시에도 message/requestUrl 에 키가 없다', async () => {
    stubFetch(fixture('header-error.xml'));
    const err = await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: SECRET,
    }).catch((e: unknown) => e);
    const busErr = err as BusApiError;
    expect(busErr.message).not.toContain(SECRET);
    expect(busErr.requestUrl).not.toContain(SECRET);
  });

  it('성공 결과의 requestUrl 도 마스킹본이다', async () => {
    stubFetch(fixture('station-single.xml'));
    const res = await callBusApi('stationinfo/getStationByName', { stSrch: '강남' }, {
      serviceKey: SECRET,
    });
    expect(res.requestUrl).toContain('serviceKey=***');
    expect(res.requestUrl).not.toContain(SECRET);
  });
});
