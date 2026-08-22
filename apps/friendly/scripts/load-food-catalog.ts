// 음식 카탈로그 CLI 적재 — 어드민 적재 잡과 같은 서비스(FoodImportService/upsertFoodSeeds)를 쓴다.
//
// 실행: pnpm --filter friendly load:food-catalog [--source=nutrition|recipe|mafra|menu-canonical|hansik800|all]
//                                                [--file=<csv 경로>] [--dry-run] [--classify] [--classify-limit=N]
//   - nutrition: --file 을 주면 **배포 파일(CSV/XLSX)** 을 읽고, 없으면 API(FOOD_API_KEY||BUS_API_KEY).
//               공공데이터포털에서 파일로 내려받았다면 파일 경로를 주는 쪽이 빠르고 쿼터도 안 쓴다.
//   - recipe/mafra: 외부 API(키: FOOD_RECIPE_API_KEY / MAFRA_API_KEY)
//   - menu-canonical: 로컬 global_menu_canonicals(식당 ≥2) 합류
//   - hansik800: 한식진흥원 800선 파일(--file 필수). XLSX 원본 그대로 또는 CSV 저장본 모두 가능.
//   - all: nutrition → recipe → mafra → menu-canonical (hansik800 은 --file 있을 때만)
//   - --dry-run: 정규화 리포트만(DB 쓰기 없음)
//   - --classify: 적재 후 미분류 행 LLM 2축 분류(chat 모델 필요). --classify-limit 로 상한.
// 원본 CSV 는 리포에 넣지 않는다(data/open/ 은 .gitignore).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { parseCsv } from '../src/lib/csv.js';
import { parseXlsx } from '../src/lib/xlsx.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import {
  MAFRA_INGREDIENT_GRID,
  MAFRA_RECIPE_GRID,
  fetchAllMafra,
  fetchAllMfdsNutrition,
  fetchAllMfdsRecipes,
} from '../src/modules/food/food-api.adapter.js';
import { FoodClassifyService } from '../src/modules/food/food-classify.service.js';
import {
  FoodImportService,
  normalizeHansik800Rows,
  normalizeMafraRows,
  normalizeMenuCanonicalRows,
  normalizeMfdsNutritionRows,
  normalizeMfdsRecipeRows,
  nutritionFileRowsToRecords,
  deactivateUnclassifiedNoise,
  upsertFoodSeeds,
  type FoodSeed,
  type NormalizeReport,
} from '../src/modules/food/food-import.service.js';
import { decodeLifeCsv } from '../src/modules/life-map/life-map-master.service.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const SOURCE = opt('source') ?? 'all';
const FILE = opt('file');
const DRY_RUN = flag('dry-run');
const CLASSIFY = flag('classify');
const CLASSIFY_LIMIT = opt('classify-limit') ? Number.parseInt(opt('classify-limit')!, 10) : undefined;

const prisma = new PrismaClient();

const printReport = (label: string, report: NormalizeReport): void => {
  console.log(`\n[${label}] 원본 ${report.fetched}행 → 시드 ${report.produced}건`);
  for (const [reason, n] of Object.entries(report.dropped)) console.log(`  drop ${reason}: ${n}`);
};

const progress = (label: string) => {
  let last = 0;
  return (processed: number, total: number): void => {
    if (processed - last >= 500 || processed === total) {
      console.log(`  [${label}] ${processed}/${total}`);
      last = processed;
    }
  };
};

const upsert = async (label: string, seeds: FoodSeed[]): Promise<void> => {
  if (DRY_RUN) {
    console.log(`  (--dry-run) 예시 시드:`, seeds.slice(0, 3));
    return;
  }
  const t0 = Date.now();
  const r = await upsertFoodSeeds(prisma, seeds, { onProgress: progress(label) });
  console.log(`  [${label}] 신규 ${r.inserted} / 갱신 ${r.updated} / 건너뜀 ${r.skipped} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

// CSV/XLSX 를 같은 { header, rows } 모양으로 읽는다. CSV 는 BOM·CP949 모두 처리(decodeLifeCsv).
const readTable = (path: string): { header: string[]; rows: string[][] } => {
  const buf = readFileSync(path);
  if (path.toLowerCase().endsWith('.xlsx')) return parseXlsx(buf);
  const table = parseCsv(decodeLifeCsv(buf));
  return { header: table.header, rows: table.rows };
};

// useFile=false 면 --file 을 무시하고 API 로만 받는다(--source=all 에서 --file 은 800선 몫).
const runNutrition = async (useFile = true): Promise<void> => {
  // 파일이 있으면 파일 우선 — 배포본(CSV/XLSX)이 API 와 같은 내용이고 쿼터를 안 쓴다.
  if (useFile && FILE) {
    const path = resolve(FILE);
    const { header, rows } = readTable(path);
    console.log(`\n[nutrition] 파일 ${header.length}열 × ${rows.length}행 (${path})`);
    const records = nutritionFileRowsToRecords(header, rows);
    const { seeds, report } = normalizeMfdsNutritionRows(records);
    printReport('nutrition', report);
    await upsert('nutrition', seeds);
    return;
  }
  const key = env.FOOD_API_KEY || env.BUS_API_KEY;
  if (!key) {
    console.log('\n[nutrition] 키 없음(FOOD_API_KEY/BUS_API_KEY) — 건너뜀');
    return;
  }
  console.log('\n[nutrition] 수집 중…');
  const res = await fetchAllMfdsNutrition({ serviceKey: key }, {}, {
    onPage: (i) => console.log(`  ${i.page}페이지 누적 ${i.fetched}/${i.totalCount ?? '?'}`),
  });
  const { seeds, report } = normalizeMfdsNutritionRows(res.items);
  printReport('nutrition', report);
  await upsert('nutrition', seeds);
};

const runRecipe = async (): Promise<void> => {
  const key = env.FOOD_RECIPE_API_KEY;
  if (!key) {
    console.log('\n[recipe] 키 없음(FOOD_RECIPE_API_KEY) — 건너뜀');
    return;
  }
  console.log('\n[recipe] 수집 중…');
  const res = await fetchAllMfdsRecipes({ serviceKey: key }, {
    onPage: (i) => console.log(`  ${i.page}페이지 누적 ${i.fetched}/${i.totalCount ?? '?'}`),
  });
  const { seeds, report } = normalizeMfdsRecipeRows(res.items);
  printReport('recipe', report);
  await upsert('recipe', seeds);
};

const runMafra = async (): Promise<void> => {
  const key = env.MAFRA_API_KEY;
  if (!key) {
    console.log('\n[mafra] 키 없음(MAFRA_API_KEY) — 건너뜀');
    return;
  }
  console.log('\n[mafra] 수집 중…');
  const recipes = await fetchAllMafra(MAFRA_RECIPE_GRID, { serviceKey: key });
  const ingredients = await fetchAllMafra(MAFRA_INGREDIENT_GRID, { serviceKey: key });
  const { seeds, report } = normalizeMafraRows(recipes.items, ingredients.items);
  printReport('mafra', report);
  await upsert('mafra', seeds);
};

const runMenuCanonical = async (): Promise<void> => {
  console.log('\n[menu-canonical] 로컬 global_menu_canonicals 조회…');
  const svc = new FoodImportService(prisma, { keys: { nutrition: '', recipe: '', mafra: '' } });
  const rows = await svc.loadMenuCanonicalRows();
  const { seeds, report } = normalizeMenuCanonicalRows(rows);
  printReport('menu-canonical', report);
  await upsert('menu-canonical', seeds);
};

const runHansik800 = async (): Promise<void> => {
  if (!FILE) {
    console.log('\n[hansik800] --file=<csv> 가 없어 건너뜀');
    return;
  }
  const path = resolve(FILE);
  const { header, rows } = readTable(path);
  console.log(`\n[hansik800] ${header.length}열 × ${rows.length}행 (${path})`);
  const { seeds, report } = normalizeHansik800Rows(header, rows);
  printReport('hansik800', report);
  await upsert('hansik800', seeds);
};

const runClassify = async (): Promise<void> => {
  if (DRY_RUN) return;
  console.log('\n[classify] LLM 2축 분류…');
  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  const classify = new FoodClassifyService(prisma, aiConfig);
  const r = await classify.classifyPending({
    limit: CLASSIFY_LIMIT,
    onProgress: (p, t) => console.log(`  [classify] ${p}/${t}`),
  });
  if (r.noProvider) console.log('  chat 모델 미설정 — 분류 생략');
  else console.log(`  분류 ${r.updated}/${r.total}행, 실패 청크 ${r.failedChunks}, 모델 ${r.model}`);
  // 분류가 끝난 뒤에도 조리형태를 못 붙인 외식 어휘는 음식이 아니다 — 비활성으로 내린다.
  const deactivated = await deactivateUnclassifiedNoise(prisma);
  if (deactivated > 0) console.log(`  음식이 아닌 외식 어휘 ${deactivated}건 비활성`);
};

const main = async (): Promise<void> => {
  console.log(`=== 음식 카탈로그 적재 (source=${SOURCE}${DRY_RUN ? ', --dry-run' : ''}) ===`);
  try {
    // --source=all 에서 --file 은 800선 파일로 해석한다(nutrition 은 API). 파일로 nutrition 을
    // 넣으려면 --source=nutrition --file=... 로 따로 돌린다.
    if (SOURCE === 'nutrition') await runNutrition();
    else if (SOURCE === 'all') await runNutrition(false);
    if (SOURCE === 'all' || SOURCE === 'recipe') await runRecipe();
    if (SOURCE === 'all' || SOURCE === 'mafra') await runMafra();
    if (SOURCE === 'all' || SOURCE === 'menu-canonical') await runMenuCanonical();
    if (SOURCE === 'hansik800' || (SOURCE === 'all' && FILE)) await runHansik800();
    if (CLASSIFY) await runClassify();
    const total = await prisma.foodItem.count();
    console.log(`\n카탈로그 총 ${total}행. 종료.`);
  } finally {
    await prisma.$disconnect();
  }
};

void main();
