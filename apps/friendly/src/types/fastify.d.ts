import type { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply,
    ) => Promise<void>;
  }

  interface FastifyRequest {
    user: { userId: string; email: string };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string };
    user: { userId: string; email: string };
  }
}
