// 서울시 버스 정보 API (ws.bus.go.kr) 어댑터.
//
// endpoint: http://ws.bus.go.kr/api/rest/{stationinfo|buspos}/<op>
//   - 평문 HTTP. List/Item 접미사 없는 경로.
//   - GET, serviceKey + 일반 파라미터(stSrch 등) 쿼리스트링.
//
// 정상 응답 XML:
//   <ServiceResult><msgHeader><headerCd/><headerMsg/></msgHeader>
//     <msgBody><itemList>...</itemList></msgBody></ServiceResult>
// 인증 실패는 두 형태로 온다:
//   1) <OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg/>
//      <returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>
//   2) ServiceResult headerCd=7 ("Key인증실패: ... [인증모듈 에러코드(NN)]")
//      — probe:bus 실관측. 둘 다 BusApiAuthError 로 분류한다.
//
// serviceKey 함정: data.go.kr 의 "Encoding 키"(%XX 시퀀스 포함)를
// URLSearchParams 에 넣으면 이중 인코딩되어 인증에러(returnReasonCode 30).
// 키만 직접 이어붙이고 일반 파라미터만 URLSearchParams 로 처리한다.
//
// 로깅/에러에는 키 평문 URL 을 절대 싣지 않는다 — 마스킹본(requestUrl)만.

import { isObject, coerceStrOrNull, numOrNull } from '../../lib/narrow.js';
import { XMLParser } from 'fast-xml-parser';

const BASE_URL = 'http://ws.bus.go.kr/api/rest';
const FETCH_TIMEOUT_MS = 10_000;

// '결과 없음' 계열 headerCd — 에러가 아니라 빈 목록으로 정상 반환한다.
// 실응답 확정(2026-07-02): headerCd=4, headerMsg "결과가 없습니다."
export const NO_RESULT_HEADER_CDS = ['4'];

export class BusApiError extends Error {
  readonly statusCode: number;
  readonly headerCd: string | null;
  // 키를 '***' 로 마스킹한 요청 URL — 로깅용. 평문 키 URL 은 보관하지 않는다.
  readonly requestUrl: string | null;
  // 프로브가 비정상 응답(JSON 등)을 분석할 수 있도록 원문 보존.
  readonly responseText: string | null;

  constructor(
    message: string,
    opts: {
      statusCode?: number;
      headerCd?: string | null;
      requestUrl?: string;
      responseText?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'BusApiError';
    this.statusCode = opts.statusCode ?? 502;
    this.headerCd = opts.headerCd ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

export class BusApiAuthError extends BusApiError {
  readonly returnAuthMsg: string;
  readonly returnReasonCode: string | null;

  constructor(
    returnAuthMsg: string,
    returnReasonCode: string | null,
    opts: { requestUrl?: string; responseText?: string; headerCd?: string | null } = {},
  ) {
    // 503: 키 인증 실패는 업스트림 장애(502)가 아니라 우리 측 설정 이슈.
    super(`bus api 인증 실패(${returnReasonCode ?? '?'}): ${returnAuthMsg}`, {
      ...opts,
      statusCode: 503,
    });
    this.name = 'BusApiAuthError';
    this.returnAuthMsg = returnAuthMsg;
    this.returnReasonCode = returnReasonCode;
  }
}

// parseTagValue: false 라 보통 string 이지만, 옵션이 바뀌어도 안전하게 number
// 도 받는다 (단 arsId '02013' 의 선행 0 보존은 parseTagValue: false 가 책임).

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  // 단건 응답이 객체로 떨어지는 함정 봉인 — itemList 는 항상 배열.
  isArray: (name) => name === 'itemList',
  // 숫자 자동 변환 금지 — arsId '02013' 같은 선행 0 이 3001 식으로 소실된다.
  // 숫자 필드는 numOrNull 로 명시 변환.
  parseTagValue: false,
});

export interface BusApiCallOptions {
  serviceKey: string;
  // 주어지면 타임아웃은 caller 책임 — 자체 AbortController 를 만들지 않는다.
  signal?: AbortSignal;
  // 프로브용 추가 파라미터 (resultType=json 등).
  extraParams?: Record<string, string>;
}

export interface BusApiCallResult {
  // 키 마스킹본 — 그대로 로깅해도 안전.
  requestUrl: string;
  xmlText: string;
  headerCd: string;
  headerMsg: string;
  items: Record<string, unknown>[];
}

// serviceKey 가 URL 에 실리는 최종 형태. %XX 시퀀스가 있으면 이미 인코딩된
// Encoding 키 — raw 그대로. 없으면(Decoding 키/평문) encodeURIComponent.
// 절대 URLSearchParams 에 넣지 않는다(이중 인코딩 → 인증에러 30).
// probe:bus 가 같은 규칙으로 키 변형을 사전 dedupe 하므로 export.
export const toServiceKeyPart = (serviceKey: string): string =>
  /%[0-9a-fA-F]{2}/.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey);

const buildUrls = (
  path: string,
  params: Record<string, string>,
  opts: BusApiCallOptions,
): { fetchUrl: string; requestUrl: string } => {
  const sp = new URLSearchParams(params);
  if (opts.extraParams) {
    for (const [k, v] of Object.entries(opts.extraParams)) sp.set(k, v);
  }
  const qs = sp.toString();
  const keyPart = toServiceKeyPart(opts.serviceKey);
  const prefix = `${BASE_URL}/${path}?serviceKey=`;
  const suffix = qs ? `&${qs}` : '';
  return {
    fetchUrl: `${prefix}${keyPart}${suffix}`,
    requestUrl: `${prefix}***${suffix}`,
  };
};

export const callBusApi = async (
  path: string,
  params: Record<string, string>,
  opts: BusApiCallOptions,
): Promise<BusApiCallResult> => {
  const { fetchUrl, requestUrl } = buildUrls(path, params, opts);

  // signal 미지정 시 자체 timeout — 업스트림이 매달려도 10초에 끊는 안전망.
  // 같은 시그널이 본문 읽기도 중단시키므로 clearTimeout 은 text() 완료 후 —
  // fetch 직후 해제하면 헤더만 받고 본문이 매달리는 케이스(undici bodyTimeout
  // ~300초)가 10초 보호를 못 받는다.
  const ac = opts.signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;

  let xmlText: string;
  try {
    let res: Response;
    try {
      res = await fetch(fetchUrl, { signal: opts.signal ?? ac?.signal });
    } catch (e) {
      // 메시지에 fetchUrl(키 평문) 금지 — 마스킹본만 보존.
      throw new BusApiError(
        e instanceof Error ? `fetch failed: ${e.message}` : 'fetch failed',
        { requestUrl, cause: e },
      );
    }

    if (!res.ok) {
      throw new BusApiError(`bus api status ${res.status}`, { requestUrl });
    }

    try {
      xmlText = await res.text();
    } catch (e) {
      throw new BusApiError(
        e instanceof Error ? `bus api 응답 본문 읽기 실패: ${e.message}` : 'bus api 응답 본문 읽기 실패',
        { requestUrl, cause: e },
      );
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlText) as unknown;
  } catch (e) {
    throw new BusApiError('bus api 응답 XML 파싱 실패', {
      requestUrl,
      responseText: xmlText,
      cause: e,
    });
  }
  if (!isObject(parsed)) {
    throw new BusApiError('bus api 응답 형태를 해석할 수 없음', {
      requestUrl,
      responseText: xmlText,
    });
  }

  // 인증 실패는 ServiceResult 가 아니라 OpenAPI_ServiceResponse 로 온다.
  const authWrap = isObject(parsed['OpenAPI_ServiceResponse'])
    ? parsed['OpenAPI_ServiceResponse']
    : null;
  const cmm = authWrap && isObject(authWrap['cmmMsgHeader']) ? authWrap['cmmMsgHeader'] : null;
  if (cmm) {
    throw new BusApiAuthError(
      coerceStrOrNull(cmm['returnAuthMsg']) ?? '인증 실패',
      coerceStrOrNull(cmm['returnReasonCode']),
      { requestUrl, responseText: xmlText },
    );
  }

  const sr = isObject(parsed['ServiceResult']) ? parsed['ServiceResult'] : null;
  const header = sr && isObject(sr['msgHeader']) ? sr['msgHeader'] : null;
  if (!header) {
    throw new BusApiError('bus api 응답에 ServiceResult.msgHeader 없음', {
      requestUrl,
      responseText: xmlText,
    });
  }
  const headerCd = coerceStrOrNull(header['headerCd']) ?? '';
  const headerMsg = coerceStrOrNull(header['headerMsg']) ?? '';

  // sr null check 는 header 가드가 보장하지만 TS narrowing 이 못 따라온다.
  const body = sr && isObject(sr['msgBody']) ? sr['msgBody'] : null;
  const itemsRaw = body && Array.isArray(body['itemList']) ? body['itemList'] : [];
  const items = itemsRaw.filter(isObject);

  if (headerCd !== '0') {
    if (NO_RESULT_HEADER_CDS.includes(headerCd)) {
      return { requestUrl, xmlText, headerCd, headerMsg, items: [] };
    }
    // 실관측(probe:bus): 키 인증 실패가 cmmMsgHeader 가 아니라 ServiceResult
    // headerCd=7 ("Key인증실패: ... [인증모듈 에러코드(NN)]") 로도 온다 —
    // headerMsg 에서 NN 을 reasonCode 로 추출해 BusApiAuthError 로 분류.
    if (headerCd === '7') {
      const reasonCode = /인증모듈 에러코드\((\d+)\)/.exec(headerMsg)?.[1] ?? null;
      throw new BusApiAuthError(headerMsg || '인증 실패', reasonCode, {
        requestUrl,
        responseText: xmlText,
        headerCd,
      });
    }
    throw new BusApiError(`bus api error ${headerCd}: ${headerMsg}`, {
      requestUrl,
      headerCd,
      responseText: xmlText,
    });
  }

  return { requestUrl, xmlText, headerCd, headerMsg, items };
};

// ---------------------------------------------------------------------------
// 타입드 래퍼 — 1차 라우트는 정류장 검색만 쓰지만, 도착정보/실시간 위치는
// 차기 라우트와 probe:bus 스크립트가 사용한다.

export interface BusApiRequestOptions {
  serviceKey: string;
  signal?: AbortSignal;
}

// getStationByName 원시 행. 좌표 후보 필드를 전부 옵셔널로 보존한다 —
// probe:bus 실측(2026-07-02): 서울시는 tmX/tmY 필드명에 WGS84 경위도 값을,
// posX/posY 에 GRS80 TM 값을 넣어준다. 필드명을 믿지 않고 toLatLng 가
// 값 범위로 판정한다.
export interface RawBusStation {
  stId: string;
  // '0' = 가상정류장 (도착정보 조회 불가).
  arsId: string;
  stNm: string;
  tmX: number | null;
  tmY: number | null;
  gpsX: number | null;
  gpsY: number | null;
  posX: number | null;
  posY: number | null;
}

// getStationByUid 원시 행 — 정류소 경유 노선별 도착정보.
export interface RawStationArrival {
  busRouteId: string;
  rtNm: string | null;
  // 해당 정류소의 노선 내 순번 — getBusPosByRouteSt 구간 조회에 사용.
  staOrd: number | null;
  vehId1: string | null;
  arrmsg1: string | null;
  vehId2: string | null;
  arrmsg2: string | null;
}

// buspos/* 원시 행 — 차량 실시간 위치.
export interface RawBusPosition {
  vehId: string | null;
  plainNo: string | null;
  sectOrd: number | null;
  stopFlag: string | null;
  dataTm: string | null;
  tmX: number | null;
  tmY: number | null;
  gpsX: number | null;
  gpsY: number | null;
  posX: number | null;
  posY: number | null;
}

// WGS84 한국 범위 — @repo/api-contract BusStationItem 의 lat/lng 제약과 동일.
const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;

// 좌표 정규화 — 후보 (x=경도, y=위도) 쌍을 순회하며 WGS84 값 범위에 들어오는
// 쌍을 채택한다. 필드명(tmX 등)은 신뢰하지 않는다.
// probe:bus 확정(2026-07-02): stationinfo/buspos 모두 tmX/tmY=WGS84,
// posX/posY=GRS80 TM(18만~46만 단위), getBusPosByRtid 는 gpsX/gpsY(WGS84)도
// 제공 — WGS84 쌍이 항상 존재하므로 proj4 변환 불필요. 모든 쌍이 범위 밖이면
// null(호출측이 좌표계 이상 신호로 처리).
export const toLatLng = (raw: {
  tmX: number | null;
  tmY: number | null;
  gpsX: number | null;
  gpsY: number | null;
  posX: number | null;
  posY: number | null;
}): { lat: number; lng: number } | null => {
  const pairs: Array<[number | null, number | null]> = [
    [raw.tmX, raw.tmY],
    [raw.gpsX, raw.gpsY],
    [raw.posX, raw.posY],
  ];
  for (const [x, y] of pairs) {
    if (
      x !== null &&
      y !== null &&
      x >= LNG_MIN &&
      x <= LNG_MAX &&
      y >= LAT_MIN &&
      y <= LAT_MAX
    ) {
      return { lat: y, lng: x };
    }
  }
  return null;
};

const coordFields = (raw: Record<string, unknown>) => ({
  tmX: numOrNull(raw['tmX']),
  tmY: numOrNull(raw['tmY']),
  gpsX: numOrNull(raw['gpsX']),
  gpsY: numOrNull(raw['gpsY']),
  posX: numOrNull(raw['posX']),
  posY: numOrNull(raw['posY']),
});

const toRawBusStation = (raw: Record<string, unknown>): RawBusStation | null => {
  const stId = coerceStrOrNull(raw['stId']);
  const stNm = coerceStrOrNull(raw['stNm']);
  if (!stId || !stNm) return null;
  return {
    stId,
    arsId: coerceStrOrNull(raw['arsId']) ?? '0',
    stNm,
    ...coordFields(raw),
  };
};

const toRawStationArrival = (raw: Record<string, unknown>): RawStationArrival | null => {
  const busRouteId = coerceStrOrNull(raw['busRouteId']);
  if (!busRouteId) return null;
  return {
    busRouteId,
    rtNm: coerceStrOrNull(raw['rtNm']),
    staOrd: numOrNull(raw['staOrd']),
    vehId1: coerceStrOrNull(raw['vehId1']),
    arrmsg1: coerceStrOrNull(raw['arrmsg1']),
    vehId2: coerceStrOrNull(raw['vehId2']),
    arrmsg2: coerceStrOrNull(raw['arrmsg2']),
  };
};

const toRawBusPosition = (raw: Record<string, unknown>): RawBusPosition => ({
  vehId: coerceStrOrNull(raw['vehId']),
  plainNo: coerceStrOrNull(raw['plainNo']),
  sectOrd: numOrNull(raw['sectOrd']),
  stopFlag: coerceStrOrNull(raw['stopFlag']),
  dataTm: coerceStrOrNull(raw['dataTm']),
  ...coordFields(raw),
});

export const getStationsByName = async (
  keyword: string,
  opts: BusApiRequestOptions,
): Promise<RawBusStation[]> => {
  const { items } = await callBusApi('stationinfo/getStationByName', { stSrch: keyword }, opts);
  return items.map(toRawBusStation).filter((s): s is RawBusStation => s !== null);
};

export const getStationArrivals = async (
  arsId: string,
  opts: BusApiRequestOptions,
): Promise<RawStationArrival[]> => {
  const { items } = await callBusApi('stationinfo/getStationByUid', { arsId }, opts);
  return items.map(toRawStationArrival).filter((s): s is RawStationArrival => s !== null);
};

export const getBusPositionsByRouteSt = async (
  busRouteId: string,
  startOrd: number,
  endOrd: number,
  opts: BusApiRequestOptions,
): Promise<RawBusPosition[]> => {
  const { items } = await callBusApi(
    'buspos/getBusPosByRouteSt',
    { busRouteId, startOrd: String(startOrd), endOrd: String(endOrd) },
    opts,
  );
  return items.map(toRawBusPosition);
};

export const getBusPositionsByRtid = async (
  busRouteId: string,
  opts: BusApiRequestOptions,
): Promise<RawBusPosition[]> => {
  const { items } = await callBusApi('buspos/getBusPosByRtid', { busRouteId }, opts);
  return items.map(toRawBusPosition);
};

// ---------------------------------------------------------------------------
// 5차(노선 보기) — busRouteInfo 서비스 3종. 형상(getRoutePath) / 경유 정류소
// (getStaionByRoute — 서울시 원문 오타 'Staion' 그대로 유지) / 노선 기본정보
// (getRouteInfo). probe 실측(2026-07-04, 141=100100020): 좌표는 gpsX/gpsY 가
// WGS84(posX/posY 는 GRS80 TM) — toLatLng 값-범위 판정을 그대로 재사용한다.

// getRoutePath 원시 점 — no(순번) + 좌표. 응답에 tmX/tmY 는 없어 coordFields 가
// null 로 채우고 toLatLng 가 gpsX/gpsY 를 채택한다.
export interface RawRoutePathPoint {
  no: number | null;
  tmX: number | null;
  tmY: number | null;
  gpsX: number | null;
  gpsY: number | null;
  posX: number | null;
  posY: number | null;
}

const toRawRoutePathPoint = (raw: Record<string, unknown>): RawRoutePathPoint => ({
  no: numOrNull(raw['no']),
  ...coordFields(raw),
});

export const getRoutePath = async (
  busRouteId: string,
  opts: BusApiRequestOptions,
): Promise<RawRoutePathPoint[]> => {
  const { items } = await callBusApi('busRouteInfo/getRoutePath', { busRouteId }, opts);
  return items.map(toRawRoutePathPoint);
};

// getStaionByRoute 원시 행 — 경유 정류소. 'station' 필드가 정류소 고유 ID
// (stId 와 동일 ID 공간). direction=이 정류소에서 향하는 종점 표기('염곡동'),
// transYn 'Y'=회차 지점.
export interface RawRouteStation {
  seq: number | null;
  stId: string;
  arsId: string;
  stNm: string;
  direction: string | null;
  transYn: string | null;
  tmX: number | null;
  tmY: number | null;
  gpsX: number | null;
  gpsY: number | null;
  posX: number | null;
  posY: number | null;
}

const toRawRouteStation = (raw: Record<string, unknown>): RawRouteStation | null => {
  const stId = coerceStrOrNull(raw['station']);
  const stNm = coerceStrOrNull(raw['stationNm']);
  if (!stId || !stNm) return null;
  return {
    seq: numOrNull(raw['seq']),
    stId,
    arsId: coerceStrOrNull(raw['arsId']) ?? '0',
    stNm,
    direction: coerceStrOrNull(raw['direction']),
    transYn: coerceStrOrNull(raw['transYn']),
    ...coordFields(raw),
  };
};

export const getStationsByRoute = async (
  busRouteId: string,
  opts: BusApiRequestOptions,
): Promise<RawRouteStation[]> => {
  const { items } = await callBusApi('busRouteInfo/getStaionByRoute', { busRouteId }, opts);
  return items.map(toRawRouteStation).filter((s): s is RawRouteStation => s !== null);
};

// getRouteInfo 원시 행 — 노선 기본정보(단건). length/term 은 문자열로 오고
// (parseTagValue:false) 서비스가 숫자 정규화한다. corpNm 은 전화번호가 연속
// 공백으로 붙어 옴('아진교통  02-955-2321') — 서비스가 공백을 접는다.
export interface RawRouteInfo {
  busRouteId: string;
  busRouteNm: string | null;
  busRouteAbrv: string | null;
  length: string | null;
  routeType: string | null;
  stStationNm: string | null;
  edStationNm: string | null;
  term: string | null;
  firstBusTm: string | null;
  lastBusTm: string | null;
  corpNm: string | null;
}

const toRawRouteInfo = (raw: Record<string, unknown>): RawRouteInfo | null => {
  const busRouteId = coerceStrOrNull(raw['busRouteId']);
  if (!busRouteId) return null;
  return {
    busRouteId,
    busRouteNm: coerceStrOrNull(raw['busRouteNm']),
    busRouteAbrv: coerceStrOrNull(raw['busRouteAbrv']),
    length: coerceStrOrNull(raw['length']),
    routeType: coerceStrOrNull(raw['routeType']),
    stStationNm: coerceStrOrNull(raw['stStationNm']),
    edStationNm: coerceStrOrNull(raw['edStationNm']),
    term: coerceStrOrNull(raw['term']),
    firstBusTm: coerceStrOrNull(raw['firstBusTm']),
    lastBusTm: coerceStrOrNull(raw['lastBusTm']),
    corpNm: coerceStrOrNull(raw['corpNm']),
  };
};

// 단건 응답 — itemList 가 1개(또는 0개). 없으면 null(호출측이 노선 부재로 처리).
export const getRouteInfo = async (
  busRouteId: string,
  opts: BusApiRequestOptions,
): Promise<RawRouteInfo | null> => {
  const { items } = await callBusApi('busRouteInfo/getRouteInfo', { busRouteId }, opts);
  const raw = items[0];
  return raw ? toRawRouteInfo(raw) : null;
};
