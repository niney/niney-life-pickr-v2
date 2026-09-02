import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Routes,
  UpdateUsageQuotaSettingInput,
  UsageQuotaFeature,
  UsageQuotaOverview,
  UsageQuotaOverviewQuery,
  UsageQuotaSetting,
} from '@repo/api-contract';

// 공용 사용량 한도 — 어드민 "설정 > 사용량 한도". 설정 + 그날 사용량 조회, 기능별 부분 갱신.
// 소비(consume)는 각 기능 라우트가 app.usageQuota 로 직접 한다.

const Q = Routes.UsageQuota;

const usageQuotaRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Q.overview, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: UsageQuotaOverviewQuery,
      response: { 200: UsageQuotaOverview },
    },
    handler: async (req) => {
      const date = req.query.date ?? app.usageQuota.today();
      const settings = await app.usageQuota.listSettings();
      const items = await Promise.all(
        settings.map(async (setting) => ({
          setting,
          usage: await app.usageQuota.usage(setting.feature, date),
        })),
      );
      return { date, items };
    },
  });

  typed.put(Q.setting(':feature'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ feature: UsageQuotaFeature }),
      body: UpdateUsageQuotaSettingInput,
      response: { 200: UsageQuotaSetting },
    },
    handler: async (req) => app.usageQuota.updateSetting(req.params.feature, req.body, req.user.userId),
  });
};

export default usageQuotaRoutes;
