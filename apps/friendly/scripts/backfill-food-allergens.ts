// 기존 음식 카탈로그의 공개 재료 문자열을 19종 알레르겐 규칙으로 다시 계산한다.
// 운영자 검증(verified) 행은 절대 덮지 않는다.
//
// 확인: pnpm --filter friendly backfill:food-allergens -- --dry-run
// 적용: pnpm --filter friendly backfill:food-allergens

import { PrismaClient } from '@prisma/client';
import { backfillFoodAllergens } from '../src/modules/food/food-allergen.js';

const dryRun = process.argv.slice(2).includes('--dry-run');
const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  console.log(`=== 음식 알레르겐 근거 보강${dryRun ? ' (--dry-run)' : ''} ===`);
  try {
    const result = await backfillFoodAllergens(prisma, {
      dryRun,
      onProgress: (processed, total) => {
        if (processed === total || processed % 1_000 === 0) {
          console.log(`  진행 ${processed}/${total}`);
        }
      },
    });
    console.log(`  전체 확인 ${result.scanned}`);
    console.log(`  재료 기반 판정 ${result.eligible}`);
    console.log(`  알레르겐 가능 ${result.withWarnings}`);
    console.log(`  알려진 항목 없음 ${result.noneKnown}`);
    console.log(`  변경 대상 ${result.updated}${dryRun ? ' (미적용)' : ''}`);
    console.log(`  운영자 검수 보존 ${result.skippedVerified}`);
    if (result.invalidIngredients > 0) {
      console.log(`  손상된 재료 JSON 건너뜀 ${result.invalidIngredients}`);
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
};

void main();
