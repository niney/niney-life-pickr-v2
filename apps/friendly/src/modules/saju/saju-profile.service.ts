import type { PrismaClient, SajuProfile as ProfileRow } from '@prisma/client';
import { SAJU_PROFILES_MAX, SajuProfile, type SajuProfileInputType } from '@repo/api-contract';
import { calculateSaju, SajuInputError } from './saju.engine.js';
import { SajuNotFound } from './saju.service.js';

export class SajuProfileConflict extends Error {}
const profile = (row: ProfileRow) =>
  SajuProfile.parse({
    id: row.id,
    name: row.name,
    birth: JSON.parse(row.birthJson),
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
export class SajuProfileService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(userId: string) {
    const rows = await this.prisma.sajuProfile.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(profile) };
  }
  async save(userId: string, input: SajuProfileInputType, id?: string, revision?: number) {
    // Zod 형식 검증에 더해 없는 윤달·미래일·DST 누락 시각도 저장 전에 확인한다.
    calculateSaju({ birth: input.birth, kind: 'natal', note: '' });
    return this.prisma.$transaction(async (tx) => {
      const data = { name: input.name, birthJson: JSON.stringify(input.birth) };
      if (id) {
        const existing = await tx.sajuProfile.findFirst({ where: { id, userId } });
        if (!existing) throw new SajuNotFound();
        const changed = await tx.sajuProfile.updateMany({
          where: { id, userId, revision },
          data: { ...data, revision: { increment: 1 } },
        });
        if (!changed.count)
          throw new SajuProfileConflict(
            '다른 창에서 수정한 프로필이에요. 새로고침한 뒤 다시 수정해 주세요.',
          );
        return profile(await tx.sajuProfile.findUniqueOrThrow({ where: { id } }));
      }
      if ((await tx.sajuProfile.count({ where: { userId } })) >= SAJU_PROFILES_MAX)
        throw new SajuInputError(`프로필은 ${SAJU_PROFILES_MAX}명까지 보관할 수 있어요.`);
      return profile(await tx.sajuProfile.create({ data: { ...data, userId } }));
    });
  }
  async remove(userId: string, id: string) {
    if (!(await this.prisma.sajuProfile.deleteMany({ where: { id, userId } })).count)
      throw new SajuNotFound();
  }
}
