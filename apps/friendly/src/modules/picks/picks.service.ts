import type { PrismaClient } from '@prisma/client';
import type {
  CreatePickInput,
  Pick,
  PickCategory,
  PickResult,
  UpdatePickInput,
} from '@repo/api-contract';
import { pickRandom } from '@repo/utils';

interface PickRow {
  id: string;
  userId: string;
  title: string;
  options: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PicksService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<Pick[]> {
    const rows = await this.prisma.pick.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(this.toDomain);
  }

  async getById(userId: string, id: string): Promise<Pick> {
    const row = await this.prisma.pick.findFirst({ where: { id, userId } });
    if (!row) throw Object.assign(new Error('Pick not found'), { statusCode: 404 });
    return this.toDomain(row);
  }

  async create(userId: string, input: CreatePickInput): Promise<Pick> {
    const row = await this.prisma.pick.create({
      data: {
        userId,
        title: input.title,
        options: JSON.stringify(input.options),
        category: input.category,
      },
    });
    return this.toDomain(row);
  }

  async update(userId: string, id: string, input: UpdatePickInput): Promise<Pick> {
    await this.getById(userId, id);
    const row = await this.prisma.pick.update({
      where: { id },
      data: {
        title: input.title,
        options: input.options ? JSON.stringify(input.options) : undefined,
        category: input.category,
      },
    });
    return this.toDomain(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    await this.prisma.pick.delete({ where: { id } });
  }

  async random(userId: string, id: string): Promise<PickResult> {
    const pick = await this.getById(userId, id);
    const chosen = pickRandom(pick.options);
    const row = await this.prisma.pickResult.create({
      data: { pickId: id, chosen },
    });
    return {
      pickId: id,
      chosen,
      pickedAt: row.pickedAt.toISOString(),
    };
  }

  private toDomain(row: PickRow): Pick {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      options: JSON.parse(row.options) as string[],
      category: row.category as PickCategory,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
