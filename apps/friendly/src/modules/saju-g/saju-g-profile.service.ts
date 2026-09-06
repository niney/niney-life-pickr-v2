import type { PrismaClient, SajuGProfile as ProfileRow } from '@prisma/client';
import { SAJU_G_PROFILES_MAX, SajuGProfile, type SajuGProfileInputType } from '@repo/api-contract';
import { calculateSajuG, SajuGInputError } from './saju-g.engine.js';
import { SajuGNotFound } from './saju-g.service.js';

export class SajuGProfileConflict extends Error {}
const profile = (row: ProfileRow) =>
  SajuGProfile.parse({
    id: row.id,
    name: row.name,
    birth: JSON.parse(row.birthJson),
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
export class SajuGProfileService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(userId: string) {
    const rows = await this.prisma.sajuGProfile.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(profile) };
  }
  async save(userId: string, input: SajuGProfileInputType, id?: string, revision?: number) {
    // Zod 형식 검증에 더해 없는 윤달·미래일·DST 누락 시각도 저장 전에 확인한다.
    calculateSajuG({ birth: input.birth, kind: 'natal', note: '' });
    return this.prisma.$transaction(async (tx) => {
      const data = { name: input.name, birthJson: JSON.stringify(input.birth) };
      if (id) {
        const existing = await tx.sajuGProfile.findFirst({ where: { id, userId } });
        if (!existing) throw new SajuGNotFound();
        const changed = await tx.sajuGProfile.updateMany({
          where: { id, userId, revision },
          data: { ...data, revision: { increment: 1 } },
        });
        if (!changed.count)
          throw new SajuGProfileConflict(
            '다른 창에서 수정한 프로필이에요. 새로고침한 뒤 다시 수정해 주세요.',
          );
        return profile(await tx.sajuGProfile.findUniqueOrThrow({ where: { id } }));
      }
      if ((await tx.sajuGProfile.count({ where: { userId } })) >= SAJU_G_PROFILES_MAX)
        throw new SajuGInputError(`프로필은 ${SAJU_G_PROFILES_MAX}명까지 보관할 수 있어요.`);
      return profile(await tx.sajuGProfile.create({ data: { ...data, userId } }));
    });
  }
  async remove(userId: string, id: string) {
    if (!(await this.prisma.sajuGProfile.deleteMany({ where: { id, userId } })).count)
      throw new SajuGNotFound();
  }
}
