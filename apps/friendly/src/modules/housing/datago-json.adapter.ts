// data.go.kr JSON 게이트웨이 공통 클라이언트 — 집값 보강 어댑터(K-apt 단지 정보·건축HUB 건축물대장)가
// 공유한다. hira-hospital.adapter 와 같은 규약을 한 곳에 뽑아 둔 것:
//   - serviceKey 는 toServiceKeyPart(Encoding 키를 URLSearchParams 에 넣으면 이중 인코딩 → 30). 로깅/에러엔
//     키를 '***' 로 마스킹한 requestUrl 만.
//   - 정상: { response: { header:{ resultCode:'00'|'000' }, body:{ items, totalCount, pageNo, numOfRows } } }
//     items 는 배열 / { item: 배열|객체 } / ''(0건) / 단일 객체(body.item) — 다 배열로 접는다.
//   - 게이트웨이 봉투: { OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg, returnAuthMsg, returnReasonCode } } }
//     (HTTP 200/500/504) — 20/21/22/30/31/32/33 은 키·권한·쿼터 → DataGoAuthError(즉시 중단),
//     04 HTTP_ERROR / 05 SERVICETIMEOUT, HTTP 5xx, 타임아웃·네트워크는 일시 오류로 짧게 재시도.
// 라우트에서 쓰지 않는다 — 적재 스크립트·프로브 전용.

import { coerceStrOrNull, isObject } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 700;
const DEFAULT_RETRIES = 2;

const OK_RESULT_CODES = new Set(['00', '000']);
const NO_DATA_RESULT_CODES = new Set(['03', '003']);
const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
const RETRYABLE_REASON_CODES = new Set(['04', '05']);

export class DataGoApiError extends Error {
  readonly code: string | null;
  // 키를 '***' 로 마스킹한 요청 URL — 로깅용.
  readonly requestUrl: string | null;
  readonly responseText: string | null;

  constructor(
    message: string,
    opts: { code?: string | null; requestUrl?: string; responseText?: string; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'DataGoApiError';
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

// 키·권한·쿼터 오류 — 재시도·다음 항목 진행 무의미, 적재 즉시 중단.
export class DataGoAuthError extends DataGoApiError {
  constructor(message: string, opts: ConstructorParameters<typeof DataGoApiError>[1] = {}) {
    super(message, opts);
    this.name = 'DataGoAuthError';
  }
}

export interface DataGoPage {
  resultCode: string | null;
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  items: Record<string, unknown>[];
  // 마스킹된 요청 URL.
  requestUrl: string;
}

export type DataGoFetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface DataGoCallOptions {
  serviceKey: string;
  fetchImpl?: DataGoFetchLike;
  signal?: AbortSignal;
  timeoutMs?: number;
  // 일시 오류 재시도 횟수·간격(테스트 단축용).
  retries?: number;
  retryDelayMs?: number;
}

export const buildDataGoUrls = (
  endpoint: string,
  params: Record<string, string>,
  serviceKey: string,
): { fetchUrl: string; requestUrl: string } => {
  const qs = new URLSearchParams(params).toString();
  const prefix = `${endpoint}?serviceKey=`;
  const suffix = qs ? `&${qs}` : '';
  return { fetchUrl: `${prefix}${toServiceKeyPart(serviceKey)}${suffix}`, requestUrl: `${prefix}***${suffix}` };
};

// items 게이트웨이 버릇 — 배열 / {item: 배열|객체} / '' / body.item 단일 객체 → 배열.
export const narrowDataGoItems = (body: Record<string, unknown>): Record<string, unknown>[] => {
  const items = body['items'];
  if (Array.isArray(items)) return items.filter(isObject);
  if (isObject(items)) {
    if ('item' in items) {
      const item = items['item'];
      if (Array.isArray(item)) return item.filter(isObject);
      return isObject(item) ? [item] : [];
    }
    return Object.keys(items).length > 0 ? [items] : [];
  }
  const single = body['item'];
  if (Array.isArray(single)) return single.filter(isObject);
  return isObject(single) ? [single] : [];
};

const toInt = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export const parseDataGoJson = (text: string, requestUrl: string): DataGoPage => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DataGoApiError('data.go.kr 응답이 JSON 이 아닙니다(_type=json 미지원?)', {
      requestUrl,
      responseText: text.slice(0, 500),
    });
  }
  if (!isObject(json)) throw new DataGoApiError('data.go.kr 응답 형식 이상', { requestUrl, responseText: text.slice(0, 500) });

  const gw = json['OpenAPI_ServiceResponse'];
  if (isObject(gw)) {
    const header = isObject(gw['cmmMsgHeader']) ? gw['cmmMsgHeader'] : {};
    const reason = coerceStrOrNull(header['returnReasonCode']);
    const msg = coerceStrOrNull(header['returnAuthMsg']) ?? coerceStrOrNull(header['errMsg']) ?? '게이트웨이 오류';
    if (reason !== null && AUTH_REASON_CODES.has(reason)) {
      throw new DataGoAuthError(`data.go.kr 게이트웨이 ${reason}: ${msg}`, { code: reason, requestUrl });
    }
    throw new DataGoApiError(`data.go.kr 게이트웨이 ${reason ?? '?'}: ${msg}`, { code: reason, requestUrl });
  }

  const response = isObject(json['response']) ? json['response'] : null;
  const header = response && isObject(response['header']) ? response['header'] : null;
  const resultCode = header ? coerceStrOrNull(header['resultCode']) : null;
  if (resultCode !== null && !OK_RESULT_CODES.has(resultCode) && !NO_DATA_RESULT_CODES.has(resultCode)) {
    const msg = header ? (coerceStrOrNull(header['resultMsg']) ?? '') : '';
    throw new DataGoApiError(`data.go.kr resultCode ${resultCode}: ${msg}`, { code: resultCode, requestUrl });
  }
  const body = response && isObject(response['body']) ? response['body'] : {};
  return {
    resultCode,
    totalCount: toInt(body['totalCount']),
    pageNo: toInt(body['pageNo']),
    numOfRows: toInt(body['numOfRows']),
    items: resultCode !== null && NO_DATA_RESULT_CODES.has(resultCode) ? [] : narrowDataGoItems(body),
    requestUrl,
  };
};

// 일시 오류 판정 — 게이트웨이 04/05, HTTP 5xx, 타임아웃(Abort)·네트워크. 인증·파싱 오류는 즉시 던진다.
export const isDataGoTransient = (e: unknown): boolean => {
  if (e instanceof DataGoAuthError) return false;
  if (e instanceof DataGoApiError) {
    return (e.code !== null && RETRYABLE_REASON_CODES.has(e.code)) || /HTTP 5\d\d|시간초과|네트워크/.test(e.message);
  }
  return false;
};

// 한 페이지 GET — 일시 오류만 짧은 간격으로 재시도(기본 2회).
export const fetchDataGoJson = async (
  endpoint: string,
  params: Record<string, string>,
  opts: DataGoCallOptions,
): Promise<DataGoPage> => {
  const { fetchUrl, requestUrl } = buildDataGoUrls(endpoint, { ...params, _type: 'json' }, opts.serviceKey);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const once = async (): Promise<DataGoPage> => {
    const ac = opts.signal ? null : new AbortController();
    const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
    let res: Response;
    let text: string;
    try {
      res = await fetchImpl(fetchUrl, { signal: opts.signal ?? ac!.signal });
      text = await res.text();
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new DataGoApiError(aborted ? `data.go.kr 시간초과(${timeoutMs / 1000}s)` : 'data.go.kr 네트워크 오류', {
        requestUrl,
        cause: e,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res.ok && res.status >= 500) {
      try {
        return parseDataGoJson(text, requestUrl);
      } catch (e) {
        if (e instanceof DataGoAuthError) throw e;
        throw new DataGoApiError(`data.go.kr HTTP ${res.status}`, {
          code: e instanceof DataGoApiError ? e.code : null,
          requestUrl,
          responseText: text.slice(0, 500),
        });
      }
    }
    return parseDataGoJson(text, requestUrl);
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    try {
      return await once();
    } catch (e) {
      lastErr = e;
      if (!isDataGoTransient(e)) throw e;
    }
  }
  throw lastErr;
};
