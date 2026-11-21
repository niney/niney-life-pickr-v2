import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { columnLetterToIndex, listXlsxSheets, parseXlsx } from './xlsx.js';
import { streamXlsxRows } from './xlsx-stream.js';

// 최소 XLSX 리더 — 실제 배포본(한식 800선)은 sharedStrings + sheet1 조합이라 그 모양을 만들어
// 검증한다. zip 은 표준 라이브러리(deflateRaw)로 직접 조립한다(픽스처 바이너리를 리포에 넣지 않으려고).

interface Entry {
  name: string;
  data: Buffer;
}

// 최소 zip(deflate) 작성기 — 테스트 전용. ZIP64·암호화·주석 없음.
const makeZip = (entries: Entry[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const compressed = deflateRawSync(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 14); // crc(리더가 검증하지 않는다)
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(Buffer.concat([local, name, compressed]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += 30 + name.length + compressed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
};

const SHARED = `<?xml version="1.0"?><sst count="5" uniqueCount="5">
  <si><t>요리번호</t></si>
  <si><t>요리명</t></si>
  <si><t>간장게장&amp;정식</t></si>
  <si><r><t>상차림 </t></r><r><t>[Sangcharim]</t></r></si>
  <si><t>Ganjanggejang</t></si>
</sst>`;

// 1행: 조판 번호 행(실제 배포본과 같은 모양) / 2행: 진짜 헤더 / 3행: 데이터.
// C3 은 inlineStr, D3 은 숫자.
const SHEET1 = `<?xml version="1.0"?><worksheet><sheetData>
  <row r="1"><c r="A1" t="n"><v>1</v></c></row>
  <row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c><c r="D2" t="s"><v>3</v></c></row>
  <row r="3"><c r="A3" t="n"><v>001</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="inlineStr"><is><t>메모</t></is></c><c r="D3" t="s"><v>4</v></c></row>
</sheetData></worksheet>`;

const WORKBOOK = `<?xml version="1.0"?><workbook><sheets><sheet name="첫 시트" sheetId="1" r:id="rId1"/><sheet name="둘째" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const SHEET2 = `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>둘째시트</t></is></c></row></sheetData></worksheet>`;

const book = (): Buffer =>
  makeZip([
    { name: 'xl/workbook.xml', data: Buffer.from(WORKBOOK, 'utf8') },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(SHARED, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(SHEET1, 'utf8') },
    { name: 'xl/worksheets/sheet2.xml', data: Buffer.from(SHEET2, 'utf8') },
  ]);

describe('columnLetterToIndex', () => {
  it('A/Z/AA/AB', () => {
    expect(columnLetterToIndex('A1')).toBe(0);
    expect(columnLetterToIndex('Z9')).toBe(25);
    expect(columnLetterToIndex('AA1')).toBe(26);
    expect(columnLetterToIndex('AB12')).toBe(27);
  });
});

describe('parseXlsx', () => {
  const buf = book();

  it('sharedStrings·inlineStr·숫자 셀을 읽고 빈 열은 채운다', () => {
    const t = parseXlsx(buf);
    // 첫 행은 조판 번호 행 — 헤더로 잡히고 진짜 헤더는 rows[0] (호출부가 판단).
    expect(t.header).toEqual(['1']);
    expect(t.rows[0]).toEqual(['요리번호', '요리명', '', '상차림 [Sangcharim]']);
    expect(t.rows[1]).toEqual(['001', '간장게장&정식', '메모', 'Ganjanggejang']);
  });

  it('리치텍스트(<r><t>)는 이어 붙이고 XML 엔티티는 되돌린다', () => {
    const t = parseXlsx(buf);
    expect(t.rows[0]?.[3]).toBe('상차림 [Sangcharim]');
    expect(t.rows[1]?.[1]).toBe('간장게장&정식');
  });

  it('시트 이름으로 고를 수 있고, 목록을 준다', () => {
    expect(listXlsxSheets(buf)).toEqual(['첫 시트', '둘째']);
    expect(parseXlsx(buf, '둘째').header).toEqual(['둘째시트']);
    // 없는 이름은 첫 시트로 폴백.
    expect(parseXlsx(buf, '없는시트').rows[0]?.[0]).toBe('요리번호');
  });

  it('zip 이 아니면 오류', () => {
    expect(() => parseXlsx(Buffer.from('not a zip'))).toThrow(/XLSX/);
  });
});

describe('streamXlsxRows — 큰 시트를 행 단위로', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-stream-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const fileOf = (name: string, buf: Buffer): string => {
    const p = join(dir, name);
    writeFileSync(p, buf);
    return p;
  };
  const rowsOf = async (path: string): Promise<string[][]> => {
    const out: string[][] = [];
    for await (const row of streamXlsxRows(path)) out.push(row);
    return out;
  };

  it('통째로 읽는 리더와 같은 값을 행마다 넘긴다(첫 행도 그대로)', async () => {
    const t = parseXlsx(book());
    expect(await rowsOf(fileOf('book.xlsx', book()))).toEqual([t.header, ...t.rows]);
  });

  it('행이 많아 조각 경계에 걸려도 빠뜨리지 않고, 빈 공유 문자열(<si/>)은 자리를 지킨다', async () => {
    const shared = `<sst><si><t>이름</t></si><si/><si><t>값 &amp; 덧말</t></si>${Array.from({ length: 3000 }, (_, i) => `<si><t>제품 ${i} 가나다라마바사</t></si>`).join('')}</sst>`;
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>${Array.from(
      { length: 3000 },
      (_, i) => `<row r="${i + 2}" spans="1:3"><c r="A${i + 2}" t="s"><v>${i + 3}</v></c><c r="C${i + 2}"><v>${i * 1.5}</v></c></row>`,
    ).join('')}<row r="3002"/></sheetData></worksheet>`;
    const rows = await rowsOf(
      fileOf(
        'big.xlsx',
        makeZip([
          { name: 'xl/sharedStrings.xml', data: Buffer.from(shared, 'utf8') },
          { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet, 'utf8') },
        ]),
      ),
    );
    expect(rows).toHaveLength(3001);
    expect(rows[0]).toEqual(['이름', '', '값 & 덧말']);
    expect(rows[1]).toEqual(['제품 0 가나다라마바사', '', '0']);
    expect(rows[3000]).toEqual(['제품 2999 가나다라마바사', '', '4498.5']);
  });

  it('zip 이 아니면 오류', async () => {
    await expect(rowsOf(fileOf('not.xlsx', Buffer.from('not a zip at all')))).rejects.toThrow(/XLSX/);
  });
});
