// 국토교통부 실거래가 어댑터 — data.go.kr 1613000(RTMSDataSvc). HTTPS GET, serviceKey + LAWD_CD(법정동
// 시군구 5자리) + DEAL_YMD(계약년월 YYYYMM) + pageNo/numOfRows 쿼리스트링, 응답은 **XML**(JSON 미지원).
// 집값 거래 적재(load:housing-trades·월 스케줄러)와 프로브(probe:rtms)만 쓴다 — 라우트 없음.
// 오퍼레이션 2개:
//   trade  아파트 매매 실거래가 상세(15126468)  RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev
//   rent   아파트 전월세 실거래가(15126474)     RTMSDataSvcAptRent/getRTMSDataSvcAptRent
//
// 응답 모델(프로브 2026-08-30 실측, 종로구 202507):
//   정상: <response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
//         <body><items><item><aptNm>…</aptNm>…</item>…</items><numOfRows>…</numOfRows>
//         <pageNo>…</pageNo><totalCount>…</totalCount></body></response>
//     - resultCode 는 '000'(3자리 — 심평원 '00' 과 다르다). 0건은 items 가 비거나 없다.
//     - 빈 값은 공백 한 칸(' ')으로 온다(cdealType·aptDong 등) — 호출자가 trim 해 빈 문자열로 본다.
//     - 전월세는 태그 이름이 소문자(roadnm·roadnmsggcd…)로 오는 항목이 있다 — 정규화는 소문자 키로 찾는다.
//   게이트웨이 오류: <OpenAPI_ServiceResponse><cmmMsgHeader><errMsg/><returnAuthMsg/>
//         <returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse> (HTTP 200/500/504)
//     - 20/21/22/30/31/32/33 키·권한·쿼터 → RtmsApiAuthError(적재 즉시 중단, 재시도 무의미).
//     - 04 HTTP_ERROR / 05 SERVICETIMEOUT, HTTP 5xx, 타임아웃·네트워크 → 일시 오류 최대 2회 재시도.
//
// serviceKey 함정(data.go.kr 공통): Encoding 키(%XX)를 URLSearchParams 에 넣으면 이중 인코딩 → 30.
// bus-api.adapter 의 toServiceKeyPart 를 그대로 쓴다. 로깅/에러엔 키 마스킹 URL(requestUrl)만.
//
// XML 파서는 의존성 없이 정규식으로 — 이 API 의 XML 은 중첩 없는 <item> 안 단순 태그 목록뿐이다.

import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

export type RtmsOp = 'trade' | 'rent';
export const RTMS_OP_URL: Record<RtmsOp, string> = {
  trade: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  rent: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};
export const RTMS_OP_LABEL: Record<RtmsOp, string> = { trade: '아파트 매매', rent: '아파트 전월세' };

// 시군구·월 한 파티션이 수천 행(강남 3구 전월세 성수기 ~3,000)이라 한 번에 받도록 크게. 게이트웨이가
// 상한을 두면 items 길이로 페이지 수를 다시 계산한다(fetchRtmsPartition).
export const RTMS_PAGE_SIZE = 2000;
const MAX_PAGES = 100;
const FETCH_TIMEOUT_MS = 40_000;
const RETRY_DELAY_MS = 700;
const TRANSIENT_RETRIES = 2;

const OK_RESULT_CODES = new Set(['00', '000']);
const NO_DATA_RESULT_CODES = new Set(['03', '003']);
const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
const RETRYABLE_REASON_CODES = new Set(['04', '05']);

export class RtmsApiError extends Error {
  readonly code: string | null;
  // 키를 '***' 로 마스킹한 요청 URL — 로깅용.
  readonly requestUrl: string | null;
  readonly responseText: string | null;

  constructor(
    message: string,
    opts: { code?: string | null; requestUrl?: string; responseText?: string; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'RtmsApiError';
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

// 키·권한·쿼터 오류 — 재시도·다음 파티션 진행 무의미, 적재 즉시 중단.
export class RtmsApiAuthError extends RtmsApiError {
  constructor(message: string, opts: ConstructorParameters<typeof RtmsApiError>[1] = {}) {
    super(message, opts);
    this.name = 'RtmsApiAuthError';
  }
}

export interface RtmsPage {
  totalCount: number;
  pageNo: number;
  // 게이트웨이가 되돌린(적용한) 페이지 크기 — 요청값보다 작으면 상한이 있는 것.
  numOfRows: number;
  items: Record<string, string>[];
  requestUrl: string;
}

export interface RtmsApiCallOptions {
  serviceKey: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

export interface RtmsPageParams {
  op: RtmsOp;
  lawdCd: string;
  dealYmd: string;
  pageNo: number;
  numOfRows: number;
}

const buildUrls = (params: RtmsPageParams, serviceKey: string): { fetchUrl: string; requestUrl: string } => {
  const qs = new URLSearchParams({
    LAWD_CD: params.lawdCd,
    DEAL_YMD: params.dealYmd,
    pageNo: String(params.pageNo),
    numOfRows: String(params.numOfRows),
  }).toString();
  const prefix = `${RTMS_OP_URL[params.op]}?serviceKey=`;
  return {
    fetchUrl: `${prefix}${toServiceKeyPart(serviceKey)}&${qs}`,
    requestUrl: `${prefix}***&${qs}`,
  };
};

// ── XML 파싱 ──────────────────────────────────────────────────────────────────
const decodeXmlEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const unwrapText = (raw: string): string => {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return decodeXmlEntities(m ? m[1]! : raw).trim();
};

// 한 태그의 텍스트(첫 등장). 없으면 null.
const tagText = (xml: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return m ? unwrapText(m[1]!) : null;
};

// <item>…</item> 블록들 → 태그명→텍스트(trim) 맵 배열. 태그명 대소문자는 원문 그대로 둔다(정규화가
// 소문자 키로 찾는다). 빈 태그(<a/>)는 ''.
export const parseRtmsItems = (xml: string): Record<string, string>[] => {
  const out: Record<string, string>[] = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  const fieldRe = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<([A-Za-z_][\w.-]*)(?:\s[^>]*)?\/>/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(xml)) !== null) {
    const rec: Record<string, string> = {};
    let fm: RegExpExecArray | null;
    fieldRe.lastIndex = 0;
    while ((fm = fieldRe.exec(im[1]!)) !== null) {
      if (fm[1] !== undefined) rec[fm[1]] = unwrapText(fm[2] ?? '');
      else if (fm[3] !== undefined) rec[fm[3]] = '';
    }
    out.push(rec);
  }
  return out;
};

const parsePage = (text: string, requestUrl: string): RtmsPage => {
  const snippet = text.slice(0, 500);
  if (!/<\?xml|<response|<OpenAPI_ServiceResponse/i.test(text)) {
    throw new RtmsApiError('RTMS 응답이 XML 이 아닙니다', { requestUrl, responseText: snippet });
  }
  // 게이트웨이 오류 봉투.
  if (/<OpenAPI_ServiceResponse/i.test(text)) {
    const reason = tagText(text, 'returnReasonCode');
    const msg = tagText(text, 'returnAuthMsg') || tagText(text, 'errMsg') || '게이트웨이 오류';
    if (reason !== null && AUTH_REASON_CODES.has(reason)) {
      throw new RtmsApiAuthError(`RTMS 게이트웨이 ${reason}: ${msg}`, { code: reason, requestUrl, responseText: snippet });
    }
    throw new RtmsApiError(`RTMS 게이트웨이 ${reason ?? '?'}: ${msg}`, { code: reason, requestUrl, responseText: snippet });
  }
  const resultCode = tagText(text, 'resultCode');
  if (resultCode === null) {
    throw new RtmsApiError('RTMS 응답 형식 이상(resultCode 없음)', { requestUrl, responseText: snippet });
  }
  if (!OK_RESULT_CODES.has(resultCode) && !NO_DATA_RESULT_CODES.has(resultCode)) {
    const msg = tagText(text, 'resultMsg') ?? '';
    throw new RtmsApiError(`RTMS resultCode ${resultCode}: ${msg}`, { code: resultCode, requestUrl, responseText: snippet });
  }
  const totalCount = Number(tagText(text, 'totalCount') ?? 0);
  const pageNo = Number(tagText(text, 'pageNo') ?? 0);
  const numOfRows = Number(tagText(text, 'numOfRows') ?? 0);
  return {
    totalCount: Number.isFinite(totalCount) ? totalCount : 0,
    pageNo: Number.isFinite(pageNo) ? pageNo : 0,
    numOfRows: Number.isFinite(numOfRows) ? numOfRows : 0,
    items: parseRtmsItems(text),
    requestUrl,
  };
};

// 일시 오류 판정 — 게이트웨이 04/05, HTTP 5xx, 타임아웃(Abort)·네트워크. 인증·파싱 오류는 즉시 던진다.
const isTransient = (e: unknown): boolean => {
  if (e instanceof RtmsApiAuthError) return false;
  if (e instanceof RtmsApiError) {
    return (e.code !== null && RETRYABLE_REASON_CODES.has(e.code)) || /HTTP 5\d\d|시간초과|네트워크/.test(e.message);
  }
  return false;
};

// 한 페이지 조회 — 일시 오류만 짧은 간격으로 최대 2회 재시도.
export const fetchRtmsPage = async (params: RtmsPageParams, opts: RtmsApiCallOptions): Promise<RtmsPage> => {
  const { fetchUrl, requestUrl } = buildUrls(params, opts.serviceKey);
  const fetchImpl = opts.fetchImpl ?? fetch;

  const once = async (): Promise<RtmsPage> => {
    const ac = opts.signal ? null : new AbortController();
    const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
    let res: Response;
    let text: string;
    try {
      res = await fetchImpl(fetchUrl, { signal: opts.signal ?? ac!.signal });
      text = await res.text();
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      if (aborted && opts.signal?.aborted) throw e; // 호출자 취소 — 재시도 없이 그대로.
      throw new RtmsApiError(aborted ? `RTMS 시간초과(${FETCH_TIMEOUT_MS / 1000}s)` : 'RTMS 네트워크 오류', {
        requestUrl,
        cause: e,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res.ok && res.status >= 500) {
      // 봉투가 실려 있으면 코드 기반으로(504 SERVICETIMEOUT), 아니면 상태로.
      try {
        return parsePage(text, requestUrl);
      } catch (e) {
        if (e instanceof RtmsApiAuthError) throw e;
        throw new RtmsApiError(`RTMS HTTP ${res.status}`, {
          code: e instanceof RtmsApiError ? e.code : null,
          requestUrl,
          responseText: text.slice(0, 500),
        });
      }
    }
    if (!res.ok) {
      throw new RtmsApiError(`RTMS HTTP ${res.status}`, { requestUrl, responseText: text.slice(0, 500) });
    }
    return parsePage(text, requestUrl);
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    try {
      return await once();
    } catch (e) {
      lastErr = e;
      if (!isTransient(e)) throw e;
    }
  }
  throw lastErr;
};

export interface FetchRtmsPartitionOptions extends RtmsApiCallOptions {
  pageSize?: number;
  maxPages?: number;
  onPage?(p: { pageNo: number; fetched: number; totalCount: number }): void;
}

// 한 파티션(시군구 × 계약년월) 전량 — 첫 페이지의 실제 행수로 페이지 크기 상한을 알아내 totalCount
// 까지 순차 조회(동시 호출 없음). 빈 페이지·상한 도달이면 중단.
export const fetchRtmsPartition = async (
  op: RtmsOp,
  lawdCd: string,
  dealYmd: string,
  opts: FetchRtmsPartitionOptions,
): Promise<{ items: Record<string, string>[]; totalCount: number; pages: number; pageCap: number | null }> => {
  const pageSize = opts.pageSize ?? RTMS_PAGE_SIZE;
  const items: Record<string, string>[] = [];
  let totalCount = 0;
  let pageCap: number | null = null;
  let page = 1;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  for (; page <= maxPages; page += 1) {
    const res = await fetchRtmsPage({ op, lawdCd, dealYmd, pageNo: page, numOfRows: pageSize }, opts);
    totalCount = res.totalCount;
    items.push(...res.items);
    if (page === 1 && res.items.length > 0 && res.items.length < pageSize && res.items.length < totalCount) {
      pageCap = res.items.length;
    }
    opts.onPage?.({ pageNo: page, fetched: items.length, totalCount });
    if (res.items.length === 0 || items.length >= totalCount) break;
  }
  return { items, totalCount, pages: Math.min(page, maxPages), pageCap };
};
