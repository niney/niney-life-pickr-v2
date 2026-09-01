// 집값 공시가격 적재 — 국토교통부 주택 공시가격 정보 파일(data.go.kr 3073746, 호별 1,558만 행, 연 1회)을
// 단지 × 면적 구간으로 접어 HousingComplexPrice 에 전량 교체한다. 거래가 없는 단지(임대·소형·거래 희소)에도
// 가격 앵커를 주는 용도. 원천이 3.4GB CSV(zip 안) 라 **스트리밍**이 필수 — 문자열 상한 때문에 통째로 읽을 수
// 없고, zip 은 의존성 없이 로컬 파일 헤더/중앙 디렉터리를 읽어 deflate 스트림만 푼다.
//
// 파일 규약(포털 명시, 2025 파일 실측): UTF-8(BOM), CRLF, 모든 값이 큰따옴표로 감싸이고 값 안에 쉼표·개행·
// 따옴표가 없다(escape 불필요). 헤더 21열:
//   "기준연도","기준월","법정동코드","도로명주소","시도","시군구","읍면","동리","특수지코드","본번","부번",
//   "특수지명","단지명","동명","호명","전용면적","공시가격","단지코드","동코드","호코드","건축물대장PK"
//
// 단지 매칭은 PNU(법정동코드 10 + 특수지 1 + 본번 4 + 부번 4 = 19자리) — 한국부동산원 단지 마스터의 PNU 와
// 직결. 특수지코드 → PNU 11번째 자리: 파일의 '0'(일반) → '1', '1'(산) → '2' (샘플 검증: 청운동 1번지 행은
// 법정동 1111010100·특수지 0·본번 1·부번 0 → '1111010100100010000' = 마스터 PNU 와 일치). 같은 PNU 에
// 단지가 여럿(동 단위로 쪼개진 마스터)이면 정규화 단지명으로 고르고, PNU 로 못 붙이면 법정동 + 정규화
// 단지명(유일할 때만)으로 붙인다 — 한 단지가 여러 필지에 걸쳐 있어 마스터 PNU 와 다른 필지의 호가 있는 경우.
//
// 아파트(kind='apt') 단지만 대상. 매칭된 호의 공시가격(원 → 만원)을 구간(b1~b4)별 배열로 모아 끝에 all/b1..b4 의
// count·median·min·max·avgArea 를 만든다(호 단위 1,200만 값이 메모리에 오르지만 숫자 배열이라 ~100MB).
// 도로명주소 최빈값도 단지별로 모아 roadAddr 가 비어 있는 단지에 채운다(좌표 보완이 쓴다).

import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';
import type { PrismaClient } from '@prisma/client';
import {
  HOUSING_AREA_BANDS,
  housingAreaBandOf,
  normalizeHousingName,
  type HousingAreaBand,
  type HousingAreaBandStrict,
} from '@repo/utils';

const CREATE_CHUNK = 500;
const UPDATE_TX_CHUNK = 200;
const REPLACE_TX_TIMEOUT_MS = 10 * 60_000;

export const GONGSI_COLUMNS = {
  year: '기준연도',
  bjdCode: '법정동코드',
  roadAddr: '도로명주소',
  special: '특수지코드',
  bon: '본번',
  bu: '부번',
  name: '단지명',
  area: '전용면적',
  price: '공시가격',
} as const;

// ── 줄 파서 ─────────────────────────────────────────────────────────────────
// `"a","b","c"` 꼴 한 줄 → 값 배열. 값 안에 쉼표·따옴표가 없다는 규약에 기대되, 따옴표가 없는 줄도 쉼표로
// 나눠 받는다(샘플·테스트 편의).
export const parseGongsiLine = (rawLine: string): string[] => {
  let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  if (line.startsWith('\uFEFF')) line = line.slice(1);
  if (line.length === 0) return [];
  if (line.startsWith('"') && line.endsWith('"') && line.length >= 2) return line.slice(1, -1).split('","');
  return line.split(',').map((v) => (v.startsWith('"') && v.endsWith('"') && v.length >= 2 ? v.slice(1, -1) : v));
};

// 헤더 → 필요한 열 인덱스. 하나라도 없으면 throw(파일 형식이 바뀐 것).
export const gongsiColumnIndex = (header: string[]): Record<keyof typeof GONGSI_COLUMNS, number> => {
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const key = h.replace(/^\uFEFF/, '').trim();
    if (!idx.has(key)) idx.set(key, i);
  });
  const out = {} as Record<keyof typeof GONGSI_COLUMNS, number>;
  const missing: string[] = [];
  for (const [key, name] of Object.entries(GONGSI_COLUMNS) as [keyof typeof GONGSI_COLUMNS, string][]) {
    const i = idx.get(name);
    if (i === undefined) missing.push(name);
    else out[key] = i;
  }
  if (missing.length > 0) throw new Error(`공시가격 CSV 필수 열 누락: ${missing.join(', ')}`);
  return out;
};

// PNU 조립 — 법정동코드 10자리 + 특수지(0 일반→1, 1 산→2; 이미 1/2 면 그대로) + 본번·부번 4자리 0패딩.
export const buildGongsiPnu = (bjdCode: string, special: string, bon: string, bu: string): string | null => {
  const bjd = bjdCode.trim();
  if (!/^\d{10}$/.test(bjd)) return null;
  const sp = special.trim();
  const specialDigit = sp === '0' || sp === '' ? '1' : sp === '1' ? '2' : null;
  if (specialDigit === null) return null;
  const pad = (v: string): string | null => {
    const s = v.trim();
    if (!/^\d{1,4}$/.test(s)) return null;
    return s.padStart(4, '0');
  };
  const b1 = pad(bon);
  const b2 = pad(bu === '' ? '0' : bu);
  if (b1 === null || b2 === null) return null;
  return `${bjd}${specialDigit}${b1}${b2}`;
};

// ── 스트림 ──────────────────────────────────────────────────────────────────
// 바이트 스트림 → 줄(개행 제거, CR 은 파서가 뗀다). 첫 청크의 BOM 제거.
export async function* iterateLines(stream: AsyncIterable<Buffer | string>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  let rest = '';
  let first = true;
  for await (const chunk of stream) {
    let text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    if (first) {
      if (text.startsWith('\uFEFF')) text = text.slice(1);
      first = false;
    }
    rest += text;
    let nl = rest.indexOf('\n');
    while (nl >= 0) {
      yield rest.slice(0, nl);
      rest = rest.slice(nl + 1);
      nl = rest.indexOf('\n');
    }
  }
  rest += decoder.decode();
  if (rest.length > 0) yield rest;
}

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const U32_MAX = 0xffffffff;

const readAt = async (fh: { read: (b: Buffer, o: number, l: number, p: number) => Promise<{ bytesRead: number }> }, position: number, length: number): Promise<Buffer> => {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return bytesRead === length ? buf : buf.subarray(0, bytesRead);
};

// zip 중앙 디렉터리를 읽어 항목 목록을 돌려준다(zip64 크기/오프셋 지원, 암호화·분할 미지원).
export const listZipEntries = async (path: string): Promise<ZipEntry[]> => {
  const fh = await open(path, 'r');
  try {
    const size = (await fh.stat()).size;
    const tailLen = Math.min(size, 65_557);
    const tail = await readAt(fh, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === SIG_EOCD) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('zip 형식이 아닙니다(EOCD 없음)');
    let cdOffset: number = tail.readUInt32LE(eocd + 16);
    let cdSize: number = tail.readUInt32LE(eocd + 12);
    if (cdOffset === U32_MAX || cdSize === U32_MAX) {
      const loc = eocd - 20;
      if (loc < 0 || tail.readUInt32LE(loc) !== SIG_EOCD64_LOCATOR) throw new Error('zip64 EOCD 로케이터 없음');
      const eocd64Offset = Number(tail.readBigUInt64LE(loc + 8));
      const eocd64 = await readAt(fh, eocd64Offset, 56);
      if (eocd64.readUInt32LE(0) !== SIG_EOCD64) throw new Error('zip64 EOCD 서명 불일치');
      cdSize = Number(eocd64.readBigUInt64LE(40));
      cdOffset = Number(eocd64.readBigUInt64LE(48));
    }
    const cd = await readAt(fh, cdOffset, cdSize);
    const entries: ZipEntry[] = [];
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === SIG_CENTRAL) {
      const method = cd.readUInt16LE(p + 10);
      let compressedSize: number = cd.readUInt32LE(p + 20);
      let uncompressedSize: number = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      let localHeaderOffset: number = cd.readUInt32LE(p + 42);
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
      // zip64 확장(0x0001): 0xFFFFFFFF 였던 필드만 순서대로(uncompressed, compressed, offset) 8바이트.
      const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
      let e = 0;
      while (e + 4 <= extra.length) {
        const id = extra.readUInt16LE(e);
        const len = extra.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompressedSize === U32_MAX && q + 8 <= e + 4 + len) {
            uncompressedSize = Number(extra.readBigUInt64LE(q));
            q += 8;
          }
          if (compressedSize === U32_MAX && q + 8 <= e + 4 + len) {
            compressedSize = Number(extra.readBigUInt64LE(q));
            q += 8;
          }
          if (localHeaderOffset === U32_MAX && q + 8 <= e + 4 + len) {
            localHeaderOffset = Number(extra.readBigUInt64LE(q));
          }
        }
        e += 4 + len;
      }
      entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    await fh.close();
  }
};

// zip 항목의 압축 데이터 시작 오프셋 — 로컬 헤더(30바이트 + 이름 + extra) 뒤.
export const zipEntryDataOffset = async (path: string, entry: ZipEntry): Promise<number> => {
  const fh = await open(path, 'r');
  try {
    const head = await readAt(fh, entry.localHeaderOffset, 30);
    if (head.length < 30 || head.readUInt32LE(0) !== SIG_LOCAL) throw new Error(`zip 로컬 헤더 서명 불일치: ${entry.name}`);
    return entry.localHeaderOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  } finally {
    await fh.close();
  }
};

// 공시가격 원본 열기 — .zip 이면 샘플이 아닌 가장 큰 .csv 항목을 deflate 스트림으로, 아니면 파일 그대로.
export const openGongsiStream = async (path: string): Promise<{ stream: Readable; description: string }> => {
  if (!/\.zip$/i.test(path)) return { stream: createReadStream(path), description: path };
  const entries = await listZipEntries(path);
  const candidates = entries.filter((e) => /\.csv$/i.test(e.name) && !/샘플/.test(e.name));
  if (candidates.length === 0) throw new Error('zip 안에 공시가격 CSV 항목이 없습니다');
  const entry = candidates.sort((a, b) => b.uncompressedSize - a.uncompressedSize)[0]!;
  if (entry.method !== 8 && entry.method !== 0) throw new Error(`지원하지 않는 zip 압축 방식(${entry.method}): ${entry.name} — deflate(8)/stored(0)만`);
  const start = await zipEntryDataOffset(path, entry);
  const raw = createReadStream(path, { start, end: start + entry.compressedSize - 1 });
  const stream: Readable = entry.method === 8 ? raw.pipe(createInflateRaw()) : raw;
  return { stream, description: `${path} :: ${entry.name} (${entry.uncompressedSize.toLocaleString('ko-KR')} bytes)` };
};

// ── 집계 ────────────────────────────────────────────────────────────────────
export interface GongsiComplexRef {
  id: string;
  pnu: string | null;
  bjdCd: string | null;
  name: string;
  altNames: string | null;
}

export interface GongsiBandAgg {
  count: number;
  median: number;
  min: number;
  max: number;
  avgArea: number;
}

export interface GongsiComplexAgg {
  complexId: string;
  year: number;
  bands: Partial<Record<HousingAreaBand, GongsiBandAgg>>;
  roadAddr: string | null;
}

export interface GongsiReport {
  rows: number;
  matchedRows: number;
  matchedByPnuRows: number;
  matchedByNameRows: number;
  // 행이 하나라도 붙은 단지 수(PNU 로 붙은 단지 / 이름으로만 붙은 단지) · PNU 가 있는데 한 행도 못 붙은 단지.
  complexes: number;
  complexesByPnu: number;
  complexesByNameOnly: number;
  complexesUnmatched: number;
  badRows: number;
  year: number | null;
  byBand: Record<HousingAreaBandStrict, number>;
  roadAddrs: number;
}

export interface GongsiAggregateOptions {
  complexes: GongsiComplexRef[];
  limitRows?: number;
  onProgress?(p: { rows: number; matched: number }): void;
}

interface Bucket {
  prices: Record<HousingAreaBandStrict, number[]>;
  areaSum: Record<HousingAreaBandStrict, number>;
  roadAddrs: Map<string, number>;
  byPnu: boolean;
  byName: boolean;
}

const newBucket = (): Bucket => ({
  prices: { b1: [], b2: [], b3: [], b4: [] },
  areaSum: { b1: 0, b2: 0, b3: 0, b4: 0 },
  roadAddrs: new Map(),
  byPnu: false,
  byName: false,
});

const medianOfSorted = (sorted: number[]): number => {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

const bandAgg = (prices: number[], areaSum: number): GongsiBandAgg | null => {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    count: sorted.length,
    median: medianOfSorted(sorted),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    avgArea: Math.round((areaSum / sorted.length) * 100) / 100,
  };
};

// 줄 스트림 → 단지별 집계. 첫 줄은 헤더.
export const aggregateGongsi = async (
  lines: AsyncIterable<string>,
  opts: GongsiAggregateOptions,
): Promise<{ aggregates: GongsiComplexAgg[]; report: GongsiReport }> => {
  // 인덱스 — PNU → 단지 id 들(동 단위로 쪼개진 마스터는 같은 PNU 를 공유할 수 있다), 법정동|정규화명 → 단지 id(유일).
  const byPnu = new Map<string, string[]>();
  const byName = new Map<string, string | null>(); // null = 중복(모호)
  const normNames = new Map<string, Set<string>>();
  for (const c of opts.complexes) {
    const names = new Set<string>();
    for (const n of [c.name, ...(c.altNames ? c.altNames.split('|') : [])]) {
      const norm = normalizeHousingName(n);
      if (norm) names.add(norm);
    }
    normNames.set(c.id, names);
    if (c.pnu) {
      const list = byPnu.get(c.pnu);
      if (list) list.push(c.id);
      else byPnu.set(c.pnu, [c.id]);
    }
    if (c.bjdCd) {
      for (const norm of names) {
        const key = `${c.bjdCd}|${norm}`;
        byName.set(key, byName.has(key) ? null : c.id);
      }
    }
  }

  const buckets = new Map<string, Bucket>();
  const bucketOf = (id: string): Bucket => {
    let b = buckets.get(id);
    if (!b) {
      b = newBucket();
      buckets.set(id, b);
    }
    return b;
  };
  const report: GongsiReport = {
    rows: 0,
    matchedRows: 0,
    matchedByPnuRows: 0,
    matchedByNameRows: 0,
    complexes: 0,
    complexesByPnu: 0,
    complexesByNameOnly: 0,
    complexesUnmatched: 0,
    badRows: 0,
    year: null,
    byBand: { b1: 0, b2: 0, b3: 0, b4: 0 },
    roadAddrs: 0,
  };

  let col: Record<keyof typeof GONGSI_COLUMNS, number> | null = null;
  for await (const line of lines) {
    if (col === null) {
      const header = parseGongsiLine(line);
      if (header.length === 0) continue;
      col = gongsiColumnIndex(header);
      continue;
    }
    const f = parseGongsiLine(line);
    if (f.length === 0) continue;
    report.rows += 1;
    if (opts.limitRows !== undefined && report.rows > opts.limitRows) {
      report.rows -= 1;
      break;
    }
    if (report.rows % 1_000_000 === 0) opts.onProgress?.({ rows: report.rows, matched: report.matchedRows });
    const pnu = buildGongsiPnu(f[col.bjdCode] ?? '', f[col.special] ?? '', f[col.bon] ?? '', f[col.bu] ?? '');
    const name = f[col.name] ?? '';
    let complexId: string | null = null;
    let viaPnu = false;
    if (pnu) {
      const ids = byPnu.get(pnu);
      if (ids && ids.length > 0) {
        if (ids.length === 1) complexId = ids[0]!;
        else {
          const norm = normalizeHousingName(name);
          complexId = ids.find((id) => normNames.get(id)?.has(norm)) ?? ids[0]!;
        }
        viaPnu = true;
      }
    }
    if (!complexId) {
      const bjd = (f[col.bjdCode] ?? '').trim();
      const norm = normalizeHousingName(name);
      if (bjd && norm) complexId = byName.get(`${bjd}|${norm}`) ?? null;
    }
    if (!complexId) continue;
    const area = Number(f[col.area]);
    const priceWon = Number((f[col.price] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(priceWon) || priceWon <= 0) {
      report.badRows += 1;
      continue;
    }
    const year = Number(f[col.year]);
    if (Number.isInteger(year) && (report.year === null || year > report.year)) report.year = year;
    const band = housingAreaBandOf(area);
    const b = bucketOf(complexId);
    b.prices[band].push(Math.round(priceWon / 10_000));
    b.areaSum[band] += area;
    if (viaPnu) {
      b.byPnu = true;
      report.matchedByPnuRows += 1;
    } else {
      b.byName = true;
      report.matchedByNameRows += 1;
    }
    report.matchedRows += 1;
    report.byBand[band] += 1;
    const road = (f[col.roadAddr] ?? '').replace(/\s+/g, ' ').trim();
    if (road) b.roadAddrs.set(road, (b.roadAddrs.get(road) ?? 0) + 1);
  }
  if (col === null) throw new Error('공시가격 CSV 가 비어 있습니다(헤더 없음)');

  const year = report.year ?? new Date().getFullYear();
  const aggregates: GongsiComplexAgg[] = [];
  for (const [complexId, b] of buckets) {
    const bands: Partial<Record<HousingAreaBand, GongsiBandAgg>> = {};
    const all: number[] = [];
    let allArea = 0;
    for (const band of HOUSING_AREA_BANDS) {
      if (band === 'all') continue;
      const agg = bandAgg(b.prices[band], b.areaSum[band]);
      if (agg) {
        bands[band] = agg;
        all.push(...b.prices[band]);
        allArea += b.areaSum[band];
      }
    }
    const allAgg = bandAgg(all, allArea);
    if (!allAgg) continue;
    bands.all = allAgg;
    let roadAddr: string | null = null;
    let best = 0;
    for (const [addr, n] of b.roadAddrs) {
      if (n > best) {
        best = n;
        roadAddr = addr;
      }
    }
    if (roadAddr) report.roadAddrs += 1;
    aggregates.push({ complexId, year, bands, roadAddr });
    report.complexes += 1;
    if (b.byPnu) report.complexesByPnu += 1;
    else report.complexesByNameOnly += 1;
  }
  report.complexesUnmatched = opts.complexes.filter((c) => c.pnu && !buckets.has(c.id)).length;
  return { aggregates, report };
};

// ── 쓰기 ────────────────────────────────────────────────────────────────────
export interface GongsiReplaceMeta {
  sourceFile: string | null;
  year: number;
}

// 전량 교체(트랜잭션) + roadAddr 가 비어 있는 단지 채우기(별도 청크 트랜잭션) + 적재 이력.
export const replaceHousingComplexPrices = async (
  prisma: PrismaClient,
  aggregates: GongsiComplexAgg[],
  meta: GongsiReplaceMeta,
): Promise<{ complexes: number; rows: number; roadAddrUpdated: number }> => {
  const rows: {
    complexId: string;
    band: string;
    year: number;
    count: number;
    median: number;
    min: number;
    max: number;
    avgArea: number;
  }[] = [];
  for (const a of aggregates) {
    for (const band of HOUSING_AREA_BANDS) {
      const agg = a.bands[band];
      if (!agg) continue;
      rows.push({ complexId: a.complexId, band, year: a.year, count: agg.count, median: agg.median, min: agg.min, max: agg.max, avgArea: agg.avgArea });
    }
  }
  await prisma.$transaction(
    async (tx) => {
      await tx.housingComplexPrice.deleteMany({});
      for (let i = 0; i < rows.length; i += CREATE_CHUNK) {
        await tx.housingComplexPrice.createMany({ data: rows.slice(i, i + CREATE_CHUNK) });
      }
      await tx.housingSync.create({
        data: { kind: 'prices', count: aggregates.length, baseDate: `${meta.year}-01-01`, sourceFile: meta.sourceFile },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  // 도로명주소 — 비어 있는 단지만(다른 보강(건축물대장)이 채운 값은 보존).
  const withRoad = aggregates.filter((a) => a.roadAddr !== null);
  let roadAddrUpdated = 0;
  for (let i = 0; i < withRoad.length; i += UPDATE_TX_CHUNK) {
    const results = await prisma.$transaction(
      withRoad.slice(i, i + UPDATE_TX_CHUNK).map((a) =>
        prisma.housingComplex.updateMany({ where: { id: a.complexId, roadAddr: null }, data: { roadAddr: a.roadAddr } }),
      ),
    );
    for (const r of results) roadAddrUpdated += r.count;
  }
  return { complexes: aggregates.length, rows: rows.length, roadAddrUpdated };
};
