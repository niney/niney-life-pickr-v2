import type { PrismaClient } from '@prisma/client';
import type { LoginInput, RegisterInput, User } from '@repo/api-contract';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../lib/hash.js';

// 토큰 서명 시 tv 클레임에 넣을 tokenVersion 을 함께 돌려준다(User 공개 타입엔 미노출).
export interface AuthResult {
  user: User;
  tokenVersion: number;
}

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw Object.assign(new Error('Email already in use'), { statusCode: 409 });

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: { email: input.email, passwordHash },
    });

    return { user: this.toPublic(user), tokenVersion: user.tokenVersion };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // 사용자 부재 시에도 더미 해시로 동일 비용의 비교를 수행 → 타이밍 기반 이메일 열거 차단.
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

    return { user: this.toPublic(user), tokenVersion: user.tokenVersion };
  }

  async getById(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    return this.toPublic(user);
  }

  private toPublic(u: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };
  }
}
