import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { env } from '../config/env.js';

export default fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.unauthorized('Invalid or missing token');
    }
    // 발급 후 무효화(로그아웃·비밀번호 변경)와 권한 변경을 반영 — 현재 tokenVersion·
    // role 을 DB 에서 확인한다. 인증 요청 볼륨은 낮고(공개 고volume 라우트는 무인증)
    // SQLite PK 조회는 저비용이라 캐시 없이 매 요청 확인해 즉시 무효화를 보장한다.
    const fresh = await app.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { tokenVersion: true, role: true },
    });
    if (!fresh || fresh.tokenVersion !== (request.user.tv ?? 0)) {
      return reply.unauthorized('Session expired');
    }
    // requireAdmin 이 최신 role 을 보게 갱신(강등/승격 즉시 반영 — JWT role 클레임은 참고용).
    request.user.role = fresh.role;
  });

  // 공개 라우트의 옵셔널 인증 — Authorization 이 있고 유효(tokenVersion 무효화 반영)하면
  // 사용자, 아니면 null. 회원 혜택(익명 한도 면제·자동 저장) 판정용이지 접근 제어가 아니다
  // — 접근 제어는 authenticate. 무효 토큰도 401 이 아니라 "게스트" 로 취급한다.
  app.decorate('resolveOptionalUser', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      return null;
    }
    const fresh = await app.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { tokenVersion: true, role: true },
    });
    if (!fresh || fresh.tokenVersion !== (request.user.tv ?? 0)) return null;
    return { userId: request.user.userId, role: fresh.role };
  });

  app.decorate('requireAdmin', async (request, reply) => {
    if (request.user?.role !== 'ADMIN') {
      return reply.forbidden('Admin role required');
    }
  });

  // SSE 등 쿼리 토큰(?token=, EventSource 는 헤더 불가) 또는 Authorization 헤더에서
  // 어드민을 확인하고 tokenVersion 무효화를 반영한다. 유효한 어드민이면 최신 role,
  // 아니면 null. (기존 3곳의 중복된 수동 검증 블록을 대체.)
  app.decorate('resolveSseAdmin', async (request) => {
    let payload: { userId: string; tv?: number } | null = null;
    try {
      await request.jwtVerify();
      payload = { userId: request.user.userId, tv: request.user.tv };
    } catch {
      const q = request.query as { token?: string };
      if (typeof q?.token === 'string' && q.token.length > 0) {
        try {
          payload = app.jwt.verify(q.token) as { userId: string; tv?: number };
        } catch {
          // 무효 토큰 — 아래에서 null 처리.
        }
      }
    }
    if (!payload?.userId) return null;
    const fresh = await app.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { tokenVersion: true, role: true },
    });
    if (!fresh || fresh.tokenVersion !== (payload.tv ?? 0) || fresh.role !== 'ADMIN') {
      return null;
    }
    return { userId: payload.userId, role: fresh.role };
  });
});
