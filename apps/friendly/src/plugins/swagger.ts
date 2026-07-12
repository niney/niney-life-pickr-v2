import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { isDev } from '../config/env.js';

export default fp(async (app) => {
  // /docs(스웨거 UI)와 전체 OpenAPI 스펙은 어드민 전용을 포함한 API 표면 전체를
  // 무인증으로 드러낸다 — 개발에서만 등록하고 prod/test 에선 미등록(/docs → 404).
  // 운영에서 열람이 필요하면 requireAdmin 게이트를 붙여 재도입한다.
  if (!isDev) return;
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Friendly API',
        description: 'Life Pickr backend API',
        version: '0.0.1',
      },
      servers: [{ url: 'http://localhost:3000' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUI, { routePrefix: '/docs' });
});
