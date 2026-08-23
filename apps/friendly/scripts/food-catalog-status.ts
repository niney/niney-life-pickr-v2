// 음식 카탈로그 적재 상태 한 줄 — deploy.sh 가 파싱한다:
//   "ok items=N classified=C nutrition=U meals=M"   (활성 종수 / 3축 분류 / 영양 보유 / 식단 항목 수)
//   "missing"                                        (테이블 없음 — 마이그레이션 전)
// 실행: pnpm --filter friendly status:food-catalog

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  try {
    const [items, classified, nutrition, meals] = await Promise.all([
      prisma.foodItem.count({ where: { active: true } }),
      prisma.foodItem.count({
        where: { active: true, dishType: { not: null }, mainIngredient: { not: null }, cuisine: { not: null } },
      }),
      prisma.foodItem.count({ where: { active: true, kcal: { not: null } } }),
      prisma.mealItem.count(),
    ]);
    console.log(`ok items=${items} classified=${classified} nutrition=${nutrition} meals=${meals}`);
  } catch (e) {
    // 테이블 없음(P2021) 등 — 배포 스크립트가 "missing" 으로 분기한다.
    console.log('missing');
    console.error(e instanceof Error ? e.message : String(e));
  }
};

main().finally(() => prisma.$disconnect());
