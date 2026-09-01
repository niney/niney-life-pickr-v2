import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { deflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import {
  aggregateGongsi,
  buildGongsiPnu,
  gongsiColumnIndex,
  iterateLines,
  listZipEntries,
  openGongsiStream,
  parseGongsiLine,
} from './housing-price-master.service.js';

// 공시가격 적재 순수 부분 — ① 줄 파서(따옴표·CRLF·BOM) ② PNU 조립(특수지 0→1, 1→2, 0패딩) ③ 집계(PNU 매칭·
// 동 단위 마스터 중복 PNU 는 이름으로·법정동+이름 폴백·구간·중위값 홀/짝·도로명 최빈값·limitRows) ④ zip 스트림
// (로컬 헤더 + deflate + 중앙 디렉터리 + EOCD 를 직접 조립한 작은 zip). DB 는 만지지 않는다.

const HEADER =
  '"기준연도","기준월","법정동코드","도로명주소","시도","시군구","읍면","동리","특수지코드","본번","부번","특수지명","단지명","동명","호명","전용면적","공시가격","단지코드","동코드","호코드","건축물대장PK"';
const row = (o: { bjd?: string; road?: string; sp?: string; bon: string; bu?: string; name: string; area: string; price: string; year?: string }): string =>
  `"${o.year ?? '2025'}","1","${o.bjd ?? '1111010100'}","${o.road ?? '서울특별시 종로구 자하문로36길 16-14'}","서울특별시","종로구","","청운동","${o.sp ?? '0'}","${o.bon}","${o.bu ?? '0'}","","${o.name}","1","101","${o.area}","${o.price}","3","1","1","1002135465"`;

const linesOf = (text: string): AsyncGenerator<string> => iterateLines(Readable.from([Buffer.from(text, 'utf8')]));

describe('공시가격 줄 파서·PNU', () => {
  it('따옴표 줄·CRLF·따옴표 없는 줄', () => {
    expect(parseGongsiLine('"2025","1","1111010100"\r')).toEqual(['2025', '1', '1111010100']);
    expect(parseGongsiLine('"a","","c"')).toEqual(['a', '', 'c']);
    expect(parseGongsiLine('a,b,"c"')).toEqual(['a', 'b', 'c']);
    expect(parseGongsiLine('')).toEqual([]);
    expect(parseGongsiLine('\r')).toEqual([]);
  });

  it('헤더 인덱스 — BOM 제거, 필수 열 누락은 throw', () => {
    const col = gongsiColumnIndex(parseGongsiLine('﻿' + HEADER));
    expect(col).toMatchObject({ year: 0, bjdCode: 2, roadAddr: 3, special: 8, bon: 9, bu: 10, name: 12, area: 15, price: 16 });
    expect(() => gongsiColumnIndex(['기준연도', '법정동코드'])).toThrow(/필수 열 누락/);
  });

  it('PNU — 청운동 1번지 일반은 마스터 PNU 1111010100100010000 과 같아야 한다', () => {
    expect(buildGongsiPnu('1111010100', '0', '1', '0')).toBe('1111010100100010000');
    expect(buildGongsiPnu('1111010100', '1', '56', '45')).toBe('1111010100200560045');
    expect(buildGongsiPnu('1111010100', '', '578', '')).toBe('1111010100105780000');
    expect(buildGongsiPnu('111101010', '0', '1', '0')).toBeNull();
    expect(buildGongsiPnu('1111010100', '9', '1', '0')).toBeNull();
    expect(buildGongsiPnu('1111010100', '0', '12345', '0')).toBeNull();
  });

  it('줄 스트림 — 청크 경계·BOM·마지막 줄', async () => {
    const chunks = ['﻿"a","b"\r\n"c","d"\r\n"e"', ',"f"\r\n', '"g","h"'].map((s) => Buffer.from(s, 'utf8'));
    const out: string[] = [];
    for await (const l of iterateLines(Readable.from(chunks))) out.push(l);
    expect(out).toEqual(['"a","b"\r', '"c","d"\r', '"e","f"\r', '"g","h"']);
  });
});

describe('공시가격 집계', () => {
  const complexes = [
    { id: 'A', pnu: '1111010100100010000', bjdCd: '1111010100', name: '청운벽산빌리지', altNames: null },
    // 동 단위로 쪼개진 마스터 — 같은 PNU, 이름으로 고른다.
    { id: 'B1', pnu: '1111010100100030000', bjdCd: '1111010100', name: '인텔빌라A동', altNames: '인텔빌라' },
    { id: 'B2', pnu: '1111010100100030000', bjdCd: '1111010100', name: '인텔빌라BC동', altNames: null },
    // PNU 없음 — 법정동 + 정규화 단지명으로만.
    { id: 'R', pnu: null, bjdCd: '1111010100', name: '경희궁자이(1단지)', altNames: null },
    // PNU 있으나 행 없음.
    { id: 'N', pnu: '1111010100100990000', bjdCd: '1111010100', name: '없는단지', altNames: null },
  ];
  const text = [
    HEADER,
    row({ bon: '1', name: '청운벽산빌리지', area: '187.49', price: '926000000' }),
    row({ bon: '1', name: '청운벽산빌리지', area: '157.25', price: '859000000' }),
    row({ bon: '1', name: '청운벽산빌리지', area: '84.9', price: '500000000', road: '서울특별시 종로구 자하문로36길 16-14' }),
    row({ bon: '1', name: '청운벽산빌리지', area: '59.9', price: '300000000', road: '서울특별시 종로구 다른길 1' }),
    row({ bon: '3', name: '인텔빌라BC동', area: '84', price: '400000000' }),
    row({ bon: '3', name: '인텔빌라', area: '84', price: '440000000' }),
    row({ bon: '77', name: '경희궁자이 1단지', area: '59.5', price: '1200000000' }),
    row({ bon: '77', name: '경희궁자이 1단지', area: '59.5', price: 'abc' }),
    row({ bon: '77', name: '경희궁자이 1단지', area: '0', price: '10000' }),
    row({ bon: '500', name: '무관단지', area: '84', price: '1000000' }),
    '',
  ].join('\r\n');

  it('PNU·이름 매칭, 구간/전체 중위·범위·평균면적, 도로명 최빈값, 미매칭 단지 수', async () => {
    const { aggregates, report } = await aggregateGongsi(linesOf(text), { complexes });
    expect(report.rows).toBe(10);
    expect(report.matchedRows).toBe(7);
    expect(report.matchedByPnuRows).toBe(6);
    expect(report.matchedByNameRows).toBe(1);
    expect(report.badRows).toBe(2);
    expect(report.year).toBe(2025);
    expect(report.complexes).toBe(4);
    expect(report.complexesByPnu).toBe(3);
    expect(report.complexesByNameOnly).toBe(1);
    expect(report.complexesUnmatched).toBe(1); // N
    expect(report.byBand).toEqual({ b1: 2, b2: 3, b3: 0, b4: 2 });

    const a = aggregates.find((x) => x.complexId === 'A')!;
    // 만원: 92,600 / 85,900 / 50,000 / 30,000 → 전체 중위(짝수) = (50,000+85,900)/2 = 67,950
    expect(a.bands.all).toEqual({ count: 4, median: 67950, min: 30000, max: 92600, avgArea: 122.39 });
    expect(a.bands.b4).toEqual({ count: 2, median: 89250, min: 85900, max: 92600, avgArea: 172.37 });
    expect(a.bands.b1).toMatchObject({ count: 1, median: 30000 });
    expect(a.bands.b2).toMatchObject({ count: 1, median: 50000 });
    expect(a.bands.b3).toBeUndefined();
    expect(a.roadAddr).toBe('서울특별시 종로구 자하문로36길 16-14');
    expect(a.year).toBe(2025);

    // 같은 PNU 두 단지 — 행의 단지명 정규화로 고른다('인텔빌라' 는 B1 의 altNames).
    const b1 = aggregates.find((x) => x.complexId === 'B1')!;
    const b2 = aggregates.find((x) => x.complexId === 'B2')!;
    expect(b1.bands.all).toMatchObject({ count: 1, median: 44000 });
    expect(b2.bands.all).toMatchObject({ count: 1, median: 40000 });

    // 홀수 중위 — R 은 유효 1행(PNU 없음 → 법정동+이름).
    const r = aggregates.find((x) => x.complexId === 'R')!;
    expect(r.bands.all).toMatchObject({ count: 1, median: 120000, min: 120000, max: 120000, avgArea: 59.5 });
    expect(aggregates.some((x) => x.complexId === 'N')).toBe(false);
  });

  it('limitRows 는 앞 N행만 읽는다', async () => {
    const { report } = await aggregateGongsi(linesOf(text), { complexes, limitRows: 2 });
    expect(report.rows).toBe(2);
    expect(report.matchedRows).toBe(2);
  });

  it('헤더 없는(빈) 입력은 throw', async () => {
    await expect(aggregateGongsi(linesOf(''), { complexes })).rejects.toThrow(/헤더 없음/);
  });
});

describe('zip 스트림', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gongsi-zip-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // 최소 zip 조립 — 로컬 헤더 + 데이터 + 중앙 디렉터리 + EOCD(zip64 아님).
  const buildZip = (files: { name: string; data: Buffer; store?: boolean }[]): Buffer => {
    const parts: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const f of files) {
      const name = Buffer.from(f.name, 'utf8');
      const comp = f.store ? f.data : deflateRawSync(f.data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6); // UTF-8 이름
      local.writeUInt16LE(f.store ? 0 : 8, 8);
      local.writeUInt32LE(0, 14); // crc — 파서가 검증하지 않는다
      local.writeUInt32LE(comp.length, 18);
      local.writeUInt32LE(f.data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);
      cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(0x0800, 8);
      cd.writeUInt16LE(f.store ? 0 : 8, 10);
      cd.writeUInt32LE(comp.length, 20);
      cd.writeUInt32LE(f.data.length, 24);
      cd.writeUInt16LE(name.length, 28);
      cd.writeUInt16LE(0, 30);
      cd.writeUInt16LE(0, 32);
      cd.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([cd, name]));
      parts.push(local, name, comp);
      offset += local.length + name.length + comp.length;
    }
    const cdBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cdBuf, eocd]);
  };

  it('중앙 디렉터리를 읽고 샘플이 아닌 가장 큰 CSV 를 deflate 스트림으로 푼다', async () => {
    const big = [HEADER, row({ bon: '1', name: '청운벽산빌리지', area: '84', price: '500000000' }), ''].join('\r\n');
    const zipPath = join(dir, 'gongsi.zip');
    writeFileSync(
      zipPath,
      buildZip([
        { name: '국토교통부_주택 공시가격 정보(2025)_샘플데이터.csv', data: Buffer.from(big + big + big, 'utf8') },
        { name: '레이아웃.png', data: Buffer.from('png'), store: true },
        { name: '국토교통부_주택 공시가격 정보(2025).csv', data: Buffer.from('﻿' + big, 'utf8') },
      ]),
    );
    const entries = await listZipEntries(zipPath);
    expect(entries.map((e) => e.name)).toEqual(['국토교통부_주택 공시가격 정보(2025)_샘플데이터.csv', '레이아웃.png', '국토교통부_주택 공시가격 정보(2025).csv']);
    expect(entries[1]).toMatchObject({ method: 0, compressedSize: 3, uncompressedSize: 3 });

    const { stream, description } = await openGongsiStream(zipPath);
    expect(description).toContain('국토교통부_주택 공시가격 정보(2025).csv');
    const lines: string[] = [];
    for await (const l of iterateLines(stream)) lines.push(l.replace(/\r$/, ''));
    expect(lines[0]).toBe(HEADER);
    expect(lines).toHaveLength(2);
    // 집계까지 한 번에.
    const { stream: s2 } = await openGongsiStream(zipPath);
    const { report } = await aggregateGongsi(iterateLines(s2), {
      complexes: [{ id: 'A', pnu: '1111010100100010000', bjdCd: '1111010100', name: '청운벽산빌리지', altNames: null }],
    });
    expect(report).toMatchObject({ rows: 1, matchedRows: 1, complexes: 1 });
  });

  it('csv 경로는 그대로 읽고, zip 에 CSV 가 없으면 throw', async () => {
    const csvPath = join(dir, 'plain.csv');
    writeFileSync(csvPath, [HEADER, row({ bon: '1', name: 'x', area: '84', price: '1' })].join('\n'), 'utf8');
    const { stream } = await openGongsiStream(csvPath);
    const lines: string[] = [];
    for await (const l of iterateLines(stream)) lines.push(l);
    expect(lines).toHaveLength(2);

    const noCsv = join(dir, 'nocsv.zip');
    writeFileSync(noCsv, buildZip([{ name: 'a.txt', data: Buffer.from('hi'), store: true }]));
    await expect(openGongsiStream(noCsv)).rejects.toThrow(/CSV 항목이 없습니다/);
  });
});
