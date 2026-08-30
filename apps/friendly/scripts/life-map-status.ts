// 일상지도 적재 상태 한 줄 — deploy.sh 가 파싱한다(stat_val 이 키 단위로 뽑아 항목 추가는 안전):
//   "ok cctv=N toilet=M geocoded=G hospital=H cache=C"
//   (N/M/H = 최근 적재 건수, G = 화장실 좌표 확보, C = 지오코딩 캐시 행)
//   "missing"                                   (테이블 없음 — 마이그레이션 전)
// 실행: pnpm --filter friendly status:life-map

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  try {
    const [cctv, toilet, hospital, cache] = await Promise.all([
      prisma.lifeMasterSync.findFirst({ where: { layer: 'cctv' }, orderBy: { loadedAt: 'desc' } }),
      prisma.lifeMasterSync.findFirst({ where: { layer: 'toilet' }, orderBy: { loadedAt: 'desc' } }),
      prisma.lifeMasterSync.findFirst({ where: { layer: 'hospital' }, orderBy: { loadedAt: 'desc' } }),
      prisma.lifeGeocodeCache.count(),
    ]);
    console.log(
      `ok cctv=${cctv?.count ?? 0} toilet=${toilet?.count ?? 0} geocoded=${toilet?.geocoded ?? 0} hospital=${hospital?.count ?? 0} cache=${cache}`,
    );
  } catch (e) {
    // 테이블 없음(P2021) 등 — 배포 스크립트가 "missing" 으로 분기한다.
    console.log('missing');
    console.error(e instanceof Error ? e.message : String(e));
  }
};

main().finally(() => prisma.$disconnect());
