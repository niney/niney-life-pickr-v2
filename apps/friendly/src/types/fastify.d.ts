import type { PrismaClient } from '@prisma/client';

type Role = 'USER' | 'ADMIN';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => Promise<void>;
    requireAdmin: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => Promise<void>;
    // SSE(쿼리 토큰) 또는 헤더 토큰에서 어드민을 확인 + tokenVersion 무효화 반영.
    // 유효한 어드민이면 최신 role 을, 아니면 null 을 반환한다.
    resolveSseAdmin: (
      request: import('fastify').FastifyRequest,
    ) => Promise<{ userId: string; role: Role } | null>;
    // 공개 라우트의 옵셔널 인증 — 유효한 토큰이면 사용자, 아니면 null(401 아님).
    resolveOptionalUser: (
      request: import('fastify').FastifyRequest,
    ) => Promise<{ userId: string; role: Role } | null>;
  }

  interface FastifyRequest {
    user: { userId: string; email: string; role: Role; tv?: number };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string; role: Role; tv?: number };
    user: { userId: string; email: string; role: Role; tv?: number };
  }
}
