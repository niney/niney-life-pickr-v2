// 집값 거래 적재 실행 — (시군구 × 계약년월 × 오퍼레이션) 파티션 목록을 세워 RTMS 를 순차 호출하고
// 파티션 교체로 쓴다. 스크립트(load:housing-trades)와 서버 월 스케줄러(housing-refresh.service)가
// 같은 함수를 부른다. 장부(HousingTradeSync)에 있는 파티션은 건너뛰되 refreshYms 에 든 연월은 다시
// 받는다(신고 지연·해제 반영). 호출은 동시성 없이 순차 + 파티션 사이 짧은 대기 — 일 10,000건 한도와
// 게이트웨이 예의. 전국 252 시군구 × 1개월 × 2 오퍼레이션 ≈ 504콜(페이지 상한에 걸리면 더).

import type { PrismaClient } from '@prisma/client';
import type { HousingDealType } from '@repo/utils';
import { normalizeHousingTradeItems, replaceHousingTradePartition } from './housing-trade-master.service.js';
import { RtmsApiAuthError, fetchRtmsPartition, type RtmsApiCallOptions, type RtmsOp } from './rtms.adapter.js';

const DEFAULT_PAUSE_MS = 150;
// 일시 오류가 이만큼 연속되면 실행을 멈춘다(업스트림 장애 중 공회전 방지).
const TRANSIENT_STOP_STREAK = 10;

export const RTMS_OP_DEAL_TYPES: Record<RtmsOp, readonly HousingDealType[]> = {
  trade: ['trade'],
  rent: ['jeonse', 'monthly'],
};

export interface HousingIngestPlanItem {
  op: RtmsOp;
  sggCd: string;
  ym: string;
}

export interface HousingIngestProgress {
  done: number;
  total: number;
  calls: number;
  rows: number;
  current: HousingIngestPlanItem;
  partitionRows: number;
}

export interface HousingIngestOptions {
  serviceKey: string;
  // 대상 계약년월('YYYYMM') 목록.
  yms: string[];
  types?: RtmsOp[];
  // 없으면 단지 마스터(kind='apt')의 DISTINCT sggCd.
  sggCds?: string[];
  // 장부에 있어도 다시 받을 연월.
  refreshYms?: string[];
  // 장부 무시(전부 다시).
  force?: boolean;
  maxCalls?: number;
  pauseMs?: number;
  pageSize?: number;
  // 수집·정규화만 하고 DB 에 쓰지 않는다.
  dryRun?: boolean;
  signal?: AbortSignal;
  fetchImpl?: RtmsApiCallOptions['fetchImpl'];
  onProgress?(p: HousingIngestProgress): void;
  onSkip?(p: { skipped: number; planned: number }): void;
}

export interface HousingIngestReport {
  planned: number;
  skippedLedger: number;
  done: number;
  calls: number;
  rows: number;
  byType: Record<HousingDealType, number>;
  dropped: number;
  transientErrors: number;
  // 게이트웨이가 페이지 크기 상한을 둔 경우 그 값(첫 관측).
  pageCap: number | null;
  stoppedBy: string | null;
  authError: RtmsApiAuthError | null;
}

export const listHousingSggCds = async (prisma: PrismaClient): Promise<string[]> =>
  (
    await prisma.housingComplex.findMany({
      where: { kind: 'apt' },
      select: { sggCd: true },
      distinct: ['sggCd'],
      orderBy: { sggCd: 'asc' },
    })
  ).map((r) => r.sggCd);

// 파티션 계획 — 최신 연월부터(한도에 걸려도 최근 데이터가 먼저), 시군구 오름차순, 매매 → 전월세.
export const planHousingPartitions = async (
  prisma: PrismaClient,
  opts: Pick<HousingIngestOptions, 'yms' | 'types' | 'sggCds' | 'refreshYms' | 'force'>,
): Promise<{ items: HousingIngestPlanItem[]; skippedLedger: number; sggCds: string[] }> => {
  const types = opts.types ?? ['trade', 'rent'];
  const sggCds = opts.sggCds && opts.sggCds.length > 0 ? [...opts.sggCds].sort() : await listHousingSggCds(prisma);
  const yms = [...new Set(opts.yms)].sort().reverse();
  const refresh = new Set(opts.refreshYms ?? []);
  const ledger = new Set<string>();
  if (!opts.force && yms.length > 0) {
    const rows = await prisma.housingTradeSync.findMany({
      where: { dealYm: { in: yms }, sggCd: { in: sggCds } },
      select: { sggCd: true, dealYm: true, dealType: true },
    });
    for (const r of rows) {
      const op: RtmsOp | null = r.dealType === 'trade' ? 'trade' : r.dealType === 'jeonse' ? 'rent' : null;
      if (op) ledger.add(`${r.sggCd}|${r.dealYm}|${op}`);
    }
  }
  const items: HousingIngestPlanItem[] = [];
  let skippedLedger = 0;
  for (const ym of yms) {
    for (const sggCd of sggCds) {
      for (const op of types) {
        if (!opts.force && !refresh.has(ym) && ledger.has(`${sggCd}|${ym}|${op}`)) {
          skippedLedger += 1;
          continue;
        }
        items.push({ op, sggCd, ym });
      }
    }
  }
  return { items, skippedLedger, sggCds };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const runHousingTradeIngest = async (prisma: PrismaClient, opts: HousingIngestOptions): Promise<HousingIngestReport> => {
  const plan = await planHousingPartitions(prisma, opts);
  const report: HousingIngestReport = {
    planned: plan.items.length,
    skippedLedger: plan.skippedLedger,
    done: 0,
    calls: 0,
    rows: 0,
    byType: { trade: 0, jeonse: 0, monthly: 0 },
    dropped: 0,
    transientErrors: 0,
    pageCap: null,
    stoppedBy: null,
    authError: null,
  };
  opts.onSkip?.({ skipped: plan.skippedLedger, planned: plan.items.length });
  const maxCalls = opts.maxCalls ?? Number.POSITIVE_INFINITY;
  const pauseMs = opts.pauseMs ?? DEFAULT_PAUSE_MS;
  let transientStreak = 0;

  for (const item of plan.items) {
    if (opts.signal?.aborted) {
      report.stoppedBy = 'aborted';
      break;
    }
    if (report.calls >= maxCalls) {
      report.stoppedBy = 'max-calls';
      break;
    }
    let partitionRows = 0;
    try {
      const res = await fetchRtmsPartition(item.op, item.sggCd, item.ym, {
        serviceKey: opts.serviceKey,
        fetchImpl: opts.fetchImpl,
        signal: opts.signal,
        pageSize: opts.pageSize,
        onPage: () => {
          report.calls += 1;
        },
      });
      if (res.pageCap !== null && report.pageCap === null) report.pageCap = res.pageCap;
      const norm = normalizeHousingTradeItems(item.op, res.items, { sggCd: item.sggCd, dealYm: item.ym });
      report.dropped += norm.droppedBadPrice + norm.droppedBadArea + norm.droppedBadDate + norm.droppedBadName;
      if (!opts.dryRun) {
        await replaceHousingTradePartition(prisma, { sggCd: item.sggCd, dealYm: item.ym, dealTypes: RTMS_OP_DEAL_TYPES[item.op] }, norm.rows);
      }
      partitionRows = norm.rows.length;
      report.rows += partitionRows;
      for (const [t, n] of norm.byType) report.byType[t] += n;
      transientStreak = 0;
    } catch (e) {
      if (e instanceof RtmsApiAuthError) {
        report.authError = e;
        report.stoppedBy = e.message;
        break;
      }
      if (opts.signal?.aborted) {
        report.stoppedBy = 'aborted';
        break;
      }
      report.transientErrors += 1;
      transientStreak += 1;
      if (transientStreak >= TRANSIENT_STOP_STREAK) {
        report.stoppedBy = `일시 장애 연속 ${transientStreak}회: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }
      continue;
    } finally {
      report.done += 1;
      opts.onProgress?.({ done: report.done, total: plan.items.length, calls: report.calls, rows: report.rows, current: item, partitionRows });
    }
    if (pauseMs > 0 && report.done < plan.items.length) await sleep(pauseMs);
  }
  return report;
};
