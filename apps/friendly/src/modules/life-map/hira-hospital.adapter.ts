// 심평원 병원정보서비스 어댑터 — 건강보험심사평가원, data.go.kr 15001698
// (B551182/hospInfoServicev2). HTTPS GET, serviceKey + pageNo/numOfRows 쿼리스트링,
// _type=json. 일상지도 병의원 적재(load:life-hospitals)와 프로브만 쓴다 — 라우트 없음.
// 오퍼레이션 1개:
//   getHospBasisList  전국 병의원 기본 목록(암호화 요양기호·명칭·종별·주소·연락처·좌표)
//
// 응답 모델(에어코리아와 같은 data.go.kr 게이트웨이 규약 — 프로브 probe:hira 로 실측):
//   정상: { response: { header:{resultCode:'00'}, body:{ totalCount, pageNo, numOfRows,
//                       items:{ item:[…] } } } }
//     - items 는 행이 1개면 객체, 0개면 빈 문자열('')로 오는 게이트웨이 버릇 — 셋 다 흡수.
//   게이트웨이 오류: { OpenAPI_ServiceResponse: { cmmMsgHeader:{ errMsg, returnAuthMsg,
//                     returnReasonCode } } } — HTTP 200 또는 504 로 온다.
//     - 20/22/30 등 키·권한·쿼터 → HiraApiAuthError(적재 즉시 중단, 재시도 무의미).
//     - 04 HTTP_ERROR / 05 SERVICETIMEOUT → 짧게 1회 재시도(에어코리아와 같은 규율).
//
// serviceKey 함정(data.go.kr 공통): Encoding 키(%XX)를 URLSearchParams 에 넣으면 이중
// 인코딩 → 30 에러. bus-api.adapter 의 toServiceKeyPart 를 그대로 쓴다(동일 포털 키).
// 로깅/에러에는 키 평문 URL 을 절대 싣지 않는다 — 마스킹본(requestUrl)만.

import { coerceStrOrNull, isObject } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

export const HIRA_HOSP_BASE_URL = 'https://apis.data.go.kr/B551182/hospInfoServicev2';

// 1,000행 페이지가 ~1MB 라 게이트웨이가 느리면 20초를 넘긴다(2026-08-28 적재 실측 — 키 등록
// 직후 첫 전량 페이징에서 AbortError). 40초 + 일시 오류 재시도 2회로 방어.
const FETCH_TIMEOUT_MS = 40_000;
const RETRY_DELAY_MS = 700;
const TRANSIENT_RETRIES = 2;

const OK_RESULT_CODE = '00';
// data.go.kr 공통 NODATA — 빈 결과로 받는다.
const NO_DATA_RESULT_CODES = new Set(['03']);
// cmmMsgHeader.returnReasonCode — 우리 측(키/권한/쿼터) 이슈.
const AUTH_REASON_CODES = new Set(['20', '21', '22', '30', '31', '32', '33']);
// 재시도 대상 — 게이트웨이 HTTP_ERROR(04)/SERVICETIMEOUT(05).
const RETRYABLE_REASON_CODES = new Set(['04', '05']);

export class HiraApiError extends Error {
  readonly code: string | null;
  // 키를 '***' 로 마스킹한 요청 URL — 로깅용.
  readonly requestUrl: string | null;
  readonly responseText: string | null;

  constructor(
    message: string,
    opts: { code?: string | null; requestUrl?: string; responseText?: string; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'HiraApiError';
    this.code = opts.code ?? null;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

// 키·권한·쿼터 오류 — 재시도·다음 페이지 진행 무의미, 적재 즉시 중단.
export class HiraApiAuthError extends HiraApiError {
  constructor(message: string, opts: ConstructorParameters<typeof HiraApiError>[1] = {}) {
    super(message, opts);
    this.name = 'HiraApiAuthError';
  }
}

export interface HiraHospPage {
  totalCount: number;
  pageNo: number;
  items: Record<string, unknown>[];
  requestUrl: string;
}

export interface HiraApiCallOptions {
  serviceKey: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

const buildUrls = (params: Record<string, string>, serviceKey: string): { fetchUrl: string; requestUrl: string } => {
  const qs = new URLSearchParams(params).toString();
  const prefix = `${HIRA_HOSP_BASE_URL}/getHospBasisList?serviceKey=`;
  const suffix = qs ? `&${qs}` : '';
  return {
    fetchUrl: `${prefix}${toServiceKeyPart(serviceKey)}${suffix}`,
    requestUrl: `${prefix}***${suffix}`,
  };
};

// items 게이트웨이 버릇 — 배열/단일 객체/''(0건) 셋 다 배열로.
const narrowItems = (body: Record<string, unknown>): Record<string, unknown>[] => {
  const items = body['items'];
  if (!isObject(items)) return [];
  const item = items['item'];
  if (Array.isArray(item)) return item.filter(isObject);
  return isObject(item) ? [item] : [];
};

const parsePage = (text: string, requestUrl: string): HiraHospPage => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HiraApiError('HIRA 응답이 JSON 이 아닙니다(_type=json 미지원?)', {
      requestUrl,
      responseText: text.slice(0, 500),
    });
  }
  if (!isObject(json)) throw new HiraApiError('HIRA 응답 형식 이상', { requestUrl, responseText: text.slice(0, 500) });

  // 게이트웨이 오류 봉투.
  const gw = json['OpenAPI_ServiceResponse'];
  if (isObject(gw)) {
    const header = isObject(gw['cmmMsgHeader']) ? gw['cmmMsgHeader'] : {};
    const reason = coerceStrOrNull(header['returnReasonCode']);
    const msg = coerceStrOrNull(header['returnAuthMsg']) ?? coerceStrOrNull(header['errMsg']) ?? '게이트웨이 오류';
    if (reason !== null && AUTH_REASON_CODES.has(reason)) {
      throw new HiraApiAuthError(`HIRA 게이트웨이 ${reason}: ${msg}`, { code: reason, requestUrl });
    }
    throw new HiraApiError(`HIRA 게이트웨이 ${reason ?? '?'}: ${msg}`, { code: reason, requestUrl });
  }

  const response = isObject(json['response']) ? json['response'] : null;
  const header = response && isObject(response['header']) ? response['header'] : null;
  const resultCode = header ? coerceStrOrNull(header['resultCode']) : null;
  if (resultCode !== OK_RESULT_CODE && !(resultCode !== null && NO_DATA_RESULT_CODES.has(resultCode))) {
    const msg = header ? (coerceStrOrNull(header['resultMsg']) ?? '') : '';
    throw new HiraApiError(`HIRA resultCode ${resultCode ?? '?'}: ${msg}`, { code: resultCode, requestUrl });
  }
  const body = response && isObject(response['body']) ? response['body'] : {};
  const totalCount = Number(body['totalCount'] ?? 0);
  const pageNo = Number(body['pageNo'] ?? 0);
  return {
    totalCount: Number.isFinite(totalCount) ? totalCount : 0,
    pageNo: Number.isFinite(pageNo) ? pageNo : 0,
    items: narrowItems(body),
    requestUrl,
  };
};

// 일시 오류 판정 — 게이트웨이 04/05, HTTP 5xx, 타임아웃(Abort)·네트워크 오류. 인증(HiraApiAuthError)·
// 파싱(JSON 아님) 오류는 재시도해도 같은 답이라 즉시 던진다.
const isTransient = (e: unknown): boolean => {
  if (e instanceof HiraApiAuthError) return false;
  if (e instanceof HiraApiError) {
    return (e.code !== null && RETRYABLE_REASON_CODES.has(e.code)) || /HTTP 5\d\d|시간초과|네트워크/.test(e.message);
  }
  return false;
};

// 한 페이지 조회 — 일시 오류만 짧은 간격으로 최대 2회 재시도.
export const fetchHiraHospPage = async (
  params: { pageNo: number; numOfRows: number },
  opts: HiraApiCallOptions,
): Promise<HiraHospPage> => {
  const { fetchUrl, requestUrl } = buildUrls(
    { pageNo: String(params.pageNo), numOfRows: String(params.numOfRows), _type: 'json' },
    opts.serviceKey,
  );
  const fetchImpl = opts.fetchImpl ?? fetch;

  const once = async (): Promise<HiraHospPage> => {
    const ac = opts.signal ? null : new AbortController();
    const timer = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
    let res: Response;
    let text: string;
    try {
      res = await fetchImpl(fetchUrl, { signal: opts.signal ?? ac!.signal });
      text = await res.text();
    } catch (e) {
      // Abort(타임아웃)·네트워크 오류를 HiraApiError 로 감싸 isTransient 가 재시도하게 한다.
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new HiraApiError(aborted ? `HIRA 시간초과(${FETCH_TIMEOUT_MS / 1000}s)` : 'HIRA 네트워크 오류', {
        requestUrl,
        cause: e,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res.ok && res.status >= 500) {
      // 게이트웨이 봉투가 실려 있으면 코드 기반으로(504 SERVICETIMEOUT), 아니면 상태로.
      try {
        return parsePage(text, requestUrl);
      } catch (e) {
        if (e instanceof HiraApiAuthError) throw e;
        throw new HiraApiError(`HIRA HTTP ${res.status}`, {
          code: e instanceof HiraApiError ? e.code : null,
          requestUrl,
          responseText: text.slice(0, 500),
        });
      }
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
