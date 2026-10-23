// 한국관광공사 국문 관광정보 서비스 어댑터 — TourAPI 4.0, data.go.kr 15101578(B551011/KorService2).
// HTTPS GET, serviceKey + MobileOS/MobileApp + pageNo/numOfRows 쿼리스트링, _type=json.
// 여행로그 장소(2023년 표본)에 지금의 운영 정보(이용 시간·쉬는 날·주차·요금)를 붙이는 데 쓴다 — docs/PLAN-tour-log.md 15차.
// 쓰는 곳: tour-kto.service.ts(sync:tour-kto) · scripts/probe-kto-api.ts. 오퍼레이션:
//   areaBasedList2      지역 기반 목록(전량 동기화용 — contentTypeId 로 관광지·문화시설·레포츠·쇼핑·음식점을 가른다)
//   locationBasedList2  좌표 반경 목록(mapX 경도 · mapY 위도 · radius m, 최대 20,000)
//   searchKeyword2      키워드 검색
//   detailCommon2       공통 정보(명칭·주소·좌표·개요·홈페이지)
//   detailIntro2        소개 정보 — 이용 시간·쉬는 날·주차·요금. 필드 이름이 contentTypeId 마다 다르다
//                       (관광지 usetime/restdate, 문화시설 usetimeculture/restdateculture, 음식점 opentimefood/restdatefood …)
//   detailInfo2 · detailImage2  반복 정보 · 이미지
//
// 응답 모델(data.go.kr 게이트웨이 규약 — 심평원·에어코리아와 같다. 2026-10-04 probe:kto·sync:tour-kto 실측으로 확인):
//   · 전체 49,613건 — 관광지 12,602 · 문화시설 2,751 · 레포츠 3,751 · 쇼핑 12,228 · 음식점 13,402(+ 축제 889 · 여행코스 1,068 · 숙박 2,922).
//     numOfRows=1000 이 된다(다섯 유형 전량 47콜).
//   · 목록 행: contentid · contenttypeid · title · addr1 · addr2 · mapx(경도) · mapy(위도) · modifiedtime · zipcode · firstimage ·
//     cpyrhtDivCd · lDongRegnCd · lDongSignguCd · lclsSystm1~3 — 값은 전부 문자열.
//   · 소개 정보의 필드 이름은 아래 INTRO_FIELDS 그대로(문화시설 usetimeculture·restdateculture·usefee, 음식점 opentimefood·restdatefood …).
//   · locationBasedList2 는 카탈로그에 있는 콘텐츠를 빠뜨린다(성산일출봉 좌표에서 반경 1km 를 물어도 성산일출봉이 오지 않았다) —
//     맞추기는 카탈로그(areaBasedList2)를 통째로 받아 로컬에서 한다.
//   정상: { response: { header:{ resultCode:'0000', resultMsg:'OK' }, body:{ totalCount, pageNo, numOfRows,
//                       items:{ item:[…] } } } }
//     - items 는 행이 1개면 객체, 0개면 빈 문자열('')로 오는 게이트웨이 버릇 — 셋 다 흡수.
//   게이트웨이 오류: OpenAPI_ServiceResponse.cmmMsgHeader{ errMsg, returnAuthMsg, returnReasonCode } — _type=json 이어도
//     XML 로 올 수 있어 JSON·XML 둘 다 읽는다.
//     - 20/22/30 등 키·권한·쿼터 → KtoApiAuthError(즉시 중단). 30 은 활용신청 직후 게이트웨이 반영 대기일 수 있다.
//     - 04 HTTP_ERROR / 05 SERVICETIMEOUT → 짧게 재시도.
//
// serviceKey 함정(data.go.kr 공통): Encoding 키(%XX)를 URLSearchParams 에 넣으면 이중 인코딩 → 30 에러.
// bus-api.adapter 의 toServiceKeyPart 를 그대로 쓴다. 로깅·에러에는 키를 가린 URL(requestUrl)만 싣는다.

import { coerceStrOrNull, isObject } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

export const KTO_TOUR_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
// 서비스 식별용 필수 파라미터 — 통계에만 쓰인다.
const MOBILE_OS = 'ETC';
const MOBILE_APP = 'LifePickr';

export const KTO_OPERATIONS = ['areaBasedList2', 'locationBasedList2', 'searchKeyword2', 'detailCommon2', 'detailIntro2', 'detailInfo2', 'detailImage2'] as const;
export type KtoOperation = (typeof KTO_OPERATIONS)[number];

// 콘텐츠 유형(contentTypeId) — 여행로그 장소와 맞출 만한 것만. 축제(15)·여행코스(25)·숙박(32)은 쓰지 않는다.
export const KTO_CONTENT_TYPES = {
  attraction: '12',
  culture: '14',
  leisure: '28',
  shopping: '38',
  restaurant: '39',
} as const;
export const KTO_CONTENT_TYPE_LABEL: Record<string, string> = {
  '12': '관광지',
  '14': '문화시설',
  '15': '축제·공연·행사',
  '25': '여행코스',
  '28': '레포츠',
  '32': '숙박',
  '38': '쇼핑',
  '39': '음식점',
};

const FETCH_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 700;
const TRANSIENT_RETRIES = 2;

const OK_RESULT_CODES = new Set(['0000', '00']);
// data.go.kr 공통 NODATA — 빈 결과로 받는다.
const NO_DATA_RESULT_CODES = new Set(['03']);
// cmmMsgHeader.returnReasonCode — 우리 측(키/권한/쿼터) 이슈.
const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
// 재시도 대상 — 게이트웨이 HTTP_ERROR(04)/SERVICETIMEOUT(05).
const RETRYABLE_REASON_CODES = new Set(['04', '05']);

export class KtoApiError extends Error {
  readonly code: string | null;
  // 키를 '***' 로 가린 요청 URL — 로깅용.
  readonly requestUrl: string | null;
  readonly responseText: string | null;

  constructor(message: string, opts: { code?: string | null; requestUrl?: string; responseText?: string; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'KtoApiError';
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

// 키·권한·쿼터 오류 — 재시도·다음 호출이 무의미하다. 적재는 즉시 중단.
export class KtoApiAuthError extends KtoApiError {
  constructor(message: string, opts: ConstructorParameters<typeof KtoApiError>[1] = {}) {
    super(message, opts);
    this.name = 'KtoApiAuthError';
  }
}

export interface KtoPage {
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  items: Record<string, unknown>[];
  requestUrl: string;
}

export interface KtoApiCallOptions {
  serviceKey: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

export const buildKtoUrls = (operation: KtoOperation, params: Record<string, string | number | undefined>, serviceKey: string): { fetchUrl: string; requestUrl: string } => {
  const sp = new URLSearchParams({ MobileOS: MOBILE_OS, MobileApp: MOBILE_APP, _type: 'json' });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  const prefix = `${KTO_TOUR_BASE_URL}/${operation}?serviceKey=`;
  return { fetchUrl: `${prefix}${toServiceKeyPart(serviceKey)}&${sp.toString()}`, requestUrl: `${prefix}***&${sp.toString()}` };
};

// items 게이트웨이 버릇 — 배열/단일 객체/''(0건) 셋 다 배열로.
const narrowItems = (body: Record<string, unknown>): Record<string, unknown>[] => {
  const items = body['items'];
  if (!isObject(items)) return [];
  const item = items['item'];
  if (Array.isArray(item)) return item.filter(isObject);
  return isObject(item) ? [item] : [];
};

const throwGateway = (reason: string | null, msg: string, requestUrl: string): never => {
  if (reason !== null && AUTH_REASON_CODES.has(reason)) throw new KtoApiAuthError(`TourAPI 게이트웨이 ${reason}: ${msg}`, { code: reason, requestUrl });
  throw new KtoApiError(`TourAPI 게이트웨이 ${reason ?? '?'}: ${msg}`, { code: reason, requestUrl });
};

const xmlTag = (text: string, tag: string): string | null => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(text)?.[1]?.trim() || null;

export const parseKtoPage = (text: string, requestUrl: string): KtoPage => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // 게이트웨이 오류는 _type=json 이어도 XML 로 온다.
    if (text.includes('OpenAPI_ServiceResponse') || text.includes('cmmMsgHeader')) {
      throwGateway(xmlTag(text, 'returnReasonCode'), xmlTag(text, 'returnAuthMsg') ?? xmlTag(text, 'errMsg') ?? '게이트웨이 오류', requestUrl);
    }
    throw new KtoApiError('TourAPI 응답이 JSON 이 아닙니다', { requestUrl, responseText: text.slice(0, 500) });
  }
  if (!isObject(json)) throw new KtoApiError('TourAPI 응답 형식 이상', { requestUrl, responseText: text.slice(0, 500) });

  const gw = json['OpenAPI_ServiceResponse'];
  if (isObject(gw)) {
    const header = isObject(gw['cmmMsgHeader']) ? gw['cmmMsgHeader'] : {};
    throwGateway(coerceStrOrNull(header['returnReasonCode']), coerceStrOrNull(header['returnAuthMsg']) ?? coerceStrOrNull(header['errMsg']) ?? '게이트웨이 오류', requestUrl);
  }

  // 본문 없이 resultCode 만 최상위에 오는 변형(일부 오류)도 읽는다.
  const response = isObject(json['response']) ? json['response'] : null;
  const header = response && isObject(response['header']) ? response['header'] : isObject(json) ? json : null;
  const resultCode = header ? coerceStrOrNull(header['resultCode']) : null;
  if (!(resultCode !== null && (OK_RESULT_CODES.has(resultCode) || NO_DATA_RESULT_CODES.has(resultCode)))) {
    const msg = header ? (coerceStrOrNull(header['resultMsg']) ?? '') : '';
    if (resultCode !== null && AUTH_REASON_CODES.has(resultCode)) throw new KtoApiAuthError(`TourAPI resultCode ${resultCode}: ${msg}`, { code: resultCode, requestUrl });
    throw new KtoApiError(`TourAPI resultCode ${resultCode ?? '?'}: ${msg}`, { code: resultCode, requestUrl, responseText: text.slice(0, 500) });
  }
  const body = response && isObject(response['body']) ? response['body'] : {};
  const num = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  return { totalCount: num(body['totalCount']), pageNo: num(body['pageNo']), numOfRows: num(body['numOfRows']), items: narrowItems(body), requestUrl };
};

// 일시 오류 — 게이트웨이 04/05, HTTP 5xx, 타임아웃·네트워크. 인증·형식 오류는 다시 해도 같은 답이다.
const isTransient = (e: unknown): boolean => {
  if (e instanceof KtoApiAuthError) return false;
  if (e instanceof KtoApiError) return (e.code !== null && RETRYABLE_REASON_CODES.has(e.code)) || /HTTP 5\d\d|시간초과|네트워크/.test(e.message);
  return false;
};

// 한 번 호출 — 일시 오류만 짧은 간격으로 최대 2회 재시도.
export const fetchKtoPage = async (operation: KtoOperation, params: Record<string, string | number | undefined>, opts: KtoApiCallOptions): Promise<KtoPage> => {
  const { fetchUrl, requestUrl } = buildKtoUrls(operation, params, opts.serviceKey);
  const fetchImpl = opts.fetchImpl ?? fetch;

  const once = async (): Promise<KtoPage> => {
    const ac = opts.signal ? null : new AbortController();
    const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
    let res: Response;
    let text: string;
    try {
      res = await fetchImpl(fetchUrl, { signal: opts.signal ?? ac!.signal });
      text = await res.text();
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new KtoApiError(aborted ? `TourAPI 시간초과(${FETCH_TIMEOUT_MS / 1000}s)` : 'TourAPI 네트워크 오류', { requestUrl, cause: e });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res.ok) {
      // 게이트웨이 봉투가 실려 있으면 코드로 판정하고(401/403 인증 포함), 아니면 상태로.
      try {
        return parseKtoPage(text, requestUrl);
      } catch (e) {
        if (e instanceof KtoApiAuthError) throw e;
        if (res.status === 401 || res.status === 403) throw new KtoApiAuthError(`TourAPI HTTP ${res.status}`, { code: String(res.status), requestUrl, responseText: text.slice(0, 500) });
        throw new KtoApiError(`TourAPI HTTP ${res.status}`, { code: e instanceof KtoApiError ? e.code : null, requestUrl, responseText: text.slice(0, 500) });
      }
    }
    return parseKtoPage(text, requestUrl);
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

// ── 소개 정보의 운영 필드 ─────────────────────────────────────────────────────
// detailIntro2 는 contentTypeId 마다 필드 이름이 다르다 — 화면에 낼 네 가지(이용 시간 · 쉬는 날 · 주차 · 요금)로 모은다.
// 값에는 <br> 같은 태그가 섞여 온다 — 줄바꿈으로 바꾸고 나머지 태그는 지운다.
const INTRO_FIELDS: Record<string, { hours: string[]; closed: string[]; parking: string[]; fee: string[] }> = {
  '12': { hours: ['usetime'], closed: ['restdate'], parking: ['parking'], fee: [] },
  '14': { hours: ['usetimeculture'], closed: ['restdateculture'], parking: ['parkingculture'], fee: ['usefee'] },
  '28': { hours: ['usetimeleports'], closed: ['restdateleports'], parking: ['parkingleports'], fee: ['usefeeleports'] },
  '38': { hours: ['opentime'], closed: ['restdateshopping'], parking: ['parkingshopping'], fee: [] },
  '39': { hours: ['opentimefood'], closed: ['restdatefood'], parking: ['parkingfood'], fee: [] },
};

export const cleanKtoText = (v: unknown): string | null => {
  const raw = coerceStrOrNull(v);
  if (raw === null) return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text === '' ? null : text;
};

export interface KtoIntro {
  hours: string | null;
  closed: string | null;
  parking: string | null;
  fee: string | null;
}

export const normalizeKtoIntro = (contentTypeId: string, item: Record<string, unknown>): KtoIntro => {
  const map = INTRO_FIELDS[contentTypeId];
  const first = (keys: string[] | undefined): string | null => {
    for (const k of keys ?? []) {
      const v = cleanKtoText(item[k]);
      if (v !== null) return v;
    }
    return null;
  };
  return { hours: first(map?.hours), closed: first(map?.closed), parking: first(map?.parking), fee: first(map?.fee) };
};
