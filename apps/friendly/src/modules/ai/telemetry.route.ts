import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { LlmTelemetrySnapshot, Routes } from '@repo/api-contract';
import { llmTelemetry } from './llm-telemetry.js';

const AiRoutes = Routes.Ai;

// LLM 사용량 텔레메트리 — 어드민 전용, 표시 목적.
//
//   GET /admin/ai/telemetry         스냅샷 (초기 로드 / SSE 폴백)
//   GET /admin/ai/telemetry/stream  SSE — 호출 이벤트 발생 또는 활동 중일 때
//                                   1초 간격으로 전체 스냅샷을 push
//
// 전체 스냅샷을 매번 보내는 이유: 클라이언트가 패치 머지 없이 마지막
// 스냅샷만 렌더하면 되고, 크기도 수 KB 라 diff 프로토콜이 과설계다.
const telemetryRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(AiRoutes.telemetry, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: LlmTelemetrySnapshot },
    },
    handler: async () => llmTelemetry.snapshot(),
  });

  app.get(AiRoutes.telemetryStream, {
    schema: { tags: ['admin'] },
    handler: async (req, reply) => {
      // EventSource 는 커스텀 헤더를 못 보내므로 ?token= 쿼리 인증을 함께
      // 받는다 — analytics/auto-discover SSE 와 동일한 패턴.
      const rawQuery = req.query as { token?: string };
      let role: 'USER' | 'ADMIN' | null = null;
      try {
        await req.jwtVerify();
        role = req.user.role;
      } catch {
        if (typeof rawQuery.token === 'string' && rawQuery.token.length > 0) {
          try {
            const payload = app.jwt.verify(rawQuery.token) as { role: 'USER' | 'ADMIN' };
            role = payload.role;
          } catch {
            // ignore
          }
        }
      }
      if (role !== 'ADMIN') {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or missing token',
        });
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const writeNamed = (name: string, data: unknown): void => {
        try {
          reply.raw.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // ignore
        }
      };
      const writeComment = (c: string): void => {
        try {
          reply.raw.write(`: ${c}\n\n`);
        } catch {
          // ignore
        }
      };

      writeComment('connected');
      writeNamed('snapshot', llmTelemetry.snapshot());

      // 이벤트마다 즉시 쓰지 않고 dirty 플래그 + 1초 tick 으로 코얼레싱 —
      // 배치 요약처럼 초당 수십 건이 끝나는 구간에서 스트림이 홍수가 되는
      // 것을 막는다. 활동 중(active/큐 대기)에는 이벤트가 없어도 게이트
      // 상태가 변하므로 tick 마다 push.
      let dirty = false;
      const unsubscribe = llmTelemetry.subscribe(() => {
        dirty = true;
      });
      const tick = setInterval(() => {
        if (dirty || llmTelemetry.hasActivity()) {
          dirty = false;
          writeNamed('snapshot', llmTelemetry.snapshot());
        }
      }, 1_000);
      tick.unref?.();

      const heartbeat = setInterval(() => writeComment('hb'), 15_000);
      heartbeat.unref?.();

      const cleanup = (): void => {
        clearInterval(tick);
        clearInterval(heartbeat);
        unsubscribe();
        try {
          reply.raw.end();
        } catch {
          // ignore
        }
      };
      req.raw.on('close', cleanup);
    },
  });
};

export default telemetryRoutes;
