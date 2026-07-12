import type { PrismaClient } from '@prisma/client';
import type { Role, User } from '@repo/api-contract';

export class AdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async listUsers(): Promise<User[]> {
    // passwordHash·tokenVersion 컬럼은 응답에 안 쓰이므로 로드하지 않는다(과다로드
    // 제거 + 민감 컬럼 미노출). 사용자 수가 적어 페이지네이션은 불필요.
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
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
