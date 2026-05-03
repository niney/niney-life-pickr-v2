import type { PrismaClient } from '@prisma/client';
import type { Role, User } from '@repo/api-contract';

export class AdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async listUsers(): Promise<User[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role as Role,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));
  }

  async setRole(id: string, role: Role): Promise<User> {
    const u = await this.prisma.user.update({ where: { id }, data: { role } });
    return {
      id: u.id,
      email: u.email,
      role: u.role as Role,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };
  }
}
