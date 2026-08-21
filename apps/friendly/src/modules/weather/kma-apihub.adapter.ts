// 기상청 API허브(apihub.kma.go.kr) 어댑터 — 방재기상관측(AWS) 매분 자료 + 지점 정보.
// data.go.kr 와 다른 포털(별도 인증키 authKey, API 별 활용신청), 응답은 JSON 이 아니라
// typ01 텍스트: '#' 로 시작하는 주석/헤더 줄 + 공백(또는 콤마) 구분 데이터 행, 결측은
// -99/-999 류 음수 센티널. 오류는 JSON {"result":{"status":403|404,"message":...}} 로 온다
// (실측 2026-08-21: 403 "활용신청이 필요한 API 입니다" / 404 "유효하지 않은 API 입니다").
//
//   stn_inf.php?inf=AWS            지점 정보(STN LON LAT HT … STN_KO)
//   cgi-bin/url/nph-aws2_min       AWS 매분 관측(TM STN WD1 WS1 WDS WSS WD10 WS10 TA RE RN-15m
//                                  RN-60m RN-12H RN-DAY HM PA PS TD) — tm2 기준 최근 1건/지점
//
// 열 이름은 응답의 '#' 헤더 줄에서 읽어 위치로 매핑한다(문서 순서를 하드코딩하지 않는다 —
// 활용신청 승인 전이라 실응답을 아직 못 봤고, 헤더 기반이면 열 추가/순서 변경에도 버틴다).

import { isObject } from '../../lib/narrow.js';

export const KMA_APIHUB_BASE_URL = 'https://apihub.kma.go.kr/api/typ01/url';
export const KMA_APIHUB_CGI_BASE_URL = 'https://apihub.kma.go.kr/api/typ01/cgi-bin/url';
const FETCH_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 700;

export class KmaApiHubError extends Error {
  readonly statusCode: number;
  readonly requestUrl: string | null;
  readonly responseText: string | null;
  constructor(
    message: string,
    opts: { statusCode?: number; requestUrl?: string; responseText?: string; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'KmaApiHubError';
    this.statusCode = opts.statusCode ?? 502;
    this.requestUrl = opts.requestUrl ?? null;
    this.responseText = opts.responseText ?? null;
  }
}

// 키 없음/미신청(403)/없는 API(404) — 우리 측 설정 이슈 → 503.
export class KmaApiHubAuthError extends KmaApiHubError {
  constructor(message: string, opts: { requestUrl?: string; responseText?: string } = {}) {
    super(message, { ...opts, statusCode: 503 });
    this.name = 'KmaApiHubAuthError';
  }
}

export interface KmaApiHubRequestOptions {
  authKey: string;
  signal?: AbortSignal;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const buildUrls = (base: string, path: string, params: Record<string, string>, authKey: string) => {
  const sp = new URLSearchParams(params);
  const qs = sp.toString();
  const prefix = `${base}/${path}?${qs ? `${qs}&` : ''}authKey=`;
  return { fetchUrl: `${prefix}${encodeURIComponent(authKey)}`, requestUrl: `${prefix}***` };
};

const scrub = (s: string, key: string): string => (key ? s.split(key).join('***') : s);

// 텍스트 표 파싱 — 마지막 '#' 헤더 줄에서 열 이름을 읽고(첫 토큰 '#' 제거), 이후 데이터 행을
// 공백/콤마로 쪼개 같은 위치의 열에 배정한다. 열 이름에 공백이 없고 데이터에도 공백이 없는
// API허브 typ01 규약을 전제. 헤더가 없으면 fallbackColumns 를 쓴다.
export interface KmaTextTable {
  columns: string[];
  rows: Record<string, string>[];
  // '#' 주석 줄 전부(진단용).
  comments: string[];
}

// 열 이름 후보 줄 판정 — '#' 뒤에 영문 토큰(STN, LON, RN-15m, YYMMDDHHMI …)만 2개 이상. 설명
// 줄("#  STN_ID : 지점번호")은 ':'·한글 때문에, 단위 줄("# KST ID deg m/s …")은 '/' 때문에 빠진다.
// 실측(2026-08-21) stn_inf 헤더에 'STN' 이 두 번 나오므로(지점번호·관할 지점) 중복 이름은
// 두 번째부터 "#2" 접미를 붙여 첫 번째가 덮이지 않게 한다.
const headerTokens = (line: string): string[] | null => {
  const tokens = line.replace(/^#+/, '').trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length < 2 || !tokens.every((t) => /^[A-Za-z][A-Za-z0-9_\-.]*$/.test(t))) return null;
  const seen = new Map<string, number>();
  return tokens.map((t) => {
    const n = (seen.get(t) ?? 0) + 1;
    seen.set(t, n);
    return n === 1 ? t : `${t}#${n}`;
  });
};

export const parseKmaTextTable = (text: string, fallbackColumns: string[] = []): KmaTextTable => {
  const lines = text.split(/\r?\n/);
  const comments: string[] = [];
  let columns: string[] = [];
  const rows: Record<string, string>[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      comments.push(line);
      const tokens = headerTokens(line);
      // 여러 후보가 있으면 'STN' 을 포함한 줄(실제 열 이름 줄)을 우선, 그다음 더 긴 줄.
      if (tokens && (columns.length === 0 || (tokens.includes('STN') && (!columns.includes('STN') || tokens.length >= columns.length)))) {
        columns = tokens;
      }
      continue;
    }
    const cols = columns.length > 0 ? columns : fallbackColumns;
    if (cols.length === 0) continue;
    // 데이터 행: 공백 또는 콤마 구분, 행 끝 '=' 무시. 값이 열 수보다 적으면 남는 열은 비움.
    const values = line.split(/[\s,]+/).filter((v) => v !== '' && v !== '=');
    const row: Record<string, string> = {};
    cols.forEach((c, i) => {
      const v = values[i];
      if (v !== undefined) row[c] = v;
    });
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return { columns: columns.length > 0 ? columns : fallbackColumns, rows, comments };
};

// 결측 센티널(-9, -99, -99.0, -99.9, -999.0 …: 실측 RE/TA 결측 "-99.9") → null. 숫자 아님 → null.
// 영하 기온(-3.5)·음수 이슬점은 9 만으로 이뤄진 패턴이 아니라 그대로 숫자.
export const kmaNumOrNull = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const s = v.trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n <= -9 && /^-9+(\.[09]+)?$/.test(s)) return null;
  return n;
};

const readError = (text: string): { status: number; message: string } | null => {
  try {
    const json: unknown = JSON.parse(text);
    if (!isObject(json)) return null;
    const result = json['result'];
    if (!isObject(result)) return null;
    const status = Number(result['status']);
    const message = typeof result['message'] === 'string' ? result['message'] : '';
    return Number.isFinite(status) ? { status, message } : null;
  } catch {
    return null;
  }
};

// 한 번의 GET — 오류 JSON 봉투/HTTP 상태를 분류하고 본문 텍스트를 돌려준다. 5xx 는 1회 재시도.
export const callKmaApiHub = async (
  base: string,
  path: string,
  params: Record<string, string>,
  opts: KmaApiHubRequestOptions,
): Promise<{ text: string; requestUrl: string }> => {
  const { fetchUrl, requestUrl } = buildUrls(base, path, params, opts.authKey);
  let lastError: KmaApiHubError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const ac = opts.signal ? null : new AbortController();
    const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
    let text: string;
    let status: number;
    try {
      const res = await fetch(fetchUrl, { signal: opts.signal ?? ac?.signal });
      status = res.status;
      // 실측: typ01 텍스트는 EUC-KR(CP949) — res.text()(UTF-8)로 읽으면 지점명이 깨진다. 오류
      // JSON 은 ASCII 라 어느 쪽으로 읽어도 같다.
      text = new TextDecoder('euc-kr').decode(await res.arrayBuffer());
    } catch (e) {
      lastError = new KmaApiHubError(scrub(e instanceof Error ? `fetch 실패: ${e.message}` : 'fetch 실패', opts.authKey), {
        requestUrl,
        cause: e,
      });
      continue;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    const err = readError(text);
    if (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        throw new KmaApiHubAuthError(`기상청 API허브 인증/활용신청 오류(${err.status}: ${err.message})`, { requestUrl, responseText: text });
      }
      lastError = new KmaApiHubError(`기상청 API허브 오류(${err.status}: ${err.message})`, { requestUrl, responseText: text });
      if (err.status < 500) throw lastError;
      continue;
    }
    if (status >= 500) {
      lastError = new KmaApiHubError(`기상청 API허브 HTTP ${status}`, { requestUrl, responseText: text.slice(0, 500) });
      continue;
    }
    if (status >= 400) {
      throw new KmaApiHubError(`기상청 API허브 HTTP ${status}`, { requestUrl, responseText: text.slice(0, 500) });
    }
    return { text, requestUrl };
  }
  throw lastError ?? new KmaApiHubError('기상청 API허브 호출 실패', { requestUrl });
};

// ── 타입드 래퍼 ──────────────────────────────────────────────────────────────

export interface RawAwsStationRow {
  stn: string | null;
  lon: number | null;
  lat: number | null;
  ht: number | null; // 해발고도 m
  name: string | null; // STN_KO
  // 원본 행(진단·미래 열 활용).
  raw: Record<string, string>;
}

const AWS_STATION_FALLBACK_COLUMNS = ['STN', 'LON', 'LAT', 'STN_SP', 'HT', 'HT_PA', 'HT_TA', 'HT_WD', 'HT_RN', 'STN_AD', 'STN_KO', 'STN_EN', 'FCT_ID', 'LAW_ID', 'BASIN'];

// AWS 지점 정보 — stn_inf.php?inf=AWS&stn=0 (tm 은 해당 시각에 유효한 지점).
export const getAwsStations = async (tm: string, opts: KmaApiHubRequestOptions): Promise<{ rows: RawAwsStationRow[]; columns: string[] }> => {
  const { text } = await callKmaApiHub(KMA_APIHUB_BASE_URL, 'stn_inf.php', { inf: 'AWS', stn: '0', tm, help: '1' }, opts);
  const table = parseKmaTextTable(text, AWS_STATION_FALLBACK_COLUMNS);
  const pick = (row: Record<string, string>, names: string[]): string | undefined => {
    for (const n of names) if (row[n] !== undefined) return row[n];
    return undefined;
  };
  const rows = table.rows
    .map((row) => ({
      stn: pick(row, ['STN', 'STN_ID']) ?? null,
      lon: kmaNumOrNull(pick(row, ['LON'])),
      lat: kmaNumOrNull(pick(row, ['LAT'])),
      ht: kmaNumOrNull(pick(row, ['HT'])),
      name: pick(row, ['STN_KO', 'STN_NM', 'STN_NAME']) ?? null,
      raw: row,
    }))
    .filter((r) => r.stn !== null && /^\d+$/.test(r.stn));
  return { rows, columns: table.columns };
};

export interface RawAwsMinuteRow {
  tm: string | null; // YYYYMMDDHHmm
  stn: string | null;
  wd1: number | null;
  ws1: number | null;
  wd10: number | null;
  ws10: number | null;
  ta: number | null; // 기온 ℃
  re: number | null; // 강수감지(0/1)
  rn15m: number | null; // mm
  rn60m: number | null;
  rn12h: number | null;
  rnDay: number | null;
  hm: number | null; // 습도 %
  pa: number | null; // 현지기압 hPa
  ps: number | null; // 해면기압
  td: number | null; // 이슬점
  raw: Record<string, string>;
}

const AWS_MINUTE_FALLBACK_COLUMNS = ['TM', 'STN', 'WD1', 'WS1', 'WDS', 'WSS', 'WD10', 'WS10', 'TA', 'RE', 'RN-15m', 'RN-60m', 'RN-12H', 'RN-DAY', 'HM', 'PA', 'PS', 'TD'];

// AWS 매분 관측 — nph-aws2_min?tm2=YYYYMMDDHHmm&stn=0 (전국, 그 시각의 최근 1건).
export const getAwsMinute = async (tm2: string, stn: string, opts: KmaApiHubRequestOptions): Promise<{ rows: RawAwsMinuteRow[]; columns: string[] }> => {
  const { text } = await callKmaApiHub(KMA_APIHUB_CGI_BASE_URL, 'nph-aws2_min', { tm2, stn, disp: '1', help: '1' }, opts);
  const table = parseKmaTextTable(text, AWS_MINUTE_FALLBACK_COLUMNS);
  const get = (row: Record<string, string>, names: string[]): string | undefined => {
    for (const n of names) if (row[n] !== undefined) return row[n];
    return undefined;
  };
  const rows = table.rows
    .map((row) => ({
      tm: get(row, ['TM', 'YYMMDDHHMI']) ?? null,
      stn: get(row, ['STN', 'STN_ID']) ?? null,
      wd1: kmaNumOrNull(get(row, ['WD1'])),
      ws1: kmaNumOrNull(get(row, ['WS1'])),
      wd10: kmaNumOrNull(get(row, ['WD10'])),
      ws10: kmaNumOrNull(get(row, ['WS10'])),
      ta: kmaNumOrNull(get(row, ['TA'])),
      re: kmaNumOrNull(get(row, ['RE'])),
      rn15m: kmaNumOrNull(get(row, ['RN-15m', 'RN_15m', 'RN15M'])),
      rn60m: kmaNumOrNull(get(row, ['RN-60m', 'RN_60m', 'RN60M'])),
      rn12h: kmaNumOrNull(get(row, ['RN-12H', 'RN_12H', 'RN12H'])),
      rnDay: kmaNumOrNull(get(row, ['RN-DAY', 'RN_DAY', 'RNDAY'])),
      hm: kmaNumOrNull(get(row, ['HM'])),
      pa: kmaNumOrNull(get(row, ['PA'])),
      ps: kmaNumOrNull(get(row, ['PS'])),
      td: kmaNumOrNull(get(row, ['TD'])),
      raw: row,
    }))
    .filter((r) => r.stn !== null && /^\d+$/.test(r.stn) && r.tm !== null && /^\d{12}$/.test(r.tm));
  return { rows, columns: table.columns };
};
