// 음식 카탈로그 외부 소스 프로브 — 0차. 실응답 필드·건수·페이지 상한·대분류 분포를 확인하고
// 첫 페이지 일부를 __fixtures__ 후보로 찍는다(콘솔 출력만, 파일은 안 쓴다).
//
// 실행: pnpm --filter friendly probe:food-api [--source=nutrition|recipe|mafra|all] [--rows=5]
//   nutrition: FOOD_API_KEY || BUS_API_KEY   recipe: FOOD_RECIPE_API_KEY   mafra: MAFRA_API_KEY
//   --rows: 출력할 샘플 행 수(기본 3). 키가 없는 소스는 건너뛴다.

import { env } from '../src/config/env.js';
import {
  MAFRA_INGREDIENT_GRID,
  MAFRA_RECIPE_GRID,
  fetchMafraRange,
  fetchMfdsNutritionPage,
  fetchMfdsRecipeRange,
} from '../src/modules/food/food-api.adapter.js';
import {
  normalizeMafraRows,
  normalizeMfdsNutritionRows,
  normalizeMfdsRecipeRows,
} from '../src/modules/food/food-import.service.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const SOURCE = opt('source') ?? 'all';
const ROWS = Number.parseInt(opt('rows') ?? '3', 10);

const show = (label: string, rows: Record<string, unknown>[]): void => {
  console.log(`\n[${label}] 샘플 ${Math.min(ROWS, rows.length)}/${rows.length}행`);
  for (const r of rows.slice(0, ROWS)) console.log(JSON.stringify(r, null, 0).slice(0, 1200));
  if (rows[0]) console.log(`필드(${Object.keys(rows[0]).length}): ${Object.keys(rows[0]).join(', ')}`);
};

const probeNutrition = async (): Promise<void> => {
  const key = env.FOOD_API_KEY || env.BUS_API_KEY;
  if (!key) {
    console.log('\n[nutrition] 키 없음(FOOD_API_KEY/BUS_API_KEY) — 건너뜀');
    return;
  }
  const t0 = Date.now();
  const p1 = await fetchMfdsNutritionPage(1, { serviceKey: key }, {}, 1000);
  console.log(`\n[nutrition] 1페이지 ${p1.items.length}행 / totalCount=${p1.totalCount} (${Date.now() - t0}ms)\n${p1.requestUrl}`);
  show('nutrition', p1.items);
  // 대분류 분포(1페이지 기준) + 정규화 리포트.
  const byCat = new Map<string, number>();
  for (const r of p1.items) {
    const c = String(r['foodLv3Nm'] ?? '(없음)');
    byCat.set(c, (byCat.get(c) ?? 0) + 1);
  }
  console.log('[nutrition] 1페이지 식품대분류 분포:', [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30));
  const { seeds, report } = normalizeMfdsNutritionRows(p1.items);
  console.log('[nutrition] 정규화:', report, '\n예시 시드:', seeds.slice(0, ROWS));
  // 필터 파라미터 동작 확인(밥류만).
  const p2 = await fetchMfdsNutritionPage(1, { serviceKey: key }, { foodLv3Nm: '밥류' }, 50);
  console.log(`[nutrition] foodLv3Nm=밥류 필터: ${p2.items.length}행 / totalCount=${p2.totalCount}`);
};

const probeRecipe = async (): Promise<void> => {
  const key = env.FOOD_RECIPE_API_KEY;
  if (!key) {
    console.log('\n[recipe] 키 없음(FOOD_RECIPE_API_KEY) — 건너뜀');
    return;
  }
  const t0 = Date.now();
  const p = await fetchMfdsRecipeRange(1, 50, { serviceKey: key });
  console.log(`\n[recipe] 1~50 ${p.items.length}행 / total_count=${p.totalCount} (${Date.now() - t0}ms)\n${p.requestUrl}`);
  show('recipe', p.items);
  const { seeds, report } = normalizeMfdsRecipeRows(p.items);
  console.log('[recipe] 정규화:', report, '\n예시 시드:', seeds.slice(0, ROWS));
};

const probeMafra = async (): Promise<void> => {
  const key = env.MAFRA_API_KEY;
  if (!key) {
    console.log('\n[mafra] 키 없음(MAFRA_API_KEY) — 건너뜀');
    return;
  }
  const t0 = Date.now();
  const recipes = await fetchMafraRange(MAFRA_RECIPE_GRID, 1, 30, { serviceKey: key });
  const ingredients = await fetchMafraRange(MAFRA_INGREDIENT_GRID, 1, 200, { serviceKey: key });
  console.log(
    `\n[mafra] 기본 ${recipes.items.length}행 / totalCnt=${recipes.totalCount}, 재료 ${ingredients.items.length}행 / totalCnt=${ingredients.totalCount} (${Date.now() - t0}ms)\n${recipes.requestUrl}`,
  );
  show('mafra.recipe', recipes.items);
  show('mafra.ingredient', ingredients.items);
  const { seeds, report } = normalizeMafraRows(recipes.items, ingredients.items);
  console.log('[mafra] 정규화:', report, '\n예시 시드:', seeds.slice(0, ROWS));
};

const main = async (): Promise<void> => {
  console.log(`=== 음식 카탈로그 소스 프로브 (source=${SOURCE}) ===`);
  if (SOURCE === 'all' || SOURCE === 'nutrition') await probeNutrition().catch((e) => console.error('[nutrition] 실패:', e));
  if (SOURCE === 'all' || SOURCE === 'recipe') await probeRecipe().catch((e) => console.error('[recipe] 실패:', e));
  if (SOURCE === 'all' || SOURCE === 'mafra') await probeMafra().catch((e) => console.error('[mafra] 실패:', e));
};

void main();
