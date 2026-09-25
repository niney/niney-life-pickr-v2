// 전기차 충전소 마스터 적재 — 환경공단 충전기 정보(getChargerInfo, 전국 ~52만 기, 9,999행 × ~53콜)를 받아 충전소(statId)
// 단위로 접고 충전기 행과 함께 전량 교체한다. 삭제 표시(delYn=Y)·버스 전용(11)·좌표 없음은 뺀다. 적재 시점 상태로
// 집계 칸을 채우고, 이후는 상태 폴러(ev-status.service)가 갱신한다.

import type { PrismaClient } from '@prisma/client';
import { EV_STAT_AVAILABLE, EV_STAT_CHARGING, isEvChargerFast } from '@repo/utils';
import { coerceStrOrNull, intOrNull, numOrNull } from '../../lib/narrow.js';
import { EV_PAGE_SIZE, fetchEvChargerInfoPage, type ParkingCallOptions } from './parking-api.adapter.js';

const CREATE_CHUNK = 500;
const REPLACE_TX_TIMEOUT_MS = 30 * 60_000;
// 페이징 안전 상한 — 52만/9,999 ≈ 53.
const MAX_PAGES = 120;
const BUS_ONLY_TYPE = '11';

export interface EvChargerRow {
  statId: string;
  chgerId: string;
  type: string;
  outputKw: number | null;
  method: string | null;
  fast: boolean;
  stat: number;
  statUpdDt: string | null;
  lastTedt: string | null;
  nowTsdt: string | null;
}

export interface EvStationRow {
  id: string;
  name: string;
  addr: string | null;
  addrDetail: string | null;
  location: string | null;
  lat: number;
  lng: number;
  useTime: string | null;
  busiId: string | null;
  operator: string | null;
  operatorCall: string | null;
  parkingFree: boolean | null;
  limited: boolean | null;
  limitDetail: string | null;
  note: string | null;
  kind: string | null;
  kindDetail: string | null;
  floorType: string | null;
  floorNum: string | null;
  zcode: string | null;
  chargerCount: number;
  fastCount: number;
  availableCount: number;
  chargingCount: number;
  hasFast: boolean;
  statusAt: Date;
}

export interface EvReport {
  stations: EvStationRow[];
  chargers: EvChargerRow[];
  droppedDeleted: number;
  droppedBusOnly: number;
  droppedBadId: number;
  droppedBadCoord: number;
  duplicates: number;
}

const text = (v: unknown): string | null => {
  const s = coerceStrOrNull(v)?.replace(/\s+/g, ' ').trim() ?? '';
  return s.length > 0 && s !== 'null' ? s : null;
};
const yn = (v: unknown): boolean | null => {
  const s = coerceStrOrNull(v)?.trim().toUpperCase() ?? '';
  return s === 'Y' ? true : s === 'N' ? false : null;
};
const inKorea = (lat: number | null, lng: number | null): boolean =>
  lat !== null && lng !== null && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;

export const normalizeEvChargerItems = (items: Record<string, unknown>[], now: Date = new Date()): EvReport => {
  const report: EvReport = { stations: [], chargers: [], droppedDeleted: 0, droppedBusOnly: 0, droppedBadId: 0, droppedBadCoord: 0, duplicates: 0 };
  const stations = new Map<string, EvStationRow>();
  const seen = new Set<string>();
  for (const r of items) {
    const statId = text(r['statId']);
    const chgerId = text(r['chgerId']);
    const name = text(r['statNm']);
    if (!statId || !chgerId || !name) {
      report.droppedBadId += 1;
      continue;
    }
    if (yn(r['delYn']) === true) {
      report.droppedDeleted += 1;
      continue;
    }
    const type = text(r['chgerType']) ?? '';
    if (type === BUS_ONLY_TYPE) {
      report.droppedBusOnly += 1;
      continue;
    }
    const key = `${statId}|${chgerId}`;
    if (seen.has(key)) {
      report.duplicates += 1;
      continue;
    }
    let st = stations.get(statId);
    if (!st) {
      const lat = numOrNull(r['lat']);
      const lng = numOrNull(r['lng']);
      if (!inKorea(lat, lng)) {
        report.droppedBadCoord += 1;
        continue;
      }
      st = {
        id: statId,
        name,
        addr: text(r['addr']),
        addrDetail: text(r['addrDetail']),
        location: text(r['location']),
        lat: lat!,
        lng: lng!,
        useTime: text(r['useTime']),
        busiId: text(r['busiId']),
        operator: text(r['busiNm']) ?? text(r['bnm']),
        operatorCall: text(r['busiCall']),
        parkingFree: yn(r['parkingFree']),
        limited: yn(r['limitYn']),
        limitDetail: text(r['limitDetail']),
        note: text(r['note']),
        kind: text(r['kind']),
        kindDetail: text(r['kindDetail']),
        floorType: text(r['floorType']),
        floorNum: text(r['floorNum']),
        zcode: text(r['zcode']),
        chargerCount: 0,
        fastCount: 0,
        availableCount: 0,
        chargingCount: 0,
        hasFast: false,
        statusAt: now,
      };
      stations.set(statId, st);
    }
    seen.add(key);
    const outputKw = numOrNull(r['output']);
    const fast = isEvChargerFast(type, outputKw);
    const stat = intOrNull(r['stat']) ?? 9;
    report.chargers.push({
      statId,
      chgerId,
      type,
      outputKw: outputKw !== null && outputKw > 0 ? outputKw : null,
      method: text(r['method']),
      fast,
      stat,
      statUpdDt: text(r['statUpdDt']),
      lastTedt: text(r['lastTedt']),
      nowTsdt: text(r['nowTsdt']),
    });
    st.chargerCount += 1;
    if (fast) {
      st.fastCount += 1;
      st.hasFast = true;
    }
    if (stat === EV_STAT_AVAILABLE) st.availableCount += 1;
    if (stat === EV_STAT_CHARGING) st.chargingCount += 1;
  }
  report.stations = [...stations.values()];
  return report;
};

export interface FetchAllEvOptions extends ParkingCallOptions {
  serviceKey: string;
  maxPages?: number;
  zcode?: string;
  onPage?(p: { pageNo: number; fetched: number; totalCount: number }): void;
}

// 전량 페이징 — 순차(동시 호출 없음). 페이지당 ~10MB.
export const fetchAllEvChargers = async (opts: FetchAllEvOptions): Promise<{ items: Record<string, unknown>[]; totalCount: number; pages: number }> => {
  const items: Record<string, unknown>[] = [];
  let totalCount = 0;
  let page = 1;
  for (; page <= (opts.maxPages ?? MAX_PAGES); page += 1) {
    const res = await fetchEvChargerInfoPage(opts.serviceKey, page, { fetchImpl: opts.fetchImpl, zcode: opts.zcode });
    totalCount = res.totalCount;
    items.push(...res.items);
    opts.onPage?.({ pageNo: page, fetched: items.length, totalCount });
    if (res.items.length < EV_PAGE_SIZE || items.length >= totalCount) break;
  }
  return { items, totalCount, pages: page };
};

// 전량 교체 — 충전소·충전기를 한 트랜잭션에서 비우고 청크로 넣는다(52만 행 ≈ 수 분, 그동안 다른 쓰기는 대기).
export const replaceEvChargers = async (
  prisma: PrismaClient,
  report: Pick<EvReport, 'stations' | 'chargers'>,
  meta: { detail: Record<string, number>; baseDate: string | null },
): Promise<{ stations: number; chargers: number }> => {
  await prisma.$transaction(
    async (tx) => {
      await tx.evCharger.deleteMany({});
      await tx.evStation.deleteMany({});
      for (let i = 0; i < report.stations.length; i += CREATE_CHUNK) {
        await tx.evStation.createMany({ data: report.stations.slice(i, i + CREATE_CHUNK) });
      }
      for (let i = 0; i < report.chargers.length; i += CREATE_CHUNK) {
        await tx.evCharger.createMany({ data: report.chargers.slice(i, i + CREATE_CHUNK) });
      }
      await tx.parkingSync.create({
        data: { kind: 'ev', count: report.stations.length, detail: JSON.stringify({ chargers: report.chargers.length, ...meta.detail }), baseDate: meta.baseDate },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  return { stations: report.stations.length, chargers: report.chargers.length };
};
