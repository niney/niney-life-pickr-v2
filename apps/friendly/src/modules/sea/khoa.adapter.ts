// 국립해양조사원(KHOA) 오픈API 어댑터 — data.go.kr `apis.data.go.kr/1192136/...`. HTTPS GET, serviceKey +
// type=json. 생활해양예보지수 6종·조석예보(고·저조)·이안류 지수가 같은 봉투를 쓴다.
//
// 응답 모델(프로브 실측 2026-09-24):
//   정상: { header:{resultCode:'00',resultMsg:'NORMAL_SERVICE'}, body:{ items:{ item:[...] }, pageNo, numOfRows,
//          totalCount, type } } — 기상청과 달리 `response` 감싸개가 없다. 숫자는 숫자 또는 숫자 문자열이 섞인다.
//   필수 파라미터 누락: { header:{resultCode:'11', ...} } / 잘못된 값: '10'. 데이터 없음: '03'(빈 결과로 받는다).
//   게이트웨이 오류: { OpenAPI_ServiceResponse:{ cmmMsgHeader:{ returnReasonCode, ... } } } — 미신청 키(30)는 HTTP 403.
//
// data.go.kr 공통 함정(Encoding 키 이중 인코딩)은 toServiceKeyPart 로 피한다. 게이트웨이 04/05·5xx 는 1회 재시도,
// 20~33 은 503(인증·쿼터).

import { coerceStrOrNull, intOrNull, isObject } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

export const KHOA_BASE_URL = 'https://apis.data.go.kr/1192136';
const FETCH_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 700;
// 한 페이지 최대 300행(가이드). 가장 큰 바다낚시가 1,750행 = 6페이지.
export const KHOA_PAGE_SIZE = 300;
const MAX_PAGES = 20;

const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
const RETRYABLE_REASON_CODES = new Set(['04', '05']);

export class KhoaApiError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  readonly requestUrl: string | null;
  readonly responseText: string | null;

  constructor(
    message: string,
    opts: { statusCode?: number; code?: string | null; requestUrl?: string; responseText?: string; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'KhoaApiError';
    this.statusCode = opts.statusCode ?? 502;
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

export interface KhoaCallOptions {
  serviceKey: string;
  signal?: AbortSignal;
}

export interface KhoaPage {
  items: Record<string, unknown>[];
  totalCount: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const scrubKey = (s: string, key: string): string => (key ? s.split(key).join('***') : s);

// 봉투 해석 — 정상이면 page, 아니면 { error, retryable }.
export const interpretKhoaResponse = (
  status: number,
  rawText: string,
  requestUrl: string,
): { page: KhoaPage } | { error: KhoaApiError; retryable: boolean } => {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    return {
      error: new KhoaApiError(`해양조사원 api 응답 JSON 파싱 실패(HTTP ${status})`, { requestUrl, responseText: rawText, cause: e }),
      retryable: status >= 500,
    };
  }
  if (!isObject(json)) {
    return { error: new KhoaApiError('해양조사원 api 응답 형식 불일치', { requestUrl, responseText: rawText }), retryable: false };
  }
  const gw = isObject(json['OpenAPI_ServiceResponse']) ? json['OpenAPI_ServiceResponse'] : null;
  if (gw) {
    const header = isObject(gw['cmmMsgHeader']) ? gw['cmmMsgHeader'] : {};
    const code = coerceStrOrNull(header['returnReasonCode']);
    const detail = `${code ?? '?'}: ${coerceStrOrNull(header['returnAuthMsg']) ?? coerceStrOrNull(header['errMsg']) ?? '게이트웨이 오류'}`;
    if (code && AUTH_REASON_CODES.has(code)) {
      return {
        error: new KhoaApiError(`해양조사원 api 인증 실패(${detail})`, { statusCode: 503, code, requestUrl, responseText: rawText }),
        retryable: false,
      };
    }
    return {
      error: new KhoaApiError(`해양조사원 api 게이트웨이 오류(${detail})`, { code, requestUrl, responseText: rawText }),
      retryable: code !== null && RETRYABLE_REASON_CODES.has(code),
    };
  }
  const header = isObject(json['header']) ? json['header'] : {};
  const resultCode = coerceStrOrNull(header['resultCode']);
  if (resultCode === '03') return { page: { items: [], totalCount: 0 } };
  if (resultCode !== '00') {
    return {
      error: new KhoaApiError(`해양조사원 api 오류(${resultCode ?? '?'}: ${coerceStrOrNull(header['resultMsg']) ?? '알 수 없는 응답'})`, {
        code: resultCode,
        requestUrl,
        responseText: rawText,
      }),
      retryable: false,
    };
  }
  const body = isObject(json['body']) ? json['body'] : {};
  const wrap = body['items'];
  const raw = isObject(wrap) ? wrap['item'] : wrap;
  const items = Array.isArray(raw) ? raw.filter(isObject) : isObject(raw) ? [raw] : [];
  return { page: { items, totalCount: intOrNull(body['totalCount']) ?? items.length } };
};

// 한 페이지 — 타임아웃 20초, 재시도 1회.
export const callKhoaPage = async (path: string, params: Record<string, string>, opts: KhoaCallOptions): Promise<KhoaPage> => {
  const qs = new URLSearchParams({ type: 'json', ...params }).toString();
  const prefix = `${KHOA_BASE_URL}/${path}?serviceKey=`;
  const fetchUrl = `${prefix}${toServiceKeyPart(opts.serviceKey)}&${qs}`;
  const requestUrl = `${prefix}***&${qs}`;
  let last: KhoaApiError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const ac = opts.signal ? null : new AbortController();
    const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
    let status: number;
    let text: string;
    try {
      const res = await fetch(fetchUrl, { signal: opts.signal ?? ac?.signal });
      status = res.status;
      text = await res.text();
    } catch (e) {
      last = new KhoaApiError(scrubKey(e instanceof Error ? `fetch 실패: ${e.message}` : 'fetch 실패', opts.serviceKey), { requestUrl, cause: e });
      continue;
    } finally {
      if (timer) clearTimeout(timer);
    }
    const out = interpretKhoaResponse(status, text, requestUrl);
    if ('page' in out) return out.page;
    last = out.error;
    if (!out.retryable) break;
  }
  throw last ?? new KhoaApiError('해양조사원 api 호출 실패', { requestUrl });
};

// 전 페이지 — totalCount 까지 KHOA_PAGE_SIZE 로 넘긴다(상한 MAX_PAGES).
export const callKhoaAll = async (
  path: string,
  params: Record<string, string>,
  opts: KhoaCallOptions,
  callPage: typeof callKhoaPage = callKhoaPage,
): Promise<Record<string, unknown>[]> => {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const p = await callPage(path, { ...params, numOfRows: String(KHOA_PAGE_SIZE), pageNo: String(page) }, opts);
    out.push(...p.items);
    if (p.items.length === 0 || out.length >= p.totalCount) break;
  }
  return out;
};

// ── 오퍼레이션 경로 ────────────────────────────────────────────────────────────
export const KHOA_PATHS = {
  beach: 'fcstBeachv2/GetFcstBeachApiServicev2',
  surf: 'fcstSurfingv2/GetFcstSurfingApiServicev2',
  // gubun(갯바위|선상) 필수지만 값과 무관하게 같은 전량(1,750행)이 온다(2026-09-24 실측) — 한 번만 부른다.
  fishing: 'fcstFishingv2/GetFcstFishingApiServicev2',
  mudflat: 'fcstMudflatv2/GetFcstMudflatApiServicev2',
  seaSplit: 'fcstSeaSplitv2/GetFcstSeaSplitApiServicev2',
  seaTrip: 'fcstSeaTripv2/GetFcstSeaTripApiServicev2',
  tide: 'tideFcstHghLw/GetTideFcstHghLwApiService',
  rip: 'ripCurrent/GetRipCurrentApiService',
} as const;
