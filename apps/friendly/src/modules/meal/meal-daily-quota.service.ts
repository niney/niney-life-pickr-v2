import type { PrismaClient } from '@prisma/client';

// SQLite에 남는 일일 비용 카운터. INSERT ... ON CONFLICT의 조건부 UPDATE 한 문장으로
// 확인과 증가를 묶어, 동시에 들어온 요청도 limit을 넘겨 provider 호출로 보내지 않는다.
export class MealDailyQuotaService {
  constructor(private readonly prisma: PrismaClient) {}

  async consume(userId: string, date: string, purpose: string, limit: number): Promise<boolean> {
    // 기존 운영 설정 계약: 0은 기능 차단이 아니라 일일 한도 비활성화다.
    if (limit <= 0) return true;
    const changed = await this.prisma.$executeRaw`
      INSERT INTO meal_daily_quotas (userId, date, purpose, count, updatedAt)
      VALUES (${userId}, ${date}, ${purpose}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(userId, date, purpose) DO UPDATE SET
        count = count + 1,
        updatedAt = CURRENT_TIMESTAMP
      WHERE count < ${limit}
    `;
    return changed === 1;
  }
}
