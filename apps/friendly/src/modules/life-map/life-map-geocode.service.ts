// 공중화장실 주소 → 좌표 — VWorld 지오코더(getcoord) 어댑터 + LifeGeocodeCache 기반 일괄 변환.
//
// 원본 CSV 에 좌표가 없고 표준데이터도 2025-02 부터 좌표를 뺐으므로 주소 지오코딩이 유일한
// 길이다. 실측(2026-08-21, 300건 표본): 도로명 83% + 지번 폴백 11% = 94%, 나머지는 열이
// 뒤바뀐 행("도로명" 열에 지번)·띄어쓰기 없는 주소 — 교차 후보로 일부 더 건진다.
// 키는 기존 VWORLD_API_KEY(WMTS 와 같은 인증키) — 일 한도가 있어(4만 건 수준) 캐시는 영구,
// 한도/키 오류(status ERROR)는 즉시 중단하고 다음 실행에서 이어간다.

import type { PrismaClient } from '@prisma/client';

export type GeocodeAddressType = 'road' | 'parcel';
export interface GeocodeCandidate {
  type: GeocodeAddressType;
  address: string;
}
export type GeocodeResult =
  | { status: 'ok'; lat: number; lng: number; refined: string | null }
  | { status: 'notfound' };

// 업스트림이 status=ERROR 로 답한 경우(키 오류·일 한도 소진 등) — 재시도 무의미, 일괄 작업 중단.
export class VworldGeocodeError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = 'VworldGeocodeError';
  }
}

const VWORLD_GEOCODE_URL = 'https://api.vworld.kr/req/address';
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_RETRIES = 4;
const FETCH_RETRY_BASE_MS = 500;
// 일시 장애(5xx·네트워크)가 이만큼 연속되면 일괄 작업을 멈춘다(업스트림 장애 중 공회전 방지).
const TRANSIENT_STOP_STREAK = 20;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// 한 건 지오코딩 — 네트워크 실패/5xx 는 4회 재시도(0.5·1·2·4초), HTTP 4xx 와 status ERROR 는
// VworldGeocodeError(재시도 없음). retryBaseMs 는 테스트용 단축 손잡이.
export const geocodeVworld = async (
  candidate: GeocodeCandidate,
  key: string,
  fetchImpl: FetchLike = fetch,
  retryBaseMs: number = FETCH_RETRY_BASE_MS,
): Promise<GeocodeResult> => {
  const params = new URLSearchParams({
    service: 'address',
    request: 'getcoord',
    version: '2.0',
    crs: 'epsg:4326',
    address: candidate.address,
    refine: 'true',
    simple: 'false',
    format: 'json',
    type: candidate.type,
    key,
  });
  const url = `${VWORLD_GEOCODE_URL}?${params.toString()}`;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < FETCH_RETRIES; attempt += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { signal: ac.signal });
      if (res.status >= 500) {
        lastErr = new Error(`vworld geocoder HTTP ${res.status}`);
      } else if (!res.ok) {
        throw new VworldGeocodeError(`vworld geocoder HTTP ${res.status}`, String(res.status));
      } else {
        const json = (await res.json().catch(() => null)) as
          | {
              response?: {
                status?: string;
                result?: { point?: { x?: string | number; y?: string | number } };
                refined?: { text?: string };
                error?: { code?: string; text?: string };
              };
            }
          | null;
        const r = json?.response;
        if (r?.status === 'OK') {
          const lat = Number(r.result?.point?.y);
          const lng = Number(r.result?.point?.x);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { status: 'ok', lat, lng, refined: typeof r.refined?.text === 'string' ? r.refined.text : null };
          }
          return { status: 'notfound' };
        }
        if (r?.status === 'NOT_FOUND') return { status: 'notfound' };
        throw new VworldGeocodeError(
          `vworld geocoder ${r?.status ?? '응답 형식 이상'}: ${r?.error?.text ?? ''}`.trim(),
          r?.error?.code ?? null,
        );
      }
    } catch (e) {
      if (e instanceof VworldGeocodeError) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, retryBaseMs * 2 ** attempt));
  }
  throw new Error(`vworld geocoder 호출 실패: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
};

// ── 주소 후보 ─────────────────────────────────────────────────────────────────
// "…동 산1-8"·"…리 102-1"·"…가 38" 로 끝나면 지번 꼴, "…로 12"·"…길 4(…)" 이면 도로명 꼴.
const PARCEL_TAIL = /(동|리|가)\s*산?\s*\d+(-\d+)?\s*$/;
const ROAD_TAIL = /(로|길)\s*(지하\s*)?\d+(-\d+)?\s*(\(|,|$)/;
const cleanAddress = (s: string): string =>
  s
    .replace(/\([^)]*\)/g, ' ') // 괄호 보조(동·건물명)
    .replace(/,\s*[^,]*$/, '') // 끝 ", 1층" 류
    .replace(/\s+/g, ' ')
    .trim();

// 행 하나의 후보 목록(순서대로 시도, 첫 성공에서 멈춤). 중복 제거, 최대 6개.
export const lifeAddressCandidates = (roadAddr: string | null, lotAddr: string | null): GeocodeCandidate[] => {
  const road = roadAddr?.replace(/\s+/g, ' ').trim() || null;
  const lot = lotAddr?.replace(/\s+/g, ' ').trim() || null;
  const out: GeocodeCandidate[] = [];
  const push = (type: GeocodeAddressType, address: string | null) => {
    if (!address || address.length < 4) return;
    if (out.some((c) => c.type === type && c.address === address)) return;
    if (out.length < 6) out.push({ type, address });
  };
  push('road', road);
  push('parcel', lot);
  // 열이 뒤바뀐 행 — 도로명 열에 지번, 지번 열에 도로명.
  if (road && PARCEL_TAIL.test(road)) push('parcel', road);
  if (lot && ROAD_TAIL.test(lot)) push('road', lot);
  // 괄호·층수 제거본.
  if (road) push('road', cleanAddress(road));
  if (lot) push('parcel', cleanAddress(lot));
  return out;
};

// ── 일괄 지오코딩 ─────────────────────────────────────────────────────────────
export interface GeocodableRow {
  roadAddr: string | null;
  lotAddr: string | null;
  lat: number | null;
  lng: number | null;
  geoSource: GeocodeAddressType | null;
}

export interface GeocodeBatchOptions {
  key: string;
  // 동시 호출 수 — 실측상 4 이상이면 업스트림이 연결을 끊는 일이 있어 기본 2.
  concurrency?: number;
  // 호출 사이 간격(ms, 워커별) — 실측(2026-08-21) 초당 ~45콜 버스트에서 502 가 나와 기본 80.
  pauseMs?: number;
  // 재시도 백오프 기준(ms) — 테스트 단축용.
  retryBaseMs?: number;
  // 이번 실행의 업스트림 호출 상한(일 한도 관리). 기본 무제한.
  maxCalls?: number;
  // 캐시만 쓰고 업스트림은 호출하지 않는다.
  offline?: boolean;
  // 캐시의 notfound 도 다시 시도.
  retryNotFound?: boolean;
  fetchImpl?: FetchLike;
  onProgress?(p: { calls: number; resolved: number; pending: number }): void;
}

export interface GeocodeBatchReport {
  rows: number;
  // 좌표가 채워진 행(캐시+신규).
  resolved: number;
  cacheHits: number;
  apiCalls: number;
  apiOk: number;
  apiNotFound: number;
  // 일시 장애(5xx·네트워크)로 건너뛴 호출 수 — 해당 행은 skipped 로 집계(다음 실행에서 재시도).
  transientErrors: number;
  // 주소 후보가 아예 없는 행.
  noCandidate: number;
  // 후보를 다 써도 못 맞춘 행(다음 실행에서도 재시도 대상 아님 — notfound 캐시).
  unresolved: number;
  // 호출 상한/오프라인으로 시도 못 한 행(다음 실행에서 이어서).
  skipped: number;
  stoppedBy: string | null;
}

interface CacheEntry {
  status: 'ok' | 'notfound';
  lat: number | null;
  lng: number | null;
  refined: string | null;
}
const cacheKey = (c: GeocodeCandidate): string => `${c.type}|${c.address}`;

// rows 의 lat/lng/geoSource 를 채운다(원본 배열을 변경). 캐시(LifeGeocodeCache) 우선, 없는
// 후보만 업스트림 — 결과는 ok/notfound 모두 캐시에 기록(200건마다 flush, 중단돼도 보존).
export const geocodeLifeRows = async (
  prisma: PrismaClient,
  rows: GeocodableRow[],
  opts: GeocodeBatchOptions,
): Promise<GeocodeBatchReport> => {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const maxCalls = opts.maxCalls ?? Number.POSITIVE_INFINITY;
  const pauseMs = Math.max(0, opts.pauseMs ?? 80);
  const report: GeocodeBatchReport = {
    rows: rows.length,
    resolved: 0,
    cacheHits: 0,
    apiCalls: 0,
    apiOk: 0,
    apiNotFound: 0,
    transientErrors: 0,
    noCandidate: 0,
    unresolved: 0,
    skipped: 0,
    stoppedBy: null,
  };

  // 캐시 전량 적재(수만 행) — 후보별 개별 조회보다 싸다.
  const cache = new Map<string, CacheEntry>();
  for (const c of await prisma.lifeGeocodeCache.findMany()) {
    cache.set(`${c.type}|${c.address}`, {
      status: c.status === 'ok' ? 'ok' : 'notfound',
      lat: c.lat,
      lng: c.lng,
      refined: c.refined,
    });
  }

  const apply = (row: GeocodableRow, c: GeocodeCandidate, e: CacheEntry): boolean => {
    if (e.status !== 'ok' || e.lat === null || e.lng === null) return false;
    row.lat = e.lat;
    row.lng = e.lng;
    row.geoSource = c.type;
    return true;
  };

  // 1) 캐시 패스 — 후보 순서대로 ok 면 채우고, 전부 notfound 면 unresolved, 미캐시 후보가
  //    남으면 pending(그 후보 인덱스부터 업스트림).
  const pending: { row: GeocodableRow; candidates: GeocodeCandidate[]; from: number }[] = [];
  for (const row of rows) {
    if (row.lat !== null && row.lng !== null) {
      report.resolved += 1;
      continue;
    }
    const candidates = lifeAddressCandidates(row.roadAddr, row.lotAddr);
    if (candidates.length === 0) {
      report.noCandidate += 1;
      continue;
    }
    let done = false;
    let firstUncached = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      const e = cache.get(cacheKey(candidates[i]!));
      if (!e || (opts.retryNotFound && e.status === 'notfound')) {
        if (firstUncached < 0) firstUncached = i;
        continue;
      }
      if (apply(row, candidates[i]!, e)) {
        report.cacheHits += 1;
        report.resolved += 1;
        done = true;
        break;
      }
    }
    if (done) continue;
    if (firstUncached < 0) {
      report.unresolved += 1;
      continue;
    }
    pending.push({ row, candidates, from: firstUncached });
  }

  if (opts.offline) {
    report.skipped = pending.length;
    report.stoppedBy = 'offline';
    return report;
  }

  // 2) 업스트림 패스 — 동시 N, 결과는 캐시 버퍼에 쌓아 주기적으로 flush.
  const buffer: { c: GeocodeCandidate; e: CacheEntry }[] = [];
  const flush = async () => {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    for (let i = 0; i < batch.length; i += 200) {
      const chunk = batch.slice(i, i + 200);
      await prisma.$transaction(
        chunk.map(({ c, e }) =>
          prisma.lifeGeocodeCache.upsert({
            where: { type_address: { type: c.type, address: c.address } },
            create: { type: c.type, address: c.address, status: e.status, lat: e.lat, lng: e.lng, refined: e.refined },
            update: { status: e.status, lat: e.lat, lng: e.lng, refined: e.refined, checkedAt: new Date() },
          }),
        ),
      );
    }
  };

  let next = 0;
  let stopped: string | null = null;
  let transientStreak = 0;
  const worker = async () => {
    while (next < pending.length && stopped === null) {
      const item = pending[next]!;
      next += 1;
      let resolved = false;
      let rowSkipped = false;
      for (let i = item.from; i < item.candidates.length; i += 1) {
        const c = item.candidates[i]!;
        const cached = cache.get(cacheKey(c));
        if (cached && !(opts.retryNotFound && cached.status === 'notfound')) {
          if (apply(item.row, c, cached)) {
            resolved = true;
            break;
          }
          continue;
        }
        if (report.apiCalls >= maxCalls) {
          stopped = 'max-calls';
          break;
        }
        report.apiCalls += 1;
        let result: GeocodeResult;
        try {
          result = await geocodeVworld(c, opts.key, opts.fetchImpl, opts.retryBaseMs);
          transientStreak = 0;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (e instanceof VworldGeocodeError) {
            // 키·한도 오류 — 더 해봐야 같은 답. 즉시 중단.
            stopped = message;
            break;
          }
          // 일시 장애 — 이 행은 건너뛰고(캐시 안 함) 다음 행으로. 연속되면 중단.
          report.transientErrors += 1;
          transientStreak += 1;
          rowSkipped = true;
          if (transientStreak >= TRANSIENT_STOP_STREAK) stopped = `일시 장애 연속 ${transientStreak}회: ${message}`;
          break;
        }
        if (pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
        const entry: CacheEntry =
          result.status === 'ok'
            ? { status: 'ok', lat: result.lat, lng: result.lng, refined: result.refined }
            : { status: 'notfound', lat: null, lng: null, refined: null };
        cache.set(cacheKey(c), entry);
        buffer.push({ c, e: entry });
        if (entry.status === 'ok') report.apiOk += 1;
        else report.apiNotFound += 1;
        if (apply(item.row, c, entry)) {
          resolved = true;
          break;
        }
      }
      if (resolved) report.resolved += 1;
      else if (stopped !== null || rowSkipped) report.skipped += 1;
      else report.unresolved += 1;
      if (report.apiCalls % 200 === 0) await flush();
      opts.onProgress?.({ calls: report.apiCalls, resolved: report.resolved, pending: pending.length - next });
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    await flush();
  }
  if (stopped !== null) {
    // 워커가 멈춘 뒤 큐에 남은 항목.
    report.skipped += Math.max(0, pending.length - next);
    report.stoppedBy = stopped;
  }
  return report;
};
