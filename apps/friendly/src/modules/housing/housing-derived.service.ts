// 집값 파생 재구축 — 거래 적재·단지 마스터 교체 뒤에 (a) 거래 ↔ 단지 매칭, (b) 마스터에 없는 단지를
// 실거래 주소로 만들기(source='rtms'), (c) 단지 × 유형 × 면적 구간 통계 표(HousingComplexStat) 전량
// 재계산. 요청 경로는 이 표만 읽으므로 거래 표(수백만 행)를 집계하지 않는다.
//
// 매칭 규칙(실거래 API 엔 단지 식별자가 아파트명·지번뿐이라 결정적 키가 없다):
//   1) 시군구코드 + 읍면동(마지막 토큰) + 지번(0 패딩 제거) — 한 필지에 한 단지가 보통.
//   2) 같은 시군구·읍면동 안에서 정규화 단지명(normalizeHousingName)이 name 또는 altNames 와 일치(유일할 때).
//   그래도 못 붙인 거래는 (시군구, 읍면동, 지번, 정규화명) 으로 묶어 rtms 단지를 만든다 — 이름은 가장
//   흔한 원문, 주소는 같은 시군구의 마스터 단지에서 시도·시군구명을 빌려 조립, 좌표는 지번 지오코딩.
//   시도명을 알 수 없는 시군구(마스터에 단지가 하나도 없는 곳)는 건너뛴다(complexId null 유지).

import { Prisma, type PrismaClient } from '@prisma/client';
import { HOUSING_AREA_BANDS, housingDateMonthsAgo, normalizeHousingName, type HousingAreaBand } from '@repo/utils';
import { createShadowTable, dropShadowTable, shadowTablePrefix, swapShadowTable } from '../../lib/shadow-table.js';
import {
  geocodeLifeRows,
  type GeocodeAddressType,
  type GeocodeBatchOptions,
  type GeocodeBatchReport,
} from '../life-map/life-map-geocode.service.js';

const SCAN_CHUNK = 5000;
const UPDATE_CHUNK = 500;
const CREATE_CHUNK = 500;

export interface HousingDerivedOptions {
  geocode: GeocodeBatchOptions;
  // 'YYYY-MM-DD' — 통계 12개월 창·rtms 단지 baseDate. 기본 오늘(로컬).
  today?: string;
  // 이미 붙은 거래도 다시 매칭(마스터가 바뀐 뒤).
  rematchAll?: boolean;
  log?: (msg: string) => void;
}

export interface HousingDerivedReport {
  scanned: number;
  matchedByJibun: number;
  matchedByName: number;
  // rtms 단지로 붙인 거래 수 / 시도명을 몰라 못 붙인 거래 수.
  matchedByRtms: number;
  unmatched: number;
  createdRtms: number;
  reusedRtms: number;
  geocode: GeocodeBatchReport | null;
  stats: number;
}

const localToday = (): string => new Date().toLocaleDateString('en-CA');

// 읍면동 키 — '조치원읍 신흥리' 와 실거래 umdNm('신흥리') 이 같은 키가 되게 마지막 토큰만.
export const housingUmdKey = (umd: string | null | undefined): string => {
  const tokens = (umd ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? tokens[tokens.length - 1]! : '';
};
// 지번 키 — '0578-0005' → '578-5', '산1-08' → '산1-8'. 형식이 다르면 공백 제거 원문.
export const housingJibunKey = (jibun: string | null | undefined): string => {
  const s = (jibun ?? '').replace(/\s+/g, '');
  const m = /^(산)?0*(\d+)(?:-0*(\d+))?$/.exec(s);
  if (!m) return s;
  return `${m[1] ?? ''}${m[2]}${m[3] !== undefined && m[3] !== '0' ? `-${m[3]}` : ''}`;
};

interface ComplexIndexRow {
  id: string;
  source: string;
  sggCd: string;
  umd: string;
  jibun: string | null;
  name: string;
  altNames: string | null;
  sido: string;
  sgg: string;
}
interface UnmatchedGroup {
  sggCd: string;
  umdNm: string;
  jibun: string | null;
  norm: string;
  names: Map<string, number>;
  tradeIds: string[];
}

const pushIndex = (m: Map<string, string[]>, key: string, id: string): void => {
  const list = m.get(key);
  if (list) {
    if (!list.includes(id)) list.push(id);
  } else m.set(key, [id]);
};

// 거래 → 단지 id 일괄 갱신(단지별 IN 목록, 500건 청크).
const applyComplexUpdates = async (prisma: PrismaClient, updates: Map<string, string[]>): Promise<void> => {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [complexId, ids] of updates) {
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
      ops.push(prisma.housingTrade.updateMany({ where: { id: { in: ids.slice(i, i + UPDATE_CHUNK) } }, data: { complexId } }));
    }
  }
  for (let i = 0; i < ops.length; i += 200) await prisma.$transaction(ops.slice(i, i + 200));
};

export const rebuildHousingDerived = async (prisma: PrismaClient, opts: HousingDerivedOptions): Promise<HousingDerivedReport> => {
  const today = opts.today ?? localToday();
  const log = opts.log ?? (() => {});
  const report: HousingDerivedReport = {
    scanned: 0,
    matchedByJibun: 0,
    matchedByName: 0,
    matchedByRtms: 0,
    unmatched: 0,
    createdRtms: 0,
    reusedRtms: 0,
    geocode: null,
    stats: 0,
  };

  // ── 단지 인덱스 ──
  const complexes: ComplexIndexRow[] = await prisma.housingComplex.findMany({
    select: { id: true, source: true, sggCd: true, umd: true, jibun: true, name: true, altNames: true, sido: true, sgg: true },
  });
  const jibunIndex = new Map<string, string[]>();
  const nameIndex = new Map<string, string[]>();
  const regionNames = new Map<string, { sido: string; sgg: string }>();
  const rtmsIds = new Set<string>();
  for (const c of complexes) {
    const umdKey = housingUmdKey(c.umd);
    if (c.jibun) pushIndex(jibunIndex, `${c.sggCd}|${umdKey}|${housingJibunKey(c.jibun)}`, c.id);
    for (const n of [c.name, ...(c.altNames ? c.altNames.split('|') : [])]) {
      const norm = normalizeHousingName(n);
      if (norm) pushIndex(nameIndex, `${c.sggCd}|${umdKey}|${norm}`, c.id);
    }
    if (c.source === 'reb' && !regionNames.has(c.sggCd)) regionNames.set(c.sggCd, { sido: c.sido, sgg: c.sgg });
    if (c.source === 'rtms') rtmsIds.add(c.id);
  }
  log(`단지 인덱스: ${complexes.length}개(지번 키 ${jibunIndex.size}, 이름 키 ${nameIndex.size}, rtms ${rtmsIds.size})`);

  // ── 거래 스캔(id 순, 5,000건씩) ──
  const unmatched = new Map<string, UnmatchedGroup>();
  let lastId = '';
  for (;;) {
    const batch = await prisma.housingTrade.findMany({
      where: { id: { gt: lastId }, ...(opts.rematchAll ? {} : { complexId: null }) },
      select: { id: true, sggCd: true, umdNm: true, jibun: true, aptNm: true },
      orderBy: { id: 'asc' },
      take: SCAN_CHUNK,
    });
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1]!.id;
    report.scanned += batch.length;
    const updates = new Map<string, string[]>();
    for (const t of batch) {
      const umdKey = housingUmdKey(t.umdNm);
      const norm = normalizeHousingName(t.aptNm);
      let complexId: string | null = null;
      const byJibun = t.jibun ? jibunIndex.get(`${t.sggCd}|${umdKey}|${housingJibunKey(t.jibun)}`) : undefined;
      if (byJibun && byJibun.length > 0) {
        // 한 필지에 단지가 여럿이면 이름으로 고르고, 그래도 모호하면 첫 단지.
        const byName = byJibun.length > 1 ? nameIndex.get(`${t.sggCd}|${umdKey}|${norm}`)?.filter((id) => byJibun.includes(id)) : undefined;
        complexId = byName && byName.length === 1 ? byName[0]! : byJibun[0]!;
        report.matchedByJibun += 1;
      } else if (norm) {
        const byName = nameIndex.get(`${t.sggCd}|${umdKey}|${norm}`);
        if (byName && byName.length === 1) {
          complexId = byName[0]!;
          report.matchedByName += 1;
        }
      }
      if (complexId) {
        pushIndex(updates, complexId, t.id);
        continue;
      }
      const key = `${t.sggCd}|${t.umdNm}|${t.jibun ?? ''}|${norm}`;
      let g = unmatched.get(key);
      if (!g) {
        g = { sggCd: t.sggCd, umdNm: t.umdNm, jibun: t.jibun, norm, names: new Map(), tradeIds: [] };
        unmatched.set(key, g);
      }
      g.names.set(t.aptNm, (g.names.get(t.aptNm) ?? 0) + 1);
      g.tradeIds.push(t.id);
    }
    if (updates.size > 0) await applyComplexUpdates(prisma, updates);
  }
  log(`거래 매칭: 스캔 ${report.scanned} · 지번 ${report.matchedByJibun} · 이름 ${report.matchedByName} · 미매칭 그룹 ${unmatched.size}`);

  // ── rtms 단지 ──
  const newRows: {
    id: string;
    source: 'rtms';
    pnu: null;
    name: string;
    altNames: string | null;
    kind: 'apt';
    addr: string;
    sido: string;
    sgg: string;
    umd: string;
    jibun: string | null;
    sggCd: string;
    bjdCd: null;
    dongCount: null;
    households: null;
    approvedDate: null;
    lat: number | null;
    lng: number | null;
    geoSource: GeocodeAddressType | null;
    baseDate: string;
  }[] = [];
  const rtmsUpdates = new Map<string, string[]>();
  for (const g of unmatched.values()) {
    const region = regionNames.get(g.sggCd);
    if (!region) {
      report.unmatched += g.tradeIds.length;
      continue;
    }
    const id = `rt:${g.sggCd}:${g.umdNm}:${g.jibun ?? '-'}:${g.norm || '-'}`;
    rtmsUpdates.set(id, g.tradeIds);
    report.matchedByRtms += g.tradeIds.length;
    if (rtmsIds.has(id)) {
      report.reusedRtms += 1;
      continue;
    }
    rtmsIds.add(id);
    const name = [...g.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    const alt = [...g.names.keys()].filter((n) => n !== name);
    newRows.push({
      id,
      source: 'rtms',
      pnu: null,
      name,
      altNames: alt.length > 0 ? alt.join('|') : null,
      kind: 'apt',
      addr: [region.sido, region.sgg, g.umdNm, g.jibun ?? ''].filter(Boolean).join(' '),
      sido: region.sido,
      sgg: region.sgg,
      umd: g.umdNm,
      jibun: g.jibun,
      sggCd: g.sggCd,
      bjdCd: null,
      dongCount: null,
      households: null,
      approvedDate: null,
      lat: null,
      lng: null,
      geoSource: null,
      baseDate: today,
    });
  }
  if (newRows.length > 0) {
    const geoRows = newRows.map((r) => ({ roadAddr: null, lotAddr: r.addr, lat: null as number | null, lng: null as number | null, geoSource: null as GeocodeAddressType | null }));
    report.geocode = await geocodeLifeRows(prisma, geoRows, opts.geocode);
    newRows.forEach((r, i) => {
      r.lat = geoRows[i]!.lat;
      r.lng = geoRows[i]!.lng;
      r.geoSource = geoRows[i]!.geoSource;
    });
    for (let i = 0; i < newRows.length; i += CREATE_CHUNK) {
      await prisma.housingComplex.createMany({ data: newRows.slice(i, i + CREATE_CHUNK) });
    }
    report.createdRtms = newRows.length;
    log(`rtms 단지 생성 ${newRows.length}(좌표 ${newRows.filter((r) => r.lat !== null).length}) · 재사용 ${report.reusedRtms}`);
  }
  if (rtmsUpdates.size > 0) await applyComplexUpdates(prisma, rtmsUpdates);

  // ── 통계 ──
  report.stats = await rebuildHousingStats(prisma, today);
  log(`통계 재계산 ${report.stats}행`);
  return report;
};

// ── 통계 표 전량 재계산 ─────────────────────────────────────────────────────────
const bandCondition = (band: HousingAreaBand): Prisma.Sql => {
  switch (band) {
    case 'b1':
      return Prisma.sql`AND "area" <= 60`;
    case 'b2':
      return Prisma.sql`AND "area" > 60 AND "area" <= 85`;
    case 'b3':
      return Prisma.sql`AND "area" > 85 AND "area" <= 135`;
    case 'b4':
      return Prisma.sql`AND "area" > 135`;
    default:
      return Prisma.empty;
  }
};

export interface HousingStatRow {
  complexId: string;
  dealType: string;
  band: string;
  latestPrice: number;
  latestRent: number;
  latestArea: number;
  latestFloor: number | null;
  latestDate: string;
  count12: number;
  count: number;
  unitPrice12: number | null;
  // dealType='any' 폴백 행에서만 — 그 최근 거래의 실제 유형.
  latestDealType: string | null;
}

const toNum = (v: unknown): number => Number(v);
const toNullableNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const toFiniteOrNull = (v: unknown): number | null => {
  const n = toNullableNum(v);
  return n !== null && Number.isFinite(n) ? n : null;
};

// ── 섀도 표 교체 ──
// 예전엔 한 쓰기 트랜잭션에서 31만 행을 지우고 다시 넣어 쓰기 락을 13.5~18초 잡았다(D-4·X-5 — 그동안 서버의 모든
// 쓰기가 멈추고, 데이터가 늘면 busy_timeout 30초를 넘겨 실패한다). 지금은 같은 정의의 _next 표를 짧은 트랜잭션
// (5,000행)으로 채운 뒤 DROP + RENAME + 적재 이력을 한 트랜잭션으로 바꿔 끼운다. 스테이징 이름은 실행마다 달라
// (lib/shadow-table.ts) 갱신 cron 과 load:housing-* 가 겹쳐 돌아도 서로의 표에 쓰지 않는다 — 각자 온전한 통계를
// 만들고 늦게 교체한 쪽이 남는다. 실패하면 제 스테이징을 지우고, 중단 잔여물은 다음 실행이 치운다.
const STATS_TABLE = 'housing_complex_stats';
// 예전 고정 스테이징 이름이자 실행별 이름의 접두(`…_next_<시각>_<난수>`).
export const HOUSING_STATS_NEXT_TABLE = shadowTablePrefix(STATS_TABLE);
const STATS_COLUMNS = [
  'complexId',
  'dealType',
  'band',
  'latestPrice',
  'latestRent',
  'latestArea',
  'latestFloor',
  'latestDate',
  'count12',
  'count',
  'unitPrice12',
  'latestDealType',
] as const;

export interface HousingStatsWriteOptions {
  // INSERT 문 하나의 행 수(12열 × 400 = 4,800 바인드)·트랜잭션 하나의 행 수 — 테스트가 작게 줘 청크 경계를 탄다.
  insertRows?: number;
  txRows?: number;
}

class StatsShadowWriter {
  private buf: HousingStatRow[] = [];
  count = 0;

  constructor(
    private readonly prisma: PrismaClient,
    // 이번 실행의 스테이징 표.
    private readonly table: string,
    private readonly insertRows: number,
    private readonly txRows: number,
  ) {}

  async push(rows: HousingStatRow[]): Promise<void> {
    for (const r of rows) {
      this.buf.push(r);
      if (this.buf.length >= this.txRows) await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buf.length === 0) return;
    const rows = this.buf;
    this.buf = [];
    const stmts: Prisma.PrismaPromise<number>[] = [];
    for (let i = 0; i < rows.length; i += this.insertRows) {
      const values = rows
        .slice(i, i + this.insertRows)
        .map(
          (r) =>
            Prisma.sql`(${r.complexId}, ${r.dealType}, ${r.band}, ${r.latestPrice}, ${r.latestRent}, ${r.latestArea}, ${r.latestFloor}, ${r.latestDate}, ${r.count12}, ${r.count}, ${r.unitPrice12}, ${r.latestDealType})`,
        );
      stmts.push(
        this.prisma.$executeRaw`INSERT INTO ${Prisma.raw(`"${this.table}"`)} (${Prisma.raw(STATS_COLUMNS.map((c) => `"${c}"`).join(', '))}) VALUES ${Prisma.join(values)}`,
      );
    }
    await this.prisma.$transaction(stmts);
    this.count += rows.length;
  }
}

// 구간마다 raw SQL 2개(최근 거래는 윈도 함수, 건수·단위가는 GROUP BY)를 JS 에서 합쳐 전량 교체.
// 해제(canceled) 거래·단지 미연결 거래는 제외. 12개월 창은 today 기준.
// 유형×구간 행에 더해 단지마다 **폴백 행(dealType='any', band='all')** 하나 — 세 유형을 통틀어 가장 최근
// 거래(그 유형은 latestDealType)와 전체 유형 합계. 선택한 축에 거래가 없는 단지에 "다른 조건의 마지막
// 거래" 를 보여 주는 용도라 요청 경로의 조인이 하나 더 늘 뿐 거래 표는 여전히 안 읽는다.
// 쓰기는 위 섀도 표 교체 — 구간별 행을 계산하는 대로 스테이징에 넣어 JS 에 전 행을 쥐지 않는다.
export const rebuildHousingStats = (
  prisma: PrismaClient,
  today: string = localToday(),
  opts: HousingStatsWriteOptions = {},
): Promise<number> => replaceHousingStats(prisma, today, (emit) => computeHousingStatRows(prisma, today, emit), opts);

// 섀도 표 교체 본체 — produce 가 넘기는 행으로 이번 실행의 스테이징을 채우고 바꿔 끼운다(쓰기 락 측정은 이걸 직접 부른다).
export const replaceHousingStats = async (
  prisma: PrismaClient,
  today: string,
  produce: (emit: (rows: HousingStatRow[]) => Promise<void>) => Promise<void>,
  opts: HousingStatsWriteOptions = {},
): Promise<number> => {
  const shadow = await createShadowTable(prisma, STATS_TABLE);
  const writer = new StatsShadowWriter(prisma, shadow.name, opts.insertRows ?? 400, opts.txRows ?? 5000);
  try {
    await produce((rows) => writer.push(rows));
    await writer.flush();
    await swapShadowTable(prisma, STATS_TABLE, shadow, [
      prisma.housingSync.create({ data: { kind: 'stats', count: writer.count, baseDate: today } }),
    ]);
  } catch (e) {
    await dropShadowTable(prisma, shadow);
    throw e;
  }
  return writer.count;
};

// 통계 행 계산 — 폴백 행, 이어서 구간별(전체·b1~b4) 행을 묶음마다 emit 으로 넘긴다(쓰기와 분리 — 결과 행 동일성 테스트).
export const computeHousingStatRows = async (
  prisma: PrismaClient,
  today: string,
  emit: (rows: HousingStatRow[]) => Promise<void>,
): Promise<void> => {
  const since12 = housingDateMonthsAgo(today, 12);
  let rows: HousingStatRow[] = [];
  const latestAny = await prisma.$queryRaw<
    { complexId: string; dealType: string; price: unknown; rent: unknown; area: unknown; floor: unknown; dealDate: string }[]
  >(Prisma.sql`SELECT "complexId", "dealType", "price", "rent", "area", "floor", "dealDate"
               FROM (SELECT "complexId", "dealType", "price", "rent", "area", "floor", "dealDate",
                            ROW_NUMBER() OVER (PARTITION BY "complexId" ORDER BY "dealDate" DESC, "id") AS rn
                     FROM "housing_trades"
                     WHERE "canceled" = 0 AND "complexId" IS NOT NULL)
               WHERE rn = 1`);
  const aggAny = await prisma.$queryRaw<{ complexId: string; n: unknown; n12: unknown; unit12: unknown }[]>(
    Prisma.sql`SELECT "complexId", COUNT(*) AS n,
                      SUM(CASE WHEN "dealDate" >= ${since12} THEN 1 ELSE 0 END) AS n12,
                      AVG(CASE WHEN "dealDate" >= ${since12} THEN "price" * 1.0 / "area" END) AS unit12
               FROM "housing_trades"
               WHERE "canceled" = 0 AND "complexId" IS NOT NULL
               GROUP BY "complexId"`,
  );
  const aggAnyMap = new Map(aggAny.map((a) => [a.complexId, { n: toNum(a.n), n12: toNum(a.n12), unit12: toFiniteOrNull(a.unit12) }]));
  for (const l of latestAny) {
    const a = aggAnyMap.get(l.complexId);
    rows.push({
      complexId: l.complexId,
      dealType: 'any',
      band: 'all',
      latestPrice: toNum(l.price),
      latestRent: toNum(l.rent),
      latestArea: toNum(l.area),
      latestFloor: toNullableNum(l.floor),
      latestDate: l.dealDate,
      count12: a?.n12 ?? 0,
      count: a?.n ?? 0,
      unitPrice12: a?.unit12 ?? null,
      latestDealType: l.dealType,
    });
  }
  await emit(rows);
  for (const band of HOUSING_AREA_BANDS) {
    rows = [];
    const cond = bandCondition(band);
    const latest = await prisma.$queryRaw<
      { complexId: string; dealType: string; price: unknown; rent: unknown; area: unknown; floor: unknown; dealDate: string }[]
    >(Prisma.sql`SELECT "complexId", "dealType", "price", "rent", "area", "floor", "dealDate"
                 FROM (SELECT "complexId", "dealType", "price", "rent", "area", "floor", "dealDate",
                              ROW_NUMBER() OVER (PARTITION BY "complexId", "dealType" ORDER BY "dealDate" DESC, "id") AS rn
                       FROM "housing_trades"
                       WHERE "canceled" = 0 AND "complexId" IS NOT NULL ${cond})
                 WHERE rn = 1`);
    const agg = await prisma.$queryRaw<{ complexId: string; dealType: string; n: unknown; n12: unknown; unit12: unknown }[]>(
      Prisma.sql`SELECT "complexId", "dealType", COUNT(*) AS n,
                        SUM(CASE WHEN "dealDate" >= ${since12} THEN 1 ELSE 0 END) AS n12,
                        AVG(CASE WHEN "dealDate" >= ${since12} THEN "price" * 1.0 / "area" END) AS unit12
                 FROM "housing_trades"
                 WHERE "canceled" = 0 AND "complexId" IS NOT NULL ${cond}
                 GROUP BY "complexId", "dealType"`,
    );
    const aggMap = new Map<string, { n: number; n12: number; unit12: number | null }>();
    for (const a of agg) {
      const unit = a.unit12 === null || a.unit12 === undefined ? null : Number(a.unit12);
      aggMap.set(`${a.complexId}|${a.dealType}`, { n: Number(a.n), n12: Number(a.n12), unit12: unit !== null && Number.isFinite(unit) ? unit : null });
    }
    for (const l of latest) {
      const a = aggMap.get(`${l.complexId}|${l.dealType}`);
      rows.push({
        complexId: l.complexId,
        dealType: l.dealType,
        band,
        latestPrice: Number(l.price),
        latestRent: Number(l.rent),
        latestArea: Number(l.area),
        latestFloor: l.floor === null || l.floor === undefined ? null : Number(l.floor),
        latestDate: l.dealDate,
        count12: a?.n12 ?? 0,
        count: a?.n ?? 0,
        unitPrice12: a?.unit12 ?? null,
        latestDealType: null,
      });
    }
    await emit(rows);
  }
};
