import fp from 'fastify-plugin';
import { UsageQuotaService } from '../modules/usage-quota/usage-quota.service.js';
import { scheduleRegistry } from '../modules/schedule/schedule-registry.js';

// 공용 사용량 한도 서비스를 app 전역 singleton 으로 decorate — 설정 캐시(30초)를 기능 라우트
// (소비)와 어드민 라우트(편집·무효화)가 공유해야 한다. 오래된 카운터는 매일 04:40 정리.
const GC_CRON = '40 4 * * *';
const GC_JOB_TYPE = 'usage-quota-gc';

export default fp(
  async (app) => {
    const usageQuota = new UsageQuotaService(app.prisma);
    app.decorate('usageQuota', usageQuota);

    scheduleRegistry.setCron(GC_JOB_TYPE, GC_CRON, 'Asia/Seoul', () => {
      void usageQuota.cleanup().catch((e: unknown) => {
        app.log.warn({ err: e }, '[usage-quota] counter cleanup failed');
      });
    });
    app.addHook('onClose', async () => {
      scheduleRegistry.clearCron(GC_JOB_TYPE);
    });
  },
  { name: 'usage-quota', dependencies: ['prisma'] },
);

declare module 'fastify' {
  interface FastifyInstance {
    usageQuota: UsageQuotaService;
  }
}
