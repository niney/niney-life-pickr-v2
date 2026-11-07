// 음식 카탈로그 CLI 적재 — 어드민 적재 잡과 같은 서비스(FoodImportService/upsertFoodSeeds)를 쓴다.
//
// 실행: pnpm --filter friendly load:food-catalog [--source=nutrition|raw|curated|recipe|mafra|menu-canonical|hansik800|all]
//                                                [--file=<csv 경로>] [--dry-run] [--classify] [--classify-limit=N]
//   - nutrition: --file 을 주면 **배포 파일(CSV/XLSX)** 을 읽고, 없으면 API(DATA_GO_KR_API_KEY).
//               공공데이터포털에서 파일로 내려받았다면 파일 경로를 주는 쪽이 빠르고 쿼터도 안 쓴다.
//               --file 이 없으면 data/open/food/ 의 K-FIND 음식 DB 엑셀(`YYYYMMDD_음식DB_*.xlsx`, 가장 최근 날짜)
//               → 표준데이터 CSV 순으로 찾는다. K-FIND 엑셀에만 마그네슘·아연·엽산이 있다(docs/data-sources.md).
//   - raw 는 data/open/food/ 에 국가표준식품성분 DB 엑셀(`식품성분표(N개정판).xlsx`)이 있으면 식품명으로 짝지어
//     마그네슘·아연·엽산을 보탠다.
//   - recipe/mafra: 외부 API(키: FOOD_RECIPE_API_KEY / MAFRA_API_KEY)
//   - menu-canonical: 로컬 global_menu_canonicals(식당 ≥2) 합류
//   - hansik800: 한식진흥원 800선 파일(--file 필수). XLSX 원본 그대로 또는 CSV 저장본 모두 가능.
//   - raw: 원재료성식품 표준데이터(15100065) 파일 — 생고기 부위·수산물·채소 100g당(메뉴 칼로리 '100g당' 등급).
//     `fetch:mfds-nutrition --pk=15100065` 로 받는다. 파일 없으면 건너뜀.
//   - curated: 코드 내장 표(food-curated-seeds.ts — 주류·음료·공기밥). 파일·키 불필요.
//   - all: nutrition → raw → curated → recipe → mafra → menu-canonical → hansik800
//   - --file 을 안 주면 배포 파일은 표준 위치(data/open/food/)에서 찾는다 → 인자 없이 `load:food-catalog`
//     만 돌려도 로컬 파일 기반 전체 재적재가 된다(공공 API 쿼터 소모 없음). 파일 출처는 docs/data-sources.md.
//   - --dry-run: 정규화 리포트만(DB 쓰기 없음)
//   - --classify: 적재 후 미분류 행 LLM 2축 분류(chat 모델 필요). --classify-limit 로 상한.
//   - --refresh-nutrition: 이미 값이 있는 행의 영양도 시드 값으로 덮어쓴다(정규화 규칙 수정 후 재적재).
//     기본은 빈 필드만 채우고, 100g당 비타민·무기질(nutrientsPer100gJson)은 **빈 키만** 더한다 — 새 영양소 열이
//     생긴 뒤 이 옵션 없이 재적재하면 기존 행에 그 키만 붙는다.
//   - --refresh-nutrients: 100g당 비타민·무기질만 시드 값으로 덮어쓴다(1인분 열량·탄단지는 그대로). 대표값 규칙을
//     바꾼 뒤의 재적재용 — --backfill-nutrition 과 함께 주면 빌려 온 행도 빌려준 행 값으로 다시 쓴다.
//   - --backfill-nutrition: 영양이 빈 행에 같은 계열 행의 1인분 영양을 빌려온다(소불고기 → 불고기).
//     --dry-run 과 함께 쓰면 무엇을 어디서 빌릴지만 찍는다.
// 원본 CSV 는 리포에 넣지 않는다(data/open/ 은 .gitignore).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { parseCsv } from '../src/lib/csv.js';
import { listXlsxSheets, parseXlsx } from '../src/lib/xlsx.js';
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
import { curatedSeeds } from '../src/modules/food/food-curated-seeds.js';
import { normalizeMfdsRawRows, rawFileRowsToRecords } from '../src/modules/food/food-raw-import.js';
import { looseNutrientHeader, type NutrientsPer100g } from '../src/modules/food/food-nutrients.js';
import { pickRdaSheet, rdaCompositionFromTable, rdaLookup } from '../src/modules/food/food-rda-import.js';
import {
  backfillBorrowedNutrients,
  backfillNutrition,
} from '../src/modules/food/food-nutrition.service.js';
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

// 배포 파일 표준 위치(리포에 안 들어간다 — .gitignore). 받는 곳·갱신 방법은 docs/data-sources.md.
const DEFAULT_FILES = {
  nutrition: 'data/open/food/mfds-nutrition.csv',
  raw: 'data/open/food/mfds-nutrition-15100065.csv',
  hansik800: 'data/open/food/hansik-800.xlsx',
} as const;

// data/ 는 리포 루트에 있고 스크립트는 apps/friendly 에서 도니 루트 기준으로도 찾는다.
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const findDataFile = (rel: string): string | null => {
  for (const base of [process.cwd(), REPO_ROOT]) {
    const p = resolve(base, rel);
    if (existsSync(p)) return p;
  }
  return null;
};

// data/open/food/ 에서 이름 규칙에 맞는 파일 중 rank 가 가장 큰 것(같은 데이터의 새 판을 이름 그대로 두면 그걸 쓴다).
const findLatestDataFile = (pattern: RegExp, rank: (m: RegExpExecArray) => number): string | null => {
  let best: { path: string; rank: number } | null = null;
  for (const base of [process.cwd(), REPO_ROOT]) {
    const dir = resolve(base, 'data/open/food');
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const m = pattern.exec(name);
      if (!m) continue;
      const r = rank(m);
      if (!best || r > best.rank) best = { path: resolve(dir, name), rank: r };
    }
    if (best) return best.path;
  }
  return null;
};

// K-FIND 식품영양성분 DB 전체판 '음식 DB' 엑셀(예: 20260828_음식DB_19617건.xlsx) — 표준데이터 CSV 의 열·값을 모두
// 갖고 마그네슘·아연·엽산 열이 더 있어(2026-11-07 대조: 같은 식품코드 19,495행 값 일치) 있으면 이쪽을 먼저 쓴다.
const KFIND_FOOD_DB_RE = /^(\d{8})_음식DB_.*\.xlsx$/;
// 국가표준식품성분 DB 엑셀(예: 식품성분표(10개정판).xlsx) — 원재료 행의 마그네슘·아연·엽산 보강용.
const RDA_COMPOSITION_RE = /^식품성분표\((\d+)개정판\)\.xlsx$/;

// --file 은 --source 가 가리키는 한 파일만 덮어쓴다(--source=all 에서는 기존 규약대로 800선 몫).
// --file 이 없으면 표준 위치에 파일이 있을 때만 그 경로를 돌려준다(음식은 K-FIND 엑셀 → 표준데이터 CSV 순).
const fileFor = (kind: keyof typeof DEFAULT_FILES): string | null => {
  if (FILE) return SOURCE === kind || (SOURCE === 'all' && kind === 'hansik800') ? FILE : null;
  if (kind === 'nutrition') {
    const kfind = findLatestDataFile(KFIND_FOOD_DB_RE, (m) => Number(m[1]));
    if (kfind) return kfind;
  }
  return findDataFile(DEFAULT_FILES[kind]);
};
const DRY_RUN = flag('dry-run');
const CLASSIFY = flag('classify');
const BACKFILL_NUTRITION = flag('backfill-nutrition');
// 정규화 규칙을 고친 뒤 기존 행의 영양을 바로잡는다(기본은 빈 필드만 채운다).
const REFRESH_NUTRITION = flag('refresh-nutrition');
// 비타민·무기질(100g당)만 다시 쓴다 — 대표값 규칙을 바꾼 뒤(2026-11-07 중앙값) 운영 재적재용. 1인분 열량은 그대로.
const REFRESH_NUTRIENTS = flag('refresh-nutrients');
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
  const r = await upsertFoodSeeds(prisma, seeds, {
    onProgress: progress(label),
    refreshNutrition: REFRESH_NUTRITION,
    refreshNutrients: REFRESH_NUTRIENTS,
  });
  console.log(`  [${label}] 신규 ${r.inserted} / 갱신 ${r.updated} / 건너뜀 ${r.skipped} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

// CSV/XLSX 를 같은 { header, rows } 모양으로 읽는다. CSV 는 BOM·CP949 모두 처리(decodeLifeCsv).
const readTable = (path: string): { header: string[]; rows: string[][] } => {
  const buf = readFileSync(path);
  if (path.toLowerCase().endsWith('.xlsx')) return parseXlsx(buf);
  const table = parseCsv(decodeLifeCsv(buf));
  return { header: table.header, rows: table.rows };
};

const runNutrition = async (): Promise<void> => {
  // 파일이 있으면 파일 우선 — 배포본(CSV/XLSX)이 API 와 같은 내용이고 쿼터를 안 쓴다.
  const file = fileFor('nutrition');
  if (file) {
    const path = resolve(file);
    const { header, rows } = readTable(path);
    console.log(`\n[nutrition] 파일 ${header.length}열 × ${rows.length}행 (${path})`);
    const records = nutritionFileRowsToRecords(header, rows);
    const { seeds, report } = normalizeMfdsNutritionRows(records);
    printReport('nutrition', report);
    await upsert('nutrition', seeds);
    return;
  }
  const key = env.DATA_GO_KR_API_KEY;
  if (!key) {
    console.log('\n[nutrition] 키 없음(DATA_GO_KR_API_KEY) — 건너뜀');
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

const runRaw = async (): Promise<void> => {
  const file = fileFor('raw');
  if (!file) {
    console.log(`\n[raw] 파일이 없어 건너뜀(fetch:mfds-nutrition --pk=15100065 → ${DEFAULT_FILES.raw})`);
    return;
  }
  const path = resolve(file);
  const { header, rows } = readTable(path);
  console.log(`\n[raw] 파일 ${header.length}열 × ${rows.length}행 (${path})`);
  // 국가표준식품성분 DB 엑셀이 있으면 식품명으로 짝지어 마그네슘·아연·엽산을 보탠다(없으면 24성분만).
  let extra: ((foodNm: string) => NutrientsPer100g | undefined) | undefined;
  const rdaPath = findLatestDataFile(RDA_COMPOSITION_RE, (m) => Number(m[1]));
  if (rdaPath) {
    const buf = readFileSync(rdaPath);
    const sheet = pickRdaSheet(listXlsxSheets(buf));
    if (sheet) {
      const composition = rdaCompositionFromTable(parseXlsx(buf, sheet));
      const lookup = rdaLookup(composition);
      extra = lookup;
      const nameCol = header.findIndex((h) => looseNutrientHeader(h).trim() === '식품명');
      const matched = nameCol < 0 ? 0 : rows.filter((r) => lookup(r[nameCol] ?? '')).length;
      console.log(`  [raw] 국가표준식품성분표 '${sheet}' ${composition.size}종 — 원재료 ${matched}/${rows.length}행에 마그네슘·아연·엽산 보탬`);
    } else {
      console.log(`  [raw] 국가표준식품성분표에서 DB 시트를 못 찾음 — 보강 없이 진행 (${rdaPath})`);
    }
  }
  const { seeds, report } = normalizeMfdsRawRows(rawFileRowsToRecords(header, rows, extra));
  printReport('raw', report);
  await upsert('raw', seeds);
};

const runCurated = async (): Promise<void> => {
  const seeds = curatedSeeds();
  console.log(`\n[curated] 내장 표 ${seeds.length}건`);
  await upsert('curated', seeds);
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
  const file = fileFor('hansik800');
  if (!file) {
    console.log(`\n[hansik800] 파일이 없어 건너뜀(--file=<경로> 또는 ${DEFAULT_FILES.hansik800})`);
    return;
  }
  const path = resolve(file);
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

const runBackfillNutrition = async (): Promise<void> => {
  console.log(`\n[nutrition-backfill] 영양이 빈 행 보강${DRY_RUN ? ' (--dry-run)' : ''}…`);
  const r = await backfillNutrition(prisma, { dryRun: DRY_RUN });
  console.log(`  대상 ${r.targets}행 → 보강 ${r.filled}, 건너뜀 ${r.skipped}`);
  for (const s of r.samples) {
    console.log(`    ${s.name} ← ${s.from} (${Math.round(s.kcal)}kcal, 같은 계열 ${s.donorCount}개)`);
  }
  // 이미 빌려 온 행에 비타민·무기질만 채운다(영양소 점검 도입 전 보강분).
  const b = await backfillBorrowedNutrients(prisma, { dryRun: DRY_RUN, refresh: REFRESH_NUTRITION || REFRESH_NUTRIENTS });
  console.log(`  비타민·무기질(빌려 온 행) 대상 ${b.targets}행 → 채움 ${b.filled}, 건너뜀 ${b.skipped}`);
};

const main = async (): Promise<void> => {
  console.log(`=== 음식 카탈로그 적재 (source=${SOURCE}${DRY_RUN ? ', --dry-run' : ''}) ===`);
  try {
    // --source=all 에서 --file 은 800선 파일로 해석한다(그때 nutrition 은 표준 위치 파일 → 없으면 API).
    if (SOURCE === 'nutrition' || SOURCE === 'all') await runNutrition();
    if (SOURCE === 'raw' || SOURCE === 'all') await runRaw();
    if (SOURCE === 'curated' || SOURCE === 'all') await runCurated();
    if (SOURCE === 'all' || SOURCE === 'recipe') await runRecipe();
    if (SOURCE === 'all' || SOURCE === 'mafra') await runMafra();
    if (SOURCE === 'all' || SOURCE === 'menu-canonical') await runMenuCanonical();
    if (SOURCE === 'hansik800' || SOURCE === 'all') await runHansik800();
    if (CLASSIFY) await runClassify();
    if (BACKFILL_NUTRITION) await runBackfillNutrition();
    const total = await prisma.foodItem.count();
    console.log(`\n카탈로그 총 ${total}행. 종료.`);
  } finally {
    await prisma.$disconnect();
  }
};

void main();
