import fp from 'fastify-plugin';
import { SummaryService } from '../modules/summary/summary.service.js';
import { ReviewSearchService } from '../modules/review-search/review-search.service.js';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { env } from '../config/env.js';

// SummaryService 를 app 전역 singleton 으로. 두 라우트(crawl/restaurant) 가
// 같은 chain map · cancelledPlaces 를 공유해야 어드민의 "요약 중지" 같은
// 동작이 양쪽 진입 경로에 일관되게 적용된다. 이전에는 각 라우트가 자체
// 인스턴스를 만들어 cancelSummaryForPlace 가 한쪽 chain 만 끊는 위험이 있었다.
//
// 의존: prisma(app.prisma) + logs(app.operationLog). JobLogService 퇴역 후
// 잡 단계 로그는 전부 plugins/logs.ts 의 OperationLogService 단일 인스턴스로
// 흐른다 — SSE seq 가 단일 카운터여야 클라이언트 (jobId, seq) dedup 이 로그를
// 드롭하지 않는다. dependencies 선언으로 autoload 가 두 플러그인을 선행 등록.
export default fp(
  async (app) => {
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: env.OLLAMA_CLOUD_API_KEY,
      baseUrl: env.OLLAMA_CLOUD_BASE_URL,
      timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
      maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
      defaultModels: {
        chat: env.OLLAMA_DEFAULT_MODEL,
        image: env.OLLAMA_IMAGE_MODEL,
        'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL,
      },
    });
    // review-search 도 app 전역 singleton — corpusCache(LRU)·enrich 진행상태를
    // 라우트·요약 훅이 한 인스턴스로 공유해야 한다. 요약 종료 시 자동 enrich 를
    // 위해 SummaryService 에 주입.
    const reviewSearch = new ReviewSearchService(app.prisma, aiConfig);
    const summaries = new SummaryService(app.prisma, aiConfig, {
      logger: app.log,
      operationLog: app.operationLog,
      reviewSearch,
    });

    app.decorate('summaries', summaries);
    app.decorate('aiConfig', aiConfig);
    app.decorate('reviewSearch', reviewSearch);
  },
  { name: 'summaries', dependencies: ['prisma', 'logs'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    summaries: SummaryService;
    aiConfig: AiConfigService;
    reviewSearch: ReviewSearchService;
  }
}
