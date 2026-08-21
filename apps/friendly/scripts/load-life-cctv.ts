// 일상지도 — 전국 CCTV 설치 현황 CSV(지방행정인허가데이터개방 localdata.go.kr, CP949) 적재.
// 정규화 리포트를 찍고 LifeCctv 를 전량 교체한다(실측 377,278행 → 좌표 이상 35행 제외).
//
// 실행: pnpm --filter friendly load:life-cctv <csv 경로> [--dry-run]
//   --dry-run: 파싱 + 정규화 리포트만(DB 쓰기 없음).
// 원본 CSV 는 리포에 넣지 않는다(data/open/ 은 .gitignore). 갱신은 재다운로드 후 재실행.

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseCsv } from '../src/lib/csv.js';
import {
  decodeLifeCsv,
  normalizeLifeCctvRows,
  replaceLifeCctv,
} from '../src/modules/life-map/life-map-master.service.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  if (!file) {
    console.error('사용법: pnpm --filter friendly load:life-cctv <csv 경로> [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const path = resolve(file);
  console.log(`\n=== 일상지도 CCTV 적재 ${DRY_RUN ? '(--dry-run)' : ''} ===\n파일: ${path}`);

  const started = Date.now();
  const text = decodeLifeCsv(readFileSync(path));
  const table = parseCsv(text);
  console.log(`CSV: ${table.header.length}열 × ${table.rows.length}행 (${((Date.now() - started) / 1000).toFixed(1)}s)`);

  const report = normalizeLifeCctvRows(table.header, table.rows);
  console.log('\n[설치목적별 채택]');
  for (const [purpose, n] of [...report.byPurpose.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${purpose}: ${n}행`);
  }
  console.log(`  합계: ${report.rows.length}행 (데이터기준일자 최대 ${report.maxBaseDate ?? '-'})`);
  if (report.droppedWidth > 0) console.log(`\n[열 수 불일치 drop] ${report.droppedWidth}행`);
  if (report.droppedBadId > 0) console.log(`\n[관리번호/자치단체코드 누락 drop] ${report.droppedBadId}행`);
  if (report.droppedBadCoord.length > 0) {
    console.log(`\n[좌표 이상(한국 밖·결측) drop] ${report.droppedBadCoord.length}행`);
    for (const d of report.droppedBadCoord.slice(0, 10)) console.log(`  ${d.id}: lat=${d.lat} lng=${d.lng}`);
  }
  if (report.duplicates > 0) console.log(`\n[관리번호 중복 접힘] ${report.duplicates}행`);

  if (DRY_RUN) {
    console.log('\n--dry-run — 적재 생략. 종료.');
    return;
  }

  const t0 = Date.now();
  const count = await replaceLifeCctv(prisma, report.rows, { sourceFile: basename(path), baseDate: report.maxBaseDate });
  console.log(`\nLifeCctv 전량 교체: ${count}행 + 적재 이력(LifeMasterSync) 기록 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
