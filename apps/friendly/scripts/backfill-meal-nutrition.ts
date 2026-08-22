// 이미 저장된 식단 항목에 영양 스냅샷을 채운다. 항목 저장 시점에는 서버가 자동으로 붙이지만,
// (1) 영양 컬럼이 생기기 전에 저장된 기록과 (2) 카탈로그 영양이 나중에 보강된 음식은 비어 있다.
// 카탈로그 적재(load:food-catalog --backfill-nutrition) 뒤에 한 번 돌리면 된다.
//
// 실행: pnpm --filter friendly backfill:meal-nutrition [--dry-run] [--refresh]
//   --refresh: 이미 값이 있는 항목도 카탈로그 현재 값으로 다시 계산한다(카탈로그 영양을 고친 뒤).

import { PrismaClient } from '@prisma/client';
import { mealPortionFactor } from '@repo/utils';
import { normalizeTerm } from '../src/lib/text.js';

const DRY_RUN = process.argv.includes('--dry-run');
// 스냅샷은 원래 안 바꾸는 게 원칙이다(과거 기록이 흔들리면 안 된다). --refresh 는 카탈로그 쪽
// 값이 틀렸던 걸 바로잡은 뒤에만 쓰는 명시적 재계산이다.
const REFRESH = process.argv.includes('--refresh');
const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  console.log(`=== 식단 항목 영양 보강 ${DRY_RUN ? '(--dry-run)' : ''} ===`);
  const items = await prisma.mealItem.findMany({
    where: REFRESH ? {} : { kcal: null },
    select: { id: true, name: true, nameNorm: true, foodId: true, portion: true, kcal: true },
  });
  console.log(`${REFRESH ? '재계산 대상' : '영양이 빈 항목'} ${items.length}건`);

  let filled = 0;
  for (const item of items) {
    // 저장 당시 매칭된 행을 우선 보고, 없으면 이름(정규화)으로 다시 찾는다.
    const food =
      (item.foodId
        ? await prisma.foodItem.findFirst({
            where: { id: item.foodId, active: true },
            select: { name: true, kcal: true, proteinG: true, sodiumMg: true, nutritionFrom: true },
          })
        : null) ??
      (await prisma.foodItem.findFirst({
        where: { nameNorm: item.nameNorm || normalizeTerm(item.name), active: true },
        select: { name: true, kcal: true, proteinG: true, sodiumMg: true, nutritionFrom: true },
      }));
    if (!food || food.kcal === null) continue;

    const f = mealPortionFactor(item.portion);
    const scale = (v: number | null, digits: number): number | null =>
      v === null ? null : Number((v * f).toFixed(digits));
    if (!DRY_RUN) {
      await prisma.mealItem.update({
        where: { id: item.id },
        data: {
          kcal: scale(food.kcal, 0),
          proteinG: scale(food.proteinG, 1),
          sodiumMg: scale(food.sodiumMg, 0),
          nutritionFrom: food.nutritionFrom,
        },
      });
    }
    filled += 1;
    const before = item.kcal === null ? '' : `${Math.round(item.kcal)} → `;
    console.log(`  ${item.name} ← ${food.name} (${before}${Math.round(food.kcal * f)}kcal${food.nutritionFrom ? `, ${food.nutritionFrom} 기준 추정` : ''})`);
  }
  console.log(`\n보강 ${filled} / ${items.length}건. 나머지는 카탈로그에 영양이 없는 음식이다.`);
  await prisma.$disconnect();
};

void main();
