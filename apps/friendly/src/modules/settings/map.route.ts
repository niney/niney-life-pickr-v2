import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  MapProviderConfig as MapProviderConfigSchema,
  MapProviderId,
  MapProviderListResult,
  MapProviderPublicConfig,
  MapProviderSecret,
  Routes,
  UpdateMapProviderInput,
  type MapProviderIdType,
} from '@repo/api-contract';
import { MapSettingsService } from './map.service.js';

const MapRoutes = Routes.SettingsMap;
const ProviderParams = z.object({ id: MapProviderId });

const settingsMapRoutes: FastifyPluginAsync = async (app) => {
  const service = new MapSettingsService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(MapRoutes.list, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: MapProviderListResult },
    },
    handler: async () => ({ providers: await service.list() }),
  });

  typed.put(MapRoutes.provider(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      body: UpdateMapProviderInput,
      response: { 200: MapProviderConfigSchema },
    },
    handler: async (req) => {
      try {
        return await service.update(
          req.params.id as MapProviderIdType,
          req.body,
          req.user.userId,
        );
      } catch (e) {
        if (e instanceof Error && e.message.includes('apiKey is required')) {
          throw app.httpErrors.badRequest('API 키가 필요합니다.');
        }
        throw e;
      }
    },
  });

  typed.delete(MapRoutes.provider(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
    },
    handler: async (req, reply) => {
      await service.remove(req.params.id as MapProviderIdType);
      return reply.code(204).send();
    },
  });

  // 평문 키 노출 — vworld JS SDK init URL 에 그대로 박아 호출해야 한다.
  // admin 가드만 통과하면 평문 반환. 일반 사용자는 절대 도달 불가.
  typed.get(MapRoutes.secret(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: ProviderParams,
      response: { 200: MapProviderSecret },
    },
    handler: async (req) => service.getSecret(req.params.id as MapProviderIdType),
  });

  // 공개 — 맛집 지도 페이지가 vworld WMTS 호출에 쓸 키. WMTS 키는 어차피 브라
  // 우저 Network 탭에 노출되므로 admin secret 과 보안 등급이 동등 — 단지 공개
  // 페이지가 admin guard 를 통과 못 하니 라우트만 분리. 키 미등록이면 404.
  typed.get(MapRoutes.publicConfig, {
    schema: {
      tags: ['public'],
      response: { 200: MapProviderPublicConfig },
    },
    handler: async () => {
      const secret = await service.getSecret('vworld');
      if (!secret.apiKey) {
        throw app.httpErrors.notFound('지도 키가 등록되지 않았습니다.');
      }
      return { provider: 'vworld' as const, apiKey: secret.apiKey };
    },
  });
};

export default settingsMapRoutes;
