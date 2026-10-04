import fp from 'fastify-plugin';
import { Cron } from 'croner';
import { PrismaClient } from '@prisma/client';

// SQLite 연결 설정. Prisma 는 연결 풀을 쓰고 PRAGMA 는 실행한 그 연결에만 걸린다 — 예전엔
// busy_timeout=30000·synchronous=NORMAL 을 한 번만 실행해 첫 연결만 30초를 기다리고 나머지 연결은
// 5초 만에 'database is locked' 로 실패했다(실측 64연결 중 63개가 5000, docs/PLAN-perf-2.md X-1).
// 연결마다 걸려야 하는 값은 URL 로 준다(이미 있으면 그대로 둔다):
//   socket_timeout=30   → 모든 연결의 busy_timeout 30000
//   connection_limit=12 → 풀 크기 명시. 기본(물리코어×2+1)은 운영 4코어에서 5~9 라 느린 공개 쿼리
//                         몇 개가 인증 요청까지 줄 세운다(X-V2). WAL 읽기는 병렬이고 연결당 캐시는 2MB 다.
// synchronous 는 URL 로 걸 방법이 없어 기본(FULL, 커밋당 +~1ms)을 받아들인다. foreign_keys 는 Prisma 가
// 연결마다 켠다(실측). 쓰기 트랜잭션은 DB 전체 쓰기 락이라 본문에서 외부 호출·긴 계산을 하지 않는다.
export const withSqlitePoolParams = (url: string | undefined): string | undefined => {
  if (!url || !url.startsWith('file:')) return url;
  const [base, query = ''] = url.split('?', 2) as [string, string?];
  const params = new URLSearchParams(query);
  if (!params.has('socket_timeout')) params.set('socket_timeout', '30');
  if (!params.has('connection_limit')) params.set('connection_limit', '12');
  return `${base}?${params.toString()}`;
};

// 플래너 통계 유지 — 통계(sqlite_stat1)가 없으면 저선택도 인덱스를 골라 집값 지도 등이 10~30배 느렸다(X-2).
// 0x10002 = 필요한 테이블만 ANALYZE(통계가 없거나 크게 바뀐 테이블) + 표본 한도(2000행) 없이 — 기본 한도는
// 단일값 열(kind)을 잘못 추정해 효과가 없었다. 통계가 맞으면 100ms 안팎의 no-op 이다. 첫 통계는 배포 때
// `pnpm --filter friendly db:analyze` 로 만든다.
const OPTIMIZE_CRON = '30 4 * * *';

export default fp(
  async (app) => {
    const prisma = new PrismaClient({
      datasourceUrl: withSqlitePoolParams(process.env.DATABASE_URL),
      log: app.log.level === 'debug' ? ['warn', 'error'] : ['error'],
    });

    await prisma.$connect();

    // journal_mode 는 DB 파일에 저장되는 설정이라 한 번이면 모든 연결에 적용된다. WAL 로 동시 읽기 허용.
    // 현재 값을 결과 행으로 반환하므로 $executeRawUnsafe 가 아니라 $queryRawUnsafe 를 써야 한다.
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');

    app.decorate('prisma', prisma);

    let optimizeCron: Cron | null = null;
    if (process.env.NODE_ENV !== 'test') {
      optimizeCron = new Cron(
        OPTIMIZE_CRON,
        { timezone: 'Asia/Seoul', name: 'sqlite-optimize', unref: true, catch: true },
        () => {
          const started = Date.now();
          void prisma
            .$queryRawUnsafe('PRAGMA optimize = 0x10002')
            .then(() => app.log.info({ ms: Date.now() - started }, '[prisma] PRAGMA optimize'))
            .catch((err) => app.log.warn({ err }, '[prisma] PRAGMA optimize failed'));
        },
      );
    }

    app.addHook('onClose', async (instance) => {
      optimizeCron?.stop();
      await instance.prisma.$disconnect();
    });
  },
  { name: 'prisma' },
);
