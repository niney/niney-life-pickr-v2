// 기상청 날씨 API 어댑터 — data.go.kr 15084084 단기예보 조회서비스(VilageFcstInfoService_2.0)
// + 15059468 중기예보 조회서비스(MidFcstInfoService). HTTPS GET, serviceKey + 파라미터,
// dataType=JSON. 8개 오퍼레이션:
//   getUltraSrtNcst   초단기실황(정시 관측, 매시 :10 제공)       base_date/base_time/nx/ny
//   getUltraSrtFcst   초단기예보(6시간, 매시 :30 생성 :45 제공)     〃
//   getVilageFcst     단기예보(+3일, 02/05/…/23시 생성 +10분 제공) 〃
//   getFcstVersion    예보 버전(ftype ODAM/VSRT/SHRT + basedatetime)
//   getMidFcst        중기전망(stnId, tmFc 0600/1800)
//   getMidLandFcst    중기육상예보(regId, tmFc)
//   getMidTa          중기기온(regId, tmFc)
//   getMidSeaFcst     중기해상예보(regId, tmFc)
//
// 응답 모델(프로브 실측 2026-08-21):
//   정상: { response: { header:{resultCode:'00',resultMsg:'NORMAL_SERVICE'},
//                       body:{ dataType:'JSON', items:{ item:[...] }, pageNo, numOfRows, totalCount } } }
//     - 단기 계열 행: { baseDate, baseTime, category, nx, ny, obsrValue }(실황) /
//       { …, fcstDate, fcstTime, fcstValue }(예보). 값은 문자열(강수량은 "1mm 미만" 같은
//       범주 문자열), nx/ny 만 숫자.
//     - 중기 계열 행: 한 행에 rnSt4Am… / taMin4… / wf4Am… / wh4AAm… 가 가로로 실린다
//       (2026 현재 D+4~D+10; D+3 필드는 더 이상 오지 않는다). 값은 숫자 또는 문자열.
//     - 데이터 없음(아직 생성 전 슬롯·잘못된 날짜): HTTP 200 + resultCode '03' NO_DATA,
//       body 없음.
//   게이트웨이 오류: { OpenAPI_ServiceResponse: { cmmMsgHeader:{ errMsg, returnAuthMsg,
//                     returnReasonCode } } } — 키 미등록(30)은 HTTP 403 으로 왔다.
//
// 에어코리아 어댑터와 봉투 해석 규율이 같다(키 마스킹, 게이트웨이 04/05·5xx 1회 재시도,
// 20~33 은 503 인증 오류). data.go.kr 공통 serviceKey 함정(Encoding 키 이중 인코딩)도
// 같아 toServiceKeyPart 를 그대로 쓴다.

import { coerceStrOrNull, intOrNull, isObject, numOrNull } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

export const KMA_VILAGE_BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
export const KMA_MID_BASE_URL = 'https://apis.data.go.kr/1360000/MidFcstInfoService';
// 실측 응답은 수십~수백 ms(단기예보 798행 ≈1초). 게이트웨이 자체 타임아웃(~10초)을 받아
// 재시도할 여지를 두기 위해 에어코리아와 같은 20초.
const FETCH_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 700;
// 단기예보 한 base 는 최대 14항목 × ~70시각 ≈ 900행 — 1000 이면 1페이지.
export const KMA_PAGE_SIZE = 1000;

const OK_RESULT_CODE = '00';
// '03' NO_DATA — 아직 생성되지 않은 슬롯/없는 날짜. 빈 결과로 받는다(서비스가 폴백).
const NO_DATA_RESULT_CODES = new Set(['03']);
const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
const RETRYABLE_REASON_CODES = new Set(['04', '05']);

export class KmaApiError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  readonly requestUrl: string | null;
  readonly responseText: string | null;

  constructor(
    message: string,
    opts: {
      statusCode?: number;
      code?: string | null;
      requestUrl?: string;
      responseText?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'KmaApiError';
    this.statusCode = opts.statusCode ?? 502;
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

export class KmaApiAuthError extends KmaApiError {
  constructor(
    message: string,
    opts: { code?: string | null; requestUrl?: string; responseText?: string } = {},
  ) {
    super(message, { ...opts, statusCode: 503 });
    this.name = 'KmaApiAuthError';
  }
}

export interface KmaApiRequestOptions {
  serviceKey: string;
  signal?: AbortSignal;
}

export interface KmaCallResult {
  requestUrl: string;
  items: Record<string, unknown>[];
  totalCount: number | null;
  // NO_DATA(03) 로 빈 결과가 된 경우 true — 서비스가 "이전 슬롯 폴백" 판단에 쓴다.
  noData: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const buildUrls = (
  base: string,
  op: string,
  params: Record<string, string>,
  serviceKey: string,
): { fetchUrl: string; requestUrl: string } => {
  const sp = new URLSearchParams({ dataType: 'JSON', ...params });
  const qs = sp.toString();
  const prefix = `${base}/${op}?serviceKey=`;
  const suffix = qs ? `&${qs}` : '';
  return {
    fetchUrl: `${prefix}${toServiceKeyPart(serviceKey)}${suffix}`,
    requestUrl: `${prefix}***${suffix}`,
  };
};

const scrubKey = (s: string, serviceKey: string): string =>
  serviceKey ? s.split(serviceKey).join('***') : s;

interface RawHttpResult {
  status: number;
  rawText: string;
}

const httpGet = async (
  fetchUrl: string,
  requestUrl: string,
  opts: KmaApiRequestOptions,
): Promise<RawHttpResult> => {
  const ac = opts.signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    let res: Response;
    try {
      res = await fetch(fetchUrl, { signal: opts.signal ?? ac?.signal });
    } catch (e) {
      throw new KmaApiError(
        scrubKey(e instanceof Error ? `fetch 실패: ${e.message}` : 'fetch 실패', opts.serviceKey),
        { requestUrl, cause: e },
      );
    }
    let rawText: string;
    try {
      rawText = await res.text();
    } catch (e) {
      throw new KmaApiError(
        scrubKey(
          e instanceof Error ? `응답 본문 읽기 실패: ${e.message}` : '응답 본문 읽기 실패',
          opts.serviceKey,
        ),
        { requestUrl, cause: e },
      );
    }
    return { status: res.status, rawText };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const readGatewayError = (
  json: unknown,
): { reasonCode: string | null; authMsg: string | null; errMsg: string | null } | null => {
  if (!isObject(json)) return null;
  const envelope = json['OpenAPI_ServiceResponse'];
  if (!isObject(envelope)) return null;
  const header = envelope['cmmMsgHeader'];
  if (!isObject(header)) return null;
  return {
    reasonCode: coerceStrOrNull(header['returnReasonCode']),
    authMsg: coerceStrOrNull(header['returnAuthMsg']),
    errMsg: coerceStrOrNull(header['errMsg']),
  };
};

// 정상 봉투 — body.items.item(배열/단건/없음 모두 배열로).
const readResponse = (
  json: unknown,
): {
  resultCode: string | null;
  resultMsg: string | null;
  items: Record<string, unknown>[];
  totalCount: number | null;
} | null => {
  if (!isObject(json)) return null;
  const response = json['response'];
  if (!isObject(response)) return null;
  const header = isObject(response['header']) ? response['header'] : {};
  const body = isObject(response['body']) ? response['body'] : {};
  const itemsWrap = body['items'];
  const rawItems = isObject(itemsWrap) ? itemsWrap['item'] : itemsWrap;
  const items = Array.isArray(rawItems)
    ? rawItems.filter(isObject)
    : isObject(rawItems)
      ? [rawItems]
      : [];
  return {
    resultCode: coerceStrOrNull(header['resultCode']),
    resultMsg: coerceStrOrNull(header['resultMsg']),
    items,
    totalCount: intOrNull(body['totalCount']),
  };
};

const interpret = (
  http: RawHttpResult,
  requestUrl: string,
): { result: KmaCallResult } | { error: KmaApiError; retryable: boolean } => {
  let json: unknown;
  try {
    json = JSON.parse(http.rawText);
  } catch (e) {
    return {
      error: new KmaApiError(`응답 JSON 파싱 실패(HTTP ${http.status})`, {
        requestUrl,
        responseText: http.rawText,
        cause: e,
      }),
      retryable: http.status >= 500,
    };
  }

  const gw = readGatewayError(json);
  if (gw) {
    const detail = `${gw.reasonCode ?? '?'}: ${gw.authMsg ?? gw.errMsg ?? '알 수 없는 게이트웨이 오류'}`;
    if (gw.reasonCode && AUTH_REASON_CODES.has(gw.reasonCode)) {
      return {
        error: new KmaApiAuthError(`기상청 api 인증 실패(${detail})`, {
          code: gw.reasonCode,
          requestUrl,
          responseText: http.rawText,
        }),
        retryable: false,
      };
    }
    return {
      error: new KmaApiError(`기상청 api 게이트웨이 오류(${detail})`, {
        code: gw.reasonCode,
        requestUrl,
        responseText: http.rawText,
      }),
      retryable: gw.reasonCode !== null && RETRYABLE_REASON_CODES.has(gw.reasonCode),
    };
  }

  const parsed = readResponse(json);
  if (!parsed) {
    return {
      error: new KmaApiError(`기상청 api 응답 형식 불일치(HTTP ${http.status})`, {
        requestUrl,
        responseText: http.rawText,
      }),
      retryable: http.status >= 500,
    };
  }
  if (parsed.resultCode !== OK_RESULT_CODE) {
    if (parsed.resultCode !== null && NO_DATA_RESULT_CODES.has(parsed.resultCode)) {
      return { result: { requestUrl, items: [], totalCount: 0, noData: true } };
    }
    return {
      error: new KmaApiError(
        `기상청 api 오류(${parsed.resultCode ?? '?'}: ${parsed.resultMsg ?? '알 수 없는 응답'})`,
        { code: parsed.resultCode, requestUrl, responseText: http.rawText },
      ),
      retryable: false,
    };
  }
  return { result: { requestUrl, items: parsed.items, totalCount: parsed.totalCount, noData: false } };
};

// 단일 오퍼레이션 1페이지 호출 — 게이트웨이 타임아웃/5xx 1회 재시도.
export const callKmaApi = async (
  base: string,
  op: string,
  params: Record<string, string>,
  opts: KmaApiRequestOptions,
): Promise<KmaCallResult> => {
  const { fetchUrl, requestUrl } = buildUrls(base, op, params, opts.serviceKey);
  let lastError: KmaApiError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const http = await httpGet(fetchUrl, requestUrl, opts);
    const outcome = interpret(http, requestUrl);
    if ('result' in outcome) return outcome.result;
    lastError = outcome.error;
    if (!outcome.retryable) break;
  }
  throw lastError ?? new KmaApiError('기상청 api 호출 실패', { requestUrl });
};

// ── 원시 행 ───────────────────────────────────────────────────────────────────

// 단기예보 계열 공통 행 — 실황은 obsrValue, 예보는 fcstDate/fcstTime/fcstValue. 값은
// 문자열 그대로(정규화는 서비스).
export interface RawKmaFcstRow {
  baseDate: string | null;
  baseTime: string | null;
  category: string | null;
  nx: number | null;
  ny: number | null;
  // 실황 전용
  obsrValue: string | null;
  // 예보 전용
  fcstDate: string | null;
  fcstTime: string | null;
  fcstValue: string | null;
}

const toFcstRow = (o: Record<string, unknown>): RawKmaFcstRow => ({
  baseDate: coerceStrOrNull(o['baseDate']),
  baseTime: coerceStrOrNull(o['baseTime']),
  category: coerceStrOrNull(o['category']),
  nx: intOrNull(o['nx']),
  ny: intOrNull(o['ny']),
  obsrValue: coerceStrOrNull(o['obsrValue']),
  fcstDate: coerceStrOrNull(o['fcstDate']),
  fcstTime: coerceStrOrNull(o['fcstTime']),
  fcstValue: coerceStrOrNull(o['fcstValue']),
});

export interface KmaGridBaseParams {
  baseDate: string; // YYYYMMDD
  baseTime: string; // HHMM
  nx: number;
  ny: number;
}

const gridParams = (p: KmaGridBaseParams): Record<string, string> => ({
  base_date: p.baseDate,
  base_time: p.baseTime,
  nx: String(p.nx),
  ny: String(p.ny),
  numOfRows: String(KMA_PAGE_SIZE),
  pageNo: '1',
});

export interface KmaFcstCall {
  rows: RawKmaFcstRow[];
  noData: boolean;
}

// 초단기실황 — 8항목(T1H RN1 UUU VVV REH PTY VEC WSD) 1시각.
export const getUltraSrtNcst = async (
  p: KmaGridBaseParams,
  opts: KmaApiRequestOptions,
): Promise<KmaFcstCall> => {
  const res = await callKmaApi(KMA_VILAGE_BASE_URL, 'getUltraSrtNcst', gridParams(p), opts);
  return { rows: res.items.map(toFcstRow), noData: res.noData };
};

// 초단기예보 — 11항목 × 6시각(실측 66행, POP 포함).
export const getUltraSrtFcst = async (
  p: KmaGridBaseParams,
  opts: KmaApiRequestOptions,
): Promise<KmaFcstCall> => {
  const res = await callKmaApi(KMA_VILAGE_BASE_URL, 'getUltraSrtFcst', gridParams(p), opts);
  return { rows: res.items.map(toFcstRow), noData: res.noData };
};

// 단기예보 — 14항목 × ~70시각(실측 798행, 1페이지).
export const getVilageFcst = async (
  p: KmaGridBaseParams,
  opts: KmaApiRequestOptions,
): Promise<KmaFcstCall & { totalCount: number | null }> => {
  const res = await callKmaApi(KMA_VILAGE_BASE_URL, 'getVilageFcst', gridParams(p), opts);
  return { rows: res.items.map(toFcstRow), noData: res.noData, totalCount: res.totalCount };
};

export interface RawKmaVersionRow {
  filetype: string | null;
  version: string | null; // "YYYYMMDDHHmmss"
}

// 예보 버전 — ftype ODAM(실황)/VSRT(초단기예보)/SHRT(단기예보), basedatetime YYYYMMDDHHmm.
export const getFcstVersion = async (
  ftype: 'ODAM' | 'VSRT' | 'SHRT',
  basedatetime: string,
  opts: KmaApiRequestOptions,
): Promise<RawKmaVersionRow[]> => {
  const res = await callKmaApi(
    KMA_VILAGE_BASE_URL,
    'getFcstVersion',
    { ftype, basedatetime, numOfRows: '10', pageNo: '1' },
    opts,
  );
  return res.items.map((o) => ({
    filetype: coerceStrOrNull(o['filetype']),
    version: coerceStrOrNull(o['version']),
  }));
};

// ── 중기예보 ──────────────────────────────────────────────────────────────────
// 한 행에 가로로 실리는 필드를 키→값 맵으로 보존(문자열/숫자 그대로). 어떤 day 범위가
// 오는지(D+3 포함 여부)는 서비스가 키를 보고 판정한다.

export interface RawKmaMidRow {
  regId: string | null;
  // wf*/rnSt*/taMin*/wh* 등 — 숫자는 숫자로, 문자열은 문자열로.
  fields: Record<string, string | number | null>;
}

const toMidRow = (o: Record<string, unknown>): RawKmaMidRow => {
  const fields: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'regId') continue;
    if (typeof v === 'number') fields[k] = v;
    else if (typeof v === 'string') {
      const n = numOrNull(v);
      fields[k] = v.trim() === '' ? null : n !== null && /^-?\d+(\.\d+)?$/.test(v.trim()) ? n : v;
    } else fields[k] = null;
  }
  return { regId: coerceStrOrNull(o['regId']), fields };
};

export interface KmaMidCall {
  rows: RawKmaMidRow[];
  noData: boolean;
}

const midParams = (extra: Record<string, string>, tmFc: string): Record<string, string> => ({
  ...extra,
  tmFc,
  numOfRows: '10',
  pageNo: '1',
});

// 중기전망 — wfSv(텍스트) 1행.
export const getMidFcst = async (
  stnId: string,
  tmFc: string,
  opts: KmaApiRequestOptions,
): Promise<KmaMidCall> => {
  const res = await callKmaApi(KMA_MID_BASE_URL, 'getMidFcst', midParams({ stnId }, tmFc), opts);
  return { rows: res.items.map(toMidRow), noData: res.noData };
};

// 중기육상예보 — rnSt4Am…rnSt10 / wf4Am…wf10.
export const getMidLandFcst = async (
  regId: string,
  tmFc: string,
  opts: KmaApiRequestOptions,
): Promise<KmaMidCall> => {
  const res = await callKmaApi(KMA_MID_BASE_URL, 'getMidLandFcst', midParams({ regId }, tmFc), opts);
  return { rows: res.items.map(toMidRow), noData: res.noData };
};

// 중기기온 — taMin4/taMin4Low/taMin4High … taMax10High.
export const getMidTa = async (
  regId: string,
  tmFc: string,
  opts: KmaApiRequestOptions,
): Promise<KmaMidCall> => {
  const res = await callKmaApi(KMA_MID_BASE_URL, 'getMidTa', midParams({ regId }, tmFc), opts);
  return { rows: res.items.map(toMidRow), noData: res.noData };
};

// 중기해상예보 — wf4Am…wf10 / wh4AAm(최저)·wh4BAm(최고) … wh10A·wh10B.
export const getMidSeaFcst = async (
  regId: string,
  tmFc: string,
  opts: KmaApiRequestOptions,
): Promise<KmaMidCall> => {
  const res = await callKmaApi(KMA_MID_BASE_URL, 'getMidSeaFcst', midParams({ regId }, tmFc), opts);
  return { rows: res.items.map(toMidRow), noData: res.noData };
};
