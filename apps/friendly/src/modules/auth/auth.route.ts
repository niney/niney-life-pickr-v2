import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AuthResponse,
  LoginInput,
  RegisterInput,
  Routes,
  UserSchema,
} from '@repo/api-contract';
import { RATE } from '../../plugins/rate-limit.js';
import { AuthService } from './auth.service.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(Routes.Auth.register, {
    config: { rateLimit: RATE.authRegister },
    schema: {
      tags: ['auth'],
      summary: '이메일 회원가입 — JWT 와 사용자 정보 반환(중복 이메일 409)',
      body: RegisterInput,
      response: { 201: AuthResponse },
    },
    handler: async (req, reply) => {
      const { user, tokenVersion } = await service.register(req.body);
      const token = app.jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
        tv: tokenVersion,
      });
      return reply.code(201).send({ token, user });
    },
  });

  typed.post(Routes.Auth.login, {
    config: { rateLimit: RATE.authLogin },
    schema: {
      tags: ['auth'],
      summary: '이메일·비밀번호 로그인 — JWT 와 사용자 정보 반환',
      body: LoginInput,
      response: { 200: AuthResponse },
    },
    handler: async (req) => {
      const { user, tokenVersion } = await service.login(req.body);
      const token = app.jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
        tv: tokenVersion,
      });
      return { token, user };
    },
  });

  typed.get(Routes.Auth.me, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['auth'],
      summary: '현재 로그인 사용자 정보 조회',
      security: [{ bearerAuth: [] }],
      response: { 200: UserSchema },
    },
    handler: async (req) => service.getById(req.user.userId),
  });

  typed.post(Routes.Auth.logout, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['auth'],
      summary: '로그아웃 — 이 사용자에게 발급된 모든 JWT 즉시 무효화(전 기기)',
      security: [{ bearerAuth: [] }],
    },
    // tokenVersion 을 증가시켜 이 사용자에게 발급된 모든 JWT 를 즉시 무효화한다
    // (모든 기기 로그아웃 semantics — 단일 세션 개념이 없는 개인용 앱이라 적절).
    handler: async (req, reply) => {
      await app.prisma.user.update({
        where: { id: req.user.userId },
        data: { tokenVersion: { increment: 1 } },
      });
      return reply.code(204).send();
    },
  });
};

export default authRoutes;
