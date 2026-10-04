import fp from 'fastify-plugin';

// 메모리 관측 — 10분마다 RSS·힙·외부 메모리(MB)를 info 로 남긴다. pm2 max_memory_restart 로 재시작되기 전
// 추이를 로그에서 볼 수 있게 한다(성능 2차에서 재시작 원인을 요청 로그로 역추적했다 — docs/PLAN-perf-2.md).
// 테스트에서는 끈다.
const INTERVAL_MS = 10 * 60_000;
const MB = (n: number): number => Math.round(n / 1048576);

export default fp(
  async (app) => {
    if (process.env.NODE_ENV === 'test') return;
    const timer = setInterval(() => {
      const m = process.memoryUsage();
      app.log.info(
        { rss: MB(m.rss), heap: MB(m.heapUsed), ext: MB(m.external), ab: MB(m.arrayBuffers) },
        'mem',
      );
    }, INTERVAL_MS);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
    });
  },
  { name: 'mem-telemetry' },
);
