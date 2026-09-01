import { describe, expect, it, vi } from 'vitest';
import { RtmsApiAuthError, RtmsApiError, fetchRtmsPage, fetchRtmsPartition, parseRtmsItems } from './rtms.adapter.js';

// RTMS 어댑터 — fetch 를 목으로 바꿔 ① XML 파싱(공백·CDATA·엔티티·빈 태그) ② 정상/0건/NODATA ③ 게이트웨이
// 인증 봉투(즉시 중단) ④ 5xx 재시도 ⑤ XML 아님 즉시 실패 ⑥ 페이지 상한 순차 페이징을 확인한다.

const item = (fields: Record<string, string>): string =>
  `<item>${Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('')}</item>`;
const okXml = (items: string[], totalCount: number, numOfRows = 2000, pageNo = 1): string =>
  `<?xml version="1.0" encoding="utf-8" standalone="yes"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>${items.join('')}</items><numOfRows>${numOfRows}</numOfRows><pageNo>${pageNo}</pageNo><totalCount>${totalCount}</totalCount></body></response>`;
const gatewayXml = (code: string, msg: string): string =>
  `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>${msg}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
const res = (body: string, status = 200): Response => new Response(body, { status, headers: { 'content-type': 'application/xml' } });
const KEY = 'abc==';

describe('rtms.adapter', () => {
  it('parseRtmsItems — 공백 값은 빈 문자열, CDATA·엔티티 해제, 빈 태그 허용', () => {
    const xml = okXml([`<item><aptNm><![CDATA[래미안&amp;자이]]></aptNm><aptDong> </aptDong><cdealType/><dealAmount>58,960</dealAmount></item>`], 1);
    expect(parseRtmsItems(xml)).toEqual([{ aptNm: '래미안&자이', aptDong: '', cdealType: '', dealAmount: '58,960' }]);
  });

  it('fetchRtmsPage — 정상 응답(resultCode 000) 파싱, 키는 URL 에 인코딩·로그엔 마스킹', async () => {
    const fetchImpl = vi.fn(async () =>
      res(okXml([item({ aptNm: '동대문맨션', sggCd: '11110', dealAmount: '58,960' }), item({ aptNm: '롯데낙천대', sggCd: '11110', dealAmount: '140,000' })], 2)),
    );
    const page = await fetchRtmsPage({ op: 'trade', lawdCd: '11110', dealYmd: '202507', pageNo: 1, numOfRows: 2000 }, { serviceKey: KEY, fetchImpl });
    expect(page.totalCount).toBe(2);
    expect(page.numOfRows).toBe(2000);
    expect(page.items.map((i) => i['aptNm'])).toEqual(['동대문맨션', '롯데낙천대']);
    expect(page.requestUrl).toContain('serviceKey=***&LAWD_CD=11110&DEAL_YMD=202507&pageNo=1&numOfRows=2000');
    expect(page.requestUrl).toContain('RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev');
    const url = fetchImpl.mock.calls[0]![0] as string;
    expect(url).toContain('serviceKey=abc%3D%3D&');
    expect(url).not.toContain('***');
  });

  it('0건 — 빈 items / NODATA(03) 코드 모두 빈 배열', async () => {
    const empty = await fetchRtmsPage(
      { op: 'rent', lawdCd: '11110', dealYmd: '202507', pageNo: 1, numOfRows: 100 },
      { serviceKey: KEY, fetchImpl: async () => res(okXml([], 0).replace('<items></items>', '<items/>')) },
    );
    expect(empty.items).toEqual([]);
    expect(empty.totalCount).toBe(0);
    const noData = await fetchRtmsPage(
      { op: 'rent', lawdCd: '11110', dealYmd: '202507', pageNo: 1, numOfRows: 100 },
      {
        serviceKey: KEY,
        fetchImpl: async () => res('<response><header><resultCode>03</resultCode><resultMsg>NODATA_ERROR</resultMsg></header><body><items/><totalCount>0</totalCount></body></response>'),
      },
    );
    expect(noData.items).toEqual([]);
    expect(noData.requestUrl).toContain('RTMSDataSvcAptRent/getRTMSDataSvcAptRent');
  });

  it('게이트웨이 30(미등록 키) → RtmsApiAuthError, 재시도 없음', async () => {
    const fetchImpl = vi.fn(async () => res(gatewayXml('30', 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR')));
    await expect(
      fetchRtmsPage({ op: 'trade', lawdCd: '11110', dealYmd: '202507', pageNo: 1, numOfRows: 10 }, { serviceKey: KEY, fetchImpl }),
    ).rejects.toMatchObject({ name: 'RtmsApiAuthError', code: '30' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // 상태 500 으로 온 인증 봉투도 같다.
    const fetch500 = vi.fn(async () => res(gatewayXml('22', 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR'), 500));
    await expect(
      fetchRtmsPage({ op: 'trade', lawdCd: '11110', dealYmd: '202507', pageNo: 1, numOfRows: 10 }, { serviceKey: KEY, fetchImpl: fetch500 }),
    ).rejects.toBeInstanceOf(RtmsApiAuthError);
    expect(fetch500).toHaveBeenCalledTimes(1);
  });

  it('HTTP 502 → 일시 오류로 재시도해 성공', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n += 1;
      return n === 1 ? res('<html>bad gateway</html>', 502) : res(okXml([item({ aptNm: 'X' })], 1));
    });
    const page = await fetchRtmsPage({ op: 'trade', lawdCd: '11110', dealYmd: '202507', pageNo: 1, numOfRows: 10 }, { serviceKey: KEY, fetchImpl });
    expect(page.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('XML 이 아닌 200 응답 → RtmsApiError 즉시(재시도 없음)', async () => {
    const fetchImpl = vi.fn(async () => res('{"json":true}'));
    await expect(
      fetchRtmsPage({ op: 'trade', lawdCd: '11110', dealYmd: '202507', pageNo: 1, numOfRows: 10 }, { serviceKey: KEY, fetchImpl }),
    ).rejects.toBeInstanceOf(RtmsApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetchRtmsPartition — 게이트웨이가 100건으로 자르면 totalCount 까지 순차 페이징(pageCap 100)', async () => {
    const TOTAL = 250;
    const fetchImpl = vi.fn(async (url: string) => {
      const pageNo = Number(new URL(url).searchParams.get('pageNo'));
      const start = (pageNo - 1) * 100;
      const items = Array.from({ length: Math.max(0, Math.min(100, TOTAL - start)) }, (_, i) => item({ aptNm: `A${start + i}` }));
      return res(okXml(items, TOTAL, 100, pageNo));
    });
    const out = await fetchRtmsPartition('trade', '11110', '202507', { serviceKey: KEY, fetchImpl });
    expect(out.items).toHaveLength(TOTAL);
    expect(out.pages).toBe(3);
    expect(out.pageCap).toBe(100);
    expect(out.items[249]!['aptNm']).toBe('A249');
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const single = await fetchRtmsPartition('trade', '11110', '202507', {
      serviceKey: KEY,
      fetchImpl: async () => res(okXml([item({ aptNm: 'only' })], 1)),
    });
    expect(single.pages).toBe(1);
    expect(single.pageCap).toBeNull();
  });
});
