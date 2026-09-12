// 일상지도 생활 업종 상가 적재 — 소상공인시장진흥공단 상가(상권)정보 분기 zip(data.go.kr 15083033,
// 시도별 CSV 16개 ~1.5GB)을 풀지 않고 항목별 deflate 스트림으로 읽어 관심 업종(9종)만 LifeStore 에 전량
// 교체한다. 관심 밖 업종(부동산·제조·의료 등)은 버린다(~절반).
//
// 실행: pnpm --filter friendly load:life-stores [zip] [--dry-run] [--entry=세종]
//   zip        기본 <리포>/data/open/store/store-*.zip 중 이름 날짜(YYYYMM)가 가장 늦은 것.
//   --dry-run  파싱 + 정규화 리포트만(DB 쓰기 없음).
//   --entry    이름에 이 문자열이 든 항목만(예: 세종 — 빠른 확인용). 실적재에 쓰면 그 시도만 남으니 주의.
// 원본 zip 은 리포에 넣지 않는다(data/open/ 은 .gitignore) — docs/data-sources.md. 분기 갱신은 새 zip 을
// 받아 다시 실행 → 이어서 match:restaurant-stores 로 맛집 매칭을 갱신한다.

import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInflateRaw } from 'node:zlib';
import { PrismaClient } from '@prisma/client';
import { LIFE_STORE_KINDS, LIFE_STORE_KIND_LABEL } from '@repo/utils';
import { iterateCsvRows } from '../src/lib/csv.js';
import { iterateLines, listZipEntries, zipEntryDataOffset, type ZipEntry } from '../src/modules/housing/housing-price-master.service.js';
import {
  emptyLifeStoreReport,
  lifeStoreColumnIndex,
  normalizeLifeStoreRow,
  replaceLifeStores,
  type LifeStoreColumnIndex,
  type LifeStoreRow,
} from '../src/modules/life-map/life-store-master.service.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const STORE_DIR = resolve(REPO_ROOT, 'data/open/store');
const ZIP_RE = /^store-(\d{4})(\d{2})\.zip$/;
const CHUNK_ROWS = 5000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ENTRY = opt('entry');

const findLatestZip = (): string | null => {
  if (!existsSync(STORE_DIR)) return null;
  const found = readdirSync(STORE_DIR)
    .map((f) => ({ f, m: ZIP_RE.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => `${b.m[1]}${b.m[2]}`.localeCompare(`${a.m[1]}${a.m[2]}`));
  return found[0] ? resolve(STORE_DIR, found[0].f) : null;
};

// 'store-YYYYMM.zip' → 그 달 말일 'YYYY-MM-DD'(분기 기준일).
const baseDateOf = (file: string): string | null => {
  const m = ZIP_RE.exec(basename(file));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
};

const openEntry = async (zipPath: string, entry: ZipEntry) => {
  if (entry.method !== 8 && entry.method !== 0) throw new Error(`지원하지 않는 zip 압축 방식(${entry.method}): ${entry.name}`);
  const start = await zipEntryDataOffset(zipPath, entry);
  const raw = createReadStream(zipPath, { start, end: start + entry.compressedSize - 1 });
  return entry.method === 8 ? raw.pipe(createInflateRaw()) : raw;
};

// 줄 → 셀. 상가 CSV 는 따옴표 안 줄바꿈이 없어 줄 단위 파싱으로 충분(프로브로 열 수 불일치 0 확인).
const parseLine = (line: string): string[] => {
  const it = iterateCsvRows(line.endsWith('\r') ? line.slice(0, -1) : line);
  const first = it.next();
  return first.done ? [] : first.value;
};

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const zipPath = resolve(args.find((a) => !a.startsWith('--')) ?? findLatestZip() ?? '');
  if (!zipPath || !existsSync(zipPath)) {
    console.error('상가정보 zip 을 찾지 못했습니다. data/open/store/store-YYYYMM.zip 으로 두거나 경로를 주세요.');
    process.exitCode = 1;
    return;
  }
  const baseDate = baseDateOf(zipPath);
  console.log(`\n=== 일상지도 생활 업종 상가 적재 ${DRY_RUN ? '(--dry-run)' : ''} ===\n파일: ${zipPath} (기준일 ${baseDate ?? '-'})`);

  const entries = (await listZipEntries(zipPath)).filter((e) => /\.csv$/i.test(e.name) && (!ENTRY || e.name.includes(ENTRY)));
  if (entries.length === 0) throw new Error(`zip 안에 CSV 항목이 없습니다${ENTRY ? `(--entry=${ENTRY})` : ''}`);
  console.log(`항목 ${entries.length}개, 압축 해제 ${(entries.reduce((a, e) => a + e.uncompressedSize, 0) / 1048576).toFixed(0)}MB`);

  const report = emptyLifeStoreReport();
  const seen = new Set<string>();
  let header: string[] | null = null;
  let col: LifeStoreColumnIndex | null = null;
  const started = Date.now();

  // 항목 순서대로 행을 정규화해 CHUNK_ROWS 씩 내보내는 스트림 — 교체 트랜잭션이 이걸 그대로 소비한다.
  async function* chunks(): AsyncGenerator<LifeStoreRow[]> {
    let buf: LifeStoreRow[] = [];
    for (const entry of entries) {
      const t0 = Date.now();
      const before = report.kept;
      let first = true;
      for await (const line of iterateLines(await openEntry(zipPath, entry))) {
        if (line.length === 0) continue;
        const cells = parseLine(line);
        if (first) {
          first = false;
          if (!header) {
            header = cells.map((c) => c.trim());
            col = lifeStoreColumnIndex(header);
          } else if (cells.map((c) => c.trim()).join('|') !== header.join('|')) {
            throw new Error(`헤더가 첫 항목과 다릅니다: ${entry.name}`);
          }
          continue;
        }
        const row = normalizeLifeStoreRow(cells, col!, header!.length, seen, report);
        if (!row) continue;
        buf.push(row);
        if (buf.length >= CHUNK_ROWS) {
          yield buf;
          buf = [];
        }
      }
      console.log(`  ${entry.name}: 채택 ${(report.kept - before).toLocaleString('ko-KR')}행 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
    if (buf.length > 0) yield buf;
  }

  let count = 0;
  if (DRY_RUN) {
    for await (const c of chunks()) count += c.length;
  } else {
    count = await replaceLifeStores(prisma, chunks(), { sourceFile: basename(zipPath), baseDate });
  }

  console.log(`\n[정규화] 읽음 ${report.rows.toLocaleString('ko-KR')}행 → 채택 ${report.kept.toLocaleString('ko-KR')}행 (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  console.log(
    `[제외] 관심 밖 업종 ${report.dropped.notInterested.toLocaleString('ko-KR')} · 열 수 불일치 ${report.dropped.width} · 식별자/시군구 누락 ${report.dropped.badId} · 좌표 이상 ${report.dropped.badCoord} · 중복 ${report.dropped.duplicate}`,
  );
  console.log(`[업종별] ${LIFE_STORE_KINDS.map((k) => `${LIFE_STORE_KIND_LABEL[k]} ${report.byKind[k].toLocaleString('ko-KR')}`).join(' · ')}`);
  if (DRY_RUN) {
    console.log('\n--dry-run — 적재 생략. 종료.');
    return;
  }
  console.log(`\nLifeStore 전량 교체: ${count.toLocaleString('ko-KR')}행 + 적재 이력(LifeMasterSync layer=store) 기록`);
  console.log('다음: pnpm --filter friendly match:restaurant-stores (맛집 ↔ 상가업소 매칭 갱신)');
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
