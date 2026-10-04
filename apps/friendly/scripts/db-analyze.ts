/* eslint-disable no-console -- 배포 CLI 의 진행 출력 */
// 플래너 통계(sqlite_stat1) 만들기 — 배포·대량 적재 뒤 실행한다(deploy.sh analyze_db).
//
// 통계가 없으면 SQLite 플래너가 저선택도 인덱스(예: 값이 하나뿐인 kind)를 골라 집계·지도 쿼리가 10~30배
// 느렸다(docs/PLAN-perf-2.md X-2). 테이블마다 따로 ANALYZE 해서 쓰기 락을 0.1~0.8초씩 나눈다 — 서버가
// 떠 있어도 요청 쓰기는 busy_timeout(30초) 안에서 기다린다. housing_trades(약 709만 행, 4초)는 통계가
// 생겨도 계획이 바뀌지 않아 기본 제외한다(--all 로 포함). 이후 갱신은 서버의 매일 PRAGMA optimize 가 한다.
//
//   pnpm --filter friendly db:analyze          # 기본
//   pnpm --filter friendly db:analyze --all    # 전 테이블
import { PrismaClient } from '@prisma/client';

const all = process.argv.includes('--all');
const SKIP = new Set(all ? ['_prisma_migrations'] : ['_prisma_migrations', 'housing_trades']);

// 연결 하나로 고정 — PRAGMA·ANALYZE 가 같은 연결에서 돌게.
const url = process.env.DATABASE_URL ?? '';
const prisma = new PrismaClient({
  datasourceUrl: url.includes('?') ? `${url}&connection_limit=1&socket_timeout=60` : `${url}?connection_limit=1&socket_timeout=60`,
});

const main = async () => {
  const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  // 0 = 표본 한도 없음(전체 스캔) — 단일값 열의 분포를 정확히 잡는다.
  await prisma.$queryRawUnsafe('PRAGMA analysis_limit = 0');
  const started = Date.now();
  let done = 0;
  for (const { name } of tables) {
    if (SKIP.has(name)) continue;
    const t0 = Date.now();
    await prisma.$executeRawUnsafe(`ANALYZE "${name.replace(/"/g, '""')}"`);
    const ms = Date.now() - t0;
    done += 1;
    if (ms >= 200) console.log(`  ${name}: ${ms}ms`);
  }
  console.log(`ok analyze tables=${done} skipped=${[...SKIP].join(',')} total=${Date.now() - started}ms`);
};

main()
  .catch((err) => {
    console.error('analyze failed', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
