import fp from 'fastify-plugin';
import { SummaryService } from '../modules/summary/summary.service.js';
import { ReviewSearchService } from '../modules/review-search/review-search.service.js';
import { ReviewClusteringService } from '../modules/review-clustering/review-clustering.service.js';
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
    // review-clustering 도 전역 singleton — 라우트·enrich 완료 훅이 같은 인스턴스를
    // 공유해야 진행 가드(인메모리 Set)가 의미를 가진다.
    const reviewClustering = new ReviewClusteringService(app.prisma, aiConfig);
    const summaries = new SummaryService(app.prisma, aiConfig, {
      logger: app.log,
      operationLog: app.operationLog,
      reviewSearch,
    });

    // enrich 완료 → 자동 군집화 체이닝(이벤트 배선). 요약 훅의 enrich 뿐 아니라 어드민
    // 단건/일괄 enrich 완료에도 이어진다. 과거엔 요약 훅이 enrich→군집을 순차 await 했는데,
    // enrich 가 이미 진행 중이면(다소스 요약 경합·어드민 enrich) no-op 즉시 반환 → 군집화가
    // 미완 코퍼스 위에서 돌아 스킵된 뒤 재시도가 없어 영영 "대기"로 남았다. 완료 이벤트
    // 기준이면 항상 최종 코퍼스 위에서 돈다(게이트·중복 가드는 서비스 내부가 처리).
    reviewSearch.onEnrichProgress((e) => {
      if (!e.done) return;
      void reviewClustering.ensureClusteredByRestaurantId(e.restaurantId).catch((err) => {
        app.log.warn({ err, restaurantId: e.restaurantId }, '[clustering] enrich 후 자동 군집화 실패');
      });
    });
    // 기동 리컨실 — 재시작/배포로 끊긴 자동 체인·클러스터 버전 범프로 남은 미군집 백로그 자체 회복.
    app.addHook('onReady', async () => {
      reviewClustering.scheduleStartupReconcile(app.log);
    });

    app.decorate('summaries', summaries);
    app.decorate('aiConfig', aiConfig);
    app.decorate('reviewSearch', reviewSearch);
    app.decorate('reviewClustering', reviewClustering);
  },
  { name: 'summaries', dependencies: ['prisma', 'logs'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    summaries: SummaryService;
    aiConfig: AiConfigService;
    reviewSearch: ReviewSearchService;
    reviewClustering: ReviewClusteringService;
  }
}
