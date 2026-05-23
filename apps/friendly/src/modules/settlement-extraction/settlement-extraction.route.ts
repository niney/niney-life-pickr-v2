import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ExtractReceiptInput,
  ExtractReceiptResult,
  Routes,
  UploadReceiptResult,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../ai/ai.config.service.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import {
  SettlementExtractionError,
  SettlementExtractionService,
  isValidImageToken,
} from './settlement-extraction.service.js';

const SE = Routes.SettlementExtraction;

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModel: env.OLLAMA_DEFAULT_MODEL,
});

const PreviewParams = z.object({ token: z.string().min(1) });

// 서비스 에러를 fastify-sensible 의 httpErrors 로 매핑한다. response schema 에
// 등록되지 않은 status code 를 typed 라우트에서 그냥 reply.code(n).send() 로
// 보내면 fastify-type-provider-zod 가 타입 거부.
const throwAsHttp = (app: FastifyInstance, e: SettlementExtractionError): never => {
  switch (e.code) {
    case 'invalid_image':
    case 'invalid_token':
      throw app.httpErrors.badRequest(e.message);
    case 'image_not_found':
    case 'restaurant_not_found':
      throw app.httpErrors.notFound(e.message);
    case 'no_provider':
      throw app.httpErrors.serviceUnavailable(e.message);
    case 'llm_failed':
    default:
      throw app.httpErrors.badGateway(e.message);
  }
};

const settlementExtractionRoutes: FastifyPluginAsync = async (app) => {
  const aiConfig = new AiConfigService(app.prisma, buildEnvBlock());
  const service = new SettlementExtractionService(aiConfig, { logger: app.log });
  const restaurantService = new RestaurantService(app.prisma);

  const typed = app.withTypeProvider<ZodTypeProvider>();

  // 업로드 — multipart 파일 하나만 허용. multipart 플러그인의 limits 가
  // 파일 크기/개수 한도를 강제한다 (5MB / 1 file).
  // typed 가 아닌 일반 app.post 로 등록: multipart 는 zod body 스키마와 호환되지
  // 않는다 (parser 가 별도). 응답 스키마는 수동으로 직렬화.
  app.post(SE.upload, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
    },
    handler: async (req) => {
      const file = await req.file();
      if (!file) {
        throw app.httpErrors.badRequest('파일이 필요합니다.');
      }
      const buffer = await file.toBuffer();
      if (file.file.truncated) {
        throw app.httpErrors.payloadTooLarge('파일이 너무 큽니다.');
      }
      try {
        const out = await service.storeImage(buffer);
        return UploadReceiptResult.parse(out);
      } catch (e) {
        if (e instanceof SettlementExtractionError) {
          return throwAsHttp(app, e);
        }
        throw e;
      }
    },
  });

  typed.post(SE.extract, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      body: ExtractReceiptInput,
      response: { 200: ExtractReceiptResult },
    },
    handler: async (req) => {
      const { imageToken, placeId } = req.body;
      const detail = await restaurantService.getPublicDetail(placeId);
      if (!detail) {
        throw app.httpErrors.notFound('식당을 찾을 수 없습니다.');
      }
      try {
        return await service.extract({
          imageToken,
          restaurantName: detail.name,
          menuNames: detail.menus.map((m) => m.name),
        });
      } catch (e) {
        if (e instanceof SettlementExtractionError) {
          return throwAsHttp(app, e);
        }
        throw e;
      }
    },
  });

  // 미리보기 — 토큰을 알면 (인증된 사용자) 누구든 볼 수 있다. 토큰 자체가
  // randomUUID 라 추측이 어렵고, 정산 세션 본인 외에는 토큰을 모른다.
  // typed 가 아닌 일반 app.get 으로 등록: body 가 binary 라 zod 응답 스키마
  // 와 맞지 않는다.
  app.get(SE.preview(':token'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['settlement'],
      security: [{ bearerAuth: [] }],
      params: PreviewParams,
    },
    handler: async (req, reply) => {
      const params = req.params as { token: string };
      const token = params.token;
      if (!isValidImageToken(token)) {
        throw app.httpErrors.badRequest('잘못된 토큰입니다.');
      }
      try {
        const buffer = await service.readImage(token);
        reply.header('Content-Type', 'image/jpeg');
        reply.header('Cache-Control', 'private, max-age=3600');
        return reply.send(buffer);
      } catch (e) {
        if (e instanceof SettlementExtractionError) {
          return throwAsHttp(app, e);
        }
        throw e;
      }
    },
  });
};

export default settlementExtractionRoutes;
