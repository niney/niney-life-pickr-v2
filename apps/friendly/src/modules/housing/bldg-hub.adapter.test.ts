import { describe, expect, it, vi } from 'vitest';
import { BldgHubApiAuthError, BldgHubApiError, bldgParamsFromPnu, fetchBldgRecords } from './bldg-hub.adapter.js';
import { narrowDataGoItems, parseDataGoJson } from './datago-json.adapter.js';

// 건축HUB 어댑터 — ① PNU → 조회 파라미터(대지/산) ② data.go.kr JSON 봉투(items 배열/객체/''·NODATA·게이트웨이
// 인증 30·5xx 재시도) ③ totalCount 페이징 을 fetch 목으로 확인한다.

const ok = (items: unknown, totalCount: number, pageNo = 1, numOfRows = 100): string =>
  JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { items, totalCount, pageNo, numOfRows } } });
const gateway = (code: string, msg: string): string =>
  JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE ERROR', returnAuthMsg: msg, returnReasonCode: code } } });
const res = (body: string, status = 200): Response => new Response(body, { status, headers: { 'content-type': 'application/json' } });
const PARAMS = { sigunguCd: '11110', bjdongCd: '10100', platGbCd: '0', bun: '0056', ji: '0045' };

describe('bldg-hub.adapter', () => {
  it('bldgParamsFromPnu — 19자리 분해, 11번째 2 는 산(platGbCd 1)', () => {
    expect(bldgParamsFromPnu('1111010100100560045')).toEqual(PARAMS);
    expect(bldgParamsFromPnu('4113510100200010008')).toEqual({ sigunguCd: '41135', bjdongCd: '10100', platGbCd: '1', bun: '0001', ji: '0008' });
    expect(bldgParamsFromPnu('abc')).toBeNull();
    expect(bldgParamsFromPnu(null)).toBeNull();
  });

  it('narrowDataGoItems·parseDataGoJson — 배열/객체/빈 문자열/단일 item, NODATA 는 빈 배열', () => {
    expect(narrowDataGoItems({ items: { item: [{ a: 1 }, { a: 2 }] } })).toEqual([{ a: 1 }, { a: 2 }]);
    expect(narrowDataGoItems({ items: { item: { a: 1 } } })).toEqual([{ a: 1 }]);
    expect(narrowDataGoItems({ items: '' })).toEqual([]);
    expect(narrowDataGoItems({ items: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(narrowDataGoItems({ item: { kaptCode: 'A' } })).toEqual([{ kaptCode: 'A' }]);
    const noData = parseDataGoJson(JSON.stringify({ response: { header: { resultCode: '03', resultMsg: 'NODATA_ERROR' }, body: { items: '', totalCount: 0 } } }), 'u');
    expect(noData.items).toEqual([]);
    expect(() => parseDataGoJson('<xml/>', 'u')).toThrow(BldgHubApiError);
    expect(() => parseDataGoJson(JSON.stringify({ response: { header: { resultCode: '99', resultMsg: 'ERR' } } }), 'u')).toThrow(/resultCode 99/);
  });

  it('fetchBldgRecords — 키는 URL 에 인코딩·로그엔 마스킹, _type=json, totalCount 까지 페이징', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('pageNo'));
      return res(page === 1 ? ok({ item: [{ dongNm: '101', grndFlrCnt: '15' }, { dongNm: '102', grndFlrCnt: 12 }] }, 3, 1, 2) : ok({ item: { dongNm: '103', grndFlrCnt: '20' } }, 3, 2, 2));
    });
    const r = await fetchBldgRecords('title', PARAMS, { serviceKey: 'k==', fetchImpl, pageSize: 2 });
    expect(r.items.map((i) => i['dongNm'])).toEqual(['101', '102', '103']);
    expect(r.totalCount).toBe(3);
    expect(r.calls).toBe(2);
    expect(r.requestUrl).toContain('BldRgstHubService/getBrTitleInfo?serviceKey=***&sigunguCd=11110&bjdongCd=10100&platGbCd=0&bun=0056&ji=0045&numOfRows=2&pageNo=2&_type=json');
    const first = fetchImpl.mock.calls[0]![0] as string;
    expect(first).toContain('serviceKey=k%3D%3D&');
    expect(first).not.toContain('***');
  });

  it('게이트웨이 30 → BldgHubApiAuthError(재시도 없음), 5xx 는 재시도 뒤 성공', async () => {
    const auth = vi.fn(async () => res(gateway('30', 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR')));
    await expect(fetchBldgRecords('recap', PARAMS, { serviceKey: 'k', fetchImpl: auth })).rejects.toBeInstanceOf(BldgHubApiAuthError);
    expect(auth).toHaveBeenCalledTimes(1);

    let n = 0;
    const flaky = vi.fn(async () => {
      n += 1;
      return n === 1 ? res('<html>502</html>', 502) : res(ok({ item: [{ totPkngCnt: '120' }] }, 1));
    });
    const r = await fetchBldgRecords('recap', PARAMS, { serviceKey: 'k', fetchImpl: flaky, retryDelayMs: 1 });
    expect(r.items).toEqual([{ totPkngCnt: '120' }]);
    expect(flaky).toHaveBeenCalledTimes(2);

    const dead = vi.fn(async () => res('oops', 503));
    await expect(fetchBldgRecords('recap', PARAMS, { serviceKey: 'k', fetchImpl: dead, retries: 1, retryDelayMs: 1 })).rejects.toThrow(/HTTP 503/);
    expect(dead).toHaveBeenCalledTimes(2);
  });
});
