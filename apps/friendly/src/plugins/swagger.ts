import fp from 'fastify-plugin';
import swagger, { type SwaggerTransform } from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import type { FastifyInstance, FastifySchema, RouteOptions } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { isDev } from '../config/env.js';
import { isAdminPath } from './cors.js';

// 외부용 문서(scripts/export-openapi.ts → docs/api/)가 읽는 확장 필드.
//  - x-auth: public(무인증) | optional(선택 인증) | user(Bearer 필수) | admin(어드민 — 외부 문서에서 제외)
//  - x-rate-limit: 라우트 프리셋 { max, timeWindow } — 없으면 전역 백스톱(분당 1000). max 가
//    런타임 설정(usage-quota)에서 오면 'dynamic'.
export type RouteAuth = 'public' | 'optional' | 'user' | 'admin';

const BEARER = [{ bearerAuth: [] }];

// 선택 인증 — 핸들러가 resolveOptionalUser 로 판정해(토큰이 있으면 회원 혜택, 없거나 무효면 게스트)
// 훅으로는 안 보이므로 라우트 schema 에 명시한다. OpenAPI 에서 빈 객체({})는 "인증 없이도 됨"이다.
export const OPTIONAL_BEARER: Array<Record<string, string[]>> = [{}, { bearerAuth: [] }];

const hooksOf = (route: RouteOptions): unknown[] =>
  [route.onRequest, route.preValidation, route.preHandler].flat().filter(Boolean);

const authOf = (app: FastifyInstance, route: RouteOptions, schema: FastifySchema | undefined): RouteAuth => {
  const hooks = hooksOf(route);
  // SSE 어드민 라우트는 핸들러 안에서 ?token= 을 검증해 훅이 없다 — 경로로 판정(어드민은 전부 이 prefix 아래).
  if (isAdminPath(route.url) || hooks.includes(app.requireAdmin)) return 'admin';
  if (hooks.includes(app.authenticate)) return 'user';
  // picks 처럼 플러그인 단위 addHook 으로 거는 라우트는 route 훅에 안 보이지만 security 를 명시해 둔다.
  const security = (schema as { security?: Array<Record<string, unknown>> } | undefined)?.security;
  if (security?.length) return security.some((s) => Object.keys(s).length === 0) ? 'optional' : 'user';
  return 'public';
};

const rateLimitOf = (route: RouteOptions): { max: number | 'dynamic'; timeWindow: string } | undefined => {
  const rl = (route.config as { rateLimit?: { max?: unknown; timeWindow?: unknown } } | undefined)?.rateLimit;
  if (!rl) return undefined;
  return {
    max: typeof rl.max === 'number' ? rl.max : 'dynamic',
    timeWindow: String(rl.timeWindow ?? '1 minute'),
  };
};

export default fp(async (app) => {
  const transform: SwaggerTransform = (input) => {
    const out = jsonSchemaTransform(input) as { schema: FastifySchema | undefined; url: string };
    const schema = (out.schema ?? {}) as FastifySchema & { hide?: boolean; security?: unknown[] };
    if (schema.hide) return { schema, url: out.url };
    const auth = authOf(app, input.route, input.schema);
    const rateLimit = rateLimitOf(input.route);
    return {
      url: out.url,
      schema: {
        ...schema,
        ...(auth !== 'public' && !schema.security ? { security: BEARER } : {}),
        'x-auth': auth,
        ...(rateLimit ? { 'x-rate-limit': rateLimit } : {}),
      } as FastifySchema,
    };
  };

  // 스펙 생성기는 모든 환경에 등록한다 — 라우트를 모아 app.swagger() 로 스펙을 만들 뿐 HTTP 로
  // 노출하지 않는다(노출은 swagger-ui). /docs(UI + 전체 스펙)는 어드민 표면까지 무인증으로
  // 드러내므로 dev 에서만 등록하고 prod/test 에선 404. 외부용(어드민 제외) 스펙은
  // `pnpm --filter friendly export:openapi` 가 docs/api/ 에 파일로 뽑는다.
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
    transform,
  });

  if (isDev) await app.register(swaggerUI, { routePrefix: '/docs' });
});
