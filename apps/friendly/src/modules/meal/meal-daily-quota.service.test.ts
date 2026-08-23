import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { MealDailyQuotaService } from './meal-daily-quota.service.js';

describe('MealDailyQuotaService (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let prisma: PrismaClient;
  let service: MealDailyQuotaService;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.user.create({
      data: { id: 'quota-user', email: 'quota@example.com', passwordHash: 'unused' },
    });
    service = new MealDailyQuotaService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  it('재시작 가능한 DB 카운터가 limit에서 정확히 멈춘다', async () => {
    expect(await service.consume('quota-user', '2026-08-23', 'recognition', 2)).toBe(true);
    expect(await service.consume('quota-user', '2026-08-23', 'recognition', 2)).toBe(true);
    expect(await service.consume('quota-user', '2026-08-23', 'recognition', 2)).toBe(false);
    await expect(
      prisma.mealDailyQuota.findUniqueOrThrow({
        where: {
          userId_date_purpose: {
            userId: 'quota-user',
            date: '2026-08-23',
            purpose: 'recognition',
          },
        },
      }),
    ).resolves.toMatchObject({ count: 2 });
  });

  it('동시에 들어와도 조건부 UPDATE 한 문장으로 limit을 넘지 않는다', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.consume('quota-user', '2026-08-24', 'recommendation', 3),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    const row = await prisma.mealDailyQuota.findUniqueOrThrow({
      where: {
        userId_date_purpose: {
          userId: 'quota-user',
          date: '2026-08-24',
          purpose: 'recommendation',
        },
      },
    });
    expect(row.count).toBe(3);
  });

  it('limit 0은 기존 env 계약대로 무제한이며 카운터를 만들지 않는다', async () => {
    expect(await service.consume('quota-user', '2026-08-25', 'recognition', 0)).toBe(true);
    expect(
      await prisma.mealDailyQuota.findUnique({
        where: {
          userId_date_purpose: {
            userId: 'quota-user',
            date: '2026-08-25',
            purpose: 'recognition',
          },
        },
      }),
    ).toBeNull();
  });
});
