// 침수 흔적 적재 — 서울시 침수흔적도(서울 열린데이터 OA-15636 = data.go.kr 15133406, 공공누리 1유형)의 연도별
// SHP zip(2010~, 2015·2021 없음)을 읽어 필지 폴리곤 하나를 무게중심 점 하나로 LifeFloodTrace 에 전량 교체한다.
// 파싱·정규화는 순수 함수(+ 사유별 drop 리포트), 쓰기는 replaceLifeFloodTraces, 다운로드는 적재 스크립트.
//
// 원본 실측(2026-09-24, 14개 파일 43,112 폴리곤):
//   · 좌표계는 전부 UTM-K(EPSG:5179 — prj 'Korea_2000_Korea_Unified…' / 'KGD2002_Unified…') → utmkToWgs84.
//   · DBF 는 CP949(2022~ .cpg '949')인데 2022 파일에 UTF-8 값이 16개 섞여 있다 → 값마다 UTF-8 엄격 해석 먼저, 실패 시 euc-kr.
//   · 스키마가 연도마다 다르다: 2010~2020 은 F_DISA_NM·F_SAT_YMD·F_RSN_DTL, 2022~2024 는 TYPE 추가·ADM_CD 숫자형
//     ('1111017400.0000000'), 2025 는 재해명·원인 없이 '피해일시'('20250822 - 1031')·TYPE('주택'·'소상공인').
//   · 피해일자에 꼬리('20220808 - 1')나 오타('2180828')가 있어 앞 8자리만 검증해 쓰고, 안 되면 F_YR → 파일 연도.
//   · 파일 연도와 사건 연도가 다른 행이 있다(2019 파일의 2020년 호우 등) — 사건 연도는 피해일자 기준. 파일 간
//     중복은 2건뿐이라 접지 않는다(같은 건물 여러 세대는 같은 점 여러 행이 정상).
//   · 2023·2024 는 풍수해보험금, 2025 는 재난지원금 신청 기반(서울시 배포 설명) — 같은 '침수 흔적'으로 센다.

import { open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import type { PrismaClient } from '@prisma/client';
import { utmkToWgs84, type ProjectedXY } from '@repo/utils';
import { zipEntryDataOffset, type ZipEntry } from '../housing/housing-price-master.service.js';

// WGS84 한국 범위 — 계약(lat 33~39, lng 124~132)과 동일. 밖이면 좌표계 이상으로 drop.
const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;
// 한 트랜잭션 안 createMany 청크 — 10열 × 2,000행 = 20,000 바인드(SQLite 상한 32,766 아래).
const CREATE_CHUNK = 2000;
const REPLACE_TX_TIMEOUT_MS = 10 * 60_000;

// ── 서울 열린데이터 파일 목록 ─────────────────────────────────────────────────────
export const SEOUL_FLOOD_DATASET_ID = 'OA-15636';
export const SEOUL_FLOOD_PAGE_URL = `https://data.seoul.go.kr/dataList/${SEOUL_FLOOD_DATASET_ID}/S/1/datasetView.do`;
export const SEOUL_FLOOD_DOWNLOAD_URL = 'https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false';

export interface SeoulFloodFile {
  year: number;
  seq: string;
  name: string;
}

// 데이터셋 페이지 HTML → 연도별 zip(파일명에 'YYYY년 … 침수흔적도 … .zip'). 같은 연도가 여럿이면 목록 위(최신 등록)
// 것 하나. 연도 오름차순.
export const parseSeoulFloodFileList = (html: string): SeoulFloodFile[] => {
  const byYear = new Map<number, SeoulFloodFile>();
  const re = /<span title="([^"]+\.zip)" onclick="javascript:downloadFile\('(\d+)'\);"/g;
  for (const m of html.matchAll(re)) {
    const name = m[1]!;
    const year = /(\d{4})년/.exec(name);
    if (!year || !name.includes('침수흔적도')) continue;
    const y = Number(year[1]);
    if (!byYear.has(y)) byYear.set(y, { year: y, seq: m[2]!, name });
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
};

// 적재 파일명 규약 — data/open/flood/seoul-flood-YYYY.zip.
export const SEOUL_FLOOD_ZIP_RE = /^seoul-flood-(\d{4})\.zip$/;
export const seoulFloodZipName = (year: number): string => `seoul-flood-${year}.zip`;

// ── DBF ────────────────────────────────────────────────────────────────────────
const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const eucKr = new TextDecoder('euc-kr');

// 값 하나 해석 — ASCII 면 그대로, 아니면 UTF-8 엄격(깨지면 예외) → euc-kr. CP949 한글 바이트열이 우연히 유효한
// UTF-8 이 되는 일은 사실상 없어(두 바이트 모두 0x80 이상 + UTF-8 연속 바이트 규칙) 순서가 안전하다.
export const decodeDbfText = (bytes: Uint8Array): string => {
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0x20 || bytes[end - 1] === 0x00)) end -= 1;
  let start = 0;
  while (start < end && bytes[start] === 0x20) start += 1;
  const b = bytes.subarray(start, end);
  if (b.every((c) => c < 0x80)) return String.fromCharCode(...b);
  try {
    return utf8Strict.decode(b);
  } catch {
    return eucKr.decode(b);
  }
};

export interface DbfField {
  name: string;
  type: string;
  length: number;
}

// dBASE III 테이블 → 필드 목록 + 행(필드명 → 문자열, 앞뒤 공백 제거). 삭제 표시('*') 행은 null 로 자리만 지켜
// SHP 레코드 순서와 짝이 맞게 한다.
export const parseDbf = (buf: Buffer): { fields: DbfField[]; records: (Record<string, string> | null)[] } => {
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields: DbfField[] = [];
  for (let p = 32; p + 32 <= headerLen && buf[p] !== 0x0d; p += 32) {
    const raw = buf.subarray(p, p + 11);
    const nul = raw.indexOf(0);
    fields.push({ name: decodeDbfText(nul >= 0 ? raw.subarray(0, nul) : raw), type: String.fromCharCode(buf[p + 11]!), length: buf[p + 16]! });
  }
  const records: (Record<string, string> | null)[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = headerLen + i * recordLen;
    if (at + recordLen > buf.length) break;
    if (buf[at] === 0x2a) {
      records.push(null);
      continue;
    }
    const rec: Record<string, string> = {};
    let o = at + 1;
    for (const f of fields) {
      rec[f.name] = decodeDbfText(buf.subarray(o, o + f.length));
      o += f.length;
    }
    records.push(rec);
  }
  return { fields, records };
};

// ── SHP ────────────────────────────────────────────────────────────────────────
// 레코드마다 대표점 하나 — 점은 그대로, 폴리곤(5·15·25)은 모든 링의 부호 있는 면적 가중 무게중심(SHP 는 외곽
// 시계·구멍 반시계라 부호 합이 곧 구멍 뺀 면적), 면적이 0 에 가까우면 bbox 중심. null shape 는 null.
export const parseShpCentroids = (buf: Buffer): (ProjectedXY | null)[] => {
  const out: (ProjectedXY | null)[] = [];
  let p = 100;
  while (p + 8 <= buf.length) {
    const contentLen = buf.readInt32BE(p + 4) * 2;
    const c = p + 8;
    p = c + contentLen;
    if (contentLen < 4 || p > buf.length) break;
    const type = buf.readInt32LE(c);
    if (type === 0) {
      out.push(null);
      continue;
    }
    if (type === 1 || type === 11 || type === 21) {
      out.push({ x: buf.readDoubleLE(c + 4), y: buf.readDoubleLE(c + 12) });
      continue;
    }
    if (type !== 5 && type !== 15 && type !== 25) {
      out.push(null);
      continue;
    }
    const bbox = { minX: buf.readDoubleLE(c + 4), minY: buf.readDoubleLE(c + 12), maxX: buf.readDoubleLE(c + 20), maxY: buf.readDoubleLE(c + 28) };
    const numParts = buf.readInt32LE(c + 36);
    const numPoints = buf.readInt32LE(c + 40);
    const pts = c + 44 + numParts * 4;
    // 좌표가 ~10⁶ m 라 외적이 ~10¹² — 첫 점 기준으로 옮겨 자릿수 손실을 막는다.
    const ox = numPoints > 0 ? buf.readDoubleLE(pts) : 0;
    const oy = numPoints > 0 ? buf.readDoubleLE(pts + 8) : 0;
    let area2 = 0;
    let cx = 0;
    let cy = 0;
    for (let part = 0; part < numParts; part += 1) {
      const from = buf.readInt32LE(c + 44 + part * 4);
      const to = part + 1 < numParts ? buf.readInt32LE(c + 44 + (part + 1) * 4) : numPoints;
      for (let i = from; i < to - 1; i += 1) {
        const x0 = buf.readDoubleLE(pts + i * 16) - ox;
        const y0 = buf.readDoubleLE(pts + i * 16 + 8) - oy;
        const x1 = buf.readDoubleLE(pts + (i + 1) * 16) - ox;
        const y1 = buf.readDoubleLE(pts + (i + 1) * 16 + 8) - oy;
        const cross = x0 * y1 - x1 * y0;
        area2 += cross;
        cx += (x0 + x1) * cross;
        cy += (y0 + y1) * cross;
      }
    }
    out.push(
      Math.abs(area2) > 1e-6
        ? { x: ox + cx / (3 * area2), y: oy + cy / (3 * area2) }
        : { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 },
    );
  }
  return out;
};

// ── 정규화 ─────────────────────────────────────────────────────────────────────
export interface LifeFloodTraceRow {
  lat: number;
  lng: number;
  eventYear: number;
  eventMonth: number | null;
  depthM: number | null;
  disaster: string | null;
  cause: string | null;
  kind: string | null;
  sggCd: string | null;
  sourceYear: number;
}

export type LifeFloodDropReason = 'deleted' | 'noGeometry' | 'outOfRange';
export interface LifeFloodReport {
  read: number;
  kept: number;
  dropped: Record<LifeFloodDropReason, number>;
  // 사건 연도별 건수 / 날짜 폴백(F_YR·파일 연도) 건수.
  byEventYear: Record<string, number>;
  yearFallback: number;
}
export const emptyLifeFloodReport = (): LifeFloodReport => ({
  read: 0,
  kept: 0,
  dropped: { deleted: 0, noGeometry: 0, outOfRange: 0 },
  byEventYear: {},
  yearFallback: 0,
});

const clean = (s: string | undefined): string | null => {
  const v = (s ?? '').replace(/\s+/g, ' ').trim();
  return v.length > 0 ? v : null;
};

// 피해 시작일 — 앞 8자리 YYYYMMDD 만 보고(꼬리 ' - 1' 무시) 연도 2000~2100·월 1~12 일 때만 인정.
const parseEventDate = (raw: string | undefined): { year: number; month: number } | null => {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec((raw ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
};

export const normalizeLifeFloodRecord = (
  rec: Record<string, string> | null,
  xy: ProjectedXY | null,
  sourceYear: number,
  report: LifeFloodReport,
): LifeFloodTraceRow | null => {
  report.read += 1;
  if (rec === null) {
    report.dropped.deleted += 1;
    return null;
  }
  if (xy === null || !Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
    report.dropped.noGeometry += 1;
    return null;
  }
  const { lat, lng } = utmkToWgs84(xy);
  if (!(lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX)) {
    report.dropped.outOfRange += 1;
    return null;
  }
  const date = parseEventDate(rec['F_SAT_YMD'] ?? rec['피해일시']);
  let eventYear = date?.year ?? null;
  if (eventYear === null) {
    report.yearFallback += 1;
    const fy = /^(\d{4})/.exec(rec['F_YR'] ?? '');
    eventYear = fy && Number(fy[1]) >= 2000 ? Number(fy[1]) : sourceYear;
  }
  const depth = Number(rec['F_SHIM']);
  const sgg = /^(\d{5})/.exec(rec['ADM_CD'] ?? '');
  report.kept += 1;
  report.byEventYear[String(eventYear)] = (report.byEventYear[String(eventYear)] ?? 0) + 1;
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    eventYear,
    eventMonth: date?.month ?? null,
    depthM: Number.isFinite(depth) && depth > 0 ? Math.round(depth * 1000) / 1000 : null,
    disaster: clean(rec['F_DISA_NM']),
    cause: clean(rec['F_RSN_DTL']),
    kind: clean(rec['TYPE']),
    sggCd: sgg ? sgg[1]! : null,
    sourceYear,
  };
};

// SHP·DBF 한 쌍 → 행. 레코드 수가 다르면 원본 손상이라 예외(짝이 어긋나면 속성이 엉뚱한 점에 붙는다).
export const parseLifeFloodLayer = (
  shp: Buffer,
  dbf: Buffer,
  sourceYear: number,
  report: LifeFloodReport,
): LifeFloodTraceRow[] => {
  const points = parseShpCentroids(shp);
  const { records } = parseDbf(dbf);
  if (points.length !== records.length) {
    throw new Error(`${sourceYear}년 SHP(${points.length})와 DBF(${records.length}) 레코드 수가 다릅니다`);
  }
  const rows: LifeFloodTraceRow[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const row = normalizeLifeFloodRecord(records[i]!, points[i]!, sourceYear, report);
    if (row) rows.push(row);
  }
  return rows;
};

// zip 항목 하나를 통째로 메모리로(가장 큰 DBF 가 77MB — 스트리밍 불필요).
export const readZipEntryBuffer = async (zipPath: string, entry: ZipEntry): Promise<Buffer> => {
  if (entry.method !== 8 && entry.method !== 0) throw new Error(`지원하지 않는 zip 압축 방식(${entry.method}): ${entry.name}`);
  const start = await zipEntryDataOffset(zipPath, entry);
  const fh = await open(zipPath, 'r');
  try {
    const buf = Buffer.alloc(entry.compressedSize);
    await fh.read(buf, 0, entry.compressedSize, start);
    return entry.method === 8 ? inflateRawSync(buf) : buf;
  } finally {
    await fh.close();
  }
};

// ── 쓰기 ───────────────────────────────────────────────────────────────────────
export interface LifeFloodReplaceMeta {
  // 최신 사건 'YYYY-MM'(없으면 연도) — LifeMasterSync.baseDate.
  baseDate: string | null;
  sourceFile: string;
}

export const replaceLifeFloodTraces = async (
  prisma: PrismaClient,
  rows: LifeFloodTraceRow[],
  meta: LifeFloodReplaceMeta,
): Promise<number> => {
  await prisma.$transaction(
    async (tx) => {
      await tx.lifeFloodTrace.deleteMany({});
      for (let i = 0; i < rows.length; i += CREATE_CHUNK) {
        await tx.lifeFloodTrace.createMany({ data: rows.slice(i, i + CREATE_CHUNK) });
      }
      await tx.lifeMasterSync.create({
        data: { layer: 'flood', count: rows.length, geocoded: null, baseDate: meta.baseDate, sourceFile: meta.sourceFile },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  return rows.length;
};

// 최신 사건 연월 — 'YYYY-MM'(월 없는 연도만 있으면 'YYYY').
export const latestFloodEvent = (rows: LifeFloodTraceRow[]): string | null => {
  let best: { y: number; m: number } | null = null;
  for (const r of rows) {
    const m = r.eventMonth ?? 0;
    if (!best || r.eventYear > best.y || (r.eventYear === best.y && m > best.m)) best = { y: r.eventYear, m };
  }
  if (!best) return null;
  return best.m > 0 ? `${best.y}-${String(best.m).padStart(2, '0')}` : String(best.y);
};
