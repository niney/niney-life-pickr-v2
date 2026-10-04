import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ExtractReceiptInput,
  ExtractReceiptResult,
  Routes,
  UploadReceiptResult,
} from '@repo/api-contract';
import { env, isTest } from '../../config/env.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { MealDailyQuotaService } from '../meal/meal-daily-quota.service.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { scheduleRegistry } from '../schedule/schedule-registry.js';
import { kstToday } from '../usage-quota/usage-quota.service.js';
import {
  SettlementExtractionError,
  SettlementExtractionService,
  cleanupUnreferencedReceipts,
  isValidImageToken,
} from './settlement-extraction.service.js';

const SE = Routes.SettlementExtraction;

const PreviewParams = z.object({ token: z.string().min(1) });

// 레이트리밋(라우트 로컬 프리셋 — plugins/rate-limit.ts 의 RATE 와 같은 형태). 둘 다 로그인 필요지만 가입이
// 무료라 계정을 늘려 비전 LLM·HEIC 디코드·디스크를 태울 수 있었다(PLAN-perf-2 G-3).
// 업로드 — 장당 1요청(차수마다 1장 + 재시도). HEIC 는 장당 디코드 ~1초라 분당 20.
const RECEIPT_UPLOAD_RATE = { max: 20, timeWindow: '1 minute' } as const;
// 추출 — 비전 LLM 1콜/요청. 한 사진 최대 5분할을 연속 호출해도 여유 있게 분당 20. 진짜 비용 방어선은 일일 한도.
const RECEIPT_EXTRACT_RATE = { max: 20, timeWindow: '1 minute' } as const;

// 미참조 영수증 정리 — 매일 04:20(KST). logs-retention 04:00·usage-quota GC 04:40 과 겹치지 않게.
const RETENTION_JOB_TYPE = 'receipts-retention';
const RETENTION_CRON = '20 4 * * *';
// 일일 한도 카운터의 용도 키(meal_daily_quotas 의 purpose — 사용자·날짜·용도별 원자 카운터).
const QUOTA_PURPOSE = 'settlement-extraction';

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
    case 'busy':
      throw app.httpErrors.serviceUnavailable(e.message);
    case 'quota':
      throw app.httpErrors.tooManyRequests(
        `오늘 영수증 추출 한도(${env.SETTLEMENT_EXTRACT_DAILY_LIMIT}회)를 모두 썼습니다. 항목을 직접 입력해 주세요.`,
      );
    case 'llm_failed':
    default:
      throw app.httpErrors.badGateway(e.message);
  }
};

const settlementExtractionRoutes: FastifyPluginAsync = async (app) => {
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const dailyQuota = new MealDailyQuotaService(app.prisma);
  // operationLog 주입 — extract 1회 = OperationRun 1개 계측. plugins/logs.ts
  // 가 라우트 autoload 보다 먼저 등록되므로 여기서 참조해도 안전하다.
  const service = new SettlementExtractionService(aiConfig, {
    logger: app.log,
    operationLog: app.operationLog,
    consumeQuota: (userId) =>
      dailyQuota.consume(userId, kstToday(), QUOTA_PURPOSE, env.SETTLEMENT_EXTRACT_DAILY_LIMIT),
  });
  const restaurantService = new RestaurantService(app.prisma);

  if (!isTest) {
    scheduleRegistry.setCron(RETENTION_JOB_TYPE, RETENTION_CRON, 'Asia/Seoul', () => {
      void cleanupUnreferencedReceipts(app.prisma, { logger: app.log }).catch((err: unknown) => {
        app.log.warn({ err }, '[settlement-extraction] receipt retention cleanup failed');
      });
    });
    app.addHook('onClose', async () => {
      scheduleRegistry.clearCron(RETENTION_JOB_TYPE);
    });
  }

  const typed = app.withTypeProvider<ZodTypeProvider>();

  // 업로드 — multipart 파일 하나만 허용. multipart 플러그인의 limits 가
  // 파일 크기/개수 한도를 강제한다 (5MB / 1 file).
  // typed 가 아닌 일반 app.post 로 등록: multipart 는 zod body 스키마와 호환되지
  // 않는다 (parser 가 별도). 응답 스키마는 수동으로 직렬화.
  app.post(SE.upload, {
    onRequest: [app.authenticate],
    config: { rateLimit: RECEIPT_UPLOAD_RATE },
    schema: {
      tags: ['settlement'],
      summary: '영수증 사진 업로드 — multipart 파일 1개(최대 5MB), imageToken 발급',
      description:
        'multipart/form-data 파일 1개(필드명 무관, 공식 클라이언트는 file). HEIC 도 받으며(최대 2,500만 화소) JPEG 로 정규화해 저장한다. ' +
        '받은 imageToken 으로 항목 추출(extract)과 정산 저장(rounds[].receiptImageToken)을 호출한다. ' +
        'IP 당 분당 20회, HEIC 변환이 밀리면 503. 어떤 정산·임시저장도 참조하지 않는 사진은 30일 뒤 지워진다.',
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
    config: { rateLimit: RECEIPT_EXTRACT_RATE },
    schema: {
      tags: ['settlement'],
      summary: '영수증 항목 추출 — 비전 LLM 1콜, 식당 메뉴를 힌트로 품목·금액·분류 반환',
      description:
        'placeId 필수(그 식당 등록 메뉴명을 프롬프트 힌트로 쓴다). 한 사진에 영수증이 여러 장이면 ' +
        'split(count·index)로 가로 N등분한 영역만 추출한다. 모델 미설정 503, LLM 실패 502. ' +
        '사용자 일일 한도(SETTLEMENT_EXTRACT_DAILY_LIMIT, 기본 50회·KST 자정 기준, 분할 추출은 영역마다 1회) 초과 시 429, IP 당 분당 20회.',
      security: [{ bearerAuth: [] }],
      body: ExtractReceiptInput,
      response: { 200: ExtractReceiptResult },
    },
    handler: async (req) => {
      const { imageToken, placeId, roundIndex, roundTotal, split } = req.body;
      // 추출은 식당명 + 메뉴명만 쓴다 — 3개 출처 리뷰 코퍼스까지 로드하는
      // getPublicDetail 대신 name/menus 만 뽑는 경량 getPublicSeoMeta 를 사용.
      const detail = await restaurantService.getPublicSeoMeta(placeId);
      if (!detail) {
        throw app.httpErrors.notFound('식당을 찾을 수 없습니다.');
      }
      // roundIndex 와 roundTotal 은 둘 다 있을 때만 의미가 있다 — 한쪽만 들어
      // 오면 무시. 범위 검증은 zod 에서 끝났지만 1<=index<=total 도 확인.
      const roundHint =
        roundIndex && roundTotal && roundIndex <= roundTotal
          ? { index: roundIndex, total: roundTotal }
          : undefined;
      try {
        return await service.extract({
          imageToken,
          restaurantName: detail.name,
          menuNames: detail.menus.map((m) => m.name),
          roundHint,
          split,
          // 작업 로그 subjectId — 식당 단위로 run 을 묶어 조회하기 위함.
          placeId,
          userId: req.user.userId,
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
      summary: '업로드한 영수증 사진 미리보기(image/jpeg) — JWT 필요',
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
