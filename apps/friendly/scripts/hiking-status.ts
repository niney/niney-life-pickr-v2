// 등산 적재 상태 한 줄 — deploy.sh 가 파싱한다(stat_val 이 키 단위로 뽑는다):
//   "ok mountains=N courses=C pois=P images=I stale=S peaks=K parks=Q"  (N = 0 이면 미적재, K = 전국 주요 봉우리 산(5차) 수, Q = 국립공원
//   경계(9차 산행안전지도) 수, S = 새 열이 빈 코스 — 2차(hiking_time_guide)의
//   이동 분(고도 있는 코스) 또는 3차(hiking_sigungu)의 시군구가 비었다 = 마이그레이션 뒤 아직 다시 적재하지 않은 것.
//   S > 0 이면 deploy.sh 가 다시 적재한다)
//   "missing"  (테이블·열 없음 — 마이그레이션 전)
// 실행: pnpm --filter friendly status:hiking

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  try {
    const last = await prisma.hikingSync.findFirst({ orderBy: { loadedAt: 'desc' } });
    const stale = await prisma.hikingCourse.count({
      where: { OR: [{ hasElevation: true, moveMin: null }, { sigungu: null }] },
    });
    const peaks = await prisma.hikingMountain.count({ where: { kind: 'peak' } });
    const parks = await prisma.hikingPark.count();
    console.log(
      `ok mountains=${last?.mountains ?? 0} courses=${last?.courses ?? 0} pois=${last?.pois ?? 0} images=${last?.images ?? 0} stale=${stale} peaks=${peaks} parks=${parks}`,
    );
  } catch (e) {
    console.log('missing');
    console.error(e instanceof Error ? e.message : String(e));
  }
};

main().finally(() => prisma.$disconnect());
