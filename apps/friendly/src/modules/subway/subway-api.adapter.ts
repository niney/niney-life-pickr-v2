// 서울시 지하철 공공 API 어댑터 — 두 포털을 한 파일에서 다룬다.
//
// 1) 실시간 swopenAPI (도착/위치): http://swopenAPI.seoul.go.kr/api/subway
//    경로: /{KEY}/json/{service}/{start}/{end}/{역명|호선명}. SUBWAY_API_KEY 사용.
// 2) 정적 openapi (역사마스터):   http://openapi.seoul.go.kr:8088
//    경로: /{KEY}/json/{service}/{start}/{end}/{...extra}. SEOUL_OPEN_API_KEY 사용.
//
// 키가 URL path 세그먼트에 실리므로(쿼리스트링 아님) fetchUrl(키 평문)과
// requestUrl(마스킹본)을 같은 템플릿에서 병렬 생성한다 — URL 에서 키를 사후
// 치환하지 않는다(누락 위험). 로깅/에러에는 마스킹본만 싣고, 예외 메시지는
// scrub 으로 한 번 더 키 평문을 지운다(이중 안전망). bus-api.adapter 의 에러
// 클래스 형태·타임아웃 규율을 이식했다.
//
// 에러 모델 (프로브 실측 2026-07-06 — HTTP status 신뢰 금지, 본문 code 로 판정):
//   - swopen 정상: { errorMessage:{status,code:'INFO-000',...}, <list>:[...] }
//   - swopen 데이터 없음: 톱레벨 단독 { status, code:'INFO-200', message } —
//     에러가 아니라 빈 배열 정상(서울 밖 역·운행종료가 여기로 떨어짐).
//   - openapi 정상: { <service>:{ list_total_count, RESULT:{CODE:'INFO-000'}, row:[...] } }
//   - openapi 실패: 톱레벨 { RESULT:{CODE:'ERROR-500',MESSAGE} }
//   - 인증 실패 INFO-100(양 포털 공통, 미관측) → SubwayApiAuthError(503).
//   - 그 외 ERROR-*/비정상 코드 → SubwayApiError(502).

const SWOPEN_BASE = 'http://swopenAPI.seoul.go.kr/api/subway';
const SEOUL_OPEN_BASE = 'http://openapi.seoul.go.kr:8088';
const FETCH_TIMEOUT_MS = 10_000;

// 정상 처리 / 데이터 없음(빈 결과, 에러 아님) — 나머지 코드는 아래에서 분류.
const OK_CODE = 'INFO-000';
const NO_DATA_CODE = 'INFO-200';
const AUTH_CODE = 'INFO-100';

export class SubwayApiError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  // 키를 '***' 로 마스킹한 요청 URL — 로깅용. 평문 키 URL 은 보관하지 않는다.
  readonly requestUrl: string | null;
  // 비정상 응답 본문 원문 보존(디버깅용).
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
    this.name = 'SubwayApiError';
    this.statusCode = opts.statusCode ?? 502;
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

export class SubwayApiAuthError extends SubwayApiError {
  constructor(
    message: string,
    opts: { code?: string | null; requestUrl?: string; responseText?: string } = {},
  ) {
    // 503: 키 인증 실패는 업스트림 장애(502)가 아니라 우리 측 설정 이슈.
    super(message, { ...opts, statusCode: 503 });
    this.name = 'SubwayApiAuthError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// JSON 응답이어도 숫자가 문자열로 온다(서울 openapi 관례: LAT "37.556228",
// barvlDt "90") — 명시 변환. 선행 0 이 있는 코드성 값은 strOrNull 로 보존한다.
const strOrNull = (v: unknown): string | null => {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
};
const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

// 예외 메시지가 키 평문을 물고 올 여지를 봉인 — 어떤 문자열이든 키를 '***' 로.
const scrubKey = (s: string, apiKey: string): string =>
  apiKey ? s.split(apiKey).join('***') : s;

export interface SubwayApiRequestOptions {
  apiKey: string;
  // 주어지면 타임아웃은 caller 책임 — 자체 AbortController 를 만들지 않는다.
  signal?: AbortSignal;
}

// ── HTTP 코어 ──────────────────────────────────────────────────────────────
interface RawJsonResult {
  requestUrl: string; // 마스킹본 — 그대로 로깅/덤프해도 안전.
  status: number; // HTTP 상태 (신뢰 금지 — 200+본문에러 케이스 존재).
  rawText: string;
  json: unknown; // 파싱 성공 시 값, 실패 시 null.
}

// signal 미지정 시 자체 timeout — 업스트림이 매달려도 10초에 끊는다. 같은 시그널이
// 본문 읽기도 중단시키므로 clearTimeout 은 text() 완료 후 (undici bodyTimeout
// ~300초 함정 회피 — bus-api.adapter 주석 참조).
const callJson = async (
  fetchUrl: string,
  requestUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<RawJsonResult> => {
  const ac = signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;

  let rawText: string;
  let status: number;
  try {
    let res: Response;
    try {
      res = await fetch(fetchUrl, { signal: signal ?? ac?.signal });
    } catch (e) {
      // 메시지에 fetchUrl(키 평문) 금지 — 마스킹본만. scrub 이 한 번 더 지운다.
      throw new SubwayApiError(
        scrubKey(e instanceof Error ? `fetch 실패: ${e.message}` : 'fetch 실패', apiKey),
        { requestUrl, cause: e },
      );
    }
    status = res.status;
    try {
      rawText = await res.text();
    } catch (e) {
      throw new SubwayApiError(
        scrubKey(e instanceof Error ? `응답 본문 읽기 실패: ${e.message}` : '응답 본문 읽기 실패', apiKey),
        { requestUrl, cause: e },
      );
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // 에러 본문도 JSON 이므로(200/500 무관) 파싱 실패만 에러로 올린다.
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    throw new SubwayApiError('응답 JSON 파싱 실패', {
      requestUrl,
      responseText: rawText,
      cause: e,
    });
  }
  return { requestUrl, status, rawText, json };
};

// ── 응답 파서 ────────────────────────────────────────────────────────────────
// swopen: 정상은 { errorMessage:{status,code,message,total}, <list>:[...] },
// 데이터 없음은 톱레벨 { status, code, message } 단독. 둘 다에서 상태를 뽑는다.
const readSwopenStatus = (
  json: unknown,
): { code: string | null; message: string | null; total: number | null } => {
  const box =
    isObject(json) && isObject(json['errorMessage'])
      ? json['errorMessage']
      : isObject(json)
        ? json
        : null;
  if (!box) return { code: null, message: null, total: null };
  return {
    code: strOrNull(box['code']),
    message: strOrNull(box['message']),
    total: numOrNull(box['total']),
  };
};
// 단건이 객체로 떨어지는 함정 봉인 — 배열/객체/부재 모두 배열로 정규화.
const readSwopenList = (json: unknown, key: string): Record<string, unknown>[] => {
  if (!isObject(json)) return [];
  const list = json[key];
  if (Array.isArray(list)) return list.filter(isObject);
  if (isObject(list)) return [list];
  return [];
};

// openapi: 성공은 { <service>:{ list_total_count, RESULT:{CODE,MESSAGE}, row:[...] } },
// 실패는 톱레벨 { RESULT:{CODE,MESSAGE} }. 둘 다에서 결과를 뽑는다.
const readSeoulResult = (
  json: unknown,
  service: string,
): {
  code: string | null;
  message: string | null;
  total: number | null;
  rows: Record<string, unknown>[];
} => {
  if (!isObject(json)) return { code: null, message: null, total: null, rows: [] };
  const box = isObject(json[service]) ? json[service] : json;
  const result = isObject(box['RESULT']) ? box['RESULT'] : null;
  const rowsRaw = box['row'];
  const rows = Array.isArray(rowsRaw)
    ? rowsRaw.filter(isObject)
    : isObject(rowsRaw)
      ? [rowsRaw]
      : [];
  return {
    code: result ? strOrNull(result['CODE']) : null,
    message: result ? strOrNull(result['MESSAGE']) : null,
    total: numOrNull(box['list_total_count']),
    rows,
  };
};

// 코드 → 예외 분류. INFO-000/INFO-200 은 정상(200=빈 결과)이라 통과, INFO-100 은
// 인증 실패(503), 나머지 코드/미해석은 업스트림 오류(502). 양 포털 공통.
const throwIfError = (
  code: string | null,
  message: string | null,
  requestUrl: string,
  responseText: string,
): void => {
  if (code === OK_CODE || code === NO_DATA_CODE) return;
  const detail = `${code ?? '?'}: ${message ?? '알 수 없는 응답'}`;
  if (code === AUTH_CODE) {
    throw new SubwayApiAuthError(`지하철 api 인증 실패(${detail})`, { code, requestUrl, responseText });
  }
  throw new SubwayApiError(`지하철 api 오류(${detail})`, { code, requestUrl, responseText });
};

// swopen 호출 — pathSegments 는 호출부가 encodeURIComponent 해서 넘긴다(한글 역명/
// 호선명). 반환 json 에서 호출부가 readSwopenList 로 리스트를 뽑는다.
const callSwopenApi = async (
  service: string,
  pathSegments: string[],
  opts: SubwayApiRequestOptions,
): Promise<{ requestUrl: string; json: unknown }> => {
  const tail = [service, ...pathSegments].join('/');
  const fetchUrl = `${SWOPEN_BASE}/${opts.apiKey}/json/${tail}`;
  const requestUrl = `${SWOPEN_BASE}/***/json/${tail}`;
  const res = await callJson(fetchUrl, requestUrl, opts.apiKey, opts.signal);
  const st = readSwopenStatus(res.json);
  throwIfError(st.code, st.message, requestUrl, res.rawText);
  return { requestUrl, json: res.json };
};

// openapi 호출 — service/start/end 뒤에 extraSegments(역명 검색형에서만 사용).
const callSeoulOpenApi = async (
  service: string,
  start: number,
  end: number,
  extraSegments: string[],
  opts: SubwayApiRequestOptions,
): Promise<{ requestUrl: string; rows: Record<string, unknown>[]; total: number | null }> => {
  const tail = [service, String(start), String(end), ...extraSegments].join('/');
  const fetchUrl = `${SEOUL_OPEN_BASE}/${opts.apiKey}/json/${tail}`;
  const requestUrl = `${SEOUL_OPEN_BASE}/***/json/${tail}`;
  const res = await callJson(fetchUrl, requestUrl, opts.apiKey, opts.signal);
  const parsed = readSeoulResult(res.json, service);
  throwIfError(parsed.code, parsed.message, requestUrl, res.rawText);
  return { requestUrl, rows: parsed.rows, total: parsed.total };
};

// ---------------------------------------------------------------------------
// 타입드 래퍼 — 1차 라우트는 역사마스터 적재만 쓰지만, 도착/위치는 2·6차 라우트가
// 사용한다(프로브가 이미 검증한 함수라 어댑터에 함께 둔다).

// subwayStationMaster 원시 행 — BLDN_ID(4자리 역코드), BLDN_NM(역명),
// ROUTE(39종 철도노선 표기), LAT/LOT(WGS84 문자열). 좌표/코드는 서비스가 정규화.
export interface RawSubwayMasterRow {
  bldnId: string | null; // BLDN_ID — 4자리 역코드(stationCd 후보), 실시간 statnId 와 불일치.
  name: string | null; // BLDN_NM ('서울역')
  route: string | null; // ROUTE ('1호선', '경부선' 등 — 서비스가 lineId 로 접는다)
  lat: number | null; // LAT (WGS84 위도)
  lng: number | null; // LOT (WGS84 경도)
}

const toRawSubwayMasterRow = (raw: Record<string, unknown>): RawSubwayMasterRow => ({
  bldnId: strOrNull(raw['BLDN_ID']),
  name: strOrNull(raw['BLDN_NM']),
  route: strOrNull(raw['ROUTE']),
  lat: numOrNull(raw['LAT']),
  lng: numOrNull(raw['LOT']),
});

// 역사마스터 전량(총 784행, 1/1000 단일 콜). 단건 row 객체는 readSeoulResult 가
// 배열로 정규화한다. SEOUL_OPEN_API_KEY 를 apiKey 로 넘겨야 한다.
export const getStationMaster = async (
  opts: SubwayApiRequestOptions,
): Promise<RawSubwayMasterRow[]> => {
  const { rows } = await callSeoulOpenApi('subwayStationMaster', 1, 1000, [], opts);
  return rows.map(toRawSubwayMasterRow);
};

// realtimeStationArrival 원시 행 — 관측 필드 그대로 보존(2차 도착 라우트 대비).
// 숫자가 문자열로 오는 barvlDt("90")는 numOrNull 로 초 단위 숫자화한다.
export interface RawSubwayArrival {
  subwayId: string | null;
  updnLine: string | null; // '외선'/'내선'/'상행'/'하행' 등 텍스트
  trainLineNm: string | null; // '성수행 - 역삼방면'
  statnFid: string | null;
  statnTid: string | null;
  statnId: string | null; // 실시간 10자리
  statnNm: string | null; // 실시간 조회 역명('강남' — 마스터 BLDN_NM 과 다를 수 있음)
  trnsitCo: string | null;
  subwayList: string | null; // '1002,1077' — 환승 그룹(호선)
  statnList: string | null; // '1002000222,1077000687' — 환승 그룹(역)
  btrainSttus: string | null; // '일반'/'급행' 등
  barvlDt: number | null; // 도착까지 초('90')
  btrainNo: string | null;
  bstatnId: string | null;
  bstatnNm: string | null; // 행선지 역명
  recptnDt: string | null; // 원천 수신 시각
  arvlMsg2: string | null; // '전역 도착', '2분 40초 후'
  arvlMsg3: string | null; // '교대'(현재 위치 역)
  arvlCd: string | null; // 도착코드
  lstcarAt: string | null; // 막차 여부 '0'/'1'
}

const toRawSubwayArrival = (raw: Record<string, unknown>): RawSubwayArrival => ({
  subwayId: strOrNull(raw['subwayId']),
  updnLine: strOrNull(raw['updnLine']),
  trainLineNm: strOrNull(raw['trainLineNm']),
  statnFid: strOrNull(raw['statnFid']),
  statnTid: strOrNull(raw['statnTid']),
  statnId: strOrNull(raw['statnId']),
  statnNm: strOrNull(raw['statnNm']),
  trnsitCo: strOrNull(raw['trnsitCo']),
  subwayList: strOrNull(raw['subwayList']),
  statnList: strOrNull(raw['statnList']),
  btrainSttus: strOrNull(raw['btrainSttus']),
  barvlDt: numOrNull(raw['barvlDt']),
  btrainNo: strOrNull(raw['btrainNo']),
  bstatnId: strOrNull(raw['bstatnId']),
  bstatnNm: strOrNull(raw['bstatnNm']),
  recptnDt: strOrNull(raw['recptnDt']),
  arvlMsg2: strOrNull(raw['arvlMsg2']),
  arvlMsg3: strOrNull(raw['arvlMsg3']),
  arvlCd: strOrNull(raw['arvlCd']),
  lstcarAt: strOrNull(raw['lstcarAt']),
});

// realtimeStationArrival/0/30/{역명} — 역명 기반 도착정보(전 호선 한 콜).
// SUBWAY_API_KEY 를 apiKey 로 넘겨야 한다. (2차 라우트 대비 — 1차엔 미노출.)
export const getRealtimeArrivals = async (
  stationName: string,
  opts: SubwayApiRequestOptions,
): Promise<RawSubwayArrival[]> => {
  const { json } = await callSwopenApi(
    'realtimeStationArrival',
    ['0', '30', encodeURIComponent(stationName)],
    opts,
  );
  return readSwopenList(json, 'realtimeArrivalList').map(toRawSubwayArrival);
};

// realtimePosition 원시 행 — 관측 필드 그대로 보존(6차 실시간 위치 대비).
// updnLine 이 도착('외선')과 달리 '0'/'1' 숫자문자열로 온다(인코딩 상이).
export interface RawSubwayPosition {
  subwayId: string | null;
  subwayNm: string | null; // '2호선'
  statnId: string | null;
  statnNm: string | null; // 현재 역
  trainNo: string | null;
  lastRecptnDt: string | null; // 'YYYYMMDD'
  recptnDt: string | null;
  updnLine: string | null; // '0'/'1'
  statnTid: string | null; // 행선 역ID
  statnTnm: string | null; // 행선 역명('성수지선')
  trainSttus: string | null; // '0'~'3' (진입/도착/출발/운행)
  directAt: string | null; // 급행 여부
  lstcarAt: string | null; // 막차 여부
}

const toRawSubwayPosition = (raw: Record<string, unknown>): RawSubwayPosition => ({
  subwayId: strOrNull(raw['subwayId']),
  subwayNm: strOrNull(raw['subwayNm']),
  statnId: strOrNull(raw['statnId']),
  statnNm: strOrNull(raw['statnNm']),
  trainNo: strOrNull(raw['trainNo']),
  lastRecptnDt: strOrNull(raw['lastRecptnDt']),
  recptnDt: strOrNull(raw['recptnDt']),
  updnLine: strOrNull(raw['updnLine']),
  statnTid: strOrNull(raw['statnTid']),
  statnTnm: strOrNull(raw['statnTnm']),
  trainSttus: strOrNull(raw['trainSttus']),
  directAt: strOrNull(raw['directAt']),
  lstcarAt: strOrNull(raw['lstcarAt']),
});

// realtimePosition/0/100/{호선명} — 호선 전체 차량 위치. lineNameParam 은
// @repo/utils SUBWAY_LINES.positionParam 표기. SUBWAY_API_KEY 를 apiKey 로 넘긴다.
// (6차 라우트 대비 — 1차엔 미노출.)
export const getRealtimePositions = async (
  lineNameParam: string,
  opts: SubwayApiRequestOptions,
): Promise<RawSubwayPosition[]> => {
  const { json } = await callSwopenApi(
    'realtimePosition',
    ['0', '100', encodeURIComponent(lineNameParam)],
    opts,
  );
  return readSwopenList(json, 'realtimePositionList').map(toRawSubwayPosition);
};
