import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Routes,
  TelegramChatIdResult,
  TelegramConfig,
  TelegramTestResult,
  UpdateTelegramConfigInput,
} from '@repo/api-contract';

const T = Routes.SettingsTelegram;

const settingsTelegramRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  // plugins/random-crawl.ts 가 decorate 한 전역 인스턴스 — 폴링 봇과 같은
  // TelegramService 를 공유하므로 저장 즉시 폴러에 반영된다.
  const service = app.telegramConfig;

  // 설정 조회 (마스킹).
  typed.get(T.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: TelegramConfig },
    },
    handler: async () => service.getConfig(),
  });

  // 설정 변경 — botToken/chatId set·보존.
  typed.put(T.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: UpdateTelegramConfigInput,
      response: { 200: TelegramConfig },
    },
    handler: async (req) => service.update(req.body, req.user.userId),
  });

  // DB 설정 삭제 → .env fallback 으로 복귀.
  typed.delete(T.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
    },
    handler: async (_req, reply) => {
      await service.clear();
      return reply.code(204).send();
    },
  });

  // 연결 테스트 — getMe → getChat → 테스트 메시지.
  typed.post(T.test, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: TelegramTestResult },
    },
    handler: async () => service.test(),
  });

  // chat_id 자동 탐색 — 폴러를 잠시 멈추고 message 롱폴(~25초). 클라이언트는
  // 충분한 타임아웃으로 호출하고, 그 사이 사용자가 봇에 메시지를 보내야 한다.
  typed.post(T.resolveChatId, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: TelegramChatIdResult },
    },
    handler: async () => service.resolveChatId(),
  });
};

export default settingsTelegramRoutes;
