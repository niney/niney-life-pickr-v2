import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  MENU_BOARD_MAX_UPLOAD_MB,
  MenuBoardEvalResponse,
  MenuBoardReadResult,
  MenuBoardSamplesResponse,
  Routes,
} from '@repo/api-contract';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import {
  MenuBoardError,
  MenuBoardService,
  listMenuBoardSamples,
  readMenuBoardEvalReport,
  readMenuBoardSampleImage,
} from './menu-board.service.js';

// 메뉴판 읽기 — 어드민 테스트 페이지(/admin/menu-board). 사진 → 비전 LLM(purpose menu-board) 메뉴 목록,
// 수집 샘플(data/menu-boards)과 회귀 평가 리포트(eval:menu-boards)를 보여 준다.

const MB = Routes.MenuBoard;

// 비전 LLM 1콜/요청 — 어드민 전용이라 넉넉히.
const READ_RATE = { max: 20, timeWindow: '1 minute' } as const;

const SampleParams = z.object({ key: z.string().min(1).max(80) });

const throwAsHttp = (app: FastifyInstance, e: MenuBoardError): never => {
  switch (e.code) {
    case 'invalid_image':
      throw app.httpErrors.badRequest(e.message);
    case 'no_provider':
      throw app.httpErrors.serviceUnavailable(e.message);
    case 'llm_failed':
    case 'parse_failed':
    default:
      throw app.httpErrors.badGateway(e.message);
  }
};

const menuBoardRoutes: FastifyPluginAsync = async (app) => {
  const service = new MenuBoardService(new AiConfigService(app.prisma, buildLlmProviderEnv()));
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // multipart 는 zod body 스키마와 맞지 않아 일반 app.post — 응답은 수동으로 검증한다.
  app.post(MB.read, {
    onRequest: [app.authenticate, app.requireAdmin],
    config: { rateLimit: READ_RATE },
    schema: {
      tags: ['admin'],
      summary: '메뉴판 사진 읽기 — multipart 파일 1개, 비전 LLM 이 메뉴·가격·설명 목록으로',
      security: [{ bearerAuth: [] }],
    },
    handler: async (req) => {
      // 메뉴판 원본은 영수증보다 커서(캐치테이블 사진 최대 9MB) 전역 한도(5MB) 대신 이 라우트 한도로 받는다.
      const file = await req.file({ limits: { fileSize: MENU_BOARD_MAX_UPLOAD_MB * 1024 * 1024 } });
      if (!file) throw app.httpErrors.badRequest('파일이 필요합니다.');
      const buffer = await file.toBuffer();
      if (file.file.truncated) {
        throw app.httpErrors.payloadTooLarge(`파일이 너무 큽니다(최대 ${MENU_BOARD_MAX_UPLOAD_MB}MB).`);
      }
      try {
        return MenuBoardReadResult.parse(await service.read(buffer));
      } catch (e) {
        if (e instanceof MenuBoardError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.get(MB.samples, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      summary: '메뉴판 샘플 사진 목록(collect:menu-boards 로 받아 둔 캐치테이블 메뉴판)',
      security: [{ bearerAuth: [] }],
      response: { 200: MenuBoardSamplesResponse },
    },
    handler: async () => ({ samples: await listMenuBoardSamples() }),
  });

  // 본문이 바이너리라 일반 app.get.
  app.get(MB.sampleImage(':key'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      summary: '메뉴판 샘플 사진 원본',
      security: [{ bearerAuth: [] }],
      params: SampleParams,
    },
    handler: async (req, reply) => {
      const { key } = req.params as z.infer<typeof SampleParams>;
      const image = await readMenuBoardSampleImage(key);
      if (!image) throw app.httpErrors.notFound('샘플 사진이 없습니다.');
      reply.header('Content-Type', image.contentType);
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(image.buffer);
    },
  });

  typed.get(MB.evalReport, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      summary: '메뉴판 읽기 회귀 평가 리포트(eval:menu-boards 가 남긴 마지막 결과, 없으면 null)',
      security: [{ bearerAuth: [] }],
      response: { 200: MenuBoardEvalResponse },
    },
    handler: async () => ({ report: await readMenuBoardEvalReport() }),
  });
};

export default menuBoardRoutes;
