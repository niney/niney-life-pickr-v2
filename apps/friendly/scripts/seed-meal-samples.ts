// 검증용 식단 기록 씨딩 — 추천·통계가 실제로 어떻게 보이는지 확인하려면 며칠치 기록이 필요하다.
// 저장 경로는 앱과 똑같이 MealService.create 를 태운다(카탈로그 매칭·분류·영양 스냅샷 포함).
//
// 실행: pnpm --filter friendly seed:meal-samples <userId> [--yes] [--undo]
//   --undo: 이 스크립트가 만든 기록(memo 표식)만 지운다.
//   --yes : 운영 DB(prod.db)에 쓰는 것을 명시적으로 승인한다.
//
// 주의: .env 의 DATABASE_URL 을 그대로 쓰므로 **운영 DB 에 바로 쓴다**. 씨딩 기록은 실사용 기록과
// 같은 테이블에 섞이고 구분은 memo 표식 하나뿐이다. 화면 확인만 목적이라면 사본을 권한다
// (probe:meal-e2e 와 같은 방식):
//   cp apps/friendly/data/prod.db /tmp/seed.db
//   DATABASE_URL="file:/tmp/seed.db" pnpm --filter friendly seed:meal-samples <userId>
//
// 넣는 기록에는 memo 로 MARK 를 남겨 나중에 정확히 되돌릴 수 있게 한다.

import { PrismaClient } from '@prisma/client';
import { MealService } from '../src/modules/meal/meal.service.js';

const MARK = '[검증용 샘플]';
const userId = process.argv[2];
const UNDO = process.argv.includes('--undo');
const prisma = new PrismaClient();

// [며칠 전, 끼니, 시각, 음식들(첫 번째가 주식), 식사방식]
const PLAN: [number, string, string, string[], string][] = [
  [9, 'lunch', '12:40', ['김치찌개', '공깃밥'], 'home'],
  [9, 'dinner', '19:10', ['제육볶음', '된장국'], 'dining_out'],
  [8, 'breakfast', '08:10', ['토스트', '계란후라이'], 'home'],
  [8, 'lunch', '12:20', ['비빔밥'], 'dining_out'],
  [7, 'lunch', '12:50', ['된장찌개', '공깃밥'], 'home'],
  [7, 'dinner', '19:30', ['삼겹살', '냉면'], 'dining_out'],
  [6, 'lunch', '13:00', ['김치찌개', '공깃밥'], 'home'],
  [5, 'breakfast', '08:20', ['시리얼'], 'home'],
  [5, 'dinner', '18:50', ['파스타', '샐러드'], 'dining_out'],
  [4, 'lunch', '12:30', ['김밥', '라면'], 'convenience'],
  [3, 'dinner', '19:20', ['치킨'], 'delivery'],
  [2, 'lunch', '12:35', ['순대국밥'], 'dining_out'],
  [2, 'dinner', '19:40', ['제육볶음', '계란찜'], 'home'],
  [1, 'breakfast', '08:05', ['토스트'], 'home'],
  [1, 'lunch', '12:45', ['비빔밥'], 'dining_out'],
];

const main = async (): Promise<void> => {
  if (!userId) {
    console.error('사용법: pnpm --filter friendly seed:meal-samples <userId> [--undo]');
    process.exitCode = 1;
    return;
  }

  // 되돌리기는 안전한 방향이라 막지 않는다. 쓰기만 확인을 받는다.
  const dbUrl = process.env['DATABASE_URL'] ?? '';
  if (!UNDO && /prod\.db/.test(dbUrl) && !process.argv.includes('--yes')) {
    console.error(`운영 DB 로 보입니다: ${dbUrl}`);
    console.error('실사용 기록과 섞입니다. 사본을 쓰거나, 알고서 넣는 거라면 --yes 를 붙이세요.');
    console.error('  사본: DATABASE_URL="file:/tmp/seed.db" pnpm --filter friendly seed:meal-samples <userId>');
    process.exitCode = 1;
    return;
  }

  if (UNDO) {
    const r = await prisma.mealEntry.deleteMany({ where: { userId, memo: MARK } });
    console.log(`검증용 기록 ${r.count}건 삭제`);
    return;
  }

  const service = new MealService(prisma, {});
  let made = 0;
  for (const [daysAgo, slot, hhmm, foods, mealType] of PLAN) {
    const base = new Date(Date.now() - daysAgo * 86_400_000);
    const [h, m] = hhmm.split(':').map(Number);
    const at = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h!, m!) - 9 * 3_600_000,
    );
    const eatenDate = at.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const entry = await service.create(userId, {
      eatenAt: at.toISOString(),
      eatenDate,
      slot: slot as never,
      mealType: mealType as never,
      memo: MARK,
      source: 'manual',
      photoTokens: [],
      items: foods.map((name, i) => ({
        name,
        isMain: i === 0,
        portion: 'normal' as never,
        source: 'manual' as never,
      })),
    });
    made += 1;
    const kcal = entry.items.reduce((s, it) => s + (it.kcal ?? 0), 0);
    const withNut = entry.items.filter((it) => it.kcal !== null).length;
    console.log(
      `  ${eatenDate} ${hhmm} ${slot.padEnd(9)} ${foods.join(', ').padEnd(22)} → ${Math.round(kcal)}kcal (${withNut}/${entry.items.length})`,
    );
  }
  console.log(`\n${made}건 생성. 되돌리려면 --undo.`);
};

main().finally(() => void prisma.$disconnect());
