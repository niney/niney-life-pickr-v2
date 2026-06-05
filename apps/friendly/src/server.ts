import { buildApp } from './app.js';
import { env } from './config/env.js';
import {
  cleanupStaleReviewSummaries,
  rescheduleStaleSummaries,
} from './modules/summary/summary.service.js';
import { scheduleRegistry } from './modules/schedule/schedule-registry.js';

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

    // 3) 주기 스케줄러 부팅 — DB 의 스케줄 설정을 읽어 cron 을 등록하고,
    //    직전 인스턴스에서 running 으로 남은 run 을 interrupted 로 정리한다.
    await app.schedule.bootstrap();

    await app.listen({ port: env.PORT, host: env.HOST });

    // graceful shutdown — 중복 호출 가드, 스케줄러 정지, 진행 중 작업 취소,
    // 그리고 app.close() 가 매달릴 때를 대비한 unref 안전망. abort 된 주기
    // 작업은 식당 경계에서 멈추며, DB 에 running 으로 남으면 다음 부팅의
    // schedule.bootstrap() 이 interrupted 로 정리하고 다음 tick 에 재개한다.
    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info(`Received ${signal}, shutting down...`);
      scheduleRegistry.stopAllCrons();
      scheduleRegistry.abortInflight();
      const safety = setTimeout(() => process.exit(1), 15_000);
      safety.unref();
      await app.close();
      clearTimeout(safety);
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
