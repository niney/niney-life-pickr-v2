import { describe, expect, it } from 'vitest';
import { KtoApiAuthError, KtoApiError, buildKtoUrls, cleanKtoText, fetchKtoPage, normalizeKtoIntro, parseKtoPage } from './kto-tour.adapter.js';

// 한국관광공사 TourAPI 어댑터 — URL(키 가리기·이중 인코딩 방지), 게이트웨이 봉투(정상·0건·단일 객체·오류 JSON/XML),
// 재시도 규칙, 소개 정보의 운영 필드 정리. 실제 호출은 없다(fetchImpl 주입).

const ok = (item: unknown, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: item === '' ? '' : { item }, numOfRows: 10, pageNo: 1, totalCount: 3, ...extra } } });
const res = (text: string, status = 200): Response => new Response(text, { status });

describe('URL', () => {
  it('키는 로그용 URL 에서 가리고, 인코딩된 키(%XX)는 다시 인코딩하지 않는다', () => {
    const encoded = buildKtoUrls('locationBasedList2', { mapX: 126.9425, mapY: 33.4581, radius: 500, contentTypeId: undefined }, 'abc%2Bdef%3D%3D');
    expect(encoded.fetchUrl).toContain('/KorService2/locationBasedList2?serviceKey=abc%2Bdef%3D%3D&');
    expect(encoded.requestUrl).toContain('serviceKey=***&');
    expect(encoded.requestUrl).not.toContain('abc');
    // 필수 공통 파라미터 + 준 값만(undefined 는 싣지 않는다).
    expect(encoded.fetchUrl).toContain('MobileOS=ETC');
    expect(encoded.fetchUrl).toContain('_type=json');
    expect(encoded.fetchUrl).toContain('mapX=126.9425');
    expect(encoded.fetchUrl).not.toContain('contentTypeId');
    // 평문(Decoding) 키는 인코딩한다.
    expect(buildKtoUrls('detailIntro2', { contentId: 1 }, 'abc+def==').fetchUrl).toContain('serviceKey=abc%2Bdef%3D%3D&');
  });
});

describe('응답 봉투', () => {
  it('행이 여럿이면 배열, 하나면 객체, 0건이면 빈 문자열로 온다 — 전부 배열로 받는다', () => {
    expect(parseKtoPage(ok([{ contentid: '1' }, { contentid: '2' }]), 'u')).toMatchObject({ totalCount: 3, pageNo: 1, numOfRows: 10, items: [{ contentid: '1' }, { contentid: '2' }] });
    expect(parseKtoPage(ok({ contentid: '1' }), 'u').items).toEqual([{ contentid: '1' }]);
    expect(parseKtoPage(ok('', { totalCount: 0 }), 'u')).toMatchObject({ totalCount: 0, items: [] });
    // NODATA(03)도 빈 결과.
    expect(parseKtoPage(JSON.stringify({ response: { header: { resultCode: '03', resultMsg: 'NODATA_ERROR' }, body: {} } }), 'u').items).toEqual([]);
  });

  it('게이트웨이 오류 — 키·권한·쿼터(20·22·30 …)는 인증 오류로, 그 밖은 일반 오류로. JSON 요청이어도 XML 로 올 수 있다', () => {
    const json = JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE ERROR', returnAuthMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnReasonCode: '30' } } });
    expect(() => parseKtoPage(json, 'u')).toThrow(KtoApiAuthError);
    const xml = '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';
    try {
      parseKtoPage(xml, 'https://x?serviceKey=***');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KtoApiAuthError);
      expect(e).toMatchObject({ code: '22', requestUrl: 'https://x?serviceKey=***' });
      expect((e as Error).message).toContain('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR');
    }
    const timeout = '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICETIMEOUT_ERROR</returnAuthMsg><returnReasonCode>05</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';
    expect(() => parseKtoPage(timeout, 'u')).toThrow(KtoApiError);
    expect(() => parseKtoPage(timeout, 'u')).not.toThrow(KtoApiAuthError);
  });

  it('JSON 도 게이트웨이 봉투도 아니면 형식 오류, resultCode 가 정상이 아니면 그 코드로 오류', () => {
    expect(() => parseKtoPage('<html>502</html>', 'u')).toThrow(/JSON 이 아닙니다/);
    expect(() => parseKtoPage(JSON.stringify({ response: { header: { resultCode: '99', resultMsg: 'UNKNOWN' }, body: {} } }), 'u')).toThrow(/resultCode 99: UNKNOWN/);
    // 본문 없이 최상위에 resultCode 만 오는 변형.
    expect(() => parseKtoPage(JSON.stringify({ resultCode: '10', resultMsg: 'INVALID_REQUEST_PARAMETER_ERROR' }), 'u')).toThrow(/resultCode 10/);
  });
});

describe('호출', () => {
  it('일시 오류(HTTP 5xx · 게이트웨이 05)는 다시 시도하고, 인증 오류는 바로 멈춘다', async () => {
    const calls: string[] = [];
    const flaky = async (url: string): Promise<Response> => {
      calls.push(url);
      return calls.length === 1 ? res('<html>bad gateway</html>', 502) : res(ok([{ contentid: '7' }]));
    };
    const page = await fetchKtoPage('areaBasedList2', { numOfRows: 1, pageNo: 1 }, { serviceKey: 'k', fetchImpl: flaky });
    expect(page.items).toEqual([{ contentid: '7' }]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/areaBasedList2?serviceKey=k&');

    let authCalls = 0;
    const denied = async (): Promise<Response> => {
      authCalls += 1;
      return res('<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>');
    };
    await expect(fetchKtoPage('detailIntro2', { contentId: 1 }, { serviceKey: 'k', fetchImpl: denied })).rejects.toBeInstanceOf(KtoApiAuthError);
    expect(authCalls).toBe(1);
    // 본문 없는 401 도 인증 오류.
    await expect(fetchKtoPage('detailIntro2', { contentId: 1 }, { serviceKey: 'k', fetchImpl: async () => res('Unauthorized', 401) })).rejects.toBeInstanceOf(KtoApiAuthError);
  });
});

describe('소개 정보의 운영 필드', () => {
  it('태그를 지우고 <br> 은 줄바꿈으로 — 빈 값은 null', () => {
    expect(cleanKtoText('09:00~18:00<br>※ 입장마감 17:30')).toBe('09:00~18:00\n※ 입장마감 17:30');
    expect(cleanKtoText('<a href="http://x">예약</a>&nbsp;가능 &amp; 무료')).toBe('예약 가능 & 무료');
    expect(cleanKtoText('  ')).toBeNull();
    expect(cleanKtoText('<br />')).toBeNull();
    expect(cleanKtoText(undefined)).toBeNull();
  });

  it('필드 이름이 콘텐츠 유형마다 다르다 — 이용 시간·쉬는 날·주차·요금 네 가지로 모은다', () => {
    expect(normalizeKtoIntro('12', { usetime: '일출 1시간 전~20:00', restdate: '매월 첫째 월요일', parking: '가능' })).toEqual({ hours: '일출 1시간 전~20:00', closed: '매월 첫째 월요일', parking: '가능', fee: null });
    expect(normalizeKtoIntro('14', { usetimeculture: '09:00~18:00', restdateculture: '매주 월요일', usefee: '성인 5,000원<br>청소년 3,000원', parkingculture: '' })).toEqual({
      hours: '09:00~18:00',
      closed: '매주 월요일',
      parking: null,
      fee: '성인 5,000원\n청소년 3,000원',
    });
    expect(normalizeKtoIntro('39', { opentimefood: '11:00~21:00', restdatefood: '연중무휴', parkingfood: '주차 가능' })).toMatchObject({ hours: '11:00~21:00', closed: '연중무휴', parking: '주차 가능' });
    expect(normalizeKtoIntro('28', { usetimeleports: '10:00~17:00', usefeeleports: '20,000원' })).toMatchObject({ hours: '10:00~17:00', closed: null, fee: '20,000원' });
    expect(normalizeKtoIntro('38', { opentime: '10:30~20:00', restdateshopping: '설·추석 당일' })).toMatchObject({ hours: '10:30~20:00', closed: '설·추석 당일' });
    // 모르는 유형은 전부 null.
    expect(normalizeKtoIntro('15', { usetime: 'x' })).toEqual({ hours: null, closed: null, parking: null, fee: null });
  });
});
