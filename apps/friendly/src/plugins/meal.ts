import fp from 'fastify-plugin';
import { MealPhotoService } from '../modules/meal/meal-photo.service.js';
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
    const mealPhotos = new MealPhotoService(app.prisma, { logger: app.log });
    app.decorate('mealPhotos', mealPhotos);

    // 부팅 직후 1회 + 매일 — 재시작이 잦아도 중복 정리는 무해하다(이미 지운 파일은 skip).
    void mealPhotos.sweepOrphans().catch((e: unknown) => {
      app.log.warn({ err: e }, '[meal] orphan sweep failed');
    });
    scheduleRegistry.setCron(GC_JOB_TYPE, GC_CRON, 'Asia/Seoul', () => {
      void mealPhotos.sweepOrphans().catch((e: unknown) => {
        app.log.warn({ err: e }, '[meal] orphan sweep failed');
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
  }
}
