import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BusApiAuthError,
  BusApiError,
  callBusApi,
  getStationsByName,
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
