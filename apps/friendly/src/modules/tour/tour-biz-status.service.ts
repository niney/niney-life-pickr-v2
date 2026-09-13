// 여행로그 장소의 폐업 확인 — 영수증 사업자번호(TourSpend.brno, 장소별 최빈값)로 국세청 「사업자등록정보 진위확인 및
// 상태조회」(data.go.kr 15081808, odcloud) 를 100건/콜로 조회해 TourPlaceBizStatus 에 저장한다. 2023년 표본이라
// 문 닫은 가게가 섞여 있어, 발굴 시드를 크롤하기 전에 거르는 용도. 키는 DATA_GO_KR_API_KEY(계정 공용 —
// 이 데이터셋에 활용신청이 되어 있어야 하며, 안 돼 있으면 401/403 → auth 로 즉시 중단).
//
// 응답(프로브·공식 문서): { status_code:'OK', request_cnt, match_cnt, data:[{ b_no, b_stt:'계속사업자'|'휴업자'|'폐업자'|'',
//   b_stt_cd:'01'|'02'|'03'|'', tax_type, tax_type_cd, end_dt:'YYYYMMDD'|'', … }] }. 미등록 번호는 b_stt '' + tax_type 안내문.
// 실행: scripts/check-tour-biz.ts · 어드민 /admin/tour/biz-status/run. 순수 함수(정규화·파싱)는 export 해 테스트한다.

import type { PrismaClient } from '@prisma/client';
import type { TourBizCheckResultType, TourRegionType } from '@repo/api-contract';
import { TOUR_RESTAURANT_TYPE_SHORTS } from '@repo/utils';
import { fetchWithTimeout } from '../../lib/fetch-timeout.js';
import { isObject } from '../../lib/narrow.js';
import { toServiceKeyPart } from '../bus/bus-api.adapter.js';

export const NTS_STATUS_URL = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
export const NTS_BATCH = 100;
const FETCH_TIMEOUT_MS = 20_000;

export type NtsErrorKind = 'auth' | 'quota' | 'transient' | 'format';
export class NtsApiError extends Error {
  constructor(
    message: string,
    readonly kind: NtsErrorKind,
    readonly httpStatus: number | null,
  ) {
    super(message);
    this.name = 'NtsApiError';
  }
}

export type BizStatusKind = '계속사업자' | '휴업자' | '폐업자' | 'unknown';

export interface NtsBizStatus {
  bNo: string;
  bStt: BizStatusKind;
  bSttCd: string | null;
  // 'YYYY-MM-DD'.
  endDt: string | null;
  taxType: string | null;
}

// 사업자번호 정규화 — 숫자 10자리만 유효('123-45-67890' 도 허용).
export const normalizeBrno = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
};

const toStatusKind = (v: unknown): BizStatusKind => (v === '계속사업자' || v === '휴업자' || v === '폐업자' ? v : 'unknown');
const toEndDt = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const d = v.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
};

export const parseNtsStatusResponse = (json: unknown): NtsBizStatus[] => {
  if (!isObject(json) || !Array.isArray(json['data'])) throw new NtsApiError('국세청 응답 형식 이상(data 배열 없음)', 'format', null);
  const out: NtsBizStatus[] = [];
  for (const row of json['data']) {
    if (!isObject(row)) continue;
    const bNo = normalizeBrno(typeof row['b_no'] === 'string' ? row['b_no'] : null);
    if (!bNo) continue;
    out.push({
      bNo,
      bStt: toStatusKind(row['b_stt']),
      bSttCd: typeof row['b_stt_cd'] === 'string' && row['b_stt_cd'] !== '' ? row['b_stt_cd'] : null,
      endDt: toEndDt(row['end_dt']),
      taxType: typeof row['tax_type'] === 'string' && row['tax_type'] !== '' ? row['tax_type'] : null,
    });
  }
  return out;
};

export interface NtsFetchOptions {
  serviceKey: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

// 최대 100건 한 번 조회. 키·권한(401/403) → auth, 429 → quota, 그 외 non-2xx → transient.
export const fetchNtsBizStatus = async (bNos: string[], opts: NtsFetchOptions): Promise<NtsBizStatus[]> => {
  if (bNos.length === 0) return [];
  if (bNos.length > NTS_BATCH) throw new Error(`한 번에 ${NTS_BATCH}건까지`);
  const url = `${NTS_STATUS_URL}?serviceKey=${toServiceKeyPart(opts.serviceKey)}`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ b_no: bNos }),
  };
  const res = opts.fetchImpl ? await opts.fetchImpl(url, init) : await fetchWithTimeout(url, init, opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new NtsApiError(`국세청 API 인증 실패(${res.status}) — DATA_GO_KR_API_KEY 의 15081808 활용신청 확인`, 'auth', res.status);
  if (res.status === 429) throw new NtsApiError('국세청 API 일 한도 초과(429)', 'quota', res.status);
  if (!res.ok) throw new NtsApiError(`국세청 API ${res.status}: ${text.slice(0, 200)}`, 'transient', res.status);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new NtsApiError('국세청 응답이 JSON 이 아닙니다', 'format', res.status);
  }
  return parseNtsStatusResponse(json);
};

// ── 대상 수집 ─────────────────────────────────────────────────────────────
export interface TourPlaceBrno {
  placeId: string;
  brno: string;
  storeNm: string | null;
  n: number;
}

interface BrnoRow {
  placeId: string;
  brno: string;
  storeNm: string | null;
  n: number | bigint;
}

// 장소별 영수증 사업자번호 최빈값. 대상은 식당류 유형 + 방문자 하한(+ 제주). 43k 행 GROUP BY 한 번, in-절 없음.
export const collectTourPlaceBrnos = async (
  prisma: PrismaClient,
  opts: { region: TourRegionType; minTravelers: number },
): Promise<TourPlaceBrno[]> => {
  const eligible = await prisma.tourPlace.findMany({
    where: {
      typeShort: { in: [...TOUR_RESTAURANT_TYPE_SHORTS] },
      nTravelers: { gte: opts.minTravelers },
      ...(opts.region === 'jeju' ? { isJeju: true } : {}),
    },
    select: { id: true },
  });
  const wanted = new Set(eligible.map((p) => p.id));
  const rows = await prisma.$queryRaw<BrnoRow[]>`
    SELECT placeId, brno, storeNm, count(*) AS n
    FROM tour_spend
    WHERE placeId IS NOT NULL AND brno IS NOT NULL AND brno <> ''
    GROUP BY placeId, brno, storeNm`;
  // 같은 번호가 '123-45-67890'·'1234567890' 으로 갈라져 오므로 정규화한 뒤 합산해 최빈값을 고른다.
  const perPlace = new Map<string, Map<string, TourPlaceBrno>>();
  for (const r of rows) {
    if (!wanted.has(r.placeId)) continue;
    const brno = normalizeBrno(r.brno);
    if (!brno) continue;
    const n = Number(r.n);
    let byBrno = perPlace.get(r.placeId);
    if (!byBrno) {
      byBrno = new Map();
      perPlace.set(r.placeId, byBrno);
    }
    const cur = byBrno.get(brno);
    if (cur) cur.n += n;
    else byBrno.set(brno, { placeId: r.placeId, brno, storeNm: r.storeNm, n });
  }
  const best: TourPlaceBrno[] = [];
  for (const byBrno of perPlace.values()) {
    let top: TourPlaceBrno | null = null;
    for (const v of byBrno.values()) if (!top || v.n > top.n) top = v;
    if (top) best.push(top);
  }
  return best;
};

// ── 실행 ───────────────────────────────────────────────────────────────────
export interface BizCheckOptions {
  serviceKey: string;
  maxCalls?: number;
  minTravelers?: number;
  region?: TourRegionType;
  force?: boolean;
  recheckDays?: number;
  fetchImpl?: NtsFetchOptions['fetchImpl'];
  now?: () => Date;
  onProgress?: (done: number, total: number) => void;
}

const kindKey = (k: BizStatusKind): keyof TourBizCheckResultType['byStatus'] =>
  k === '계속사업자' ? 'open' : k === '휴업자' ? 'suspended' : k === '폐업자' ? 'closed' : 'unknown';

// 대상 수집 → 30일 안에 조회한 장소 제외(force 면 전부) → 100건씩 호출 → upsert. 인증·쿼터 오류는 즉시 중단(부분 결과 유지).
export const checkTourBizStatus = async (prisma: PrismaClient, opts: BizCheckOptions): Promise<TourBizCheckResultType> => {
  const now = opts.now ?? (() => new Date());
  const maxCalls = opts.maxCalls ?? 10;
  const result: TourBizCheckResultType = {
    candidates: 0,
    pending: 0,
    calls: 0,
    checked: 0,
    byStatus: { open: 0, suspended: 0, closed: 0, unknown: 0 },
    stopped: 'done',
    error: null,
  };
  if (!opts.serviceKey) {
    result.stopped = 'auth';
    result.error = 'DATA_GO_KR_API_KEY 가 없습니다';
    return result;
  }
  const all = await collectTourPlaceBrnos(prisma, { region: opts.region ?? 'jeju', minTravelers: opts.minTravelers ?? 3 });
  result.candidates = all.length;

  const cutoff = new Date(now().getTime() - (opts.recheckDays ?? 30) * 86_400_000);
  const recent = new Set(
    opts.force
      ? []
      : (await prisma.tourPlaceBizStatus.findMany({ where: { checkedAt: { gte: cutoff } }, select: { placeId: true } })).map((r) => r.placeId),
  );
  const pending = all.filter((p) => !recent.has(p.placeId)).sort((a, b) => b.n - a.n);
  result.pending = pending.length;

  for (let i = 0; i < pending.length; i += NTS_BATCH) {
    if (result.calls >= maxCalls) {
      result.stopped = 'maxCalls';
      break;
    }
    const chunk = pending.slice(i, i + NTS_BATCH);
    // 같은 사업자번호가 여러 장소에 있으면(프랜차이즈) 한 번만 묻는다.
    const bNos = [...new Set(chunk.map((p) => p.brno))];
    let statuses: NtsBizStatus[];
    try {
      statuses = await fetchNtsBizStatus(bNos, { serviceKey: opts.serviceKey, fetchImpl: opts.fetchImpl });
    } catch (e) {
      result.stopped = e instanceof NtsApiError && (e.kind === 'auth' || e.kind === 'quota') ? e.kind : 'error';
      result.error = e instanceof Error ? e.message : String(e);
      break;
    }
    result.calls += 1;
    const byNo = new Map(statuses.map((s) => [s.bNo, s]));
    const at = now();
    for (const p of chunk) {
      const s = byNo.get(p.brno);
      if (!s) continue;
      await prisma.tourPlaceBizStatus.upsert({
        where: { placeId: p.placeId },
        create: { placeId: p.placeId, brno: p.brno, storeNm: p.storeNm, bStt: s.bStt, bSttCd: s.bSttCd, endDt: s.endDt, taxType: s.taxType, checkedAt: at },
        update: { brno: p.brno, storeNm: p.storeNm, bStt: s.bStt, bSttCd: s.bSttCd, endDt: s.endDt, taxType: s.taxType, checkedAt: at },
      });
      result.checked += 1;
      result.byStatus[kindKey(s.bStt)] += 1;
    }
    opts.onProgress?.(Math.min(i + NTS_BATCH, pending.length), pending.length);
  }
  return result;
};
