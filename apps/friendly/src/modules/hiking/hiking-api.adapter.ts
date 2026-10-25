// 등산 data.go.kr 어댑터 — 전부 DATA_GO_KR_API_KEY. 산불위험예보(conditions)만 요청 경로에서, 나머지는 적재 스크립트에서 부른다.
//   - 산림청 명산등산로 15158915 `1400000/cultureInfoService/gdTrailInfoOpenAPI` — 100대 명산 100건(1콜).
//   - 산림청 산정보 15058662 `1400000/service/cultureInfoService2/mntInfoImgOpenAPI2` — 산 코드별 사진 파일명.
//     사진은 https://www.forest.go.kr/images/data/down/mountain/<파일명> (http 는 302).
//   - 한국등산트레킹지원센터 B553662 봉우리·갈림길·교통 POI — 960·7,263·511건(1,000건씩).
// 실측(2026-10-25): 산림청 두 API 는 `_type=json` 을 받는다(기본 XML). 본문에 HTML 엔티티(&lt;BR&gt;·&quot;)가 그대로
// 들어 있어 cleanForestText 로 푼다. 숫자는 숫자/문자열이 섞인다. 단건이면 item 이 배열이 아니라 객체.

import { fetchWithTimeout } from '../../lib/fetch-timeout.js';
import { isObject, numOrNull, strOrNull } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';
import { isEmptySignDest } from './hiking-gpx.js';

const FOREST_BASE = 'https://apis.data.go.kr/1400000';
const TREKKING_BASE = 'https://apis.data.go.kr/B553662';
export const FOREST_IMAGE_BASE = 'https://www.forest.go.kr/images/data/down/mountain/';
const TIMEOUT_MS = 20_000;
const RETRIES = 2;
const RETRY_DELAY_MS = 1_000;
const TREKKING_PAGE_SIZE = 1_000;
const TREKKING_MAX_PAGES = 20;

export class HikingApiError extends Error {
  readonly requestUrl: string;
  constructor(message: string, requestUrl: string) {
    super(message);
    this.name = 'HikingApiError';
    this.requestUrl = requestUrl;
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface HikingApiOptions {
  serviceKey: string;
  fetchImpl?: FetchLike;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 게이트웨이 오류(`OpenAPI_ServiceResponse`·미신청 30 등)는 재시도하지 않는다. 네트워크·5xx 만 재시도.
const getJson = async (url: string, maskedUrl: string, opts: HikingApiOptions): Promise<Record<string, unknown>> => {
  const doFetch = opts.fetchImpl ?? ((u: string, init?: RequestInit) => fetchWithTimeout(u, init ?? {}, TIMEOUT_MS));
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep((opts.retryDelayMs ?? RETRY_DELAY_MS) * attempt);
    let res: Response;
    try {
      res = await doFetch(url);
    } catch (e) {
      lastErr = e;
      continue;
    }
    const text = await res.text();
    if (res.status >= 500) {
      lastErr = new HikingApiError(`HTTP ${res.status}`, maskedUrl);
      continue;
    }
    if (text.includes('OpenAPI_ServiceResponse') || text.startsWith('<')) {
      const reason = /<returnAuthMsg>([^<]*)/.exec(text)?.[1] ?? /errMsg[^A-Z_]*([A-Z_]+)/.exec(text)?.[1] ?? 'XML 오류 응답';
      throw new HikingApiError(`data.go.kr 오류: ${reason}`, maskedUrl);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new HikingApiError(`JSON 아님: ${text.slice(0, 120)}`, maskedUrl);
    }
    if (!isObject(json)) throw new HikingApiError('응답 형식 오류', maskedUrl);
    return json;
  }
  throw new HikingApiError(`요청 실패: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`, maskedUrl);
};

const buildUrl = (base: string, keyParam: string, params: Record<string, string>, serviceKey: string) => {
  const qs = new URLSearchParams(params).toString();
  return {
    url: `${base}?${keyParam}=${toServiceKeyPart(serviceKey)}&${qs}`,
    masked: `${base}?${keyParam}=***&${qs}`,
  };
};

interface ItemsPage {
  items: Record<string, unknown>[];
  totalCount: number;
}
const itemsOf = (json: Record<string, unknown>, maskedUrl: string): ItemsPage => {
  const res = isObject(json.response) ? json.response : null;
  const header = res && isObject(res.header) ? res.header : null;
  const code = header ? String(header.resultCode ?? '') : '';
  if (code !== '00' && code !== '0') throw new HikingApiError(`resultCode ${code} ${String(header?.resultMsg ?? '')}`, maskedUrl);
  const body = res && isObject(res.body) ? res.body : null;
  const rawItems = body && isObject(body.items) ? body.items.item : null;
  const items = Array.isArray(rawItems) ? rawItems.filter(isObject) : isObject(rawItems) ? [rawItems] : [];
  return { items, totalCount: numOrNull(body?.totalCount) ?? items.length };
};

// 산림청 본문 — HTML 엔티티를 풀고 <br> 은 줄바꿈, 나머지 태그는 지운다. 빈 줄은 하나로.
export const cleanForestText = (v: unknown): string | null => {
  const s = strOrNull(typeof v === 'number' ? String(v) : v);
  if (!s) return null;
  const out = s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x?d;|&#13;/gi, '\n')
    .replace(/&amp;/gi, '&')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return out.length > 0 ? out : null;
};

// ── 명산등산로 ────────────────────────────────────────────────────────────────

export interface GdTrailRow {
  // 산 코드(mntncd). 실측 2026-10-25: 방장산만 비어 있다 → 스크립트가 산정보(fetchMountainInfos)로 채운다.
  id: string | null;
  name: string;
  heightM: number | null;
  area: string | null;
  subtitle: string | null;
  overview: string | null;
  details: string | null;
  reason: string | null;
  officialCourses: string | null;
}

export const normalizeGdTrail = (it: Record<string, unknown>): GdTrailRow | null => {
  const id = strOrNull(typeof it.mntncd === 'number' ? String(it.mntncd) : it.mntncd)?.trim() || null;
  const name = cleanForestText(it.mntnm);
  if (!name) return null;
  return {
    id,
    name,
    heightM: numOrNull(it.mntheight),
    area: cleanForestText(it.areanm),
    subtitle: cleanForestText(it.subnm),
    overview: cleanForestText(it.overview),
    details: cleanForestText(it.details),
    reason: cleanForestText(it.aeatreason),
    officialCourses: cleanForestText(it.etccourse),
  };
};

export const fetchGdTrails = async (opts: HikingApiOptions): Promise<GdTrailRow[]> => {
  const { url, masked } = buildUrl(`${FOREST_BASE}/cultureInfoService/gdTrailInfoOpenAPI`, 'serviceKey', { numOfRows: '200', pageNo: '1', _type: 'json' }, opts.serviceKey);
  const page = itemsOf(await getJson(url, masked, opts), masked);
  return page.items.map(normalizeGdTrail).filter((r): r is GdTrailRow => r !== null);
};

// ── 산정보(3,368산) — 산 코드 보충용 ────────────────────────────────────────────

export interface MountainInfoRow {
  id: string;
  name: string;
  address: string | null;
  heightM: number | null;
  // 100대 명산 선정 이유 — 동명산 중 100대 명산을 고르는 단서.
  top100Reason: string | null;
  // 산 소개(mntidetails) — 실측 4,705산 중 1,683산만 글이 있고 나머지는 "( - )" 같은 빈 표기라 null.
  details: string | null;
}

const MOUNTAIN_INFO_URL = `${FOREST_BASE}/service/cultureInfoService2/mntInfoOpenAPI2`;
// 산정보 전체 받기 — 1,000건씩(실측 2026-10-25: 4,705산 5콜).
const MOUNTAIN_INFO_PAGE_SIZE = 1_000;
const MOUNTAIN_INFO_MAX_PAGES = 10;

const toMountainInfo = (it: Record<string, unknown>): MountainInfoRow => {
  const details = cleanForestText(it.mntidetails);
  // 높이 0 은 비어 있다는 표기(실측: 4,705산 중 1,326산 — 우면산 0m).
  const height = numOrNull(it.mntihigh);
  return {
    id: strOrNull(typeof it.mntilistno === 'number' ? String(it.mntilistno) : it.mntilistno)?.trim() ?? '',
    name: cleanForestText(it.mntiname) ?? '',
    address: cleanForestText(it.mntiadd),
    heightM: height !== null && height > 0 ? height : null,
    top100Reason: cleanForestText(it.mntitop),
    details: details && details.replace(/[\s()·.,-]/g, '').length >= 20 ? details : null,
  };
};

export const fetchMountainInfos = async (name: string, opts: HikingApiOptions): Promise<MountainInfoRow[]> => {
  const { url, masked } = buildUrl(MOUNTAIN_INFO_URL, 'ServiceKey', { searchWrd: name, numOfRows: '50', pageNo: '1', _type: 'json' }, opts.serviceKey);
  const page = itemsOf(await getJson(url, masked, opts), masked);
  return page.items.map(toMountainInfo).filter((r) => r.id.length > 0 && r.name.length > 0);
};

// 산정보 전체 — 전국 주요 봉우리(좌표만 있다)에 소개·높이·소재지를 붙이는 데 쓴다.
export const fetchAllMountainInfos = async (opts: HikingApiOptions): Promise<MountainInfoRow[]> => {
  const out: MountainInfoRow[] = [];
  for (let pageNo = 1; pageNo <= MOUNTAIN_INFO_MAX_PAGES; pageNo++) {
    const { url, masked } = buildUrl(
      MOUNTAIN_INFO_URL,
      'ServiceKey',
      { numOfRows: String(MOUNTAIN_INFO_PAGE_SIZE), pageNo: String(pageNo), _type: 'json' },
      opts.serviceKey,
    );
    const page = itemsOf(await getJson(url, masked, opts), masked);
    out.push(...page.items.map(toMountainInfo).filter((r) => r.id.length > 0 && r.name.length > 0));
    if (page.items.length < MOUNTAIN_INFO_PAGE_SIZE || out.length >= page.totalCount) break;
  }
  return out;
};

// 봉우리 ↔ 산정보 — 이름(끝 괄호를 뗀 것도)이 같고 소재지 문구에 봉우리 시군구 이름이 들어 있는 것이 하나뿐일 때만.
// 시군구는 [먼저 볼 것(이름 괄호의 지역·정상 시군구), …코스가 걸친 시군구] — 산은 경계(능선)에 많아 정상 하나로만 보면 소재지가
// 이웃 시군구인 산을 놓친다(실측: 정상 시군구만으로 1,662곳, 걸친 시군구까지 보면 더 맞는다). 여럿 걸리면 먼저 볼 것으로 좁히고,
// 그래도 여럿이면 동명산이라 묻지 않는다(null).
export const matchPeakInfo = (
  peakName: string,
  sigungu: { preferred: readonly string[]; others: readonly string[] },
  byName: ReadonlyMap<string, readonly MountainInfoRow[]>,
): MountainInfoRow | null => {
  const base = peakName.replace(/\s*\([^)]*\)/g, '').trim();
  const cands = byName.get(peakName) ?? byName.get(base) ?? [];
  const inAny = (r: MountainInfoRow, names: readonly string[]): boolean =>
    names.some((n) => {
      const short = n.replace(/(시|군|구)$/, '');
      return !!r.address && (r.address.includes(n) || (short.length >= 2 && r.address.includes(short)));
    });
  const hits = cands.filter((r) => inAny(r, [...sigungu.preferred, ...sigungu.others]));
  if (hits.length <= 1) return hits[0] ?? null;
  const preferred = hits.filter((r) => inAny(r, sigungu.preferred));
  return preferred.length === 1 ? preferred[0]! : null;
};

// ── 브이월드 역지오코딩 — 들머리 리·동 이름 ─────────────────────────────────────
// 전국 봉우리 코스에는 지점이 없어 들머리 이름을 지번 주소의 리·동으로 짓는다(가까운 역·정류장·주차장이 없을 때).
// VWORLD_API_KEY(지오코더와 같은 키, 일 4만 건 수준). 2D데이터·WMS 와 달리 Referer 없이 된다(2026-10-25 실측).
// 응답 text 예: "강원특별자치도 인제군 기린면 진동리 산 34" → 진동리, "서울특별시 관악구 신림동 310-10" → 신림동.
const VWORLD_ADDRESS_URL = 'https://api.vworld.kr/req/address';

export class VworldAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VworldAddressError';
  }
}

export const villageOfAddress = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const tokens = text.split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 1; i--) {
    const t = tokens[i]!;
    if (/^[가-힣0-9]+(리|동|가)$/.test(t) && /[가-힣]{2,}/.test(t) && !/^\d/.test(t)) return t;
  }
  return null;
};

// 못 찾으면(바다·경계 밖) null, 키·한도 오류(status ERROR·HTTP 4xx)는 VworldAddressError — 일괄 작업은 멈추고 다음에 잇는다.
// 네트워크 오류·5xx 는 동시에 여럿 보낼 때 잠깐씩 났다(실측: 동시 4개 → 수백 건 만에 502·fetch failed, 차례로 보내면 없음) —
// 1·2·4초 뒤 다시 묻고, 그래도 안 되면 VworldTransientError(그 점만 건너뛴다).
const REVERSE_RETRIES = 3;
export class VworldTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VworldTransientError';
  }
}
export const reverseGeocodeVillage = async (
  p: { lat: number; lng: number },
  key: string,
  fetchImpl: FetchLike = (u, init) => fetchWithTimeout(u, init ?? {}, TIMEOUT_MS),
  retryBaseMs = 1_000,
): Promise<string | null> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await reverseGeocodeOnce(p, key, fetchImpl);
    } catch (e) {
      const transient = !(e instanceof VworldAddressError) || /HTTP 5\d\d/.test(e.message);
      if (!transient) throw e;
      if (attempt >= REVERSE_RETRIES) throw new VworldTransientError(`브이월드 주소 요청 실패: ${e instanceof Error ? e.message : String(e)}`);
      await sleep(retryBaseMs * 2 ** attempt);
    }
  }
};

const reverseGeocodeOnce = async (p: { lat: number; lng: number }, key: string, fetchImpl: FetchLike): Promise<string | null> => {
  const params = new URLSearchParams({
    service: 'address',
    request: 'getAddress',
    version: '2.0',
    crs: 'epsg:4326',
    point: `${p.lng},${p.lat}`,
    format: 'json',
    type: 'parcel',
    zipcode: 'false',
    simple: 'false',
    key,
  });
  const res = await fetchImpl(`${VWORLD_ADDRESS_URL}?${params.toString()}`);
  if (!res.ok) throw new VworldAddressError(`브이월드 주소 HTTP ${res.status}`);
  const json: unknown = await res.json();
  const r = isObject(json) && isObject(json.response) ? json.response : null;
  const status = r ? String(r.status ?? '') : '';
  if (status === 'NOT_FOUND') return null;
  if (status !== 'OK') {
    const err = r && isObject(r.error) ? `${String(r.error.code ?? '')} ${String(r.error.text ?? '')}` : status;
    throw new VworldAddressError(`브이월드 주소 오류: ${err.trim()}`);
  }
  const first = Array.isArray(r!.result) ? r!.result[0] : null;
  return villageOfAddress(isObject(first) ? strOrNull(first.text) : null);
};

// 명산등산로 행에 맞는 산정보 — 이름이 같고, 100대 명산 선정 이유가 있거나 소재지 시군이 겹치는 것. 여럿이면 높이가 가까운 것.
export const pickMountainInfo = (gd: Pick<GdTrailRow, 'name' | 'area' | 'heightM'>, rows: readonly MountainInfoRow[]): MountainInfoRow | null => {
  const base = gd.name.replace(/\s*\([^)]*\)\s*$/, '');
  const towns = (gd.area ?? '').match(/[가-힣]+(?:시|군|구)(?=\s|,|ㆍ|$)/g) ?? [];
  const pool = rows.filter((r) => r.name === base && (r.top100Reason !== null || towns.some((t) => r.address?.includes(t))));
  if (pool.length === 0) return null;
  const score = (r: MountainInfoRow): number => (gd.heightM !== null && r.heightM !== null ? -Math.abs(r.heightM - gd.heightM) : 0);
  return pool.reduce((a, b) => (score(b) > score(a) ? b : a));
};

// ── 산 사진 ────────────────────────────────────────────────────────────────────

export interface MountainImageRow {
  no: number;
  file: string;
}

export const fetchMountainImages = async (mountainId: string, opts: HikingApiOptions): Promise<MountainImageRow[]> => {
  const { url, masked } = buildUrl(
    `${FOREST_BASE}/service/cultureInfoService2/mntInfoImgOpenAPI2`,
    'ServiceKey',
    { mntiListNo: mountainId, numOfRows: '20', pageNo: '1', _type: 'json' },
    opts.serviceKey,
  );
  const page = itemsOf(await getJson(url, masked, opts), masked);
  return page.items
    .map((it) => ({ no: numOrNull(it.imgno), file: strOrNull(it.imgfilename)?.trim() ?? null }))
    .filter((r): r is MountainImageRow => r.no !== null && !!r.file && /^[\w.-]+\.(jpe?g|png)$/i.test(r.file))
    .sort((a, b) => a.no - b.no);
};

export const downloadForestImage = async (file: string, opts: Pick<HikingApiOptions, 'fetchImpl'> = {}): Promise<Buffer> => {
  const url = `${FOREST_IMAGE_BASE}${encodeURIComponent(file)}`;
  const doFetch = opts.fetchImpl ?? ((u: string, init?: RequestInit) => fetchWithTimeout(u, init ?? {}, TIMEOUT_MS));
  const res = await doFetch(url);
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new HikingApiError(`사진 받기 실패 HTTP ${res.status} ${type}`, url);
  return Buffer.from(await res.arrayBuffer());
};

// ── 산림청 산불위험예보(시군구) — 요청 경로(conditions)에서 부른다 ─────────────────────
// 15084817 `1400377/forestPointV2/forestPointListSigunguSearchV2`. 실측(2026-10-25): 시도·시군구를 비우면 전국 229곳을 한 번에
// 준다. excludeForecast=0 이어야 예보(3시간 간격 ≈4일)까지 오고, 생략하면 현재 분석만 온다. numOfRows=10000 한 장(≈7,800행,
// 1.7MB, 1.5초). 등급별 면적 d1~d4(%)·지수 평균/최대. 시도 코드는 현행(강원 51·전북 52·전남광주 12), 울릉군은 몇 달 묵은 행만
// 온다(호출측이 오래된 칸을 버린다). area 는 "2,399"/997 처럼 문자열·숫자가 섞여 쓰지 않는다.

const FIRE_URL = 'https://apis.data.go.kr/1400377/forestPointV2/forestPointListSigunguSearchV2';

export interface FireRiskRow {
  // "<시도 코드>:<시군구 이름>"(hiking-area sigunguKeyOf 와 같은 키).
  key: string;
  sido: string;
  name: string;
  // 분석·예보 시각 ISO(+09:00).
  at: string;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  mean: number | null;
  max: number | null;
}

// "2026-10-25 10" → ISO.
const fireTimeToIso = (v: unknown): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2})$/.exec(strOrNull(v)?.trim() ?? '');
  return m ? `${m[1]}T${m[2]}:00:00+09:00` : null;
};

export const normalizeFireRisk = (it: Record<string, unknown>): FireRiskRow | null => {
  const sido = numOrNull(it.upplocalcd);
  const name = strOrNull(it.sigun)?.trim();
  const at = fireTimeToIso(it.analdate);
  if (sido === null || !name || !at) return null;
  return {
    key: `${sido}:${name}`,
    sido: strOrNull(it.doname)?.trim() ?? '',
    name,
    at,
    d1: numOrNull(it.d1) ?? 0,
    d2: numOrNull(it.d2) ?? 0,
    d3: numOrNull(it.d3) ?? 0,
    d4: numOrNull(it.d4) ?? 0,
    mean: numOrNull(it.meanavg),
    max: numOrNull(it.maxi),
  };
};

export const fetchFireRisk = async (opts: HikingApiOptions): Promise<FireRiskRow[]> => {
  const { url, masked } = buildUrl(FIRE_URL, 'ServiceKey', { numOfRows: '10000', pageNo: '1', _type: 'json', excludeForecast: '0' }, opts.serviceKey);
  const page = itemsOf(await getJson(url, masked, opts), masked);
  return page.items.map(normalizeFireRisk).filter((r): r is FireRiskRow => r !== null);
};

// ── 한국등산트레킹지원센터 POI ──────────────────────────────────────────────────

export const TREKKING_POI_KINDS = {
  peak: 'peakPoiInfoService/getPeakPoiInfoList',
  sign: 'frkrdInfoService/getFrkrdInfoList',
  trans: 'trnspPoiInfoService/getTrnspPoiInfoList',
} as const;
export type TrekkingPoiKind = keyof typeof TREKKING_POI_KINDS;

export interface TrekkingPoiRow {
  poiId: string;
  // 숲길명 = GPX 폴더 이름(산 이름).
  mountainName: string;
  category: string;
  name: string | null;
  description: string | null;
  lat: number;
  lng: number;
  ele: number | null;
  signposts: { dest: string; dir: string | null }[];
}

export const normalizeTrekkingPoi = (it: Record<string, unknown>): TrekkingPoiRow | null => {
  const poiId = strOrNull(it.poiId)?.trim();
  const mountainName = strOrNull(it.frtrlNm)?.trim();
  const category = strOrNull(it.orgnPlaceTpeCd)?.trim();
  const lat = numOrNull(it.lat);
  const lng = numOrNull(it.lot);
  if (!poiId || !mountainName || !category || lat === null || lng === null) return null;
  const signposts: TrekkingPoiRow['signposts'] = [];
  for (let i = 1; i <= 4; i++) {
    const dest = strOrNull(it[`sgnpstDstn${i}Nm`])?.trim();
    if (!dest || isEmptySignDest(dest)) continue;
    signposts.push({ dest, dir: strOrNull(it[`orgnSgnpstDstn${i}DrcntCd`])?.trim() || null });
  }
  const ele = numOrNull(it.aslAltide);
  return {
    poiId,
    mountainName,
    category,
    name: strOrNull(it.placeNm)?.trim() || null,
    description: strOrNull(it.dscrtCn)?.trim() || null,
    lat,
    lng,
    ele: ele !== null && ele > 0 ? ele : null,
    signposts,
  };
};

export const fetchTrekkingPois = async (kind: TrekkingPoiKind, opts: HikingApiOptions): Promise<TrekkingPoiRow[]> => {
  const out: TrekkingPoiRow[] = [];
  for (let pageNo = 1; pageNo <= TREKKING_MAX_PAGES; pageNo++) {
    const { url, masked } = buildUrl(
      `${TREKKING_BASE}/${TREKKING_POI_KINDS[kind]}`,
      'serviceKey',
      { type: 'json', numOfRows: String(TREKKING_PAGE_SIZE), pageNo: String(pageNo) },
      opts.serviceKey,
    );
    const page = itemsOf(await getJson(url, masked, opts), masked);
    for (const it of page.items) {
      const row = normalizeTrekkingPoi(it);
      if (row) out.push(row);
    }
    if (page.items.length < TREKKING_PAGE_SIZE || pageNo * TREKKING_PAGE_SIZE >= page.totalCount) break;
  }
  return out;
};
