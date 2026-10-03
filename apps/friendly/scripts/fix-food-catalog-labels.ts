// 식약처 카탈로그 표기 바로잡기 — 적재 규칙을 고친 것을 이미 적재된 행에 소급한다. 재적재는 이름(nameNorm)으로
// 행을 찾고 빈 칸만 채우므로 이것만으로는 고쳐지지 않는다(이름을 안 바꾸면 원래 이름의 행이 또 생긴다).
//   ① 대표식품명 보정(MFDS_REP_NAME_OVERRIDES): '돼지고기'(찜류) → '돼지 부속고기(허파·간·머리고기)',
//      '달걀'(수·조·어·육류) → '삶은 달걀'. 이미 다른 이름으로 손본 행은 건드리지 않는다.
//   ② 수·조·어·육류인데 회(raw_fish)로 적재된 행 중 이름이 회가 아닌 것(삶은 달걀·소시지·대구포) → 분류를
//      비운다(재분류 대상 — 새로 적재해도 같은 상태가 된다).
//   ③ 계통이 '분식·패스트푸드'인데 이름이 한식 요리형으로 끝나는 행(어묵 매운탕·어묵볶음·순대국) → 한식.
//      @repo/utils guessCuisineFromName 규칙 보정(2026-10-04)의 소급. 운영자가 정한 curated 행은 건드리지 않는다.
// 어드민 편집과 같은 경로(FoodService.adminUpdate)로 바꿔 이름 정규화·별칭이 맞춰진다.
//
// 실행: pnpm --filter friendly fix:food-labels [--dry-run]   (여러 번 돌려도 결과가 같다)

import { PrismaClient } from '@prisma/client';
import { guessCuisineFromName, guessDishTypeFromName } from '@repo/utils';
import { mfdsCatalogName } from '../src/modules/food/food-import.service.js';
import { FoodService } from '../src/modules/food/food.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();
const isMeatFishEggCategory = (category: string | null): boolean =>
  (category ?? '').replace(/[\s·ㆍ•,，()]/g, '') === '수조어육류';

const main = async (): Promise<void> => {
  console.log(`=== 식약처 카탈로그 표기 바로잡기 ${DRY_RUN ? '(--dry-run)' : ''} ===`);
  const food = new FoodService(prisma);
  const rows = await prisma.foodItem.findMany({
    where: { source: 'mfds-nutrition' },
    select: { id: true, name: true, repName: true, sourceCategory: true, dishType: true },
  });
  let changed = 0;
  for (const row of rows) {
    const target = row.repName ? mfdsCatalogName(row.sourceCategory, row.repName) : row.name;
    const rename = target !== row.name && row.name === row.repName ? target : null;
    const name = rename ?? row.name;
    const clearDishType =
      isMeatFishEggCategory(row.sourceCategory) &&
      row.dishType === 'raw_fish' &&
      guessDishTypeFromName(name) !== 'raw_fish';
    if (!rename && !clearDishType) continue;
    changed += 1;
    console.log(
      `  ${row.name}${rename ? ` → 이름 "${rename}"` : ''}${clearDishType ? ' · 분류 회 → (비움)' : ''}`,
    );
    if (!DRY_RUN) {
      await food.adminUpdate(row.id, {
        ...(rename ? { name: rename } : {}),
        ...(clearDishType ? { dishType: null } : {}),
      });
    }
  }
  // ③ 분식으로 잘못 잡힌 한식 요리.
  const fastFood = await prisma.foodItem.findMany({
    where: { cuisine: 'fast_food', source: { not: 'curated' } },
    select: { id: true, name: true },
  });
  for (const row of fastFood) {
    if (guessCuisineFromName(row.name) !== 'korean') continue;
    changed += 1;
    console.log(`  ${row.name} · 계통 분식 → 한식`);
    if (!DRY_RUN) await food.adminUpdate(row.id, { cuisine: 'korean' });
  }
  console.log(
    `\n${DRY_RUN ? '바뀔' : '바꾼'} 행 ${changed} / 식약처 음식 ${rows.length}행 + 분식 계통 ${fastFood.length}행`,
  );
  await prisma.$disconnect();
};

void main();
