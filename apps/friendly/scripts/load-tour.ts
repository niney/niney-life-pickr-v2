// 여행로그(AI 허브 71780 제주·도서, 71779 서부권, 71778 동부권) 적재 — tour-c export(manifest.json + <table>.jsonl.gz 10개)를
// Tour* 테이블의 해당 데이터셋 행과 갈아끼운다(다른 데이터셋은 그대로). 원본은 리포 밖 data/open/tour/<name>/ 에 두고
// (docs/data-sources.md), 이용조건·구조는 docs/PLAN-tour-log.md.
//
// 실행: pnpm --filter friendly load:tour [dir] [--dataset jeju|west|east] [--dry-run]
//   dir        기본 <리포>/data/open/tour/<exportName>(jeju: lp-2023, west: lp-west-2023, east: lp-east-2023) — manifest.json 이 있는 폴더
//   --dataset  어느 세트인지(기본 jeju). export 의 manifest 는 어느 권역이든 71780 이라 적혀 오므로 적재기가 여행 표의 제주
//              방문 비율로 맞는지 검사한다(틀리면 중단).
//   --dry-run  정규화 + 리포트만(DB 쓰기 없음)
// 다음 단계: match:restaurant-tour(2차) — 맛집 ↔ 여행로그 장소 매칭. 환수·폐기 시 unload:tour [--dataset].

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { TOUR_DATASETS, TOUR_DATASET_KEYS, isTourDatasetKey, tourSyncLayer } from '@repo/utils';
import {
  TOUR_TABLES,
  getTourLoadStatus,
  readTourManifest,
  replaceTourTables,
  resolveTourThumbsDir,
  type TourTable,
} from '../src/modules/tour/tour-master.service.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const datasetArg = args[args.indexOf('--dataset') + 1];
const dataset = args.includes('--dataset') ? datasetArg : 'jeju';
if (!isTourDatasetKey(dataset)) {
  console.error(`--dataset 은 ${TOUR_DATASET_KEYS.join('|')} 중 하나여야 합니다: ${String(dataset)}`);
  process.exit(1);
}
const DEFAULT_DIR = resolve(REPO_ROOT, `data/open/tour/${TOUR_DATASETS[dataset].exportName}`);
const dir = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--dataset') ?? DEFAULT_DIR);

const prisma = new PrismaClient();
const n = (x: number): string => x.toLocaleString('ko-KR');

const main = async (): Promise<void> => {
  if (!existsSync(resolve(dir, 'manifest.json'))) {
    console.error(`manifest.json 을 찾지 못했습니다: ${dir}\ntour-c 에서 \`npm run data:export\` 로 만든 폴더를 data/open/tour/ 아래에 두거나 경로를 주세요.`);
    process.exitCode = 1;
    return;
  }
  const manifest = readTourManifest(dir);
  console.log(`\n=== 여행로그 적재 [${dataset} · ${TOUR_DATASETS[dataset].label}] ${DRY_RUN ? '(--dry-run)' : ''} ===`);
  console.log(`export: ${dir} · v${manifest.exportVersion} · region=${manifest.region} · built ${manifest.built_at}`);
  console.log(`표: ${TOUR_TABLES.map((t) => `${t} ${n(manifest.tables[t]!.rows)}`).join(' · ')}`);
  const thumbs = resolveTourThumbsDir(dir, dataset);
  console.log(`썸네일: ${manifest.thumbs ? Object.entries(manifest.thumbs).map(([k, v]) => `${k} ${n(v)}`).join(' · ') : '없음'}${thumbs ? ` → ${thumbs}${existsSync(thumbs) ? '' : ' (폴더 없음)'}` : ''}`);

  const t0 = Date.now();
  let lastTable: TourTable | null = null;
  const { report, inserted } = await replaceTourTables(prisma, dir, manifest, {
    dataset,
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
  const mine = status.datasets.find((d) => d.key === dataset)!;
  console.log(`\nTour* [${dataset}] 교체 완료: ${TOUR_TABLES.map((t) => `${t} ${n(inserted[t])}`).join(' · ')}`);
  console.log(`LifeMasterSync layer=${tourSyncLayer(dataset)} · 장소 ${n(mine.places)} · 기준 ${mine.baseDate} · ${mine.sourceFile}`);
  console.log(`전체: ${status.datasets.map((d) => `${d.label} ${d.loaded ? n(d.places) + '곳' : '없음'}`).join(' · ')} → 장소 ${n(status.places)}`);
  console.log('다음: pnpm --filter friendly match:restaurant-tour · 상태: pnpm --filter friendly status:life-map');
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
