// 이미 저장된 식단 항목에 영양 스냅샷을 채운다. 항목 저장 시점에는 서버가 자동으로 붙이지만,
// (1) 영양 컬럼이 생기기 전에 저장된 기록과 (2) 카탈로그 영양이 나중에 보강된 음식은 비어 있다.
// 카탈로그 적재(load:food-catalog --backfill-nutrition) 뒤에 한 번 돌리면 된다.
//
// 실행: pnpm --filter friendly backfill:meal-nutrition [--dry-run] [--refresh]
//   --refresh: 이미 값이 있는 항목도 카탈로그·어휘 현재 값으로 다시 계산한다(카탈로그 영양을 고쳤거나,
//              1인분 중량 규칙·어드민 "1인분 기준 중량" 어휘를 바꾼 뒤).
//
// 계산은 저장 경로(MealService)와 같은 mealServingNutrition 을 쓴다 — 주식의 카탈로그 1인분이 기준량(100g)
// 이하이면 종류별 통상 1인분으로 환산하고, 양은 사용자가 적은 인분 수 → 서수(조금·보통·많이) 순으로 곱한다.

import { PrismaClient } from '@prisma/client';
import { mealPortionFactor } from '@repo/utils';
import { FoodService } from '../src/modules/food/food.service.js';
import { mealServingNutrition } from '../src/modules/food/food-serving.js';

const DRY_RUN = process.argv.includes('--dry-run');
// 스냅샷은 원래 안 바꾸는 게 원칙이다(과거 기록이 흔들리면 안 된다). --refresh 는 카탈로그 쪽
// 값이나 1인분 규칙이 틀렸던 걸 바로잡은 뒤에만 쓰는 명시적 재계산이다.
const REFRESH = process.argv.includes('--refresh');
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
    const before = item.kcal === null ? '' : `${Math.round(item.kcal)} → `;
    const note = next.nutritionFrom ? `, ${next.nutritionFrom} 기준 추정` : '';
    console.log(`  ${item.name}${item.isMain ? '' : '(반찬)'} ← ${row?.name ?? '?'} (${before}${next.kcal ?? '?'}kcal${note})`);
  }
  console.log(`\n${DRY_RUN ? '바뀔' : '바꾼'} 항목 ${changed} / ${items.length}건. 나머지는 그대로이거나 카탈로그에 영양이 없다.`);
  await prisma.$disconnect();
};

void main();
