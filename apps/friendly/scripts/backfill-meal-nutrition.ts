// 이미 저장된 식단 항목에 영양 스냅샷을 채운다. 항목 저장 시점에는 서버가 자동으로 붙이지만,
// (1) 영양 컬럼이 생기기 전에 저장된 기록과 (2) 카탈로그 영양이 나중에 보강된 음식은 비어 있다.
// 카탈로그 적재(load:food-catalog --backfill-nutrition) 뒤에 한 번 돌리면 된다.
//
// 실행: pnpm --filter friendly backfill:meal-nutrition [--dry-run] [--refresh] [--estimate]
//   --refresh: 이미 값이 있는 항목도 카탈로그·어휘 현재 값으로 다시 계산한다(카탈로그 영양을 고쳤거나,
//              1인분 중량 규칙·어드민 "1인분 기준 중량" 어휘를 바꾼 뒤).
//   --estimate: 카탈로그로도 못 채운 이름을 식단 저장과 같은 이름 추정(규칙 → LLM 매칭 → 웹 실측)으로 채운다.
//               아직 안 물어본 이름은 LLM·웹에 묻는다(--dry-run 이면 묻지 않고 캐시로 채울 수 있는 것만 보인다).
//
// 계산은 저장 경로(MealService)와 같은 mealServingNutrition 을 쓴다 — 주식의 카탈로그 1인분이 기준량(100g)
// 이하이면 종류별 통상 1인분으로 환산하고, 양은 사용자가 적은 인분 수 → 서수(조금·보통·많이) 순으로 곱한다.

import { PrismaClient } from '@prisma/client';
import { mealPortionFactor } from '@repo/utils';
import { env } from '../src/config/env.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { FoodService } from '../src/modules/food/food.service.js';
import { mealServingNutrition } from '../src/modules/food/food-serving.js';
import { FoodWebEstimateService } from '../src/modules/food/food-web-estimate.service.js';
import { MenuLlmMatchService } from '../src/modules/food/menu-llm-match.service.js';
import { MenuNutritionResolver } from '../src/modules/food/menu-nutrition.js';
import { MealNutritionEstimator } from '../src/modules/meal/meal-nutrition-estimate.js';

const DRY_RUN = process.argv.includes('--dry-run');
// 스냅샷은 원래 안 바꾸는 게 원칙이다(과거 기록이 흔들리면 안 된다). --refresh 는 카탈로그 쪽
// 값이나 1인분 규칙이 틀렸던 걸 바로잡은 뒤에만 쓰는 명시적 재계산이다.
const REFRESH = process.argv.includes('--refresh');
const ESTIMATE = process.argv.includes('--estimate');
const prisma = new PrismaClient();

const round = (v: number | null, digits: number): number | null =>
  v === null ? null : Number(v.toFixed(digits));

const main = async (): Promise<void> => {
  console.log(`=== 식단 항목 영양 보강 ${DRY_RUN ? '(--dry-run)' : ''}${REFRESH ? ' (--refresh)' : ''} ===`);
  const food = new FoodService(prisma);
  const lexicon = await food.servingLexicon();
  const items = await prisma.mealItem.findMany({
    where: REFRESH ? {} : { kcal: null },
    select: {
      id: true,
      name: true,
      foodId: true,
      portion: true,
      servings: true,
      isMain: true,
      kcal: true,
      proteinG: true,
      sodiumMg: true,
      nutritionFrom: true,
      nutritionBasis: true,
    },
  });
  console.log(`${REFRESH ? '재계산 대상' : '영양이 빈 항목'} ${items.length}건`);

  let changed = 0;
  // 카탈로그로 채운 항목 — --dry-run 이면 실제로 쓰지 않아 아래 이름 추정이 이들을 빈 항목으로 다시 세지 않게 뺀다.
  const filledByCatalog = new Set<string>();
  for (const item of items) {
    // 저장 당시 매칭된 행을 우선 보고, 없으면(삭제·비활성) 이름으로 다시 찾는다.
    const row = (item.foodId ? await food.getServingRow(item.foodId) : null) ?? (await food.matchFood(item.name));
    const n = mealServingNutrition(row, { isMain: item.isMain }, lexicon);
    // 카탈로그에도 근거가 없으면 기존 스냅샷을 지우지 않는다(카탈로그 행이 사라진 경우 등).
    if (n.basis === 'missing') continue;

    const f = item.servings ?? mealPortionFactor(item.portion);
    const next = {
      kcal: round(n.kcal === null ? null : n.kcal * f, 0),
      proteinG: round(n.proteinG === null ? null : n.proteinG * f, 1),
      sodiumMg: round(n.sodiumMg === null ? null : n.sodiumMg * f, 0),
      nutritionFrom: n.nutritionFrom,
      nutritionBasis: n.basis,
    };
    const same =
      next.kcal === item.kcal &&
      next.proteinG === item.proteinG &&
      next.sodiumMg === item.sodiumMg &&
      next.nutritionFrom === item.nutritionFrom &&
      next.nutritionBasis === item.nutritionBasis;
    if (same) continue;

    if (!DRY_RUN) await prisma.mealItem.update({ where: { id: item.id }, data: next });
    changed += 1;
    filledByCatalog.add(item.id);
    const before = item.kcal === null ? '' : `${Math.round(item.kcal)} → `;
    const note = next.nutritionFrom ? `, ${next.nutritionFrom} 기준 추정` : '';
    console.log(`  ${item.name}${item.isMain ? '' : '(반찬)'} ← ${row?.name ?? '?'} (${before}${next.kcal ?? '?'}kcal${note})`);
  }
  console.log(`\n${DRY_RUN ? '바뀔' : '바꾼'} 항목 ${changed} / ${items.length}건. 나머지는 그대로이거나 카탈로그에 영양이 없다.`);
  if (ESTIMATE) await estimateMissing(food, filledByCatalog);
  await prisma.$disconnect();
};

// 카탈로그로도 빈 이름 — 식단 저장과 같은 이름 추정. 묻는 건 이름당 LLM 한 번·웹 한 번(캐시는 맛집 메뉴와 같이 쓴다).
const estimateMissing = async (food: FoodService, filledByCatalog: ReadonlySet<string>): Promise<void> => {
  const missing = (
    await prisma.mealItem.findMany({
      where: { nutritionBasis: 'missing' },
      select: { id: true, name: true },
    })
  ).filter((m) => !filledByCatalog.has(m.id));
  const names = [...new Set(missing.map((m) => m.name.trim()))];
  console.log(`\n=== 이름 추정 — 열량이 빈 이름 ${names.length}개 ===`);
  if (names.length === 0) return;
  const estimator = new MealNutritionEstimator({
    prisma,
    food,
    resolver: new MenuNutritionResolver(prisma),
    llm: new MenuLlmMatchService(prisma, new AiConfigService(prisma, buildLlmProviderEnv()), {
      model: env.OLLAMA_MENU_MATCH_MODEL,
    }),
    web: new FoodWebEstimateService(prisma),
  });
  if (!DRY_RUN) await estimator.ask(names);
  for (const name of names) {
    const { estimate, askable } = await estimator.lookup(name, true);
    const what = estimate
      ? `약 ${Math.round(estimate.kcal ?? 0)}kcal(주식 1인분) ← ${estimate.nutritionFrom} 기준 추정`
      : askable
        ? '아직 안 물어봄'
        : '못 찾음';
    console.log(`  ${name}: ${what}`);
  }
  if (DRY_RUN) return;
  const filled = await estimator.fillMissingItems(names);
  console.log(`채운 항목 ${filled} / ${missing.length}건.`);
};

void main();
