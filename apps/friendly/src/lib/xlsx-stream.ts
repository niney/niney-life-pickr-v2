import { closeSync, createReadStream, fstatSync, openSync, readSync } from 'node:fs';
import { createInflateRaw } from 'node:zlib';
import { decodeXmlText, parseXlsxRowCells } from './xlsx.js';

// 큰 XLSX 를 행 단위로 흘려 읽는다 — 시트 XML 이 수 GB 라 xlsx.ts(통째로 풀어 문자열 하나로 읽는다)로는 못 여는 배포본용
// (식약처 식품영양성분 DB 가공식품 전체판: 33만 행, 시트 2.3GB). zip 은 파일 끝의 목차만 읽고, 고른 항목을 압축을 풀면서
// 닫는 태그(`</si>`·`</row>`)에서 끊어 넘긴다. ZIP64 를 읽는다. 첫 시트만.

interface ZipEntry {
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const U32_MAX = 0xffffffff;

const readAt = (fd: number, position: number, length: number): Buffer => {
  const buf = Buffer.alloc(length);
  readSync(fd, buf, 0, length, position);
  return buf;
};

const zipEntries = (fd: number, size: number): Map<string, ZipEntry> => {
  // 목차 끝 기록(EOCD)은 파일 끝에 있고 주석이 붙을 수 있다(최대 64KB). ZIP64 면 그 바로 앞에 locator 가 있다.
  const tailLength = Math.min(size, 66_000);
  const tail = readAt(fd, size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('XLSX 가 아닙니다(zip 서명 없음)');
  let count = tail.readUInt16LE(eocd + 10);
  let directorySize = tail.readUInt32LE(eocd + 12);
  let directoryOffset = tail.readUInt32LE(eocd + 16);
  if (eocd >= 20 && tail.readUInt32LE(eocd - 20) === SIG_EOCD64_LOCATOR) {
    const record = readAt(fd, Number(tail.readBigUInt64LE(eocd - 12)), 56);
    if (record.readUInt32LE(0) === SIG_EOCD64) {
      count = Number(record.readBigUInt64LE(32));
      directorySize = Number(record.readBigUInt64LE(40));
      directoryOffset = Number(record.readBigUInt64LE(48));
    }
  }
  const directory = readAt(fd, directoryOffset, directorySize);
  const entries = new Map<string, ZipEntry>();
  let o = 0;
  for (let i = 0; i < count && o + 46 <= directory.length; i += 1) {
    if (directory.readUInt32LE(o) !== SIG_CENTRAL) break;
    const method = directory.readUInt16LE(o + 10);
    let compressedSize = directory.readUInt32LE(o + 20);
    const uncompressedSize = directory.readUInt32LE(o + 24);
    const nameLength = directory.readUInt16LE(o + 28);
    const extraLength = directory.readUInt16LE(o + 30);
    const commentLength = directory.readUInt16LE(o + 32);
    let localHeaderOffset = directory.readUInt32LE(o + 42);
    const name = directory.toString('utf8', o + 46, o + 46 + nameLength);
    // ZIP64 덧칸(0x0001) — 32비트 칸이 0xFFFFFFFF 인 것만 차례로(원래 크기 → 압축 크기 → 헤더 자리) 8바이트씩 온다.
    const extraEnd = o + 46 + nameLength + extraLength;
    for (let e = o + 46 + nameLength; e + 4 <= extraEnd; ) {
      const id = directory.readUInt16LE(e);
      const length = directory.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let p = e + 4;
        if (uncompressedSize === U32_MAX) p += 8;
        if (compressedSize === U32_MAX) {
          compressedSize = Number(directory.readBigUInt64LE(p));
          p += 8;
        }
        if (localHeaderOffset === U32_MAX) localHeaderOffset = Number(directory.readBigUInt64LE(p));
      }
      e += 4 + length;
    }
    entries.set(name, { method, compressedSize, localHeaderOffset });
    o = extraEnd + commentLength;
  }
  return entries;
};

/** zip 항목 하나를 압축을 풀면서 글 조각으로 — UTF-8 글자가 조각 경계에서 잘리지 않는다(setEncoding). */
const entryText = (path: string, fd: number, name: string, entry: ZipEntry): AsyncIterable<string> => {
  const head = readAt(fd, entry.localHeaderOffset, 30);
  if (head.readUInt32LE(0) !== SIG_LOCAL) throw new Error(`zip 로컬 헤더가 깨졌습니다: ${name}`);
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`지원하지 않는 zip 압축 방식(${entry.method}): ${name}`);
  if (entry.compressedSize === 0) return (async function* empty() {})();
  const start = entry.localHeaderOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  const raw = createReadStream(path, { start, end: start + entry.compressedSize - 1 });
  const out = entry.method === 8 ? raw.pipe(createInflateRaw()) : raw;
  out.setEncoding('utf8');
  return out as AsyncIterable<string>;
};

/** 글 조각들을 닫는 태그에서 끊는다 — 넘기는 조각은 닫는 태그로 끝난다(마지막 남은 꼬리는 버린다). */
async function* cutAt(chunks: AsyncIterable<string>, closeTag: string): AsyncGenerator<string> {
  let pending = '';
  for await (const chunk of chunks) {
    pending += chunk;
    let from = 0;
    for (;;) {
      const at = pending.indexOf(closeTag, from);
      if (at < 0) break;
      yield pending.slice(from, at + closeTag.length);
      from = at + closeTag.length;
    }
    pending = pending.slice(from);
  }
}

const readSharedStrings = async (chunks: AsyncIterable<string>): Promise<string[]> => {
  const out: string[] = [];
  for await (const piece of cutAt(chunks, '</si>')) {
    // 조각 = (머리말 또는 빈 항목 `<si/>` 들) + `<si>…</si>` 하나. 빈 항목도 자리를 차지한다(번호가 밀리면 안 된다).
    const open = /<si(?:\s[^>]*)?>/.exec(piece);
    if (!open) continue;
    for (let i = piece.indexOf('<si/>'); i >= 0 && i < open.index; i = piece.indexOf('<si/>', i + 5)) out.push('');
    // 발음 표기(<rPh>)의 <t> 는 값이 아니다.
    const inner = piece.slice(open.index + open[0].length, piece.length - 5).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner)) !== null) text += t[1] ?? '';
    out.push(decodeXmlText(text));
  }
  return out;
};

/**
 * 첫 시트의 행을 차례로 넘긴다(첫 행이 머리글 — parseXlsx 처럼 가르지 않고 그대로). 빈 칸은 ''.
 * 메모리에는 공유 문자열 표와 지금 행만 있다.
 */
export async function* streamXlsxRows(path: string): AsyncGenerator<string[]> {
  const fd = openSync(path, 'r');
  try {
    const entries = zipEntries(fd, fstatSync(fd).size);
    const sharedEntry = entries.get('xl/sharedStrings.xml');
    const shared = sharedEntry ? await readSharedStrings(entryText(path, fd, 'xl/sharedStrings.xml', sharedEntry)) : [];
    const sheet = entries.get('xl/worksheets/sheet1.xml');
    if (!sheet) throw new Error('XLSX 에 워크시트가 없습니다');
    for await (const piece of cutAt(entryText(path, fd, 'xl/worksheets/sheet1.xml', sheet), '</row>')) {
      const open = /<row(?:\s[^>]*)?>/.exec(piece);
      if (!open) continue;
      yield parseXlsxRowCells(piece.slice(open.index + open[0].length, piece.length - 6), shared);
    }
  } finally {
    closeSync(fd);
  }
}
