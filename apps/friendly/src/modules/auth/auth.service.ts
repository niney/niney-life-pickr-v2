import type { PrismaClient } from '@prisma/client';
import type { LoginInput, RegisterInput, User } from '@repo/api-contract';
import { hashPassword, verifyPassword } from '../../lib/hash.js';

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: RegisterInput): Promise<User> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw Object.assign(new Error('Email already in use'), { statusCode: 409 });

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: { email: input.email, passwordHash },
    });

    return this.toPublic(user);
  }

  async login(input: LoginInput): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

    return this.toPublic(user);
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
