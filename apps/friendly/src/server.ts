import { buildApp } from './app.js';
import { env } from './config/env.js';
import {
  cleanupStaleReviewSummaries,
  rescheduleStaleSummaries,
  SummaryService,
} from './modules/summary/summary.service.js';
import { AiConfigService } from './modules/ai/ai.config.service.js';

const start = async (): Promise<void> => {
  try {
    const app = await buildApp();

    // 1) 직전 인스턴스에서 진행 중이던 queued/pending/running 행을 모두
    //    failed/server_restart 로 마킹. cleanup 끝나야 DB 가 깨끗한 상태에서
    //    listen 시작.
    await cleanupStaleReviewSummaries(app.prisma, app.log);

    // 2) 방금 server_restart 로 마킹된 행들 + 이전부터 남아있던 server_restart
    //    행들을 placeId 별로 묶어 자동 재큐잉. 라우트의 SummaryService 와는
    //    별개 인스턴스지만 summaryEventsBus 가 module singleton 이라 진행도
    //    SSE 는 어드민 UI 에 그대로 흘러간다. listen 전에 enqueue 만 해 두면
    //    이후 LLM 호출은 백그라운드로 진행.
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: env.OLLAMA_CLOUD_API_KEY,
      baseUrl: env.OLLAMA_CLOUD_BASE_URL,
      timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
      maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
      defaultModel: env.OLLAMA_DEFAULT_MODEL,
    });
    const bootSummaries = new SummaryService(app.prisma, aiConfig, {
      logger: app.log,
    });
    await rescheduleStaleSummaries(app.prisma, bootSummaries, app.log);

    await app.listen({ port: env.PORT, host: env.HOST });

    const shutdown = async (signal: string): Promise<void> => {
      app.log.info(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

void start();
