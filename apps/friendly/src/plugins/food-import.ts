import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../modules/ai/llm-provider-env.js';
import { FoodClassifyService } from '../modules/food/food-classify.service.js';
import { FoodImportService } from '../modules/food/food-import.service.js';

// 음식 카탈로그 적재 잡(food-import). FoodImportService 를 app 전역 singleton 으로 decorate —
// 라우트(설정/지금 실행/SSE)와 부팅 cron tick 이 같은 인스턴스를 공유한다. cron 타이머는
// scheduleRegistry(모듈 singleton)에 jobType 'food-import' 로 등록되어 schedule/random-crawl 과
// 키만 다르게 공존한다. LLM 2축 분류는 chat purpose(AiConfigService 를 여기서 직접 조립 —
// autoload 순서상 summaries 플러그인의 app.aiConfig 보다 먼저 로드되므로).
//
// 외부 키: data.go.kr 표준데이터는 DATA_GO_KR_API_KEY(계정당 1키), 식품안전나라는
// FOOD_RECIPE_API_KEY, MAFRA 는 MAFRA_API_KEY. 비어 있으면 그 소스는 회차에서 오류로 기록·건너뜀.
export default fp(
  async (app) => {
    const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
    const classify = new FoodClassifyService(app.prisma, aiConfig, { logger: app.log });
    const foodImport = new FoodImportService(app.prisma, {
      keys: {
        nutrition: env.DATA_GO_KR_API_KEY,
        recipe: env.FOOD_RECIPE_API_KEY,
        mafra: env.MAFRA_API_KEY,
      },
      classify,
      logger: app.log,
      operationLog: app.operationLog,
    });

    app.decorate('foodImport', foodImport);
    app.decorate('foodClassify', classify);

    app.addHook('onClose', async () => {
      foodImport.shutdown();
    });
  },
  { name: 'food-import', dependencies: ['prisma', 'logs'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    foodImport: FoodImportService;
    foodClassify: FoodClassifyService;
  }
}
