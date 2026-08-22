import { inflateRawSync } from 'node:zlib';

// 최소 XLSX 리더 — 공공데이터 배포본이 CSV 가 아니라 XLSX 로만 오는 경우(한식진흥원 800선 등)를
// 위해 zip + XML 만 직접 푼다. 새 의존성을 들이지 않으려는 선택이고, 필요한 기능만 지원한다:
//   - 첫 시트(또는 이름 지정) 읽기
//   - sharedStrings / inlineStr / 숫자·문자 셀
//   - 열 문자(A, B, …, AA) → 인덱스 매핑(빈 셀은 '' 로 채움)
// 지원하지 않는 것: 수식 결과 외 계산, 날짜 서식 변환(원시 숫자 그대로), ZIP64, 암호화.
// 대용량(수십 MB)에는 부적합 — 그런 소스는 CSV 로 받는다.

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const findEocd = (buf: Buffer): number => {
  // EOCD 는 파일 끝에 있고 주석이 붙을 수 있어 뒤에서부터 찾는다(주석 최대 64KB).
  const start = Math.max(0, buf.length - 66_000);
  for (let i = buf.length - 22; i >= start; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
};

const readZipEntries = (buf: Buffer): Map<string, ZipEntry> => {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('XLSX 가 아닙니다(zip 서명 없음)');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(offset) !== SIG_CENTRAL) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
};

const readEntry = (buf: Buffer, entry: ZipEntry): string => {
  const o = entry.localHeaderOffset;
  if (buf.readUInt32LE(o) !== SIG_LOCAL) throw new Error(`zip 로컬 헤더가 깨졌습니다: ${entry.name}`);
  const nameLen = buf.readUInt16LE(o + 26);
  const extraLen = buf.readUInt16LE(o + 28);
  const dataStart = o + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return raw.toString('utf8');
  if (entry.method === 8) return inflateRawSync(raw).toString('utf8');
  throw new Error(`지원하지 않는 zip 압축 방식(${entry.method}): ${entry.name}`);
};

const decodeXmlText = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// <si> 하나가 리치텍스트면 <t> 가 여러 개다 — 전부 이어 붙인다.
const parseSharedStrings = (xml: string): string[] => {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    const inner = m[1] ?? '';
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner)) !== null) text += t[1] ?? '';
    out.push(decodeXmlText(text));
  }
  return out;
};

// 'A' → 0, 'Z' → 25, 'AA' → 26.
export const columnLetterToIndex = (ref: string): number => {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const parseSheet = (xml: string, shared: string[]): string[][] => {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null) {
    const rowXml = rm[1] ?? '';
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowXml)) !== null) {
      const attrs = cm[1] ?? '';
      const inner = cm[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      let value = '';
      if (type === 'inlineStr') {
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let t: RegExpExecArray | null;
        while ((t = tRe.exec(inner)) !== null) value += t[1] ?? '';
        value = decodeXmlText(value);
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
        if (type === 's') {
          const idx = Number.parseInt(v, 10);
          value = Number.isFinite(idx) ? (shared[idx] ?? '') : '';
        } else {
          value = decodeXmlText(v);
        }
      }
      const col = ref ? columnLetterToIndex(ref) : cells.length;
      while (cells.length < col) cells.push('');
      cells[col] = value.trim();
    }
    rows.push(cells);
  }
  return rows;
};

export interface XlsxTable {
  header: string[];
  rows: string[][];
}

// 첫 행을 헤더로 보고 나머지를 행으로 돌려준다(parseCsv 와 같은 모양 — 호출부가 동일하게 쓴다).
// sheetName 을 주면 그 시트를, 없으면 sheet1 을 읽는다.
export const parseXlsx = (buf: Buffer, sheetName?: string): XlsxTable => {
  const entries = readZipEntries(buf);
  const sharedEntry = entries.get('xl/sharedStrings.xml');
  const shared = sharedEntry ? parseSharedStrings(readEntry(buf, sharedEntry)) : [];

  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (sheetName) {
    // workbook.xml 의 시트 순서 = sheetN.xml 순서(일반적인 내보내기 기준).
    const wbEntry = entries.get('xl/workbook.xml');
    if (wbEntry) {
      const wb = readEntry(buf, wbEntry);
      const names = [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => decodeXmlText(m[1] ?? ''));
      const idx = names.findIndex((n) => n === sheetName);
      if (idx >= 0) sheetPath = `xl/worksheets/sheet${idx + 1}.xml`;
    }
  }
  const sheetEntry = entries.get(sheetPath) ?? entries.get('xl/worksheets/sheet1.xml');
  if (!sheetEntry) throw new Error('XLSX 에 워크시트가 없습니다');

  const all = parseSheet(readEntry(buf, sheetEntry), shared);
  const [header = [], ...rows] = all;
  return { header, rows };
};

// 시트 이름 목록 — 여러 시트 중 무엇을 읽을지 고를 때.
export const listXlsxSheets = (buf: Buffer): string[] => {
  const entries = readZipEntries(buf);
  const wbEntry = entries.get('xl/workbook.xml');
  if (!wbEntry) return [];
  const wb = readEntry(buf, wbEntry);
  return [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => decodeXmlText(m[1] ?? ''));
};
