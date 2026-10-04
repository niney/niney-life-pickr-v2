import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import autoLoad from '@fastify/autoload';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Routes } from '@repo/api-contract';
import { env, isDev, isTest } from './config/env.js';
import { registerRestaurantPreview } from './modules/restaurant/restaurant-preview.js';
import { registerSharePreview } from './modules/settlement/share-preview.js';
import { registerVotePreview } from './modules/vote/vote-preview.js';
import { registerTarotPreview } from './modules/tarot/tarot-preview.js';
import { registerSajuPreview } from './modules/saju/saju-preview.js';
import { registerSajuGPreview } from './modules/saju-g/saju-g-preview.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// EventSource 는 헤더를 못 보내 SSE 인증 토큰이 ?token= 으로 온다 — 로그에 JWT 가 남지 않게 가린다.
const redactToken = (url: string): string => url.replace(/([?&]token=)[^&]+/i, '$1[REDACTED]');

// 이 시간 이상 걸린 요청은 warn 으로 실제 URL 까지 남긴다(SSE 제외).
const SLOW_REQUEST_MS = 500;

// 큰 지도·목록 응답은 zod 응답 직렬화(safeParse 로 객체를 통째로 복사·검증한 뒤 stringify)가 JSON.stringify 의
// 3~4배라 요청마다 이벤트 루프를 수십 ms 막는다(집값 points 1.1MB: 21ms vs 5ms, 라우트 전체 ~95ms — docs/PLAN-perf-2.md
// X-6). 서비스가 스키마 모양 그대로 만드는 아래 라우트의 200 응답만 운영에서 zod 를 건너뛴다. zod 는 스키마 밖 필드를
// 걸러 주는 역할도 하므로, 테스트 환경에서는 응답마다 두 출력이 같은지 확인해(다르면 throw) 모양이 어긋나는 변경을 잡는다.
const TRUSTED_RESPONSE_ROUTES = new Set([
  `GET ${Routes.Housing.points}`,
  `GET ${Routes.LifeMap.points}`,
  `GET ${Routes.Parking.evPoints}`,
  `GET ${Routes.Parking.lotPoints}`,
  `GET ${Routes.Restaurant.publicList}`,
]);

const sameJson = (a: string, b: string): boolean => {
  const eq = (x: unknown, y: unknown): boolean => {
    if (x === y) return true;
    if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false;
    if (Array.isArray(x) !== Array.isArray(y)) return false;
    const kx = Object.keys(x as object);
    const ky = Object.keys(y as object);
    if (kx.length !== ky.length) return false;
    return kx.every((k) => eq((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k]));
  };
  return eq(JSON.parse(a), JSON.parse(b));
};

export async function buildApp(opts: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // graceful shutdown 시 idle keep-alive 연결을 즉시 닫아 app.close() 가
    // 매달리지 않게 한다(처리 중인 요청은 그대로 완료 대기). SIGTERM 핸들러의
    // 스케줄러 정리 후 close 가 지연되는 것을 막는다.
    forceCloseConnections: 'idle',
    // 배포는 Cloudflare→nginx→앱 구성 — nginx 가 X-Forwarded-For 를 세팅하므로
    // req.ip 가 프록시(127.0.0.1)가 아니라 실제 클라이언트 IP 가 되게 신뢰한다.
    // 이게 없으면 per-IP 레이트리밋이 전체 사용자 단일 버킷으로 붕괴한다.
    // (dev/test 는 XFF 헤더가 없어 영향 없음.) 스푸핑 방지는 :3000 방화벽 전제.
    trustProxy: true,
    // 기본 요청 로그(요청마다 incoming/completed 2줄, IP·쿼리 포함)는 끄고 아래 onResponse 1줄로 대신한다.
    disableRequestLogging: true,
    logger: {
      level: env.LOG_LEVEL,
      // Redact `?token=...` (used by EventSource for SSE auth — EventSource
      // can't send custom headers). Without this the JWT would land in
      // every request log line.
      serializers: {
        req: (req) => ({
          method: req.method,
          url: typeof req.url === 'string' ? redactToken(req.url) : req.url,
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
  app.setSerializerCompiler((route) => {
    const zodSerialize = serializerCompiler(route as Parameters<typeof serializerCompiler>[0]);
    if (Number(route.httpStatus) !== 200 || !TRUSTED_RESPONSE_ROUTES.has(`${route.method} ${route.url}`)) {
      return zodSerialize;
    }
    if (isTest) {
      return (data: unknown) => {
        const viaZod = zodSerialize(data);
        if (!sameJson(viaZod, JSON.stringify(data))) {
          throw new Error(`[serializer] ${route.url} 응답이 스키마 모양과 달라 zod 생략을 쓸 수 없다`);
        }
        return viaZod;
      };
    }
    return (data: unknown) => JSON.stringify(data);
  });

  // 요청 로그 1줄 — 라우트 패턴·상태·ms 만(IP·쿼리 없음)이라 로그 양이 줄고 경로별 집계는 쉬워진다
  // (운영 로그 분석으로 재시작 원인을 찾은 근거라 끄지 않는다 — docs/PLAN-perf-2.md X-7). 느린 요청은
  // warn 으로 실제 URL(토큰 가림)까지 남긴다. SSE 는 연결 시간이 응답 시간이라 느림 판정에서 뺀다.
  app.addHook('onResponse', async (req, reply) => {
    const ms = Math.round(reply.elapsedTime);
    const route = req.routeOptions.url ?? '(no-route)';
    const sse = String(reply.getHeader('content-type') ?? '').startsWith('text/event-stream');
    if (!sse && ms >= SLOW_REQUEST_MS) {
      req.log.warn({ m: req.method, route, url: redactToken(req.url), status: reply.statusCode, ms }, 'slow request');
    } else {
      req.log.info({ m: req.method, route, status: reply.statusCode, ms }, 'req');
    }
  });

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
  // 그룹 투표 공유 링크 OG — /vote/:token (nginx `^~ /vote/` 프록시 필요, 없으면
  // SPA 는 동작하고 OG 만 부재).
  await registerVotePreview(app);

  // 타로 공유 링크 OG + 공유 이미지 — /tarot/s/:token(/image.png). nginx `^~ /tarot/s/` 프록시 필요.
  await registerTarotPreview(app);
  // 사주 공유 링크 OG + 공유 이미지 — /saju-c/s/:token(/image.png). nginx `^~ /saju-c/s/` 프록시 필요.
  await registerSajuPreview(app);
  await registerSajuGPreview(app);

  return app;
}
