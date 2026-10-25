// 등산 적재 상태 한 줄 — deploy.sh 가 파싱한다(stat_val 이 키 단위로 뽑는다):
//   "ok mountains=N courses=C pois=P images=I"  (N = 0 이면 미적재)
//   "missing"  (테이블 없음 — 마이그레이션 전)
// 실행: pnpm --filter friendly status:hiking

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  try {
    const last = await prisma.hikingSync.findFirst({ orderBy: { loadedAt: 'desc' } });
    console.log(`ok mountains=${last?.mountains ?? 0} courses=${last?.courses ?? 0} pois=${last?.pois ?? 0} images=${last?.images ?? 0}`);
  } catch (e) {
    console.log('missing');
    console.error(e instanceof Error ? e.message : String(e));
  }
};

main().finally(() => prisma.$disconnect());
