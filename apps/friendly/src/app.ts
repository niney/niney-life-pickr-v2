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
import { registerSharePreview } from './modules/settlement/share-preview.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(opts: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Redact `?token=...` (used by EventSource for SSE auth — EventSource
      // can't send custom headers). Without this the JWT would land in
      // every request log line.
      serializers: {
        req: (req) => ({
          method: req.method,
          url: typeof req.url === 'string'
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

  return app;
}
