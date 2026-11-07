// 영양소 점검 커버리지 프로브 — 한 계정의 점검 결과를 영양 기준 음식 연결 없이/있이 나란히 찍는다(읽기만 한다).
// 운영 배포·카탈로그 적재·link:food-nutrients 뒤 '판단 보류'가 실제로 줄었는지 확인하는 용도(docs/PLAN-meal-nutrition.md).
//
// 실행: pnpm --filter friendly probe:nutrition-coverage [--email=<계정>] [--today=YYYY-MM-DD] [--days=7,14,28]
//   DB 는 .env 의 DATABASE_URL — 운영 사본(prod.db)에 돌려도 쓰기는 없다(점검·연결 조회 모두 읽기).

import { PrismaClient } from '@prisma/client';
import { FoodNutrientRefService } from '../src/modules/food/food-nutrient-ref.service.js';
import { MealNutritionService } from '../src/modules/meal-nutrition/meal-nutrition.service.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const EMAIL = opt('email') ?? 'niney@life.com';
const TODAY = opt('today') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const DAYS = (opt('days') ?? '7,14,28').split(',').map((d) => Number.parseInt(d, 10)).filter((d) => d >= 7 && d <= 28);
const LABEL: Record<string, string> = { low: '부족', borderline: '조금 부족', ok: '충분', high: '많음', unknown: '보류' };

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error(`계정 없음: ${EMAIL}`);
  const dbName = (process.env.DATABASE_URL ?? '').split(/[\\/]/).pop() ?? '';
  console.log(`=== 영양소 점검 커버리지 (${EMAIL}, DB ${dbName}, 기준일 ${TODAY}) ===`);
  const refs = new FoodNutrientRefService(prisma);
  const plain = new MealNutritionService(prisma);
  const linked = new MealNutritionService(prisma, { refs });
  for (const days of DAYS) {
    for (const [label, svc] of [['연결 없이', plain], ['연결 있이', linked]] as const) {
      const a = await svc.analyze(user.id, TODAY, days);
      const count = (s: string) => a.nutrients.filter((n) => n.status === s).length;
      console.log(`\n[${days}일 · ${label}] 분석일 ${a.analyzedDays} · ${a.status} · 보류 ${count('unknown')} · 부족 ${count('low')} · 조금 부족 ${count('borderline')} · 충분 ${count('ok')} · 많음 ${count('high')}`);
      if (a.status === 'insufficient') {
        console.log(`  ${a.insufficientReason}`);
        continue;
      }
      console.log(
        '  ' +
          a.nutrients
            .map((n) => `${n.label.split('(')[0]} ${LABEL[n.status]}(${n.percent ?? '-'}%·정보 ${Math.round(n.coverage * 100)}%)`)
            .join(' | '),
      );
      for (const note of a.notes) console.log(`  · ${note}`);
    }
  }
};

void main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
