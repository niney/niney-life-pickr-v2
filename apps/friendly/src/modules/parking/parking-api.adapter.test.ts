import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParkingApiError, callDataGoKr, callSeoulOpen, createCallSpacer, fetchKotsaPage, interpretDataGoKr } from './parking-api.adapter.js';

// 원천 봉투 — data.go.kr 의 API 별 모양(표준데이터/공항 GW response 감싸개, 인천 items 배열, 환경공단 감싸개 없음)과
// 게이트웨이 오류(JSON·XML), 서울 열린데이터 코드(INFO-000/200/100·ERROR). 실측(2026-09-25) 응답을 줄여 쓴다.

const URL_ = 'https://example/x';

describe('interpretDataGoKr', () => {
  it('response 감싸개 + items.item 배열(공항 GW)', () => {
    const out = interpretDataGoKr(
      200,
      JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [{ a: 1 }, { a: 2 }] }, totalCount: 25 } } }),
      URL_,
    );
    expect(out).toEqual({ page: { items: [{ a: 1 }, { a: 2 }], totalCount: 25 } });
  });

  it('items 가 배열(인천)·단건 객체·감싸개 없음(환경공단)', () => {
    expect(interpretDataGoKr(200, JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [{ f: 1 }], totalCount: 19 } } }), URL_)).toEqual({
      page: { items: [{ f: 1 }], totalCount: 19 },
    });
    expect(interpretDataGoKr(200, JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: { f: 1 } }, totalCount: 1 } } }), URL_)).toEqual({
      page: { items: [{ f: 1 }], totalCount: 1 },
    });
    expect(interpretDataGoKr(200, JSON.stringify({ resultCode: '00', totalCount: 525056, items: { item: [{ statId: 'ME1' }] } }), URL_)).toEqual({
      page: { items: [{ statId: 'ME1' }], totalCount: 525056 },
    });
  });

  it('데이터 없음 03 은 빈 결과, 다른 결과코드는 502', () => {
    expect(interpretDataGoKr(200, JSON.stringify({ response: { header: { resultCode: '03' }, body: {} } }), URL_)).toEqual({ page: { items: [], totalCount: 0 } });
    const out = interpretDataGoKr(200, JSON.stringify({ response: { header: { resultCode: '10', resultMsg: '잘못된 요청' } } }), URL_);
    expect('error' in out && out.error.statusCode).toBe(502);
  });

  it('게이트웨이 오류 — 미등록 키(30)는 503(JSON·XML 둘 다), 04 는 재시도 대상', () => {
    const json = interpretDataGoKr(
      200,
      JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '30', returnAuthMsg: '등록되지 않은 서비스키' } } }),
      URL_,
    );
    expect('error' in json && json.error.statusCode).toBe(503);
    const xml = interpretDataGoKr(
      200,
      '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
      URL_,
    );
    expect('error' in xml && xml.error.code).toBe('30');
    expect('error' in xml && xml.error.statusCode).toBe(503);
    const gw = interpretDataGoKr(200, '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>04</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>', URL_);
    expect('retryable' in gw && gw.retryable).toBe(true);
  });

  it('한국교통안전공단 봉투 — 목록 키가 오퍼레이션 이름(listKey), 없으면 items 만 본다', () => {
    const body = JSON.stringify({ resultCode: '0', resultMsg: 'SUCCESS', numOfRows: '2', pageNo: '1', totalCount: '5443', PrkSttusInfo: [{ prk_center_id: 'a' }] });
    expect(interpretDataGoKr(200, body, URL_, 'PrkSttusInfo')).toEqual({ page: { items: [{ prk_center_id: 'a' }], totalCount: 5443 } });
    expect(interpretDataGoKr(200, body, URL_)).toEqual({ page: { items: [], totalCount: 5443 } });
  });

  it('초당 호출 한도 초과는 길게 쉬고 재시도, 일 한도 초과(같은 22)는 재시도 안 함', () => {
    const perSecond = interpretDataGoKr(
      200,
      '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
      URL_,
    );
    expect(perSecond).toMatchObject({ retryable: true, error: { statusCode: 503 } });
    expect('retryAfterMs' in perSecond && perSecond.retryAfterMs).toBeGreaterThanOrEqual(1000);
    const daily = interpretDataGoKr(
      200,
      JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '22', returnAuthMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' } } }),
      URL_,
    );
    expect(daily).toMatchObject({ retryable: false, error: { statusCode: 503, code: '22' } });
  });
});

const fakeFetch = (bodies: string[]) => {
  const urls: string[] = [];
  const impl = async (url: string): Promise<Response> => {
    urls.push(url);
    return new Response(bodies[Math.min(urls.length - 1, bodies.length - 1)]!, { status: 200 });
  };
  return { impl, urls };
};

describe('callDataGoKr', () => {
  it('Encoding 키는 그대로 붙이고(이중 인코딩 금지) 에러 메시지에 키가 없다', async () => {
    const f = fakeFetch([JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '30' } } })]);
    const key = 'abc%2Bdef%3D%3D';
    const err = await callDataGoKr('https://apis.data.go.kr/x', { pageNo: '1' }, key, { fetchImpl: f.impl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParkingApiError);
    expect(f.urls[0]).toContain(`serviceKey=${key}&`);
    expect((err as ParkingApiError).requestUrl).toContain('serviceKey=***');
    expect((err as ParkingApiError).message).not.toContain(key);
  });

  it('게이트웨이 04 는 한 번 재시도해 성공하면 결과', async () => {
    const f = fakeFetch([
      '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>04</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
      JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [{ x: 1 }], totalCount: 1 } } }),
    ]);
    const page = await callDataGoKr('https://apis.data.go.kr/x', {}, 'k', { fetchImpl: f.impl });
    expect(page.items).toEqual([{ x: 1 }]);
    expect(f.urls).toHaveLength(2);
  });

  it('키가 없으면 503', async () => {
    await expect(callDataGoKr('https://x', {}, '')).rejects.toMatchObject({ statusCode: 503 });
  });

  describe('초당 한도', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('초당 한도 초과는 쉬었다가 attempts 까지 다시 부른다', async () => {
      vi.useFakeTimers();
      const limited = '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR</errMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';
      const f = fakeFetch([limited, limited, JSON.stringify({ resultCode: '0', totalCount: '1', PrkOprInfo: [{ prk_center_id: 'a' }] })]);
      const pending = callDataGoKr('https://apis.data.go.kr/x', {}, 'k', { fetchImpl: f.impl, attempts: 3, listKey: 'PrkOprInfo' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).items).toEqual([{ prk_center_id: 'a' }]);
      expect(f.urls).toHaveLength(3);
    });
  });
});

describe('fetchKotsaPage · createCallSpacer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('시군구 코드 앞 두 자리가 시도, 오퍼레이션 _v1 경로·JSON(format=2)·1만 행', async () => {
    const f = fakeFetch([JSON.stringify({ resultCode: '0', totalCount: '13', PrkSttusInfo: [{ prk_center_id: 'a' }, { prk_center_id: 'b' }] })]);
    const page = await fetchKotsaPage('k', 'facility', { sigunguCd: '11110' }, { fetchImpl: f.impl });
    expect(page).toEqual({ items: [{ prk_center_id: 'a' }, { prk_center_id: 'b' }], totalCount: 13 });
    expect(f.urls[0]).toBe('https://apis.data.go.kr/B553881/Parking_v1/PrkSttusInfo_v1?serviceKey=k&pageNo=1&numOfRows=10000&format=2&sidoCd=11&sigunguCd=11110');
  });

  it('호출 시작 시각을 gapMs 씩 벌린다', async () => {
    vi.useFakeTimers();
    const space = createCallSpacer(350);
    const starts: number[] = [];
    const run = () =>
      space(async () => {
        starts.push(Date.now());
      });
    const all = Promise.all([run(), run(), run()]);
    await vi.advanceTimersByTimeAsync(1_000);
    await all;
    expect([starts[1]! - starts[0]!, starts[2]! - starts[1]!]).toEqual([350, 350]);
  });
});

describe('callSeoulOpen', () => {
  it('INFO-000 은 행, INFO-200 은 빈 결과, INFO-100 은 503, ERROR 는 502', async () => {
    const ok = fakeFetch([JSON.stringify({ GetParkingInfo: { list_total_count: 122, RESULT: { CODE: 'INFO-000' }, row: [{ PKLT_CD: '1' }] } })]);
    expect(await callSeoulOpen('GetParkingInfo', 1, 1000, 'key', { fetchImpl: ok.impl })).toEqual({ items: [{ PKLT_CD: '1' }], totalCount: 122 });
    const none = fakeFetch([JSON.stringify({ RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } })]);
    expect(await callSeoulOpen('GetParkingInfo', 1, 1000, 'key', { fetchImpl: none.impl })).toEqual({ items: [], totalCount: 0 });
    const auth = fakeFetch([JSON.stringify({ RESULT: { CODE: 'INFO-100', MESSAGE: '인증키가 유효하지 않습니다.' } })]);
    await expect(callSeoulOpen('GetParkingInfo', 1, 1000, 'key', { fetchImpl: auth.impl })).rejects.toMatchObject({ statusCode: 503 });
    const bad = fakeFetch([JSON.stringify({ RESULT: { CODE: 'ERROR-500', MESSAGE: '서버 오류' } })]);
    await expect(callSeoulOpen('GetParkingInfo', 1, 1000, 'key', { fetchImpl: bad.impl })).rejects.toMatchObject({ statusCode: 502 });
    expect(ok.urls[0]).toBe('http://openapi.seoul.go.kr:8088/key/json/GetParkingInfo/1/1000/');
  });
});
