// 주차 실시간 폴러 — croner 로 PARKING_LIVE_CRON(기본 5분)마다 서울 시영 실시간(GetParkingInfo 1콜)·한국공항공사 주차
// 혼잡도(1콜)·인천공항 주차(1콜)를 받아 메모리에 두고, 혼잡 이력(ParkingOccupancyStat, key×KST 요일×시)에 점유율을
// 누적한다. 단일 인스턴스 인프로세스(CLAUDE.md no-Redis) — 재기동하면 첫 폴링(기동 직후)까지 실시간이 빈다.
// 원천 하나가 실패해도 나머지는 갱신하고, 실패한 쪽은 이전 값을 유지(stale 표시). 원천 갱신 시각이 오래된 값(서울 연계
// 끊김 등)은 실시간·이력 모두에서 뺀다.

import { Cron } from 'croner';
import type { PrismaClient } from '@prisma/client';
import {
  PARKING_AIRPORTS,
  PARKING_FULL_RATIO,
  PARKING_PATTERN_MIN_SAMPLES,
  parkingAirportByApiName,
  parkingKstSlot,
  parkingLevelOf,
  type ParkingLevel,
} from '@repo/utils';
import { coerceStrOrNull, intOrNull, numOrNull } from '../../lib/narrow.js';
import {
  SEOUL_PARKING_LIVE,
  callSeoulOpen,
  fetchIncheonParking,
  fetchKacParkingCongestion,
  type FetchLike,
} from './parking-api.adapter.js';
import { seoulExcludedOper } from './parking-master.service.js';

interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

// 원천 갱신 시각이 이보다 오래되면 실시간으로 보지 않는다(서울 '통신점검중' 류).
const LIVE_MAX_AGE_MS = 2 * 60 * 60_000;
// 이력에는 이보다 신선한 값만 — 같은 값이 반복 누적되지 않게.
const HISTORY_MAX_AGE_MS = 30 * 60_000;
// 같은 이력 칸의 최소 기록 간격(5분 폴링보다 조금 짧게).
const HISTORY_MIN_GAP_MS = 4 * 60_000;

export interface ParkingLiveValue {
  total: number | null;
  occupied: number | null;
  available: number | null;
  level: ParkingLevel | null;
  updatedAt: string | null;
  fetchedAt: string;
}

export interface AirportLotLive extends ParkingLiveValue {
  airportCode: string;
  name: string;
  rate: number | null;
}

export interface ParkingLiveDeps {
  prisma: PrismaClient;
  log: LoggerLike;
  // 빈 문자열이면 스케줄 등록 안 함(요청 시 값이 없다).
  cron: string;
  seoulKey: string;
  dataGoKrKey: string;
  timezone?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

// 'YYYY-MM-DD HH:MM:SS' | 'YYYYMMDDHHMMSS(.sss)' (KST) → ISO. 깨진 값은 null.
export const kstToIso = (raw: string | null): string | null => {
  if (!raw) return null;
  const s = raw.trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})[ T]?(\d{2}):?(\d{2}):?(\d{2})?/.exec(s);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const liveOf = (total: number | null, occupied: number | null, updatedAt: string | null, fetchedAt: string): ParkingLiveValue => {
  const t = total !== null && total > 0 ? total : null;
  const o = occupied !== null && occupied >= 0 ? occupied : null;
  return {
    total: t,
    occupied: o,
    available: t !== null && o !== null ? Math.max(0, t - o) : null,
    level: parkingLevelOf(t, o),
    updatedAt,
    fetchedAt,
  };
};

// 서울 시영 실시간 행 → (key, 값). 연계 코드(PRK_STTS_YN)가 '1'(20분 이내)·'2'(2시간 이내)만.
export const parseSeoulLiveRows = (rows: Record<string, unknown>[], fetchedAt: string): Map<string, ParkingLiveValue> => {
  const out = new Map<string, ParkingLiveValue>();
  for (const r of rows) {
    const code = coerceStrOrNull(r['PKLT_CD'])?.trim();
    const stts = coerceStrOrNull(r['PRK_STTS_YN'])?.trim();
    if (!code || (stts !== '1' && stts !== '2') || seoulExcludedOper(r['OPER_SE_NM']) !== null) continue;
    const occupied = intOrNull(r['NOW_PRK_VHCL_CNT']);
    const total = intOrNull(r['TPKCT']);
    if (occupied === null || total === null) continue;
    out.set(`seoul:${code}`, liveOf(total, occupied, kstToIso(coerceStrOrNull(r['NOW_PRK_VHCL_UPDT_TM'])), fetchedAt));
  }
  return out;
};

// 한국공항공사 혼잡도 행 → 공항 주차장. 면수 0(청주 제4주차장 등)은 값 없음으로.
export const parseKacRows = (rows: Record<string, unknown>[], fetchedAt: string): AirportLotLive[] => {
  const out: AirportLotLive[] = [];
  for (const r of rows) {
    const airport = parkingAirportByApiName(coerceStrOrNull(r['airportKor']) ?? '');
    const name = coerceStrOrNull(r['parkingAirportCodeName'])?.trim();
    if (!airport || !name) continue;
    const total = numOrNull(r['parkingTotalSpace']);
    const occupied = numOrNull(r['parkingOccupiedSpace']);
    const date = coerceStrOrNull(r['sysGetdate']);
    const time = coerceStrOrNull(r['sysGettime']);
    const v = liveOf(total !== null ? Math.round(total) : null, occupied !== null ? Math.round(occupied) : null, kstToIso(date && time ? `${date} ${time}` : null), fetchedAt);
    out.push({ ...v, airportCode: airport.code, name, rate: v.total !== null && v.occupied !== null ? v.occupied / v.total : null });
  }
  return out;
};

// 인천공항 구역 행(floor·parking=현재 대수·parkingarea=면수·datetm).
export const parseIncheonRows = (rows: Record<string, unknown>[], fetchedAt: string): AirportLotLive[] => {
  const out: AirportLotLive[] = [];
  for (const r of rows) {
    const name = coerceStrOrNull(r['floor'])?.trim();
    if (!name) continue;
    const v = liveOf(intOrNull(r['parkingarea']), intOrNull(r['parking']), kstToIso(coerceStrOrNull(r['datetm'])), fetchedAt);
    out.push({ ...v, airportCode: 'ICN', name, rate: v.total !== null && v.occupied !== null ? v.occupied / v.total : null });
  }
  return out;
};

export const airportLotKey = (airportCode: string, name: string): string => `airport:${airportCode}:${name}`;

export class ParkingLiveService {
  private cronJob: Cron | null = null;
  private running = false;
  private lots = new Map<string, ParkingLiveValue>();
  private lotAt: string | null = null;
  private airportLots: AirportLotLive[] = [];
  private airportAt: string | null = null;
  private airportStale = false;

  constructor(private readonly deps: ParkingLiveDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  start(): void {
    if (!this.deps.cron) return;
    this.stop();
    this.cronJob = new Cron(
      this.deps.cron,
      { timezone: this.deps.timezone ?? 'Asia/Seoul', name: 'parking-live', unref: true, catch: true },
      () => {
        void this.pollOnce();
      },
    );
    // 기동 직후 한 번 — 첫 cron 까지 실시간이 비지 않게.
    void this.pollOnce();
    this.deps.log.info({ cron: this.deps.cron, nextRun: this.cronJob.nextRun()?.toISOString() ?? null }, '[parking] 실시간 폴러 등록');
  }

  stop(): void {
    this.cronJob?.stop();
    this.cronJob = null;
  }

  // 원천 하나씩 — 실패는 로그만 남기고 이전 값 유지. 겹치면 건너뜀.
  async pollOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const fetchedAt = this.now().toISOString();
    const nowMs = this.now().getTime();
    const history: { key: string; rate: number }[] = [];
    const fresh = (v: ParkingLiveValue, maxAge: number): boolean =>
      v.updatedAt === null || nowMs - new Date(v.updatedAt).getTime() <= maxAge;
    try {
      if (this.deps.seoulKey) {
        try {
          const page = await callSeoulOpen(SEOUL_PARKING_LIVE, 1, 1000, this.deps.seoulKey, { fetchImpl: this.deps.fetchImpl });
          const parsed = parseSeoulLiveRows(page.items, fetchedAt);
          const next = new Map<string, ParkingLiveValue>();
          for (const [k, v] of parsed) {
            if (!fresh(v, LIVE_MAX_AGE_MS)) continue;
            next.set(k, v);
            if (fresh(v, HISTORY_MAX_AGE_MS) && v.total !== null && v.occupied !== null) history.push({ key: k, rate: v.occupied / v.total });
          }
          this.lots = next;
          this.lotAt = fetchedAt;
        } catch (e) {
          this.deps.log.warn({ err: e }, '[parking] 서울 실시간 폴링 실패 — 이전 값 유지');
        }
      }
      if (this.deps.dataGoKrKey) {
        const results = await Promise.allSettled([
          fetchKacParkingCongestion(this.deps.dataGoKrKey, { fetchImpl: this.deps.fetchImpl }),
          fetchIncheonParking(this.deps.dataGoKrKey, { fetchImpl: this.deps.fetchImpl }),
        ]);
        const [kac, iiac] = results;
        const prevBy = (code: string) => this.airportLots.filter((l) => (code === 'ICN' ? l.airportCode === 'ICN' : l.airportCode !== 'ICN'));
        const kacLots = kac.status === 'fulfilled' ? parseKacRows(kac.value.items, fetchedAt) : prevBy('KAC');
        const iiacLots = iiac.status === 'fulfilled' ? parseIncheonRows(iiac.value.items, fetchedAt) : prevBy('ICN');
        if (kac.status === 'rejected') this.deps.log.warn({ err: kac.reason }, '[parking] 한국공항공사 주차 폴링 실패 — 이전 값 유지');
        if (iiac.status === 'rejected') this.deps.log.warn({ err: iiac.reason }, '[parking] 인천공항 주차 폴링 실패 — 이전 값 유지');
        this.airportLots = [...iiacLots, ...kacLots];
        this.airportStale = kac.status === 'rejected' || iiac.status === 'rejected';
        if (kac.status === 'fulfilled' || iiac.status === 'fulfilled') this.airportAt = fetchedAt;
        for (const l of [...(kac.status === 'fulfilled' ? kacLots : []), ...(iiac.status === 'fulfilled' ? iiacLots : [])]) {
          if (l.rate !== null && fresh(l, HISTORY_MAX_AGE_MS)) history.push({ key: airportLotKey(l.airportCode, l.name), rate: l.rate });
        }
      }
      if (history.length > 0) await this.recordHistory(history);
    } catch (e) {
      this.deps.log.error({ err: e }, '[parking] 실시간 폴링 실패');
    } finally {
      this.running = false;
    }
  }

  // 이력 칸 누적 — (key, 요일, 시) 하나당 한 행. 점유율은 초과 주차를 고려해 1.5 로 자른다. 같은 칸을 4분 안에 다시
  // 쓰지 않는다(재기동 직후 폴링·겹친 cron 이 표본을 부풀리지 않게).
  private async recordHistory(items: { key: string; rate: number }[]): Promise<void> {
    const { dow, hour } = parkingKstSlot(this.now());
    // Prisma 는 SQLite DateTime 을 epoch ms 정수로 저장한다 — raw SQL 도 같은 형식으로.
    const updatedAt = this.now().getTime();
    await this.deps.prisma.$transaction(
      items.map(({ key, rate }) => {
        const occ = Math.min(1.5, Math.max(0, rate));
        const full = rate >= PARKING_FULL_RATIO ? 1 : 0;
        return this.deps.prisma.$executeRaw`
          INSERT INTO "parking_occupancy_stats" ("key", "dow", "hour", "samples", "occSum", "fullCount", "updatedAt")
          VALUES (${key}, ${dow}, ${hour}, 1, ${occ}, ${full}, ${updatedAt})
          ON CONFLICT ("key", "dow", "hour") DO UPDATE SET
            "samples" = "samples" + 1,
            "occSum" = "occSum" + excluded."occSum",
            "fullCount" = "fullCount" + excluded."fullCount",
            "updatedAt" = excluded."updatedAt"
          WHERE "parking_occupancy_stats"."updatedAt" <= excluded."updatedAt" - ${HISTORY_MIN_GAP_MS}`;
      }),
    );
  }

  // ── 조회 ──
  // 폴링이 계속 실패해 남은 오래된 값은 실시간으로 내보내지 않는다(원천 갱신 시각, 없으면 폴링 시각 기준).
  private isFresh(v: ParkingLiveValue): boolean {
    return this.now().getTime() - new Date(v.updatedAt ?? v.fetchedAt).getTime() <= LIVE_MAX_AGE_MS;
  }
  getLot(liveKey: string | null | undefined): ParkingLiveValue | null {
    const v = liveKey ? this.lots.get(liveKey) : undefined;
    return v && this.isFresh(v) ? v : null;
  }
  liveKeys(): string[] {
    return [...this.lots.entries()].filter(([, v]) => this.isFresh(v)).map(([k]) => k);
  }
  lotStatus(): { count: number; at: string | null } {
    return { count: this.lots.size, at: this.lotAt };
  }
  airportSnapshot(): { lots: AirportLotLive[]; at: string | null; stale: boolean } {
    return { lots: this.airportLots, at: this.airportAt, stale: this.airportStale };
  }

  // 오늘(KST) 요일의 24시간 평소 점유율 — 표본 부족 칸은 null. 표본이 하나도 없으면 null.
  async getPattern(key: string): Promise<{ dow: number; hours: { hour: number; occ: number | null; fullRatio: number | null; samples: number }[]; minSamples: number } | null> {
    const { dow } = parkingKstSlot(this.now());
    const rows = await this.deps.prisma.parkingOccupancyStat.findMany({ where: { key, dow } });
    if (rows.length === 0) return null;
    const byHour = new Map(rows.map((r) => [r.hour, r]));
    return {
      dow,
      minSamples: PARKING_PATTERN_MIN_SAMPLES,
      hours: Array.from({ length: 24 }, (_, hour) => {
        const r = byHour.get(hour);
        const ok = r !== undefined && r.samples >= PARKING_PATTERN_MIN_SAMPLES;
        return {
          hour,
          occ: ok ? r!.occSum / r!.samples : null,
          fullRatio: ok ? r!.fullCount / r!.samples : null,
          samples: r?.samples ?? 0,
        };
      }),
    };
  }

  // 지금 (요일, 시) 칸의 평소 점유율 — 공항 목록용. 키 여러 개를 한 번에.
  async usualNow(keys: string[]): Promise<Map<string, number>> {
    if (keys.length === 0) return new Map();
    const { dow, hour } = parkingKstSlot(this.now());
    const rows = await this.deps.prisma.parkingOccupancyStat.findMany({
      where: { key: { in: keys }, dow, hour, samples: { gte: PARKING_PATTERN_MIN_SAMPLES } },
    });
    return new Map(rows.map((r) => [r.key, r.occSum / r.samples]));
  }
}

// 공항 목록 조립 — 상수 공항 순서대로, 폴링된 주차장을 붙이고 공항 합계로 대표 단계.
export const buildAirportList = (lots: AirportLotLive[], usual: Map<string, number>) =>
  PARKING_AIRPORTS.map((a) => {
    const mine = lots.filter((l) => l.airportCode === a.code);
    const counted = mine.filter((l) => l.total !== null && l.occupied !== null);
    const total = counted.length > 0 ? counted.reduce((s, l) => s + l.total!, 0) : null;
    const occupied = counted.length > 0 ? counted.reduce((s, l) => s + l.occupied!, 0) : null;
    return {
      code: a.code,
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      total,
      occupied,
      level: parkingLevelOf(total, occupied),
      lots: mine.map((l) => ({
        name: l.name,
        total: l.total,
        occupied: l.occupied,
        rate: l.rate,
        level: l.level,
        updatedAt: l.updatedAt,
        usualOcc: usual.get(airportLotKey(l.airportCode, l.name)) ?? null,
      })),
    };
  });
