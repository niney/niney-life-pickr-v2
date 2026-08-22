// 음식 카탈로그 외부 소스 어댑터 — 배치 적재 전용(요청 경로에서 호출하지 않는다).
//
// (1) 식약처 전국통합식품영양성분정보(음식) 표준데이터 — data.go.kr 15100070
//     GET https://api.data.go.kr/openapi/tn_pubr_public_nutri_food_info_api
//         ?serviceKey=…&pageNo=1&numOfRows=1000&type=json[&foodLv3Nm=밥류…]
//     응답(표준데이터 공통 봉투, 0차 프로브로 실측 확정 예정):
//       { response: { header:{resultCode:'00',resultMsg:'NORMAL_SERVICE'},
//                     body:{ items:[{ foodCd, foodNm, foodLv3Nm, foodLv4Nm, foodOriginNm, enerc, …, foodSize }],
//                            totalCount, numOfRows, pageNo } } }
//       게이트웨이 오류: { OpenAPI_ServiceResponse: { cmmMsgHeader:{ errMsg, returnAuthMsg, returnReasonCode } } }
//       — 에어코리아와 같은 모델(30 키 미등록 / 22 일일한도 → 503, 04/05 → 1회 재시도).
//     numOfRows 최대 1000, 개발계정 10,000/일(음식 19,495행 = 20콜).
// (2) 식품안전나라 조리식품의 레시피 DB COOKRCP01
//     GET http://openapi.foodsafetykorea.go.kr/api/{key}/COOKRCP01/json/{start}/{end}
//     응답: { COOKRCP01: { total_count:'1156', row:[{ RCP_SEQ, RCP_NM, RCP_WAY2, RCP_PAT2, INFO_WGT, INFO_ENG,
//            INFO_CAR, INFO_PRO, INFO_FAT, INFO_NA, HASH_TAG, ATT_FILE_NO_MAIN, RCP_PARTS_DTLS, MANUAL01… }],
//            RESULT:{ MSG, CODE:'INFO-000' } } }  — 오류는 최상위 RESULT.CODE('ERROR-3xx'), 빈 결과 INFO-200.
//     1회 최대 1,000건, 1,000회/일. 키는 URL path 에 들어간다(마스킹 필수).
// (3) 농림수산식품교육문화정보원 레시피 기본/재료 (data.mafra.go.kr 키)
//     GET http://211.237.50.150:7080/openapi/{key}/json/Grid_20150827000000000226_1/{start}/{end}  (기본 537)
//     GET …/Grid_20150827000000000227_1/{start}/{end}                                        (재료 6,104)
//     응답: { Grid_…: { totalCnt, startRow, endRow, result:{code:'INFO-000',message}, row:[…] } }
//     평문 HTTP + IP 주소 — 서버 배치 수집만. 기능별 1,000회/일.
//
// 공통 규율(에어코리아·버스 어댑터 이식): fetchUrl/requestUrl 이중 빌드(키 마스킹), 자체 20초
// 타임아웃(clearTimeout 은 text() 뒤), 응답 본문 코드로 에러 분류, 키 평문은 예외 메시지에서 scrub.

import { coerceStrOrNull, intOrNull, isObject } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

export const MFDS_NUTRITION_BASE_URL =
  'https://api.data.go.kr/openapi/tn_pubr_public_nutri_food_info_api';
export const MFDS_NUTRITION_PAGE_SIZE = 1000;
// 음식 19,495행(2026-04) → 20페이지. 가공식품(30만)은 대상이 아니므로 40에서 절단(쿼터 보호).
export const MFDS_NUTRITION_MAX_PAGES = 40;

export const MFDS_RECIPE_BASE_URL = 'http://openapi.foodsafetykorea.go.kr/api';
export const MFDS_RECIPE_SERVICE = 'COOKRCP01';
export const MFDS_RECIPE_PAGE_SIZE = 1000;
export const MFDS_RECIPE_MAX_PAGES = 5;

export const MAFRA_BASE_URL = 'http://211.237.50.150:7080/openapi';
export const MAFRA_RECIPE_GRID = 'Grid_20150827000000000226_1';
export const MAFRA_INGREDIENT_GRID = 'Grid_20150827000000000227_1';
export const MAFRA_PAGE_SIZE = 1000;
export const MAFRA_MAX_PAGES = 10;

const FETCH_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 700;

// data.go.kr 게이트웨이 — 우리 측(키/권한/쿼터) 이슈 → 503.
const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
// 게이트웨이 HTTP_ERROR(04)/SERVICETIMEOUT(05) → 1회 재시도.
const RETRYABLE_REASON_CODES = new Set(['04', '05']);
const OK_RESULT_CODE = '00';
const NO_DATA_RESULT_CODES = new Set(['03']);

export class FoodApiError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  // 키 마스킹 요청 URL — 로깅용.
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
    this.name = 'FoodApiError';
    this.statusCode = opts.statusCode ?? 502;
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

export class FoodApiAuthError extends FoodApiError {
  constructor(
    message: string,
    opts: { code?: string | null; requestUrl?: string; responseText?: string } = {},
  ) {
    super(message, { ...opts, statusCode: 503 });
    this.name = 'FoodApiAuthError';
  }
}

export interface FoodApiRequestOptions {
  serviceKey: string;
  signal?: AbortSignal;
}

export interface FoodApiPage {
  requestUrl: string;
  items: Record<string, unknown>[];
  totalCount: number | null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const scrubKey = (s: string, serviceKey: string): string =>
  serviceKey ? s.split(serviceKey).join('***') : s;

interface RawHttpResult {
  status: number;
  rawText: string;
}

const httpGet = async (
  fetchUrl: string,
  requestUrl: string,
  opts: FoodApiRequestOptions,
): Promise<RawHttpResult> => {
  const ac = opts.signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    let res: Response;
    try {
      res = await fetch(fetchUrl, { signal: opts.signal ?? ac?.signal });
    } catch (e) {
      throw new FoodApiError(
        scrubKey(e instanceof Error ? `fetch 실패: ${e.message}` : 'fetch 실패', opts.serviceKey),
        { requestUrl, cause: e },
      );
    }
    let rawText: string;
    try {
      rawText = await res.text();
    } catch (e) {
      throw new FoodApiError(
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

const parseJson = (
  http: RawHttpResult,
  requestUrl: string,
  label: string,
): { json: unknown } | { error: FoodApiError; retryable: boolean } => {
  try {
    return { json: JSON.parse(http.rawText) };
  } catch (e) {
    return {
      error: new FoodApiError(`${label} 응답 JSON 파싱 실패(HTTP ${http.status})`, {
        requestUrl,
        responseText: http.rawText.slice(0, 2000),
        cause: e,
      }),
      retryable: http.status >= 500,
    };
  }
};

// 1회 재시도 루프 — interpret 가 retryable 을 돌려주면 RETRY_DELAY_MS 뒤 한 번 더.
const callWithRetry = async (
  fetchUrl: string,
  requestUrl: string,
  opts: FoodApiRequestOptions,
  interpret: (http: RawHttpResult) => { result: FoodApiPage } | { error: FoodApiError; retryable: boolean },
  label: string,
): Promise<FoodApiPage> => {
  let lastError: FoodApiError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const http = await httpGet(fetchUrl, requestUrl, opts);
    const outcome = interpret(http);
    if ('result' in outcome) return outcome.result;
    lastError = outcome.error;
    if (!outcome.retryable) break;
  }
  throw lastError ?? new FoodApiError(`${label} 호출 실패`, { requestUrl });
};

// ── (1) 식약처 영양성분 표준데이터 ───────────────────────────────────────────

const buildMfdsNutritionUrls = (
  params: Record<string, string>,
  serviceKey: string,
): { fetchUrl: string; requestUrl: string } => {
  const qs = new URLSearchParams({ type: 'json', ...params }).toString();
  const prefix = `${MFDS_NUTRITION_BASE_URL}?serviceKey=`;
  const suffix = qs ? `&${qs}` : '';
  return {
    fetchUrl: `${prefix}${toServiceKeyPart(serviceKey)}${suffix}`,
    requestUrl: `${prefix}***${suffix}`,
  };
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

// 표준데이터 봉투 — body.items 가 배열 / {item:[…]} / 단건 객체 / 빈 문자열 어느 쪽이어도 배열로.
const readStandardResponse = (
  json: unknown,
): { resultCode: string | null; resultMsg: string | null; items: Record<string, unknown>[]; totalCount: number | null } | null => {
  if (!isObject(json)) return null;
  const response = json['response'];
  if (!isObject(response)) return null;
  const header = isObject(response['header']) ? response['header'] : {};
  const body = isObject(response['body']) ? response['body'] : {};
  let rawItems: unknown = body['items'];
  if (isObject(rawItems) && 'item' in rawItems) rawItems = rawItems['item'];
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

const interpretMfdsNutrition = (
  http: RawHttpResult,
  requestUrl: string,
): { result: FoodApiPage } | { error: FoodApiError; retryable: boolean } => {
  const parsed = parseJson(http, requestUrl, '식약처 영양성분');
  if ('error' in parsed) return parsed;
  const json = parsed.json;

  const gw = readGatewayError(json);
  if (gw) {
    const detail = `${gw.reasonCode ?? '?'}: ${gw.authMsg ?? gw.errMsg ?? '알 수 없는 게이트웨이 오류'}`;
    if (gw.reasonCode && AUTH_REASON_CODES.has(gw.reasonCode)) {
      return {
        error: new FoodApiAuthError(`식약처 영양성분 api 인증 실패(${detail})`, {
          code: gw.reasonCode,
          requestUrl,
          responseText: http.rawText.slice(0, 2000),
        }),
        retryable: false,
      };
    }
    return {
      error: new FoodApiError(`식약처 영양성분 api 게이트웨이 오류(${detail})`, {
        code: gw.reasonCode,
        requestUrl,
        responseText: http.rawText.slice(0, 2000),
      }),
      retryable: gw.reasonCode !== null && RETRYABLE_REASON_CODES.has(gw.reasonCode),
    };
  }

  const std = readStandardResponse(json);
  if (!std) {
    return {
      error: new FoodApiError(`식약처 영양성분 api 응답 형식 불일치(HTTP ${http.status})`, {
        requestUrl,
        responseText: http.rawText.slice(0, 2000),
      }),
      retryable: http.status >= 500,
    };
  }
  if (std.resultCode !== null && std.resultCode !== OK_RESULT_CODE) {
    if (NO_DATA_RESULT_CODES.has(std.resultCode)) {
      return { result: { requestUrl, items: [], totalCount: 0 } };
    }
    return {
      error: new FoodApiError(
        `식약처 영양성분 api 오류(${std.resultCode}: ${std.resultMsg ?? '알 수 없는 응답'})`,
        { code: std.resultCode, requestUrl, responseText: http.rawText.slice(0, 2000) },
      ),
      retryable: false,
    };
  }
  return { result: { requestUrl, items: std.items, totalCount: std.totalCount } };
};

// 1페이지. filters 는 컬럼명=값(예: { foodLv3Nm: '밥류' }) — 표준데이터 API 는 모든 컬럼을 필터로 받는다.
export const fetchMfdsNutritionPage = async (
  page: number,
  opts: FoodApiRequestOptions,
  filters: Record<string, string> = {},
  numOfRows: number = MFDS_NUTRITION_PAGE_SIZE,
): Promise<FoodApiPage> => {
  const { fetchUrl, requestUrl } = buildMfdsNutritionUrls(
    { ...filters, pageNo: String(page), numOfRows: String(numOfRows) },
    opts.serviceKey,
  );
  return callWithRetry(
    fetchUrl,
    requestUrl,
    opts,
    (http) => interpretMfdsNutrition(http, requestUrl),
    '식약처 영양성분 api',
  );
};

export interface FetchAllOptions {
  // 페이지마다 호출 — 진행 표시용.
  onPage?: (info: { page: number; fetched: number; totalCount: number | null }) => void;
}

// 전량 — totalCount 까지 페이지를 이어 받는다(상한 MFDS_NUTRITION_MAX_PAGES). 짧은 페이지/빈 페이지면 종료.
export const fetchAllMfdsNutrition = async (
  opts: FoodApiRequestOptions,
  filters: Record<string, string> = {},
  hooks: FetchAllOptions = {},
): Promise<{ items: Record<string, unknown>[]; totalCount: number | null; pages: number }> => {
  const items: Record<string, unknown>[] = [];
  let totalCount: number | null = null;
  let page = 1;
  for (; page <= MFDS_NUTRITION_MAX_PAGES; page++) {
    const res = await fetchMfdsNutritionPage(page, opts, filters);
    items.push(...res.items);
    totalCount = res.totalCount;
    hooks.onPage?.({ page, fetched: items.length, totalCount });
    const done =
      res.items.length === 0 ||
      res.items.length < MFDS_NUTRITION_PAGE_SIZE ||
      (totalCount !== null && items.length >= totalCount);
    if (done) break;
  }
  return { items, totalCount, pages: Math.min(page, MFDS_NUTRITION_MAX_PAGES) };
};

// ── (2) 식품안전나라 레시피 DB COOKRCP01 ─────────────────────────────────────

const buildMfdsRecipeUrls = (
  start: number,
  end: number,
  serviceKey: string,
): { fetchUrl: string; requestUrl: string } => {
  const tail = `/${MFDS_RECIPE_SERVICE}/json/${start}/${end}`;
  return {
    fetchUrl: `${MFDS_RECIPE_BASE_URL}/${encodeURIComponent(serviceKey)}${tail}`,
    requestUrl: `${MFDS_RECIPE_BASE_URL}/***${tail}`,
  };
};

// 식품안전나라 봉투: { COOKRCP01:{ total_count, row:[…], RESULT:{CODE,MSG} } } 또는 최상위 { RESULT:{CODE,MSG} }.
const interpretMfdsRecipe = (
  http: RawHttpResult,
  requestUrl: string,
): { result: FoodApiPage } | { error: FoodApiError; retryable: boolean } => {
  const parsed = parseJson(http, requestUrl, '식약처 레시피');
  if ('error' in parsed) return parsed;
  const json = parsed.json;
  if (!isObject(json)) {
    return {
      error: new FoodApiError(`식약처 레시피 api 응답 형식 불일치(HTTP ${http.status})`, {
        requestUrl,
        responseText: http.rawText.slice(0, 2000),
      }),
      retryable: http.status >= 500,
    };
  }
  const svc = json[MFDS_RECIPE_SERVICE];
  const topResult = isObject(json['RESULT']) ? json['RESULT'] : null;
  if (!isObject(svc)) {
    const code = topResult ? coerceStrOrNull(topResult['CODE']) : null;
    const msg = topResult ? coerceStrOrNull(topResult['MSG']) : null;
    if (code === 'INFO-200') return { result: { requestUrl, items: [], totalCount: 0 } };
    const isAuth = code !== null && /^ERROR-(300|301|310|331|336|337)$/.test(code);
    const Err = isAuth ? FoodApiAuthError : FoodApiError;
    return {
      error: new Err(`식약처 레시피 api 오류(${code ?? '?'}: ${msg ?? '알 수 없는 응답'})`, {
        code,
        requestUrl,
        responseText: http.rawText.slice(0, 2000),
      }),
      retryable: false,
    };
  }
  const result = isObject(svc['RESULT']) ? svc['RESULT'] : null;
  const code = result ? coerceStrOrNull(result['CODE']) : null;
  if (code && code !== 'INFO-000') {
    if (code === 'INFO-200') return { result: { requestUrl, items: [], totalCount: 0 } };
    return {
      error: new FoodApiError(
        `식약처 레시피 api 오류(${code}: ${result ? (coerceStrOrNull(result['MSG']) ?? '') : ''})`,
        { code, requestUrl, responseText: http.rawText.slice(0, 2000) },
      ),
      retryable: false,
    };
  }
  const rows = svc['row'];
  const items = Array.isArray(rows) ? rows.filter(isObject) : isObject(rows) ? [rows] : [];
  return { result: { requestUrl, items, totalCount: intOrNull(svc['total_count']) } };
};

export const fetchMfdsRecipeRange = async (
  start: number,
  end: number,
  opts: FoodApiRequestOptions,
): Promise<FoodApiPage> => {
  const { fetchUrl, requestUrl } = buildMfdsRecipeUrls(start, end, opts.serviceKey);
  return callWithRetry(
    fetchUrl,
    requestUrl,
    opts,
    (http) => interpretMfdsRecipe(http, requestUrl),
    '식약처 레시피 api',
  );
};

export const fetchAllMfdsRecipes = async (
  opts: FoodApiRequestOptions,
  hooks: FetchAllOptions = {},
): Promise<{ items: Record<string, unknown>[]; totalCount: number | null; pages: number }> => {
  const items: Record<string, unknown>[] = [];
  let totalCount: number | null = null;
  let page = 1;
  for (; page <= MFDS_RECIPE_MAX_PAGES; page++) {
    const start = (page - 1) * MFDS_RECIPE_PAGE_SIZE + 1;
    const end = page * MFDS_RECIPE_PAGE_SIZE;
    const res = await fetchMfdsRecipeRange(start, end, opts);
    items.push(...res.items);
    totalCount = res.totalCount;
    hooks.onPage?.({ page, fetched: items.length, totalCount });
    const done =
      res.items.length === 0 ||
      res.items.length < MFDS_RECIPE_PAGE_SIZE ||
      (totalCount !== null && items.length >= totalCount);
    if (done) break;
  }
  return { items, totalCount, pages: Math.min(page, MFDS_RECIPE_MAX_PAGES) };
};

// ── (3) MAFRA 레시피 기본/재료 ───────────────────────────────────────────────

const buildMafraUrls = (
  grid: string,
  start: number,
  end: number,
  serviceKey: string,
): { fetchUrl: string; requestUrl: string } => {
  const tail = `/json/${grid}/${start}/${end}`;
  return {
    fetchUrl: `${MAFRA_BASE_URL}/${encodeURIComponent(serviceKey)}${tail}`,
    requestUrl: `${MAFRA_BASE_URL}/***${tail}`,
  };
};

// MAFRA 봉투: { [grid]: { totalCnt, startRow, endRow, result:{code,message}, row:[…] } } — 오류는 result.code.
const interpretMafra = (
  grid: string,
  http: RawHttpResult,
  requestUrl: string,
): { result: FoodApiPage } | { error: FoodApiError; retryable: boolean } => {
  const parsed = parseJson(http, requestUrl, '농식품 레시피');
  if ('error' in parsed) return parsed;
  const json = parsed.json;
  const svc = isObject(json) ? json[grid] : null;
  if (!isObject(svc)) {
    const result = isObject(json) && isObject(json['result']) ? json['result'] : null;
    const code = result ? coerceStrOrNull(result['code']) : null;
    const msg = result ? coerceStrOrNull(result['message']) : null;
    const isAuth = code !== null && /^ERROR-(290|300|301|310)$/.test(code);
    const Err = isAuth ? FoodApiAuthError : FoodApiError;
    return {
      error: new Err(
        `농식품 레시피 api 응답 형식 불일치(HTTP ${http.status}${code ? `, ${code}: ${msg ?? ''}` : ''})`,
        { code, requestUrl, responseText: http.rawText.slice(0, 2000) },
      ),
      retryable: code === null && http.status >= 500,
    };
  }
  const result = isObject(svc['result']) ? svc['result'] : null;
  const code = result ? coerceStrOrNull(result['code']) : null;
  if (code && code !== 'INFO-000') {
    if (code === 'INFO-200') return { result: { requestUrl, items: [], totalCount: 0 } };
    return {
      error: new FoodApiError(
        `농식품 레시피 api 오류(${code}: ${result ? (coerceStrOrNull(result['message']) ?? '') : ''})`,
        { code, requestUrl, responseText: http.rawText.slice(0, 2000) },
      ),
      retryable: false,
    };
  }
  const rows = svc['row'];
  const items = Array.isArray(rows) ? rows.filter(isObject) : isObject(rows) ? [rows] : [];
  return { result: { requestUrl, items, totalCount: intOrNull(svc['totalCnt']) } };
};

export const fetchMafraRange = async (
  grid: string,
  start: number,
  end: number,
  opts: FoodApiRequestOptions,
): Promise<FoodApiPage> => {
  const { fetchUrl, requestUrl } = buildMafraUrls(grid, start, end, opts.serviceKey);
  return callWithRetry(
    fetchUrl,
    requestUrl,
    opts,
    (http) => interpretMafra(grid, http, requestUrl),
    '농식품 레시피 api',
  );
};

export const fetchAllMafra = async (
  grid: string,
  opts: FoodApiRequestOptions,
  hooks: FetchAllOptions = {},
): Promise<{ items: Record<string, unknown>[]; totalCount: number | null; pages: number }> => {
  const items: Record<string, unknown>[] = [];
  let totalCount: number | null = null;
  let page = 1;
  for (; page <= MAFRA_MAX_PAGES; page++) {
    const start = (page - 1) * MAFRA_PAGE_SIZE + 1;
    const end = page * MAFRA_PAGE_SIZE;
    const res = await fetchMafraRange(grid, start, end, opts);
    items.push(...res.items);
    totalCount = res.totalCount;
    hooks.onPage?.({ page, fetched: items.length, totalCount });
    const done =
      res.items.length === 0 ||
      res.items.length < MAFRA_PAGE_SIZE ||
      (totalCount !== null && items.length >= totalCount);
    if (done) break;
  }
  return { items, totalCount, pages: Math.min(page, MAFRA_MAX_PAGES) };
};

// 테스트·프로브가 봉투 해석만 따로 쓸 수 있게 노출.
export const __foodApiInternals = {
  interpretMfdsNutrition,
  interpretMfdsRecipe,
  interpretMafra,
  buildMfdsNutritionUrls,
  buildMfdsRecipeUrls,
  buildMafraUrls,
};
