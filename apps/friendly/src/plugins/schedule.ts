import fp from 'fastify-plugin';
import { AiConfigService } from '../modules/ai/ai.config.service.js';
import { MenuGroupingService } from '../modules/menu-grouping/menu-grouping.service.js';
import { AnalyticsService } from '../modules/analytics/analytics.service.js';
import { ScheduleService } from '../modules/schedule/schedule.service.js';
import { scheduleRegistry } from '../modules/schedule/schedule-registry.js';
import { env } from '../config/env.js';

// 주기 자동 실행(정규화 → 글로벌 머지) 스케줄러. ScheduleService 를 app 전역
// singleton 으로 decorate — 라우트(수동 실행/설정)와 부팅 cron tick 이 같은
// 인스턴스를 공유한다. cron 타이머/진행 상태는 scheduleRegistry(모듈 singleton).
//
// 의존: prisma 플러그인(app.prisma). 자체 aiConfig 를 만들어 summaries 플러그인
// 로드 순서에 의존하지 않는다 — autoload 알파벳순상 'schedule' < 'summaries' 라
// schedule 이 먼저 잡히므로 app.aiConfig 재사용은 불가.
export default fp(
  async (app) => {
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: env.OLLAMA_CLOUD_API_KEY,
      baseUrl: env.OLLAMA_CLOUD_BASE_URL,
      timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
      maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
      defaultModel: env.OLLAMA_DEFAULT_MODEL,
    });
    const menuGrouping = new MenuGroupingService(app.prisma, aiConfig, {
      logger: app.log,
    });
    const analytics = new AnalyticsService(app.prisma, aiConfig, {
      logger: app.log,
    });
    const schedule = new ScheduleService(app.prisma, {
      menuGrouping,
      analytics,
      logger: app.log,
    });

    app.decorate('schedule', schedule);

    // graceful shutdown — cron 타이머 정지 + 진행 중 작업 취소. server.ts 의
    // shutdown 핸들러와 중복이지만 멱등하며, 테스트의 app.close() 에서도 정리된다.
    app.addHook('onClose', async () => {
      scheduleRegistry.stopAllCrons();
      scheduleRegistry.abortInflight();
    });
  },
  { name: 'schedule', dependencies: ['prisma'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    schedule: ScheduleService;
  }
}
