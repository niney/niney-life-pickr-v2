// 등산 적재 상태 한 줄 — deploy.sh 가 파싱한다(stat_val 이 키 단위로 뽑는다):
//   "ok mountains=N courses=C pois=P images=I stale=S"  (N = 0 이면 미적재, S = 고도는 있는데 이동 분이 빈 코스 —
//   2차 마이그레이션(hiking_time_guide) 뒤 아직 다시 적재하지 않은 것. S > 0 이면 deploy.sh 가 다시 적재한다)
//   "missing"  (테이블·열 없음 — 마이그레이션 전)
// 실행: pnpm --filter friendly status:hiking

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  try {
    const last = await prisma.hikingSync.findFirst({ orderBy: { loadedAt: 'desc' } });
    const stale = await prisma.hikingCourse.count({ where: { hasElevation: true, moveMin: null } });
    console.log(
      `ok mountains=${last?.mountains ?? 0} courses=${last?.courses ?? 0} pois=${last?.pois ?? 0} images=${last?.images ?? 0} stale=${stale}`,
    );
  } catch (e) {
    console.log('missing');
    console.error(e instanceof Error ? e.message : String(e));
  }
};

main().finally(() => prisma.$disconnect());
