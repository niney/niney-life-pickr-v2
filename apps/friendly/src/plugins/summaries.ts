import fp from 'fastify-plugin';
import { SummaryService } from '../modules/summary/summary.service.js';
import { JobLogService } from '../modules/crawl/job-log.service.js';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { jobRegistry } from '../modules/crawl/job-registry.js';
import { env } from '../config/env.js';

// SummaryService 와 JobLogService 를 app 전역 singleton 으로. 두 라우트(crawl/
// restaurant) 가 같은 chain map · cancelledPlaces 를 공유해야 어드민의 "요약
// 중지" 같은 동작이 양쪽 진입 경로에 일관되게 적용된다. 이전에는 각 라우트
// 가 자체 인스턴스를 만들어 cancelSummaryForPlace 가 한쪽 chain 만 끊는 위험
// 이 있었다.
//
// 의존: prisma 플러그인이 먼저 등록되어야 한다 (app.prisma 필요). plugins 디렉
// 토리는 autoload 순서가 알파벳 순이므로 'p' < 's' 라 prisma 가 먼저 잡힌다.
export default fp(
  async (app) => {
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: env.OLLAMA_CLOUD_API_KEY,
      baseUrl: env.OLLAMA_CLOUD_BASE_URL,
      timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
      maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
      defaultModel: env.OLLAMA_DEFAULT_MODEL,
    });
    const jobLog = new JobLogService(app.prisma, jobRegistry, undefined, app.log);
    const summaries = new SummaryService(app.prisma, aiConfig, {
      logger: app.log,
      jobLog,
    });

    app.decorate('summaries', summaries);
    app.decorate('jobLog', jobLog);
    app.decorate('aiConfig', aiConfig);
  },
  { name: 'summaries', dependencies: ['prisma'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    summaries: SummaryService;
    jobLog: JobLogService;
    aiConfig: AiConfigService;
  }
}
