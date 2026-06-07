import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import autoLoad from '@fastify/autoload';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isDev } from './config/env.js';
import { registerRestaurantPreview } from './modules/restaurant/restaurant-preview.js';
import { registerSharePreview } from './modules/settlement/share-preview.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(opts: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // graceful shutdown 시 idle keep-alive 연결을 즉시 닫아 app.close() 가
    // 매달리지 않게 한다(처리 중인 요청은 그대로 완료 대기). SIGTERM 핸들러의
    // 스케줄러 정리 후 close 가 지연되는 것을 막는다.
    forceCloseConnections: 'idle',
    logger: {
      level: env.LOG_LEVEL,
      // Redact `?token=...` (used by EventSource for SSE auth — EventSource
      // can't send custom headers). Without this the JWT would land in
      // every request log line.
      serializers: {
        req: (req) => ({
          method: req.method,
          url:
            typeof req.url === 'string'
              ? req.url.replace(/([?&]token=)[^&]+/i, '$1[REDACTED]')
              : req.url,
          hostname: req.hostname,
          remoteAddress: req.ip,
          remotePort: req.socket?.remotePort,
        }),
      },
      ...(isDev && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }),
    },
    ...opts,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(autoLoad, {
    dir: join(__dirname, 'plugins'),
  });

  await app.register(autoLoad, {
    dir: join(__dirname, 'modules'),
    matchFilter: /\.route\.(ts|js)$/,
    dirNameRoutePrefix: false,
  });

  // 정산 공유 링크 OG 미리보기 — `/api/v1` prefix 밖의 루트 경로
  // (/share/settlements/:token, /s/:token) 를 직접 등록한다.
  await registerSharePreview(app);
  // 맛집 공유/SEO 대표 URL — `/r/:placeId` 를 상세 단독 HTML 로 응답한다.
  await registerRestaurantPreview(app);

  return app;
}
