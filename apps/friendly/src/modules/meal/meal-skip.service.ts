import type { PrismaClient } from '@prisma/client';
import { MEAL_SKIPPABLE_SLOTS, type MealSkipSlotType, type MealSkipType } from '@repo/api-contract';
import { MEAL_SLOT_ORDER } from '@repo/utils';
import { mealMutationBarrier } from './meal-mutation-barrier.js';

// 끼니 '안 먹음' 표시(2026-11-08) — 빈 칸이 '안 적음'인지 '안 먹음'인지 가린다. 영양소 점검·통계의 하루 평균은 기록과 이
// 표시를 함께 세어 평균에 넣을 날을 고른다(@repo/utils isCountedMealDay). 쓰기는 식단 쓰기 장벽 안에서 — 전체 삭제·복원과
// 엇갈리지 않게. 같은 날·끼니에 기록이 생기면 MealService 가 같은 트랜잭션에서 지운다.

export class MealSkipError extends Error {
  constructor(
    public readonly code: 'future' | 'recorded',
    message: string,
  ) {
    super(message);
  }
}

const SKIPPABLE: ReadonlySet<string> = new Set(MEAL_SKIPPABLE_SLOTS);
const slotRank = (slot: string): number => MEAL_SLOT_ORDER[slot as keyof typeof MEAL_SLOT_ORDER] ?? 99;

/**
 * 날짜 → 그날 기록이 없는 끼니에 붙은 '안 먹음' 수. 같은 끼니에 기록이 있으면 기록이 이긴다(저장 때 지우지만, 예전 데이터나
 * 동시 저장으로 둘 다 남아도 두 번 세지 않게).
 */
export const skippedByDate = (
  skips: ReadonlyArray<{ date: string; slot: string }>,
  entries: ReadonlyArray<{ eatenDate: string; slot: string }>,
): Map<string, number> => {
  const recorded = new Set(entries.map((e) => `${e.eatenDate}|${e.slot}`));
  const out = new Map<string, number>();
  for (const s of skips) {
    if (!SKIPPABLE.has(s.slot) || recorded.has(`${s.date}|${s.slot}`)) continue;
    out.set(s.date, (out.get(s.date) ?? 0) + 1);
  }
  return out;
};

export class MealSkipService {
  constructor(private readonly prisma: PrismaClient) {}

  /** 기간(from~to, 포함)의 '안 먹음' 표시 — 날짜·끼니 순. */
  async list(userId: string, from: string, to: string): Promise<MealSkipType[]> {
    const rows = await this.prisma.mealSkip.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { date: true, slot: true },
    });
    return rows
      .filter((r): r is { date: string; slot: MealSkipSlotType } => SKIPPABLE.has(r.slot))
      .sort((a, b) => a.date.localeCompare(b.date) || slotRank(a.slot) - slotRank(b.slot));
  }

  /** 표시(이미 있으면 그대로). 앞으로 올 날은 받지 않고, 그 날·끼니에 기록이 있으면 409 — 기록이 이긴다. */
  async set(userId: string, skip: MealSkipType, today: string): Promise<MealSkipType> {
    if (skip.date > today) throw new MealSkipError('future', '앞으로 올 끼니는 안 먹음으로 표시할 수 없어요.');
    return mealMutationBarrier.runExclusive(userId, async () => {
      const recorded = await this.prisma.mealEntry.findFirst({
        where: { userId, eatenDate: skip.date, slot: skip.slot },
        select: { id: true },
      });
      if (recorded) throw new MealSkipError('recorded', '이미 기록한 끼니예요.');
      await this.prisma.mealSkip.upsert({
        where: { userId_date_slot: { userId, date: skip.date, slot: skip.slot } },
        create: { userId, date: skip.date, slot: skip.slot },
        update: {},
      });
      return { date: skip.date, slot: skip.slot };
    });
  }

  /** 표시 지우기(없으면 그대로). */
  async clear(userId: string, skip: MealSkipType): Promise<void> {
    await mealMutationBarrier.runExclusive(userId, () =>
      this.prisma.mealSkip.deleteMany({ where: { userId, date: skip.date, slot: skip.slot } }),
    );
  }
}
