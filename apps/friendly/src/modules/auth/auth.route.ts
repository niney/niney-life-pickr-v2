import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AuthResponse,
  LoginInput,
  RegisterInput,
  Routes,
  UserSchema,
} from '@repo/api-contract';
import { AuthService } from './auth.service.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(Routes.Auth.register, {
    schema: {
      tags: ['auth'],
      body: RegisterInput,
      response: { 201: AuthResponse },
    },
    handler: async (req, reply) => {
      const user = await service.register(req.body);
      const token = app.jwt.sign({ userId: user.id, email: user.email, role: user.role });
      return reply.code(201).send({ token, user });
    },
  });

  typed.post(Routes.Auth.login, {
    schema: {
      tags: ['auth'],
      body: LoginInput,
      response: { 200: AuthResponse },
    },
    handler: async (req) => {
      const user = await service.login(req.body);
      const token = app.jwt.sign({ userId: user.id, email: user.email, role: user.role });
      return { token, user };
    },
  });

  typed.get(Routes.Auth.me, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['auth'],
      security: [{ bearerAuth: [] }],
      response: { 200: UserSchema },
    },
    handler: async (req) => service.getById(req.user.userId),
  });

  typed.post(Routes.Auth.logout, {
    onRequest: [app.authenticate],
    schema: { tags: ['auth'], security: [{ bearerAuth: [] }] },
    handler: async (_req, reply) => reply.code(204).send(),
  });
};

export default authRoutes;
