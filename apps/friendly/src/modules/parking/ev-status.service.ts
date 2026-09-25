// 전기차 충전기 상태 폴러 — croner 로 EV_STATUS_CRON(기본 10분)마다 getChargerStatus(period=10 → 최근 10분 안에 상태가
// 바뀐 충전기, 실측 ~1.3만 행 = 9,999행 × 2콜)를 받아 EvCharger.stat 을 고치고, 바뀐 충전소의 사용 가능·충전 중 칸을
// 다시 센다. 개발계정 일 1,000건 — 10분 간격이면 하루 ~290콜. 충전소 마스터가 비어 있으면(미적재) 건너뛴다.
// 모르는 충전기(적재 뒤 새로 생긴 것)는 무시 — 다음 load:ev-chargers 에서 들어온다.

import { Cron } from 'croner';
import { Prisma, type PrismaClient } from '@prisma/client';
import { EV_STAT_AVAILABLE, EV_STAT_CHARGING } from '@repo/utils';
import { coerceStrOrNull, intOrNull } from '../../lib/narrow.js';
import { EV_PAGE_SIZE, fetchEvChargerStatusPage, type FetchLike } from './parking-api.adapter.js';

interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

const PERIOD_MIN = 10;
const MAX_PAGES = 5;
const UPDATE_CHUNK = 400;

export interface EvStatusRow {
  statId: string;
  chgerId: string;
  stat: number;
  statUpdDt: string | null;
  lastTedt: string | null;
  nowTsdt: string | null;
}

export const parseEvStatusRows = (items: Record<string, unknown>[]): EvStatusRow[] => {
  const out = new Map<string, EvStatusRow>();
  for (const r of items) {
    const statId = coerceStrOrNull(r['statId'])?.trim();
    const chgerId = coerceStrOrNull(r['chgerId'])?.trim();
    const stat = intOrNull(r['stat']);
    if (!statId || !chgerId || stat === null) continue;
    const row: EvStatusRow = {
      statId,
      chgerId,
      stat,
      statUpdDt: coerceStrOrNull(r['statUpdDt'])?.trim() || null,
      lastTedt: coerceStrOrNull(r['lastTedt'])?.trim() || null,
      nowTsdt: coerceStrOrNull(r['nowTsdt'])?.trim() || null,
    };
    // 같은 충전기가 여러 번이면 상태 갱신일시가 늦은 쪽.
    const key = `${statId}|${chgerId}`;
    const prev = out.get(key);
    if (!prev || (row.statUpdDt ?? '') >= (prev.statUpdDt ?? '')) out.set(key, row);
  }
  return [...out.values()];
};

// 충전기 상태 반영 + 충전소 칸 재계산. 바뀐 충전소 수를 돌려준다. SQLite UPDATE … FROM(3.33+).
export const applyEvStatus = async (prisma: PrismaClient, rows: EvStatusRow[], at: Date): Promise<number> => {
  if (rows.length === 0) return 0;
  const statIds = new Set<string>();
  const atMs = at.getTime();
  for (let i = 0; i < rows.length; i += UPDATE_CHUNK) {
    const chunk = rows.slice(i, i + UPDATE_CHUNK);
    for (const r of chunk) statIds.add(r.statId);
    const values = Prisma.join(chunk.map((r) => Prisma.sql`(${r.statId}, ${r.chgerId}, ${r.stat}, ${r.statUpdDt}, ${r.lastTedt}, ${r.nowTsdt})`));
    await prisma.$executeRaw`
      UPDATE "ev_chargers" SET
        "stat" = v.column3,
        "statUpdDt" = v.column4,
        "lastTedt" = COALESCE(v.column5, "ev_chargers"."lastTedt"),
        "nowTsdt" = v.column6
      FROM (VALUES ${values}) AS v
      WHERE "ev_chargers"."statId" = v.column1 AND "ev_chargers"."chgerId" = v.column2`;
  }
  const ids = [...statIds];
  for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
    const chunk = ids.slice(i, i + UPDATE_CHUNK);
    await prisma.$executeRaw`
      UPDATE "ev_stations" SET
        "availableCount" = (SELECT COUNT(*) FROM "ev_chargers" c WHERE c."statId" = "ev_stations"."id" AND c."stat" = ${EV_STAT_AVAILABLE}),
        "chargingCount" = (SELECT COUNT(*) FROM "ev_chargers" c WHERE c."statId" = "ev_stations"."id" AND c."stat" = ${EV_STAT_CHARGING}),
        "statusAt" = ${atMs}
      WHERE "id" IN (${Prisma.join(chunk)})`;
  }
  return ids.length;
};

export interface EvStatusDeps {
  prisma: PrismaClient;
  log: LoggerLike;
  cron: string;
  serviceKey: string;
  timezone?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

export class EvStatusPoller {
  private cronJob: Cron | null = null;
  private running = false;

  constructor(private readonly deps: EvStatusDeps) {}

  start(): void {
    if (!this.deps.cron || !this.deps.serviceKey) return;
    this.stop();
    this.cronJob = new Cron(
      this.deps.cron,
      { timezone: this.deps.timezone ?? 'Asia/Seoul', name: 'ev-status', unref: true, catch: true },
      () => {
        void this.pollOnce();
      },
    );
    this.deps.log.info({ cron: this.deps.cron, nextRun: this.cronJob.nextRun()?.toISOString() ?? null }, '[parking] 충전기 상태 폴러 등록');
  }

  stop(): void {
    this.cronJob?.stop();
    this.cronJob = null;
  }

  async pollOnce(): Promise<{ rows: number; stations: number } | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const loaded = await this.deps.prisma.evStation.count();
      if (loaded === 0) return null;
      const items: Record<string, unknown>[] = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await fetchEvChargerStatusPage(this.deps.serviceKey, page, PERIOD_MIN, { fetchImpl: this.deps.fetchImpl });
        items.push(...res.items);
        if (res.items.length < EV_PAGE_SIZE || items.length >= res.totalCount) break;
      }
      const rows = parseEvStatusRows(items);
      const stations = await applyEvStatus(this.deps.prisma, rows, this.deps.now?.() ?? new Date());
      return { rows: rows.length, stations };
    } catch (e) {
      this.deps.log.warn({ err: e }, '[parking] 충전기 상태 폴링 실패');
      return null;
    } finally {
      this.running = false;
    }
  }
}
