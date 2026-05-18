import { buildApp } from './app.js';
import { env } from './config/env.js';
import {
  cleanupStaleReviewSummaries,
  rescheduleStaleSummaries,
} from './modules/summary/summary.service.js';

const start = async (): Promise<void> => {
  try {
    const app = await buildApp();

    // 1) 직전 인스턴스에서 진행 중이던 queued/pending/running 행을 모두
    //    failed/server_restart 로 마킹. cleanup 끝나야 DB 가 깨끗한 상태에서
    //    listen 시작.
    await cleanupStaleReviewSummaries(app.prisma, app.log);

    // 2) 방금 server_restart 로 마킹된 행들 + 이전부터 남아있던 server_restart
    //    행들을 placeId 별로 묶어 자동 재큐잉. app 전역 singleton SummaryService
    //    에 enqueue 하므로 라우트가 같은 chain map 으로 진행 상태를 관찰한다.
    await rescheduleStaleSummaries(app.prisma, app.summaries, app.log);

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
