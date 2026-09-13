// 여행로그(AI 허브 71780) 적재 — tour-c export(manifest.json + <table>.jsonl.gz 10개)를 Tour* 테이블에 전량 교체한다.
// 원본은 리포 밖 data/open/tour/<name>/ 에 두고(docs/data-sources.md), 이용조건·구조는 docs/PLAN-tour-log.md.
//
// 실행: pnpm --filter friendly load:tour [dir] [--dry-run]
//   dir        기본 <리포>/data/open/tour/lp-2023 (manifest.json 이 있는 폴더)
//   --dry-run  정규화 + 리포트만(DB 쓰기 없음)
// 다음 단계: match:restaurant-tour(2차) — 맛집 ↔ 여행로그 장소 매칭. 환수·폐기 시 unload:tour.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  TOUR_TABLES,
  getTourLoadStatus,
  readTourManifest,
  replaceTourTables,
  resolveTourThumbsDir,
  type TourTable,
} from '../src/modules/tour/tour-master.service.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const DEFAULT_DIR = resolve(REPO_ROOT, 'data/open/tour/lp-2023');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? DEFAULT_DIR);

const prisma = new PrismaClient();
const n = (x: number): string => x.toLocaleString('ko-KR');

const main = async (): Promise<void> => {
  if (!existsSync(resolve(dir, 'manifest.json'))) {
    console.error(`manifest.json 을 찾지 못했습니다: ${dir}\ntour-c 에서 \`npm run data:export\` 로 만든 폴더를 data/open/tour/ 아래에 두거나 경로를 주세요.`);
    process.exitCode = 1;
    return;
  }
  const manifest = readTourManifest(dir);
  console.log(`\n=== 여행로그 적재 ${DRY_RUN ? '(--dry-run)' : ''} ===`);
  console.log(`export: ${dir} · v${manifest.exportVersion} · region=${manifest.region} · built ${manifest.built_at}`);
  console.log(`표: ${TOUR_TABLES.map((t) => `${t} ${n(manifest.tables[t]!.rows)}`).join(' · ')}`);
  const thumbs = resolveTourThumbsDir(dir);
  console.log(`썸네일: ${manifest.thumbs ? Object.entries(manifest.thumbs).map(([k, v]) => `${k} ${n(v)}`).join(' · ') : '없음'}${thumbs ? ` → ${thumbs}${existsSync(thumbs) ? '' : ' (폴더 없음)'}` : ''}`);

  const t0 = Date.now();
  let lastTable: TourTable | null = null;
  const { report, inserted } = await replaceTourTables(prisma, dir, manifest, {
    dryRun: DRY_RUN,
    onProgress: (table, count) => {
      if (table !== lastTable) {
        lastTable = table;
        process.stdout.write(`  ${table} …`);
      }
      if (count % 10000 < 1000) process.stdout.write(` ${n(count)}`);
    },
  });
  process.stdout.write('\n');

  console.log(`\n[정규화] ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const t of TOUR_TABLES) {
    const r = report[t];
    const drops = Object.entries(r.dropped).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
    const extra = [r.badCoord ? `좌표 이상→null ${r.badCoord}` : null, r.unknownType ? `미지 유형 ${r.unknownType}` : null].filter(Boolean);
    console.log(`  ${t.padEnd(14)} 읽음 ${n(r.rows).padStart(7)} → 채택 ${n(r.kept).padStart(7)}${drops.length ? ` · 제외 ${drops.join(', ')}` : ''}${extra.length ? ` · ${extra.join(' · ')}` : ''}`);
    if (r.rows !== manifest.tables[t]!.rows) console.log(`    ⚠ manifest 행 수(${n(manifest.tables[t]!.rows)})와 다릅니다`);
  }
  const leaks = report.visits.dropped.privateLeak;
  if (leaks > 0) console.log(`\n⚠ 비공개 방문 마스킹 위반 ${leaks}건을 버렸습니다 — tour-c prepare.py 를 확인하세요.`);

  if (DRY_RUN) {
    console.log('\n--dry-run — 적재 생략. 종료.');
    return;
  }
  const status = await getTourLoadStatus(prisma);
  console.log(`\nTour* 전량 교체 완료: ${TOUR_TABLES.map((t) => `${t} ${n(inserted[t])}`).join(' · ')}`);
  console.log(`LifeMasterSync layer=tour · 장소 ${n(status.places)} · 기준 ${status.baseDate} · ${status.sourceFile}`);
  console.log('다음: pnpm --filter friendly match:restaurant-tour (2차 구현 후) · 상태: pnpm --filter friendly status:life-map');
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
