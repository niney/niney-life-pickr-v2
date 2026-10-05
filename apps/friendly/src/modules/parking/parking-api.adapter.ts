// 주차 원천 어댑터 — 서울 열린데이터(openapi.seoul.go.kr:8088, SEOUL_OPEN_API_KEY)와 data.go.kr(DATA_GO_KR_API_KEY)
// 봉투를 한 곳에서 푼다. data.go.kr 는 API 마다 봉투가 다르다(프로브 실측 2026-09-25):
//   - 표준데이터 tn_pubr_prkplce_info_api / 한국공항공사 GW: { response:{ header:{resultCode}, body:{ items:{item:[…]}|[…], totalCount } } }
//   - 인천공항: { response:{ header, body:{ items:[…], totalCount } } }
//   - 환경공단 EvCharger: { resultCode, resultMsg, totalCount, items:{ item:[…] } }(감싸개 없음)
//   - 한국교통안전공단 주차정보: { resultCode:'0', totalCount, <오퍼레이션 이름>:[…] }(감싸개 없음, 목록 키가 오퍼레이션마다 다름 — listKey)
//   - 게이트웨이 오류: { OpenAPI_ServiceResponse:{ cmmMsgHeader:{ returnReasonCode } } } — JSON 또는 XML 문자열.
// 인증·쿼터(20~33)는 503, 나머지는 502. 게이트웨이 04/05·5xx·네트워크 오류는 1회 재시도. 초당 한도 초과(…PER_SECOND…)는 503 이지만
// 잠깐 쉬면 풀리므로 더 길게 쉬고 재시도. 키는 로그·에러에 싣지 않는다.

import { coerceStrOrNull, intOrNull, isObject } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

const FETCH_TIMEOUT_MS = 30_000;
// 충전기 전량 페이지(9,999행 ≈ 10MB)는 느리다.
const SLOW_FETCH_TIMEOUT_MS = 120_000;
const RETRY_DELAY_MS = 800;
// 초당 한도 초과 뒤 쉬는 시간 — 1초 창이 지나도록.
const PER_SECOND_RETRY_DELAY_MS = 2_500;
const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
const RETRYABLE_REASON_CODES = new Set(['04', '05']);
// LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR — 일 쿼터 초과(…REQUESTS_EXCEEDS_ERROR)와 달리 곧 풀린다.
const isPerSecondLimit = (msg: string): boolean => msg.includes('PER_SECOND');

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class ParkingApiError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  readonly requestUrl: string | null;

  constructor(message: string, opts: { statusCode?: number; code?: string | null; requestUrl?: string; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'ParkingApiError';
    this.statusCode = opts.statusCode ?? 502;
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
  }
}

export interface ParkingCallOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  // 시도 횟수(기본 2 = 1회 재시도).
  attempts?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const scrub = (s: string, key: string): string => (key ? s.split(key).join('***') : s);

export interface ParkingPage {
  items: Record<string, unknown>[];
  totalCount: number;
}

// data.go.kr 봉투 해석 — 정상이면 page, 아니면 { error, retryable(, retryAfterMs) }. listKey 는 목록이 items 가 아닌 다른
// 키에 있는 API(한국교통안전공단 — 오퍼레이션 이름)용.
export const interpretDataGoKr = (
  status: number,
  rawText: string,
  requestUrl: string,
  listKey?: string,
): { page: ParkingPage } | { error: ParkingApiError; retryable: boolean; retryAfterMs?: number } => {
  const trimmed = rawText.trim();
  // 게이트웨이 오류는 XML 로 오기도 한다.
  if (trimmed.startsWith('<')) {
    const code = /<returnReasonCode>\s*(\d+)\s*<\/returnReasonCode>/.exec(trimmed)?.[1] ?? null;
    const msg = /<returnAuthMsg>([^<]*)<\/returnAuthMsg>/.exec(trimmed)?.[1] ?? /<errMsg>([^<]*)<\/errMsg>/.exec(trimmed)?.[1] ?? 'XML 응답';
    if (isPerSecondLimit(trimmed)) {
      return {
        error: new ParkingApiError(`공공데이터 초당 호출 한도 초과(${code ?? '?'})`, { statusCode: 503, code, requestUrl }),
        retryable: true,
        retryAfterMs: PER_SECOND_RETRY_DELAY_MS,
      };
    }
    const auth = code !== null && AUTH_REASON_CODES.has(code);
    return {
      error: new ParkingApiError(`공공데이터 ${auth ? '인증' : '게이트웨이'} 오류(${code ?? '?'}: ${msg})`, {
        statusCode: auth ? 503 : 502,
        code,
        requestUrl,
      }),
      retryable: code !== null && RETRYABLE_REASON_CODES.has(code),
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (e) {
    return { error: new ParkingApiError(`공공데이터 응답 JSON 파싱 실패(HTTP ${status})`, { requestUrl, cause: e }), retryable: status >= 500 };
  }
  if (!isObject(json)) return { error: new ParkingApiError('공공데이터 응답 형식 불일치', { requestUrl }), retryable: false };
  const gw = isObject(json['OpenAPI_ServiceResponse']) ? json['OpenAPI_ServiceResponse'] : null;
  if (gw) {
    const header = isObject(gw['cmmMsgHeader']) ? gw['cmmMsgHeader'] : {};
    const code = coerceStrOrNull(header['returnReasonCode']);
    const msg = coerceStrOrNull(header['returnAuthMsg']) ?? coerceStrOrNull(header['errMsg']) ?? '게이트웨이 오류';
    if (isPerSecondLimit(`${coerceStrOrNull(header['errMsg']) ?? ''} ${msg}`)) {
      return {
        error: new ParkingApiError(`공공데이터 초당 호출 한도 초과(${code ?? '?'})`, { statusCode: 503, code, requestUrl }),
        retryable: true,
        retryAfterMs: PER_SECOND_RETRY_DELAY_MS,
      };
    }
    const auth = code !== null && AUTH_REASON_CODES.has(code);
    return {
      error: new ParkingApiError(`공공데이터 ${auth ? '인증' : '게이트웨이'} 오류(${code ?? '?'}: ${msg})`, {
        statusCode: auth ? 503 : 502,
        code,
        requestUrl,
      }),
      retryable: code !== null && RETRYABLE_REASON_CODES.has(code),
    };
  }
  const resp = isObject(json['response']) ? json['response'] : json;
  const header = isObject(resp['header']) ? resp['header'] : resp;
  const resultCode = coerceStrOrNull(header['resultCode']);
  // 표준데이터 API 는 데이터 없음을 '03' 으로 준다.
  if (resultCode === '03') return { page: { items: [], totalCount: 0 } };
  if (resultCode !== null && resultCode !== '00' && resultCode !== '0') {
    return {
      error: new ParkingApiError(`공공데이터 오류(${resultCode}: ${coerceStrOrNull(header['resultMsg']) ?? '알 수 없는 응답'})`, {
        code: resultCode,
        requestUrl,
      }),
      retryable: false,
    };
  }
  const body = isObject(resp['body']) ? resp['body'] : resp;
  const wrap = body[listKey ?? 'items'];
  const raw = isObject(wrap) ? wrap['item'] : wrap;
  const items = Array.isArray(raw) ? raw.filter(isObject) : isObject(raw) ? [raw] : [];
  return { page: { items, totalCount: intOrNull(body['totalCount']) ?? items.length } };
};

// data.go.kr 한 페이지 — base 는 '?' 앞까지. 키는 Encoding 값 그대로(이중 인코딩 금지).
export const callDataGoKr = async (
  base: string,
  params: Record<string, string>,
  serviceKey: string,
  opts: ParkingCallOptions & { listKey?: string } = {},
): Promise<ParkingPage> => {
  if (!serviceKey) throw new ParkingApiError('DATA_GO_KR_API_KEY 가 설정되지 않았습니다', { statusCode: 503 });
  const qs = new URLSearchParams(params).toString();
  const fetchUrl = `${base}?serviceKey=${toServiceKeyPart(serviceKey)}&${qs}`;
  const requestUrl = `${base}?serviceKey=***&${qs}`;
  const doFetch = opts.fetchImpl ?? fetch;
  let last: ParkingApiError | null = null;
  let delay = RETRY_DELAY_MS;
  for (let attempt = 0; attempt < (opts.attempts ?? 2); attempt += 1) {
    if (attempt > 0) await sleep(delay);
    delay = RETRY_DELAY_MS;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
    let status: number;
    let text: string;
    try {
      const res = await doFetch(fetchUrl, { signal: ac.signal });
      status = res.status;
      text = await res.text();
    } catch (e) {
      last = new ParkingApiError(scrub(e instanceof Error ? `fetch 실패: ${e.message}` : 'fetch 실패', serviceKey), { requestUrl, cause: e });
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (status >= 500 && !text.trim().startsWith('{') && !text.trim().startsWith('<')) {
      last = new ParkingApiError(`공공데이터 HTTP ${status}`, { requestUrl });
      continue;
    }
    const out = interpretDataGoKr(status, text, requestUrl, opts.listKey);
    if ('page' in out) return out.page;
    last = out.error;
    if (!out.retryable) break;
    delay = out.retryAfterMs ?? RETRY_DELAY_MS;
  }
  throw last ?? new ParkingApiError('공공데이터 호출 실패', { requestUrl });
};

// 호출 사이 간격을 지키는 줄 세우기 — 초당 한도가 낮은 원천(KOTSA)을 한 프로세스 안에서 순차로 부를 때. 앞 호출이 끝나기를
// 기다리진 않고 시작 시각만 gapMs 씩 벌린다(호출은 원래 순차로 부른다).
export const createCallSpacer = (gapMs: number) => {
  let nextAt = 0;
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const wait = Math.max(0, nextAt - now);
    nextAt = Math.max(now, nextAt) + gapMs;
    if (wait > 0) await sleep(wait);
    return fn();
  };
};

// ── 서울 열린데이터 ──────────────────────────────────────────────────────────
const SEOUL_OPEN_BASE = 'http://openapi.seoul.go.kr:8088';
// 한 번에 최대 1,000행.
const SEOUL_PAGE_SIZE = 1000;
const SEOUL_MAX_PAGES = 20;

// 응답: 성공 { <service>:{ list_total_count, RESULT:{CODE:'INFO-000'}, row:[…] } }, 데이터 없음 INFO-200(빈 결과),
// 실패 톱레벨 { RESULT:{CODE,MESSAGE} }. 인증 오류(INFO-100)는 503.
export const callSeoulOpen = async (
  service: string,
  start: number,
  end: number,
  apiKey: string,
  opts: ParkingCallOptions = {},
): Promise<ParkingPage> => {
  if (!apiKey) throw new ParkingApiError('SEOUL_OPEN_API_KEY 가 설정되지 않았습니다', { statusCode: 503 });
  const tail = `${service}/${start}/${end}/`;
  const requestUrl = `${SEOUL_OPEN_BASE}/***/json/${tail}`;
  const doFetch = opts.fetchImpl ?? fetch;
  let last: ParkingApiError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
    let json: unknown;
    try {
      const res = await doFetch(`${SEOUL_OPEN_BASE}/${apiKey}/json/${tail}`, { signal: ac.signal });
      json = JSON.parse(await res.text());
    } catch (e) {
      last = new ParkingApiError(scrub(e instanceof Error ? `서울 열린데이터 호출 실패: ${e.message}` : '서울 열린데이터 호출 실패', apiKey), {
        requestUrl,
        cause: e,
      });
      continue;
    } finally {
      clearTimeout(timer);
    }
    const box = isObject(json) && isObject(json[service]) ? json[service] : json;
    const result = isObject(box) && isObject(box['RESULT']) ? box['RESULT'] : null;
    const code = result ? coerceStrOrNull(result['CODE']) : null;
    if (code === 'INFO-200') return { items: [], totalCount: 0 };
    if (code !== 'INFO-000') {
      const message = result ? coerceStrOrNull(result['MESSAGE']) : null;
      const auth = code === 'INFO-100';
      throw new ParkingApiError(`서울 열린데이터 오류(${code ?? '?'}: ${message ?? '알 수 없음'})`, {
        statusCode: auth ? 503 : 502,
        code,
        requestUrl,
      });
    }
    const rows = isObject(box) && Array.isArray(box['row']) ? box['row'].filter(isObject) : [];
    return { items: rows, totalCount: intOrNull(isObject(box) ? box['list_total_count'] : null) ?? rows.length };
  }
  throw last ?? new ParkingApiError('서울 열린데이터 호출 실패', { requestUrl });
};

export const callSeoulOpenAll = async (service: string, apiKey: string, opts: ParkingCallOptions = {}): Promise<Record<string, unknown>[]> => {
  const out: Record<string, unknown>[] = [];
  for (let page = 0; page < SEOUL_MAX_PAGES; page += 1) {
    const start = page * SEOUL_PAGE_SIZE + 1;
    const p = await callSeoulOpen(service, start, start + SEOUL_PAGE_SIZE - 1, apiKey, opts);
    out.push(...p.items);
    if (p.items.length === 0 || out.length >= p.totalCount) break;
  }
  return out;
};

// 서울 공영주차장 안내(OA-13122, 2,189행 — 노상은 구획마다 행) / 시영 실시간 주차대수(122행, 1콜).
export const SEOUL_PARK_INFO = 'GetParkInfo';
export const SEOUL_PARKING_LIVE = 'GetParkingInfo';

// ── data.go.kr 엔드포인트 ────────────────────────────────────────────────────
export const STD_PARKING_URL = 'http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api';
export const STD_PARKING_PAGE_SIZE = 1000;
export const KAC_PARKING_CONGESTION_URL = 'https://apis.data.go.kr/B551178/parking-congestion/info';
export const IIAC_PARKING_URL = 'https://apis.data.go.kr/B551177/StatusOfParking/getTrackingParking';
export const EV_CHARGER_INFO_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
export const EV_CHARGER_STATUS_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerStatus';
// 가이드: 한 페이지 최대 9,999행.
export const EV_PAGE_SIZE = 9999;
// 한국교통안전공단 주차정보(15099883, 개발·운영 모두 심의승인 — 2026-10-05 승인 확인). 2026-09-10 에 /Parking → /Parking_v1,
// 오퍼레이션 _v1 로 바뀌었다. 목록 키는 오퍼레이션 이름. 지역 필터는 옛 행정코드(강원 42·전북 45·부천 41190)만 받는다(kotsa-sigungu).
// 실측(2026-10-05): 한 페이지 1만 행까지 받는다. 가이드의 30tps 보다 초당 한도가 훨씬 낮아(동시 4개면 대부분 PER_SECOND) 호출은
// 순차 + 간격(createCallSpacer). 실시간(PrkRealtimeInfo)은 쓰지 않는다 — 시설과 이어지는 행은 값이 멈춰 있고(월요일 출근 시간
// 1시간 관측 동안 858행 중 변화 0), 값이 바뀌는 행은 시설에 없는 ID 라 위치를 모른다(docs/PLAN-parking.md §KOTSA).
export const KOTSA_PARKING_BASE = 'https://apis.data.go.kr/B553881/Parking_v1';
export const KOTSA_OPS = { facility: 'PrkSttusInfo', operation: 'PrkOprInfo' } as const;
export type KotsaOp = keyof typeof KOTSA_OPS;
export const KOTSA_PAGE_SIZE = 10_000;
export const KOTSA_CALL_GAP_MS = 350;

export const fetchStdParkingPage = (serviceKey: string, pageNo: number, opts: ParkingCallOptions = {}): Promise<ParkingPage> =>
  callDataGoKr(STD_PARKING_URL, { pageNo: String(pageNo), numOfRows: String(STD_PARKING_PAGE_SIZE), type: 'json' }, serviceKey, opts);

export const fetchKacParkingCongestion = (serviceKey: string, opts: ParkingCallOptions = {}): Promise<ParkingPage> =>
  callDataGoKr(KAC_PARKING_CONGESTION_URL, { pageNo: '1', numOfRows: '100', type: 'json' }, serviceKey, opts);

export const fetchIncheonParking = (serviceKey: string, opts: ParkingCallOptions = {}): Promise<ParkingPage> =>
  callDataGoKr(IIAC_PARKING_URL, { pageNo: '1', numOfRows: '100', type: 'json' }, serviceKey, opts);

export const fetchEvChargerInfoPage = (serviceKey: string, pageNo: number, opts: ParkingCallOptions & { zcode?: string } = {}): Promise<ParkingPage> =>
  callDataGoKr(
    EV_CHARGER_INFO_URL,
    { pageNo: String(pageNo), numOfRows: String(EV_PAGE_SIZE), dataType: 'JSON', ...(opts.zcode ? { zcode: opts.zcode } : {}) },
    serviceKey,
    { ...opts, timeoutMs: opts.timeoutMs ?? SLOW_FETCH_TIMEOUT_MS },
  );

// KOTSA 한 페이지 — 시군구(옛 행정코드 5자리) 단위. 시도는 코드 앞 두 자리.
export const fetchKotsaPage = (
  serviceKey: string,
  op: KotsaOp,
  q: { sigunguCd: string; pageNo?: number; numOfRows?: number },
  opts: ParkingCallOptions = {},
): Promise<ParkingPage> =>
  callDataGoKr(
    `${KOTSA_PARKING_BASE}/${KOTSA_OPS[op]}_v1`,
    {
      pageNo: String(q.pageNo ?? 1),
      numOfRows: String(q.numOfRows ?? KOTSA_PAGE_SIZE),
      format: '2',
      sidoCd: q.sigunguCd.slice(0, 2),
      sigunguCd: q.sigunguCd,
    },
    serviceKey,
    { ...opts, listKey: KOTSA_OPS[op], timeoutMs: opts.timeoutMs ?? SLOW_FETCH_TIMEOUT_MS, attempts: opts.attempts ?? 3 },
  );

// period = 최근 N분(1~10) 안에 상태가 바뀐 충전기.
export const fetchEvChargerStatusPage = (serviceKey: string, pageNo: number, period: number, opts: ParkingCallOptions = {}): Promise<ParkingPage> =>
  callDataGoKr(
    EV_CHARGER_STATUS_URL,
    { pageNo: String(pageNo), numOfRows: String(EV_PAGE_SIZE), dataType: 'JSON', period: String(Math.min(10, Math.max(1, Math.round(period)))) },
    serviceKey,
    { ...opts, timeoutMs: opts.timeoutMs ?? SLOW_FETCH_TIMEOUT_MS },
  );
