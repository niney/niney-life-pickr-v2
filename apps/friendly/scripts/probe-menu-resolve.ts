// 메뉴명 몇 개를 규칙 판정기(규칙 계층만)에 대어 보는 스팟체크.
// 실행: pnpm --filter friendly probe:menu-resolve "항정살 150g" "生生生연어사시미" "통영생굴(200g)"

import { PrismaClient } from '@prisma/client';
import { MenuNutritionResolver } from '../src/modules/food/menu-nutrition.js';

const prisma = new PrismaClient();
const names = process.argv.slice(2);
const resolver = new MenuNutritionResolver(prisma);
const res = await resolver.resolveMany(names);
for (const n of names) {
  const r = res.get(n)!;
  console.log(`${n} → ${r.basis ? `${r.foodName} [${r.matchedBy}] ${r.kcal} ${r.basis}` : `(${r.reason}${r.candidate ? ` cand=${r.candidate}` : ''})`}`);
}
await prisma.$disconnect();
