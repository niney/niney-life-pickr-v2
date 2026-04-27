import type { FastifyPluginAsync } from 'fastify';
import { Routes } from '@repo/api-contract';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(Routes.Health, {
    schema: { tags: ['health'] },
    handler: async () => ({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  });

  app.get('/health', {
    schema: { tags: ['health'], hide: true },
    handler: async () => ({ status: 'ok' }),
  });
};

export default healthRoutes;
