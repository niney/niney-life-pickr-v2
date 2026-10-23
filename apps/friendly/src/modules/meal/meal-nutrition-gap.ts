import { Prisma, type PrismaClient } from '@prisma/client';
import type { FoodAdminMealNutritionGapsResultType } from '@repo/api-contract';

// 어드민 "열량 빈 식단 이름" — 열량이 빈 항목(missing)과 카탈로그 밖 이름을 추정으로 채운 항목(donor_estimate 인데
// foodId 없음 — 카탈로그 행에서 빌린 값은 foodId 가 있다)을 이름(nameNorm)별로 모은다. 아직 빈 이름을 위로,
// 그다음 기록이 많은 순. 사용자는 드러내지 않고 수만 센다.

interface GapRow {
  name: string;
  itemCount: bigint | number;
  userCount: bigint | number;
  lastEatenDate: string | null;
  missingCount: bigint | number;
  nutritionFrom: string | null;
}

interface TotalRow {
  missingNames: bigint | number | null;
  estimatedNames: bigint | number | null;
}

const GAP_WHERE = Prisma.sql`
  i.nutritionBasis = 'missing' OR (i.nutritionBasis = 'donor_estimate' AND i.foodId IS NULL)`;

export const listMealNutritionGaps = async (
  prisma: PrismaClient,
  limit: number,
): Promise<FoodAdminMealNutritionGapsResultType> => {
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<GapRow[]>`
      SELECT MIN(i.name) AS name,
             COUNT(*) AS itemCount,
             COUNT(DISTINCT e.userId) AS userCount,
             MAX(e.eatenDate) AS lastEatenDate,
             SUM(CASE WHEN i.nutritionBasis = 'missing' THEN 1 ELSE 0 END) AS missingCount,
             MAX(CASE WHEN i.nutritionBasis = 'donor_estimate' THEN i.nutritionFrom END) AS nutritionFrom
      FROM meal_items i JOIN meal_entries e ON e.id = i.entryId
      WHERE ${GAP_WHERE}
      GROUP BY i.nameNorm
      ORDER BY (missingCount > 0) DESC, itemCount DESC, lastEatenDate DESC
      LIMIT ${limit}`,
    prisma.$queryRaw<TotalRow[]>`
      SELECT SUM(CASE WHEN missingCount > 0 THEN 1 ELSE 0 END) AS missingNames,
             SUM(CASE WHEN missingCount = 0 THEN 1 ELSE 0 END) AS estimatedNames
      FROM (
        SELECT SUM(CASE WHEN i.nutritionBasis = 'missing' THEN 1 ELSE 0 END) AS missingCount
        FROM meal_items i
        WHERE ${GAP_WHERE}
        GROUP BY i.nameNorm
      )`,
  ]);
  const total = totals[0];
  return {
    items: rows.map((r) => {
      const missing = Number(r.missingCount) > 0;
      return {
        name: r.name,
        itemCount: Number(r.itemCount),
        userCount: Number(r.userCount),
        lastEatenDate: r.lastEatenDate,
        state: missing ? ('missing' as const) : ('estimated' as const),
        nutritionFrom: missing ? null : r.nutritionFrom,
      };
    }),
    missingNames: Number(total?.missingNames ?? 0),
    estimatedNames: Number(total?.estimatedNames ?? 0),
  };
};
