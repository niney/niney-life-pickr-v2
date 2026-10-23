import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fp from 'fastify-plugin';
import { env, isTest } from '../config/env.js';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../modules/ai/llm-provider-env.js';
import { FoodService } from '../modules/food/food.service.js';
import { FoodWebEstimateService } from '../modules/food/food-web-estimate.service.js';
import { MenuLlmMatchService } from '../modules/food/menu-llm-match.service.js';
import { MenuNutritionResolver } from '../modules/food/menu-nutrition.js';
import { sweepMealRecognitionDebugDumps } from '../modules/meal/meal-recognition-debug.store.js';
import { MealNutritionEstimator } from '../modules/meal/meal-nutrition-estimate.js';
import { MealPhotoService } from '../modules/meal/meal-photo.service.js';
import { scheduleRegistry } from '../modules/schedule/schedule-registry.js';

// 식단 사진 저장 서비스를 app 전역 singleton 으로 decorate — 라우트(업로드·조회·삭제)와
// 인식 라우트, 그리고 고아 사진 정리 cron 이 같은 인스턴스를 공유한다.
//
// 고아 정리: 사용자가 사진만 올리고 기록을 저장하지 않으면 파일이 남는다(영수증엔 없던 문제 —
// 식단은 업로드 빈도가 훨씬 높다). 매일 04:30 에 TTL 지난 미연결 사진을 파일까지 지운다.
const GC_CRON = '30 4 * * *';
const GC_JOB_TYPE = 'meal-photo-gc';

export default fp(
  async (app) => {
    // 테스트는 실제 업로드를 하므로 리포의 data/meal-photos 를 더럽히지 않게 임시 디렉터리로 보낸다.
    const mealPhotos = new MealPhotoService(app.prisma, {
      logger: app.log,
      ...(isTest ? { storageDir: join(tmpdir(), 'lifepickr-test-meal-photos') } : {}),
    });
    app.decorate('mealPhotos', mealPhotos);

    // 카탈로그에 없는 음식 이름의 열량 추정 — 저장 경로(식단 라우트)와 어드민 재시도가 같은 인스턴스(백그라운드 자리)를
    // 쓴다. LLM·웹은 맛집 메뉴 칼로리와 같은 서비스·캐시. 테스트는 외부 호출 없이 규칙 단계만.
    // aiConfig 는 autoload 순서에 기대지 않게 직접 만든다(plugins/food-import 관례).
    app.decorate(
      'mealNutritionEstimator',
      new MealNutritionEstimator({
        prisma: app.prisma,
        food: new FoodService(app.prisma),
        resolver: new MenuNutritionResolver(app.prisma),
        ...(isTest
          ? {}
          : {
              llm: new MenuLlmMatchService(app.prisma, new AiConfigService(app.prisma, buildLlmProviderEnv()), {
                model: env.OLLAMA_MENU_MATCH_MODEL,
                logger: app.log,
              }),
              web: new FoodWebEstimateService(app.prisma, { logger: app.log }),
            }),
        logger: app.log,
      }),
    );

    // 부팅 직후 1회 + 매일 — DB 고아 행뿐 아니라 DB 기록 전에 종료돼 파일만 남은 경우도 정리한다.
    const runPhotoGc = async (): Promise<void> => {
      await mealPhotos.drainDeletionOutbox();
      await mealPhotos.sweepOrphans();
      await mealPhotos.sweepUntrackedFiles();
      await sweepMealRecognitionDebugDumps();
    };
    void runPhotoGc().catch((e: unknown) => {
      app.log.warn({ err: e }, '[meal] photo gc failed');
    });
    scheduleRegistry.setCron(GC_JOB_TYPE, GC_CRON, 'Asia/Seoul', () => {
      void runPhotoGc().catch((e: unknown) => {
        app.log.warn({ err: e }, '[meal] photo gc failed');
      });
    });

    app.addHook('onClose', async () => {
      scheduleRegistry.clearCron(GC_JOB_TYPE);
    });
  },
  { name: 'meal', dependencies: ['prisma'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    mealPhotos: MealPhotoService;
    mealNutritionEstimator: MealNutritionEstimator;
  }
}
