// 에어코리아 대기오염정보 API 어댑터 — 한국환경공단, data.go.kr 15073861
// (ArpltnInforInqireSvc). HTTPS GET, serviceKey + 일반 파라미터 쿼리스트링,
// returnType=json. 5개 오퍼레이션:
//   getCtprvnRltmMesureDnsty                  시도별 실시간 측정정보
//   getMsrstnAcctoRltmMesureDnsty             측정소별 실시간 측정정보(DAILY/MONTH/3MONTH)
//   getUnityAirEnvrnIdexSnstiveAboveMsrstnList 통합대기환경지수 나쁨 이상 측정소
//   getMinuDustFrcstDspth                     대기질 예보통보(PM10/PM25/O3)
//   getMinuDustWeekFrcstDspth                 초미세먼지 주간예보
//
// 응답 모델 (프로브 실측 2026-08-21):
//   정상: { response: { header:{resultCode:'00',resultMsg:'NORMAL_CODE'},
//                       body:{ totalCount, pageNo, numOfRows, items:[...] } } }
//     - 모든 값이 문자열. 농도 결측 "-", 등급 결측 null, Flag 는 null 또는 '통신장애' 등.
//     - 데이터 없음은 에러가 아니라 totalCount 0 + items [] (200).
//     - InformCode 필터는 무시된다(PM10 요청에도 3종 전부 반환) — 서비스가 거른다.
//   게이트웨이 오류: { OpenAPI_ServiceResponse: { cmmMsgHeader:{ errMsg, returnAuthMsg,
//                     returnReasonCode } } } — HTTP 200 또는 504 로 온다.
//     - 30 SERVICE_KEY_IS_NOT_REGISTERED / 20 ACCESS_DENIED / 22 일일한도 초과 →
//       우리 측 설정·쿼터 이슈(503, AirKoreaApiAuthError).
//     - 05 SERVICETIMEOUT_ERROR(HTTP 504) 가 첫 호출의 ~절반에서 관측됨 → 이 한 경우만
//       짧게 1회 재시도한다(버스/지하철 어댑터의 '재시도 없음' 규율에서 의도적으로 벗어난
//       지점 — 재시도 없이는 콜드 캐시 상태의 첫 화면이 자주 깨진다).
//
// serviceKey 함정(data.go.kr 공통): Encoding 키(%XX)를 URLSearchParams 에 넣으면 이중
// 인코딩 → 30 에러. bus-api.adapter 의 toServiceKeyPart 를 그대로 쓴다(동일 포털 키).
// 로깅/에러에는 키 평문 URL 을 절대 싣지 않는다 — 마스킹본(requestUrl)만.

import { coerceStrOrNull, intOrNull, isObject } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

export const AIRKOREA_BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc';
// 업스트림이 느리다 — '전국'(673행·340KB)은 수 초, 게이트웨이 자체 타임아웃(504 SERVICETIMEOUT)
// 도 ~10초 뒤에 온다. 10초로 끊으면 504 를 받아 재시도할 기회조차 없어 20초(버스/지하철 10초의 2배).
const FETCH_TIMEOUT_MS = 20_000;
// 게이트웨이 타임아웃(05)·5xx 1회 재시도 간격.
const RETRY_DELAY_MS = 700;
// 업스트림 페이지 크기 — 전국 673개소·MONTH 742행이 1페이지에 들어온다(실측 1000 허용).
export const AIRKOREA_PAGE_SIZE = 1000;
// 다중 페이지 상한 — 3MONTH(≈2,200행) 3페이지. 그 이상은 절단(쿼터 보호).
const MAX_PAGES = 3;

// header.resultCode — '00' 정상. '03' NODATA 는 data.go.kr 공통 코드라 빈 결과로 받는다
// (에어코리아는 실측상 빈 결과도 '00' 으로 오지만 방어).
const OK_RESULT_CODE = '00';
const NO_DATA_RESULT_CODES = new Set(['03']);
// cmmMsgHeader.returnReasonCode — 우리 측(키/권한/쿼터) 이슈 → 503.
const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
// 재시도 대상 — 게이트웨이 HTTP_ERROR(04)/SERVICETIMEOUT(05).
const RETRYABLE_REASON_CODES = new Set(['04', '05']);

export class AirKoreaApiError extends Error {
  readonly statusCode: number;
  // 업스트림 코드(resultCode 또는 returnReasonCode) — replyUpstreamError 가 upstreamCode 로 로깅.
  readonly code: string | null;
  // 키를 '***' 로 마스킹한 요청 URL — 로깅용. 평문 키 URL 은 보관하지 않는다.
  readonly requestUrl: string | null;
  // 비정상 응답 본문 원문 보존(진단용).
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
    this.name = 'AirKoreaApiError';
    this.statusCode = opts.statusCode ?? 502;
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

export class AirKoreaApiAuthError extends AirKoreaApiError {
  constructor(
    message: string,
    opts: { code?: string | null; requestUrl?: string; responseText?: string } = {},
  ) {
    // 503: 키 미등록/권한/일일한도는 업스트림 장애(502)가 아니라 우리 측 설정 이슈.
    super(message, { ...opts, statusCode: 503 });
    this.name = 'AirKoreaApiAuthError';
  }
}

export interface AirKoreaApiRequestOptions {
  serviceKey: string;
  // 주어지면 타임아웃은 caller 책임 — 자체 AbortController 를 만들지 않는다.
  signal?: AbortSignal;
}

export interface AirKoreaCallResult {
  // 키 마스킹본 — 그대로 로깅해도 안전.
  requestUrl: string;
  items: Record<string, unknown>[];
  totalCount: number | null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const buildUrls = (
  op: string,
  params: Record<string, string>,
  serviceKey: string,
): { fetchUrl: string; requestUrl: string } => {
  const sp = new URLSearchParams({ returnType: 'json', ...params });
  const qs = sp.toString();
  const prefix = `${AIRKOREA_BASE_URL}/${op}?serviceKey=`;
  const suffix = qs ? `&${qs}` : '';
  return {
    fetchUrl: `${prefix}${toServiceKeyPart(serviceKey)}${suffix}`,
    requestUrl: `${prefix}***${suffix}`,
  };
};

// 예외 메시지가 키 평문을 물고 올 여지를 봉인(지하철 어댑터 scrubKey 미러).
const scrubKey = (s: string, serviceKey: string): string =>
  serviceKey ? s.split(serviceKey).join('***') : s;

interface RawHttpResult {
  status: number;
  rawText: string;
}

// signal 미지정 시 자체 timeout — 업스트림이 매달려도 10초에 끊는다. 같은 시그널이
// 본문 읽기도 중단시키므로 clearTimeout 은 text() 완료 후(bus-api.adapter 주석 참조).
const httpGet = async (
  fetchUrl: string,
  requestUrl: string,
  opts: AirKoreaApiRequestOptions,
): Promise<RawHttpResult> => {
  const ac = opts.signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    let res: Response;
    try {
      res = await fetch(fetchUrl, { signal: opts.signal ?? ac?.signal });
    } catch (e) {
      throw new AirKoreaApiError(
        scrubKey(e instanceof Error ? `fetch 실패: ${e.message}` : 'fetch 실패', opts.serviceKey),
        { requestUrl, cause: e },
      );
    }
    let rawText: string;
    try {
      rawText = await res.text();
    } catch (e) {
      throw new AirKoreaApiError(
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

// cmmMsgHeader(게이트웨이 오류 봉투) 추출 — 없으면 null.
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

// 정상 봉투 파싱 — header.resultCode + body.items(배열/단건 객체/빈 문자열 모두 배열로).
const readResponse = (
  json: unknown,
): { resultCode: string | null; resultMsg: string | null; items: Record<string, unknown>[]; totalCount: number | null } | null => {
  if (!isObject(json)) return null;
  const response = json['response'];
  if (!isObject(response)) return null;
  const header = isObject(response['header']) ? response['header'] : {};
  const body = isObject(response['body']) ? response['body'] : {};
  const rawItems = body['items'];
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

// 한 번의 HTTP 왕복을 해석해 결과 또는 분류된 예외를 낸다. retryable 은 호출자가 1회
// 재시도할지 판단하는 힌트(게이트웨이 04/05, HTTP 5xx).
const interpret = (
  http: RawHttpResult,
  requestUrl: string,
): { result: AirKoreaCallResult } | { error: AirKoreaApiError; retryable: boolean } => {
  let json: unknown;
  try {
    json = JSON.parse(http.rawText);
  } catch (e) {
    // 5xx HTML 에러 페이지 등 — 5xx 면 재시도 가치가 있다.
    return {
      error: new AirKoreaApiError(`응답 JSON 파싱 실패(HTTP ${http.status})`, {
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
        error: new AirKoreaApiAuthError(`에어코리아 api 인증 실패(${detail})`, {
          code: gw.reasonCode,
          requestUrl,
          responseText: http.rawText,
        }),
        retryable: false,
      };
    }
    return {
      error: new AirKoreaApiError(`에어코리아 api 게이트웨이 오류(${detail})`, {
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
      error: new AirKoreaApiError(`에어코리아 api 응답 형식 불일치(HTTP ${http.status})`, {
        requestUrl,
        responseText: http.rawText,
      }),
      retryable: http.status >= 500,
    };
  }
  if (parsed.resultCode !== OK_RESULT_CODE) {
    if (parsed.resultCode !== null && NO_DATA_RESULT_CODES.has(parsed.resultCode)) {
      return { result: { requestUrl, items: [], totalCount: 0 } };
    }
    return {
      error: new AirKoreaApiError(
        `에어코리아 api 오류(${parsed.resultCode ?? '?'}: ${parsed.resultMsg ?? '알 수 없는 응답'})`,
        { code: parsed.resultCode, requestUrl, responseText: http.rawText },
      ),
      retryable: false,
    };
  }
  return { result: { requestUrl, items: parsed.items, totalCount: parsed.totalCount } };
};

// 단일 오퍼레이션 1페이지 호출. 게이트웨이 타임아웃/5xx 는 1회 재시도.
export const callAirKoreaApi = async (
  op: string,
  params: Record<string, string>,
  opts: AirKoreaApiRequestOptions,
): Promise<AirKoreaCallResult> => {
  const { fetchUrl, requestUrl } = buildUrls(op, params, opts.serviceKey);
  let lastError: AirKoreaApiError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const http = await httpGet(fetchUrl, requestUrl, opts);
    const outcome = interpret(http, requestUrl);
    if ('result' in outcome) return outcome.result;
    lastError = outcome.error;
    if (!outcome.retryable) break;
  }
  throw lastError ?? new AirKoreaApiError('에어코리아 api 호출 실패', { requestUrl });
};

// totalCount 만큼 페이지를 이어 받는다(상한 MAX_PAGES). 각 페이지가 업스트림 1콜.
const callAllPages = async (
  op: string,
  params: Record<string, string>,
  opts: AirKoreaApiRequestOptions,
): Promise<{ items: Record<string, unknown>[]; totalCount: number | null; pages: number }> => {
  const items: Record<string, unknown>[] = [];
  let totalCount: number | null = null;
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const res = await callAirKoreaApi(
      op,
      { ...params, numOfRows: String(AIRKOREA_PAGE_SIZE), pageNo: String(page) },
      opts,
    );
    items.push(...res.items);
    totalCount = res.totalCount;
    const done =
      res.items.length === 0 ||
      res.items.length < AIRKOREA_PAGE_SIZE ||
      (totalCount !== null && items.length >= totalCount);
    if (done) break;
  }
  return { items, totalCount, pages: Math.min(page, MAX_PAGES) };
};

// ── 원시 행 타입 — 값은 업스트림 문자열 그대로(결측 "-" 포함), 서비스가 정규화 ──

export interface RawAirMeasureRow {
  stationName: string | null;
  stationCode: string | null;
  sidoName: string | null;
  mangName: string | null;
  dataTime: string | null;
  so2Value: string | null;
  coValue: string | null;
  o3Value: string | null;
  no2Value: string | null;
  pm10Value: string | null;
  pm10Value24: string | null;
  pm25Value: string | null;
  pm25Value24: string | null;
  khaiValue: string | null;
  khaiGrade: string | null;
  so2Grade: string | null;
  coGrade: string | null;
  o3Grade: string | null;
  no2Grade: string | null;
  pm10Grade: string | null;
  pm25Grade: string | null;
  pm10Grade1h: string | null;
  pm25Grade1h: string | null;
  so2Flag: string | null;
  coFlag: string | null;
  o3Flag: string | null;
  no2Flag: string | null;
  pm10Flag: string | null;
  pm25Flag: string | null;
}

const MEASURE_KEYS = [
  'stationName',
  'stationCode',
  'sidoName',
  'mangName',
  'dataTime',
  'so2Value',
  'coValue',
  'o3Value',
  'no2Value',
  'pm10Value',
  'pm10Value24',
  'pm25Value',
  'pm25Value24',
  'khaiValue',
  'khaiGrade',
  'so2Grade',
  'coGrade',
  'o3Grade',
  'no2Grade',
  'pm10Grade',
  'pm25Grade',
  'pm10Grade1h',
  'pm25Grade1h',
  'so2Flag',
  'coFlag',
  'o3Flag',
  'no2Flag',
  'pm10Flag',
  'pm25Flag',
] as const satisfies readonly (keyof RawAirMeasureRow)[];

const toMeasureRow = (o: Record<string, unknown>): RawAirMeasureRow => {
  const row = {} as Record<keyof RawAirMeasureRow, string | null>;
  for (const k of MEASURE_KEYS) row[k] = coerceStrOrNull(o[k]);
  return row;
};

export interface RawAirBadStationRow {
  stationName: string | null;
  addr: string | null;
}

export interface RawAirForecastRow {
  dataTime: string | null; // "2026-08-21 11시 발표"
  informCode: string | null; // PM10 / PM25 / O3
  informData: string | null; // 예측 대상일 "YYYY-MM-DD"
  informOverall: string | null;
  informCause: string | null;
  informGrade: string | null; // "서울 : 좋음,제주 : 좋음,…"
  actionKnack: string | null;
  imageUrls: string[]; // imageUrl1~9 중 비어있지 않은 값(유효성은 서비스가 판정)
}

export interface RawAirWeeklyRow {
  presnatnDt: string | null; // 발표일
  gwthcnd: string | null; // 대기질 전망
  days: Array<{ date: string | null; text: string | null }>; // frcstOne~Four
}

// ── 타입드 래퍼 ────────────────────────────────────────────────────────────

// 시도별 실시간 측정정보(ver=1.5: stationCode·Flag 포함). '전국' 은 673개소 1페이지.
export const getSidoRealtime = async (
  sidoName: string,
  opts: AirKoreaApiRequestOptions,
): Promise<{ rows: RawAirMeasureRow[]; pages: number }> => {
  const { items, pages } = await callAllPages(
    'getCtprvnRltmMesureDnsty',
    { sidoName, ver: '1.5' },
    opts,
  );
  return { rows: items.map(toMeasureRow), pages };
};

export type AirKoreaDataTerm = 'DAILY' | 'MONTH' | '3MONTH';

// 측정소별 실시간 측정정보 — dataTerm DAILY(≈24행)/MONTH(≈740)/3MONTH(≈2,200, 3페이지).
// 업스트림은 최근 → 과거 순으로 준다(정렬은 서비스).
export const getStationRealtime = async (
  stationName: string,
  dataTerm: AirKoreaDataTerm,
  opts: AirKoreaApiRequestOptions,
): Promise<{ rows: RawAirMeasureRow[]; totalCount: number | null; pages: number }> => {
  const { items, totalCount, pages } = await callAllPages(
    'getMsrstnAcctoRltmMesureDnsty',
    { stationName, dataTerm, ver: '1.5' },
    opts,
  );
  return { rows: items.map(toMeasureRow), totalCount, pages };
};

// 통합대기환경지수 나쁨 이상 측정소 — 파라미터 없음.
export const getBadStations = async (
  opts: AirKoreaApiRequestOptions,
): Promise<RawAirBadStationRow[]> => {
  const res = await callAirKoreaApi(
    'getUnityAirEnvrnIdexSnstiveAboveMsrstnList',
    { numOfRows: String(AIRKOREA_PAGE_SIZE), pageNo: '1' },
    opts,
  );
  return res.items.map((o) => ({
    stationName: coerceStrOrNull(o['stationName']),
    addr: coerceStrOrNull(o['addr']),
  }));
};

// 대기질 예보통보 — searchDate(통보일) 기준. ver=1.1 로 애니메이션 imageUrl7~9 포함.
// InformCode 는 업스트림이 무시하므로 보내지 않는다(3종 전부 반환).
export const getDustForecast = async (
  searchDate: string,
  opts: AirKoreaApiRequestOptions,
): Promise<RawAirForecastRow[]> => {
  const res = await callAirKoreaApi(
    'getMinuDustFrcstDspth',
    { searchDate, ver: '1.1', numOfRows: '100', pageNo: '1' },
    opts,
  );
  return res.items.map((o) => {
    const imageUrls: string[] = [];
    for (let i = 1; i <= 9; i++) {
      const u = coerceStrOrNull(o[`imageUrl${i}`]);
      if (u) imageUrls.push(u);
    }
    return {
      dataTime: coerceStrOrNull(o['dataTime']),
      informCode: coerceStrOrNull(o['informCode']),
      informData: coerceStrOrNull(o['informData']),
      informOverall: coerceStrOrNull(o['informOverall']),
      informCause: coerceStrOrNull(o['informCause']),
      informGrade: coerceStrOrNull(o['informGrade']),
      actionKnack: coerceStrOrNull(o['actionKnack']),
      imageUrls,
    };
  });
};

// 초미세먼지 주간예보 — searchDate(발표일) 기준 1행. 당일 미발표면 빈 배열.
export const getWeeklyForecast = async (
  searchDate: string,
  opts: AirKoreaApiRequestOptions,
): Promise<RawAirWeeklyRow[]> => {
  const res = await callAirKoreaApi(
    'getMinuDustWeekFrcstDspth',
    { searchDate, numOfRows: '10', pageNo: '1' },
    opts,
  );
  const slots = ['One', 'Two', 'Three', 'Four'] as const;
  return res.items.map((o) => ({
    presnatnDt: coerceStrOrNull(o['presnatnDt']),
    gwthcnd: coerceStrOrNull(o['gwthcnd']),
    days: slots.map((s) => ({
      date: coerceStrOrNull(o[`frcst${s}Dt`]),
      text: coerceStrOrNull(o[`frcst${s}Cn`]),
    })),
  }));
};
