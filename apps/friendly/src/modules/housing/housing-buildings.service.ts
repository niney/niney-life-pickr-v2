// 집값 단지 속성 보강(건축물대장) — 건축HUB 총괄표제부·표제부(bldg-hub.adapter)를 단지 PNU 로 조회해
// 주차대수·최고층·구조·승강기·도로명주소(+마스터가 비어 있으면 세대수·동수·사용승인일)를 HousingComplex 에
// 쓴다. 단지당 최대 2콜(총괄 1 + 표제부 1), 개발계정 일 10,000건이라 --max-calls 로 며칠에 나눈다 —
// buildingFetchedAt 이 장부라 응답이 0건이어도 찍어 두고 재호출하지 않는다(--retry-empty 로 다시).
//
// 요약 규칙(summarizeBldgRecords, 순수 함수):
//   - 주차: 총괄표제부 totPkngCnt → (없으면) 총괄의 주차 4종 합 → (없으면) 표제부 행들의 4종 합.
//   - 최고층·구조·승강기·동수: 표제부 중 주용도가 주거(아파트·공동주택·주택)인 행만(상가동 제외; 없으면 전부).
//     층수 max, 구조 최빈, 승강기 = 승용+비상 합, 동수 = 총괄 mainBldCnt → 주거 행 수.
//   - 세대수: 총괄 hhldCnt → 표제부 합. 사용승인일: 총괄 useAprDay → 표제부 최댓값('YYYYMMDD' → 'YYYY-MM-DD').
//   - 도로명주소: 총괄 newPlatPlc → 첫 표제부 newPlatPlc.

import type { PrismaClient } from '@prisma/client';
import { coerceStrOrNull, intOrNull } from '../../lib/narrow.js';
import { BldgHubApiAuthError, bldgParamsFromPnu, fetchBldgRecords, type BldgHubFetchOptions } from './bldg-hub.adapter.js';
import { isDataGoTransient } from './datago-json.adapter.js';

const DEFAULT_PAUSE_MS = 120;
const TRANSIENT_STOP_STREAK = 10;
const PROGRESS_EVERY = 100;
const CALLS_PER_COMPLEX = 2;

export interface BldgSummary {
  // 총괄·표제부 어느 쪽이든 행이 있었는지(없으면 대장에 없는 필지 — 장부만 찍는다).
  hasData: boolean;
  parkingCount: number | null;
  floorsMax: number | null;
  structure: string | null;
  elevatorCount: number | null;
  roadAddr: string | null;
  households: number | null;
  dongCount: number | null;
  approvedDate: string | null;
}

const int = (raw: Record<string, unknown>, key: string): number | null => intOrNull(raw[key]);
const positive = (n: number | null): number | null => (n !== null && n > 0 ? n : null);
const str = (raw: Record<string, unknown>, key: string): string | null => {
  const s = coerceStrOrNull(raw[key])?.trim() ?? null;
  return s && s.length > 0 ? s : null;
};
const PARKING_KEYS = ['indrAutoUtcnt', 'oudrAutoUtcnt', 'indrMechUtcnt', 'oudrMechUtcnt'];
const sumKeys = (rows: Record<string, unknown>[], keys: string[]): number | null => {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    for (const k of keys) {
      const n = int(r, k);
      if (n !== null) {
        any = true;
        sum += n;
      }
    }
  }
  return any ? sum : null;
};
// 'YYYYMMDD' → 'YYYY-MM-DD'. 다른 꼴('YYYY-MM-DD' 포함)도 앞 8자리 숫자로.
export const normalizeBldgDate = (v: string | null): string | null => {
  const digits = (v ?? '').replace(/\D/g, '');
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(digits);
  if (!m) return null;
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const RESIDENTIAL_RE = /아파트|공동주택|주택|주거/;

export const summarizeBldgRecords = (recap: Record<string, unknown>[], titles: Record<string, unknown>[]): BldgSummary => {
  const empty: BldgSummary = {
    hasData: recap.length > 0 || titles.length > 0,
    parkingCount: null,
    floorsMax: null,
    structure: null,
    elevatorCount: null,
    roadAddr: null,
    households: null,
    dongCount: null,
    approvedDate: null,
  };
  if (!empty.hasData) return empty;
  // 총괄표제부가 여럿(대지 분할)이면 세대수 큰 행.
  const main = [...recap].sort((a, b) => (int(b, 'hhldCnt') ?? 0) - (int(a, 'hhldCnt') ?? 0))[0] ?? null;
  const residential = titles.filter((t) => RESIDENTIAL_RE.test(str(t, 'mainPurpsCdNm') ?? ''));
  const rows = residential.length > 0 ? residential : titles;

  const parkingCount =
    (main ? positive(int(main, 'totPkngCnt')) : null) ?? (main ? positive(sumKeys([main], PARKING_KEYS)) : null) ?? positive(sumKeys(titles, PARKING_KEYS));
  let floorsMax: number | null = null;
  const structures = new Map<string, number>();
  let elevatorAny = false;
  let elevators = 0;
  let householdsTitle = 0;
  let approvedMax: string | null = null;
  for (const t of rows) {
    const g = positive(int(t, 'grndFlrCnt'));
    if (g !== null && (floorsMax === null || g > floorsMax)) floorsMax = g;
    const s = str(t, 'strctCdNm');
    if (s) structures.set(s, (structures.get(s) ?? 0) + 1);
    const ride = int(t, 'rideUseElvtCnt');
    const emg = int(t, 'emgenUseElvtCnt');
    if (ride !== null || emg !== null) {
      elevatorAny = true;
      elevators += (ride ?? 0) + (emg ?? 0);
    }
    householdsTitle += int(t, 'hhldCnt') ?? 0;
    const d = normalizeBldgDate(str(t, 'useAprDay'));
    if (d && (approvedMax === null || d > approvedMax)) approvedMax = d;
  }
  const structure = [...structures.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return {
    hasData: true,
    parkingCount,
    floorsMax,
    structure,
    elevatorCount: elevatorAny ? elevators : null,
    roadAddr: (main ? str(main, 'newPlatPlc') : null) ?? titles.map((t) => str(t, 'newPlatPlc')).find((v) => v !== null) ?? null,
    households: (main ? positive(int(main, 'hhldCnt')) : null) ?? positive(householdsTitle),
    dongCount: (main ? positive(int(main, 'mainBldCnt')) : null) ?? positive(rows.length),
    approvedDate: (main ? normalizeBldgDate(str(main, 'useAprDay')) : null) ?? approvedMax,
  };
};

// 단지 하나(PNU) → 총괄 + 표제부 조회 → 요약. PNU 형식이 아니면 null(호출 0).
export const fetchBldgSummaryForPnu = async (
  pnu: string,
  opts: BldgHubFetchOptions,
): Promise<{ summary: BldgSummary | null; calls: number }> => {
  const params = bldgParamsFromPnu(pnu);
  if (!params) return { summary: null, calls: 0 };
  const recap = await fetchBldgRecords('recap', params, opts);
  const title = await fetchBldgRecords('title', params, opts);
  return { summary: summarizeBldgRecords(recap.items, title.items), calls: recap.calls + title.calls };
};

// 요약을 단지에 쓴다 — 주차·최고층·구조는 값이 있으면 덮어쓰고, 승강기·도로명·세대수·동수·사용승인일은
// 비어 있을 때만. buildingFetchedAt 은 항상(0건이어도) 찍는다.
export const applyBldgSummary = async (prisma: PrismaClient, complexId: string, s: BldgSummary, now: Date): Promise<void> => {
  const c = await prisma.housingComplex.findUnique({
    where: { id: complexId },
    select: { elevatorCount: true, roadAddr: true, households: true, dongCount: true, approvedDate: true },
  });
  if (!c) return;
  await prisma.housingComplex.update({
    where: { id: complexId },
    data: {
      buildingFetchedAt: now,
      ...(s.parkingCount !== null ? { parkingCount: s.parkingCount } : {}),
      ...(s.floorsMax !== null ? { floorsMax: s.floorsMax } : {}),
      ...(s.structure !== null ? { structure: s.structure } : {}),
      ...(c.elevatorCount === null && s.elevatorCount !== null ? { elevatorCount: s.elevatorCount } : {}),
      ...(c.roadAddr === null && s.roadAddr !== null ? { roadAddr: s.roadAddr } : {}),
      ...(c.households === null && s.households !== null ? { households: s.households } : {}),
      ...(c.dongCount === null && s.dongCount !== null ? { dongCount: s.dongCount } : {}),
      ...(c.approvedDate === null && s.approvedDate !== null ? { approvedDate: s.approvedDate } : {}),
    },
  });
};

export interface LoadHousingBuildingsOptions extends BldgHubFetchOptions {
  maxCalls?: number;
  sggCds?: string[];
  // 이미 조회했지만 주차·층·구조가 전부 비어 있는 단지를 다시(기본은 미조회 단지만).
  retryEmpty?: boolean;
  pauseMs?: number;
  now?: () => Date;
  onProgress?(p: LoadHousingBuildingsProgress): void;
}
export interface LoadHousingBuildingsProgress {
  done: number;
  total: number;
  calls: number;
  withData: number;
  empty: number;
  currentId: string;
}
export interface LoadHousingBuildingsReport {
  targets: number;
  done: number;
  calls: number;
  withData: number;
  empty: number;
  transientErrors: number;
  stoppedBy: string | null;
  authError: BldgHubApiAuthError | null;
}

// 대상 = PNU 가 있고 아직 조회하지 않은 아파트 단지, 세대수 큰 순(큰 단지부터 채워지게). 순차 + 짧은 대기.
export const loadHousingBuildings = async (prisma: PrismaClient, opts: LoadHousingBuildingsOptions): Promise<LoadHousingBuildingsReport> => {
  const targets = await prisma.housingComplex.findMany({
    where: {
      kind: 'apt',
      pnu: { not: null },
      ...(opts.sggCds && opts.sggCds.length > 0 ? { sggCd: { in: opts.sggCds } } : {}),
      ...(opts.retryEmpty ? { parkingCount: null, floorsMax: null, structure: null } : { buildingFetchedAt: null }),
    },
    select: { id: true, pnu: true },
    orderBy: [{ households: 'desc' }, { id: 'asc' }],
  });
  const report: LoadHousingBuildingsReport = {
    targets: targets.length,
    done: 0,
    calls: 0,
    withData: 0,
    empty: 0,
    transientErrors: 0,
    stoppedBy: null,
    authError: null,
  };
  const maxCalls = opts.maxCalls ?? Number.POSITIVE_INFINITY;
  const pauseMs = opts.pauseMs ?? DEFAULT_PAUSE_MS;
  let transientStreak = 0;
  for (const t of targets) {
    if (opts.signal?.aborted) {
      report.stoppedBy = 'aborted';
      break;
    }
    if (report.calls + CALLS_PER_COMPLEX > maxCalls) {
      report.stoppedBy = 'max-calls';
      break;
    }
    try {
      const { summary, calls } = await fetchBldgSummaryForPnu(t.pnu!, opts);
      report.calls += calls;
      transientStreak = 0;
      if (summary) {
        await applyBldgSummary(prisma, t.id, summary, opts.now?.() ?? new Date());
        if (summary.hasData) report.withData += 1;
        else report.empty += 1;
      } else {
        // PNU 형식 이상 — 조회 불가로 찍어 두고 넘어간다.
        await prisma.housingComplex.update({ where: { id: t.id }, data: { buildingFetchedAt: opts.now?.() ?? new Date() } });
        report.empty += 1;
      }
      report.done += 1;
    } catch (e) {
      if (e instanceof BldgHubApiAuthError) {
        report.authError = e;
        report.stoppedBy = e.message;
        break;
      }
      if (opts.signal?.aborted) {
        report.stoppedBy = 'aborted';
        break;
      }
      if (!isDataGoTransient(e)) throw e;
      report.transientErrors += 1;
      transientStreak += 1;
      if (transientStreak >= TRANSIENT_STOP_STREAK) {
        report.stoppedBy = `일시 장애 연속 ${transientStreak}회: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }
      continue;
    } finally {
      if (report.done % PROGRESS_EVERY === 0 || report.done === targets.length) {
        opts.onProgress?.({ done: report.done, total: targets.length, calls: report.calls, withData: report.withData, empty: report.empty, currentId: t.id });
      }
    }
    if (pauseMs > 0 && report.done < targets.length) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  if (report.done > 0) await prisma.housingSync.create({ data: { kind: 'buildings', count: report.done, sourceFile: 'bldg-hub' } });
  return report;
};
