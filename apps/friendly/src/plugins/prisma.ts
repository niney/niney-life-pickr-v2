import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

export default fp(
  async (app) => {
    const prisma = new PrismaClient({
      log: app.log.level === 'debug' ? ['warn', 'error'] : ['error'],
    });

    await prisma.$connect();

    // SQLite 동시성/안정성 PRAGMA. WAL 로 동시 읽기 허용, busy_timeout 으로
    // 락 만나면 즉시 BUSY 던지지 않고 대기 — Prisma 의 "Transaction not found"
    // 가 SQLITE_BUSY 에서 비롯되는 케이스를 줄여준다.
    // 일부 PRAGMA(journal_mode, busy_timeout)는 현재 값을 결과 행으로 반환하므로
    // $executeRawUnsafe 가 아니라 $queryRawUnsafe 를 써야 한다.
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 30000');
    // FK 강제. SQLite 기본은 OFF 라 ON DELETE CASCADE 가 동작하지 않아 부모
    // 행을 deleteMany 로 지워도 자식이 orphan 으로 남는다. 테스트 시 보이던
    // "Field review is required ... got null" 이슈가 여기서 비롯.
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    app.decorate('prisma', prisma);

    app.addHook('onClose', async (instance) => {
      await instance.prisma.$disconnect();
    });
  },
  { name: 'prisma' },
);
