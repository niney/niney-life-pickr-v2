import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fp from 'fastify-plugin';
import { env, isTest } from '../config/env.js';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../modules/ai/llm-provider-env.js';
import { FoodService } from '../modules/food/food.service.js';
import { FoodNutrientRefService } from '../modules/food/food-nutrient-ref.service.js';
import { FoodWebEstimateService } from '../modules/food/food-web-estimate.service.js';
import { MenuCompositionService } from '../modules/food/menu-composition.service.js';
import { MenuLlmMatchService } from '../modules/food/menu-llm-match.service.js';
import { MenuNutritionResolver } from '../modules/food/menu-nutrition.js';
import { sweepMealRecognitionDebugDumps } from '../modules/meal/meal-recognition-debug.store.js';
import { MealNutritionEstimator } from '../modules/meal/meal-nutrition-estimate.js';
import { MealPhotoService } from '../modules/meal/meal-photo.service.js';
import { MealPlaceMenuService } from '../modules/meal/meal-place-menu.service.js';
import { RestaurantService } from '../modules/restaurant/restaurant.service.js';
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
    // 규칙 엔진(카탈로그 인덱스)과 음식 서비스(어휘 캐시)는 이름 추정과 식당 메뉴 조회가 한 벌을 같이 쓴다.
    const food = new FoodService(app.prisma);
    const resolver = new MenuNutritionResolver(app.prisma);
    app.decorate(
      'mealNutritionEstimator',
      new MealNutritionEstimator({
        prisma: app.prisma,
        food,
        resolver,
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

    // 식당 메뉴에서 넣기 — 기록에 식당이 정해지면 그 집 메뉴를 넣을 음식(표준명·분류·1인분 열량)으로 바꿔 준다.
    // 응답은 DB 만 읽는다. 메뉴 목록은 공개 상세와 같은 스냅샷 병합(네이버 → 테이블링 → 다이닝코드).
    // 코스·세트의 구성(설명에 적힌 음식 나열·택1)은 LLM 이 글마다 한 번 읽어 저장한다 — 응답 뒤 백그라운드에서,
    // 메뉴 칼로리 매칭과 같은 chat 용도·모델. 테스트는 외부 호출 없이 구성 읽기 없이 돈다.
    const restaurants = new RestaurantService(app.prisma);
    app.decorate(
      'mealPlaceMenus',
      new MealPlaceMenuService({
        prisma: app.prisma,
        food,
        resolver,
        estimator: app.mealNutritionEstimator,
        ...(isTest
          ? {}
          : {
              compositions: new MenuCompositionService(
                app.prisma,
                new AiConfigService(app.prisma, buildLlmProviderEnv()),
                { model: env.OLLAMA_MENU_MATCH_MODEL, logger: app.log },
              ),
            }),
        loadPlace: async (placeId) => {
          const meta = await restaurants.getPublicSeoMeta(placeId);
          return meta ? { name: meta.name, menus: meta.menus } : null;
        },
        logger: app.log,
      }),
    );

    // 영양 기준 음식 — 영양소 점검(resolveIds, 규칙)과 식단 저장 뒤 백그라운드 연결(schedule, 규칙 → LLM)이 같은
    // 인스턴스를 쓴다(후보 메모·대기열 공유). LLM 은 메뉴 칼로리 매칭과 같은 chat 용도·모델. 테스트는 규칙만.
    app.decorate(
      'foodNutrientRefs',
      new FoodNutrientRefService(
        app.prisma,
        isTest
          ? {}
          : {
              aiConfig: new AiConfigService(app.prisma, buildLlmProviderEnv()),
              model: env.OLLAMA_MENU_MATCH_MODEL,
              logger: app.log,
            },
      ),
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
    mealPlaceMenus: MealPlaceMenuService;
    foodNutrientRefs: FoodNutrientRefService;
  }
}
