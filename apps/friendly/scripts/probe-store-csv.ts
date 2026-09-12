// 상가(상권)정보 분기 zip(data.go.kr 15083033) 구조 프로브 — 시도별 CSV 항목 목록·헤더·업종 분류
// 분포를 찍는다. 적재 로더(load-life-stores.ts)의 열 이름·업종 코드 판정을 만들 때와, 분기 갱신 후
// 열이 바뀌었는지 확인할 때 쓴다. zip 은 풀지 않고 항목을 deflate 스트림으로 읽는다(공시가격 로더와
// 같은 유틸). unzip 은 한글 항목명 패턴 매칭이 깨져(CP437) 못 쓴다.
//
// 실행: pnpm --filter friendly probe:store-csv [zip] [--entry=세종] [--all]
//   --entry  분석할 항목(이름 포함 문자열). 기본 '세종'(가장 작음).
//   --all    모든 항목의 행 수·업종 대분류 분포(1.5GB 전부 읽음 — 수 분).

import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInflateRaw } from 'node:zlib';
import { iterateCsvRows } from '../src/lib/csv.js';
import { iterateLines, listZipEntries, zipEntryDataOffset, type ZipEntry } from '../src/modules/housing/housing-price-master.service.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const zipPath = resolve(args.find((a) => !a.startsWith('--')) ?? resolve(REPO_ROOT, 'data/open/store/store-202606.zip'));
const ALL = args.includes('--all');
const ENTRY = opt('entry') ?? '세종';

const openEntry = async (entry: ZipEntry) => {
  const start = await zipEntryDataOffset(zipPath, entry);
  const raw = createReadStream(zipPath, { start, end: start + entry.compressedSize - 1 });
  return entry.method === 8 ? raw.pipe(createInflateRaw()) : raw;
};

// 줄 스트림 → CSV 행(따옴표 안 줄바꿈은 상가 데이터에 없다고 보고 줄 단위로 파싱).
const parseLine = (line: string): string[] => {
  const it = iterateCsvRows(line.endsWith('\r') ? line.slice(0, -1) : line);
  const first = it.next();
  return first.done ? [] : first.value;
};

const count = <K>(m: Map<K, number>, k: K): void => {
  m.set(k, (m.get(k) ?? 0) + 1);
};
const top = <K>(m: Map<K, number>, n = 50): string =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${String(k)}=${v}`)
    .join(' · ');

const main = async (): Promise<void> => {
  const entries = (await listZipEntries(zipPath)).filter((e) => /\.csv$/i.test(e.name));
  console.log(`zip: ${zipPath}\n항목 ${entries.length}개:`);
  for (const e of entries) console.log(`  ${e.name}  ${(e.uncompressedSize / 1048576).toFixed(1)}MB  method=${e.method}`);

  const targets = ALL ? entries : entries.filter((e) => e.name.includes(ENTRY));
  if (targets.length === 0) throw new Error(`항목 없음: ${ENTRY}`);

  let header: string[] | null = null;
  const grand = { rows: 0, badWidth: 0, noCoord: 0 };
  const large = new Map<string, number>();
  const middle = new Map<string, number>();
  const small = new Map<string, number>();
  for (const entry of targets) {
    let rows = 0;
    let badWidth = 0;
    let noCoord = 0;
    let first = true;
    const t0 = Date.now();
    for await (const line of iterateLines(await openEntry(entry))) {
      if (line.length === 0) continue;
      const cells = parseLine(line);
      if (first) {
        first = false;
        if (!header) {
          header = cells;
          console.log(`\n헤더 ${header.length}열: ${header.join(' | ')}`);
        } else if (cells.join('|') !== header.join('|')) {
          console.log(`  ⚠ 헤더 불일치: ${entry.name}`);
        }
        continue;
      }
      rows += 1;
      if (cells.length !== header!.length) {
        badWidth += 1;
        continue;
      }
      const h = header!;
      const col = (name: string): string => cells[h.indexOf(name)] ?? '';
      if (!col('경도') || !col('위도')) noCoord += 1;
      count(large, `${col('상권업종대분류코드')} ${col('상권업종대분류명')}`);
      count(middle, `${col('상권업종중분류코드')} ${col('상권업종중분류명')}`);
      count(small, `${col('상권업종중분류명')} > ${col('상권업종소분류코드')} ${col('상권업종소분류명')}`);
      if (rows <= 2) console.log(`  샘플: ${cells.join(' | ')}`);
    }
    console.log(`${entry.name}: ${rows.toLocaleString('ko-KR')}행 · 열수불일치 ${badWidth} · 좌표결측 ${noCoord} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    grand.rows += rows;
    grand.badWidth += badWidth;
    grand.noCoord += noCoord;
  }
  console.log(`\n합계 ${grand.rows.toLocaleString('ko-KR')}행 · 열수불일치 ${grand.badWidth} · 좌표결측 ${grand.noCoord}`);
  console.log(`\n[대분류] ${top(large)}`);
  console.log(`\n[중분류] ${top(middle, 80)}`);
  console.log(`\n[소분류 — 관심 키워드]`);
  for (const [k, v] of [...small.entries()].sort()) {
    if (/편의점|슈퍼|마트|약국|세탁|동물|미용|학원|교습|카페|커피|한식|중식|일식|양식|분식|치킨|피자|주점|음식|식당|제과|빵/.test(k)) console.log(`  ${k}=${v}`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
