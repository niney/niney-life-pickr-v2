// 등산 적재용 data.go.kr 어댑터 — 전부 DATA_GO_KR_API_KEY, 적재 스크립트에서만 부른다(요청 경로 없음).
//   - 산림청 명산등산로 15158915 `1400000/cultureInfoService/gdTrailInfoOpenAPI` — 100대 명산 100건(1콜).
//   - 산림청 산정보 15058662 `1400000/service/cultureInfoService2/mntInfoImgOpenAPI2` — 산 코드별 사진 파일명.
//     사진은 https://www.forest.go.kr/images/data/down/mountain/<파일명> (http 는 302).
//   - 한국등산트레킹지원센터 B553662 봉우리·갈림길·교통 POI — 960·7,263·511건(1,000건씩).
// 실측(2026-10-25): 산림청 두 API 는 `_type=json` 을 받는다(기본 XML). 본문에 HTML 엔티티(&lt;BR&gt;·&quot;)가 그대로
// 들어 있어 cleanForestText 로 푼다. 숫자는 숫자/문자열이 섞인다. 단건이면 item 이 배열이 아니라 객체.

import { fetchWithTimeout } from '../../lib/fetch-timeout.js';
import { isObject, numOrNull, strOrNull } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

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
}

export const fetchMountainInfos = async (name: string, opts: HikingApiOptions): Promise<MountainInfoRow[]> => {
  const { url, masked } = buildUrl(
    `${FOREST_BASE}/service/cultureInfoService2/mntInfoOpenAPI2`,
    'ServiceKey',
    { searchWrd: name, numOfRows: '50', pageNo: '1', _type: 'json' },
    opts.serviceKey,
  );
  const page = itemsOf(await getJson(url, masked, opts), masked);
  return page.items
    .map((it) => ({
      id: strOrNull(typeof it.mntilistno === 'number' ? String(it.mntilistno) : it.mntilistno)?.trim() ?? '',
      name: cleanForestText(it.mntiname) ?? '',
      address: cleanForestText(it.mntiadd),
      heightM: numOrNull(it.mntihigh),
      top100Reason: cleanForestText(it.mntitop),
    }))
    .filter((r) => r.id.length > 0 && r.name.length > 0);
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
    if (!dest) continue;
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
