// 집값 거래 적재 — RTMS 응답 item → HousingTrade 행 정규화(순수 함수 + 사유별 drop 리포트) + 파티션
// (시군구 × 계약년월 × 유형) 전량 교체. 실거래는 신고 기한(계약 후 30일)과 해제 신고 때문에 같은 달이
// 뒤늦게 바뀌므로 upsert 가 아니라 파티션 교체로 최신 상태를 그대로 옮긴다(장부 HousingTradeSync 에
// 파티션별 건수·시각 기록). 전월세 오퍼레이션 한 번이 jeonse·monthly 두 파티션을 동시에 갱신한다.
//
// 거래 id 는 자연키 해시 — API 가 거래 식별자를 주지 않아 (유형·시군구·읍면동·지번·단지명·계약일·면적·
// 층·금액·월세·동) 를 sha1 로 접는다. 같은 파티션 안 완전 중복(같은 날 같은 층·면적·금액 2건)은 '#n'.

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { housingDealDate, parseHousingManwon, type HousingDealType } from '@repo/utils';
import type { RtmsOp } from './rtms.adapter.js';

const CREATE_CHUNK = 500;
const REPLACE_TX_TIMEOUT_MS = 5 * 60_000;

export interface HousingTradeRow {
  id: string;
  complexId: string | null;
  sggCd: string;
  dealYm: string;
  dealDate: string;
  dealType: HousingDealType;
  umdNm: string;
  jibun: string | null;
  aptNm: string;
  aptSeq: string | null;
  roadNm: string | null;
  area: number;
  floor: number | null;
  buildYear: number | null;
  price: number;
  rent: number;
  dealingGbn: string | null;
  canceled: boolean;
  canceledDate: string | null;
  rgstDate: string | null;
  aptDong: string | null;
  buyerGbn: string | null;
  slerGbn: string | null;
  contractType: string | null;
  useRRRight: string | null;
  contractTerm: string | null;
  preDeposit: number | null;
  preRent: number | null;
  landLease: boolean;
}

export interface HousingTradeReport {
  rows: HousingTradeRow[];
  byType: Map<HousingDealType, number>;
  droppedBadPrice: number;
  droppedBadArea: number;
  droppedBadDate: number;
  droppedBadName: number;
  canceled: number;
  // 완전 중복이라 '#n' 접미를 붙인 행.
  duplicateSuffixed: number;
}

// item 은 태그명 대소문자가 오퍼레이션마다 달라(roadNm / roadnm) 소문자 키로 찾는다. 공백만 있는 값은 없음.
const lowerKeys = (item: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(item)) out[k.toLowerCase()] = v;
  return out;
};
const pick = (item: Record<string, string>, ...names: string[]): string | null => {
  for (const n of names) {
    const v = item[n.toLowerCase()];
    if (v !== undefined) {
      const s = v.trim();
      if (s.length > 0) return s;
    }
  }
  return null;
};
const intOrNull = (s: string | null): number | null => {
  if (s === null) return null;
  const n = Number.parseInt(s.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
// 'YY.MM.DD'(등기일자·해제일) → 'YYYY-MM-DD'. 'YYYY-MM-DD'·'YYYYMMDD' 도 허용.
export const rtmsDateOrNull = (s: string | null): string | null => {
  if (s === null) return null;
  const short = /^(\d{2})\.(\d{1,2})\.(\d{1,2})$/.exec(s);
  if (short) return `20${short[1]}-${short[2]!.padStart(2, '0')}-${short[3]!.padStart(2, '0')}`;
  const long = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})$/.exec(s);
  return long ? `${long[1]}-${long[2]}-${long[3]}` : null;
};

export const housingTradeId = (r: Omit<HousingTradeRow, 'id' | 'complexId'>): string =>
  createHash('sha1')
    .update(
      `${r.dealType}|${r.sggCd}|${r.umdNm}|${r.jibun ?? ''}|${r.aptNm}|${r.dealDate}|${r.area}|${r.floor ?? ''}|${r.price}|${r.rent}|${r.aptDong ?? ''}`,
    )
    .digest('hex')
    .slice(0, 24);

export const normalizeHousingTradeItems = (
  op: RtmsOp,
  items: Record<string, string>[],
  ctx: { sggCd: string; dealYm: string },
): HousingTradeReport => {
  const report: HousingTradeReport = {
    rows: [],
    byType: new Map(),
    droppedBadPrice: 0,
    droppedBadArea: 0,
    droppedBadDate: 0,
    droppedBadName: 0,
    canceled: 0,
    duplicateSuffixed: 0,
  };
  const seen = new Map<string, number>();
  for (const raw of items) {
    const it = lowerKeys(raw);
    const aptNm = pick(it, 'aptNm');
    if (!aptNm) {
      report.droppedBadName += 1;
      continue;
    }
    const rent = op === 'rent' ? (parseHousingManwon(pick(it, 'monthlyRent')) ?? 0) : 0;
    const price = parseHousingManwon(op === 'rent' ? pick(it, 'deposit') : pick(it, 'dealAmount'));
    if (price === null || price < 0) {
      report.droppedBadPrice += 1;
      continue;
    }
    const area = Number(pick(it, 'excluUseAr'));
    if (!Number.isFinite(area) || area <= 0) {
      report.droppedBadArea += 1;
      continue;
    }
    const dealDate = housingDealDate(pick(it, 'dealYear'), pick(it, 'dealMonth'), pick(it, 'dealDay'));
    if (!dealDate) {
      report.droppedBadDate += 1;
      continue;
    }
    const dealType: HousingDealType = op === 'trade' ? 'trade' : rent > 0 ? 'monthly' : 'jeonse';
    const canceled = (pick(it, 'cdealType') ?? '').toUpperCase() === 'O';
    const base: Omit<HousingTradeRow, 'id' | 'complexId'> = {
      sggCd: pick(it, 'sggCd') ?? ctx.sggCd,
      dealYm: ctx.dealYm,
      dealDate,
      dealType,
      umdNm: pick(it, 'umdNm') ?? '',
      jibun: pick(it, 'jibun'),
      aptNm,
      aptSeq: pick(it, 'aptSeq'),
      roadNm: pick(it, 'roadNm'),
      area,
      floor: intOrNull(pick(it, 'floor')),
      buildYear: intOrNull(pick(it, 'buildYear')),
      price,
      rent,
      dealingGbn: pick(it, 'dealingGbn'),
      canceled,
      canceledDate: rtmsDateOrNull(pick(it, 'cdealDay')),
      rgstDate: rtmsDateOrNull(pick(it, 'rgstDate')),
      aptDong: pick(it, 'aptDong'),
      buyerGbn: pick(it, 'buyerGbn'),
      slerGbn: pick(it, 'slerGbn'),
      contractType: pick(it, 'contractType'),
      useRRRight: pick(it, 'useRRRight'),
      contractTerm: pick(it, 'contractTerm'),
      preDeposit: parseHousingManwon(pick(it, 'preDeposit')),
      preRent: parseHousingManwon(pick(it, 'preMonthlyRent')),
      landLease: (pick(it, 'landLeaseholdGbn') ?? '').toUpperCase() === 'Y',
    };
    let id = housingTradeId(base);
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    if (n > 1) {
      id = `${id}#${n}`;
      report.duplicateSuffixed += 1;
    }
    if (canceled) report.canceled += 1;
    report.rows.push({ id, complexId: null, ...base });
    report.byType.set(dealType, (report.byType.get(dealType) ?? 0) + 1);
  }
  return report;
};

export interface HousingTradePartition {
  sggCd: string;
  dealYm: string;
  dealTypes: readonly HousingDealType[];
}

// 파티션 교체 — 한 트랜잭션에서 (시군구, 계약년월, 유형∈dealTypes) 행을 지우고 새 행을 넣고 장부를 갱신.
// rows 에 없는 유형도 dealTypes 에 있으면 0건으로 장부에 남긴다("받았는데 없음" 과 "안 받음" 구분).
export const replaceHousingTradePartition = async (
  prisma: PrismaClient,
  partition: HousingTradePartition,
  rows: HousingTradeRow[],
): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const t of partition.dealTypes) counts[t] = 0;
  const accepted = rows.filter((r) => (partition.dealTypes as readonly string[]).includes(r.dealType));
  for (const r of accepted) counts[r.dealType] = (counts[r.dealType] ?? 0) + 1;
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.housingTrade.deleteMany({
        where: { sggCd: partition.sggCd, dealYm: partition.dealYm, dealType: { in: [...partition.dealTypes] } },
      });
      for (let i = 0; i < accepted.length; i += CREATE_CHUNK) {
        await tx.housingTrade.createMany({ data: accepted.slice(i, i + CREATE_CHUNK) });
      }
      for (const dealType of partition.dealTypes) {
        await tx.housingTradeSync.upsert({
          where: { sggCd_dealYm_dealType: { sggCd: partition.sggCd, dealYm: partition.dealYm, dealType } },
          create: { sggCd: partition.sggCd, dealYm: partition.dealYm, dealType, count: counts[dealType] ?? 0, fetchedAt: now },
          update: { count: counts[dealType] ?? 0, fetchedAt: now },
        });
      }
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  return counts;
};
