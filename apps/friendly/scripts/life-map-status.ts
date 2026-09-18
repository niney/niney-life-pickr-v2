// 일상지도 적재 상태 한 줄 — deploy.sh 가 파싱한다(stat_val 이 키 단위로 뽑아 항목 추가는 안전):
//   "ok cctv=N toilet=M geocoded=G hospital=H store=S tour=T tour_jeju=… tour_west=… tour_east=… tour_matched=X cache=C"
//   (N/M/H/S = 최근 적재 건수, G = 화장실 좌표 확보, T = 여행로그 장소 수(unload 뒤 0), tour_<세트> = 데이터셋별 장소 수
//    (utils TOUR_DATASET_KEYS 순서), X = 여행로그 매칭된 맛집 수, C = 지오코딩 캐시 행)
//   "missing"                                   (테이블 없음 — 마이그레이션 전)
// 실행: pnpm --filter friendly status:life-map

import { PrismaClient } from '@prisma/client';
import { TOUR_DATASET_KEYS } from '@repo/utils';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  try {
    // tour 는 데이터셋이 여러 개라 layer 이력 대신 실제 장소 수를 세고, 세트별(tour_jeju·tour_west·tour_east …)로도 낸다.
    const [cctv, toilet, hospital, store, tour, tourByDataset, tourMatched, cache] = await Promise.all([
      prisma.lifeMasterSync.findFirst({ where: { layer: 'cctv' }, orderBy: { loadedAt: 'desc' } }),
      prisma.lifeMasterSync.findFirst({ where: { layer: 'toilet' }, orderBy: { loadedAt: 'desc' } }),
      prisma.lifeMasterSync.findFirst({ where: { layer: 'hospital' }, orderBy: { loadedAt: 'desc' } }),
      prisma.lifeMasterSync.findFirst({ where: { layer: 'store' }, orderBy: { loadedAt: 'desc' } }),
      prisma.tourPlace.count(),
      prisma.tourPlace.groupBy({ by: ['dataset'], _count: { _all: true } }),
      prisma.restaurantTourMatch.count({ where: { status: 'matched' } }),
      prisma.lifeGeocodeCache.count(),
    ]);
    const byDs = (k: string): number => tourByDataset.find((r) => r.dataset === k)?._count._all ?? 0;
    const perDataset = TOUR_DATASET_KEYS.map((k) => `tour_${k}=${byDs(k)}`).join(' ');
    console.log(
      `ok cctv=${cctv?.count ?? 0} toilet=${toilet?.count ?? 0} geocoded=${toilet?.geocoded ?? 0} hospital=${hospital?.count ?? 0} store=${store?.count ?? 0} tour=${tour} ${perDataset} tour_matched=${tourMatched} cache=${cache}`,
    );
  } catch (e) {
    // 테이블 없음(P2021) 등 — 배포 스크립트가 "missing" 으로 분기한다.
    console.log('missing');
    console.error(e instanceof Error ? e.message : String(e));
  }
};

main().finally(() => prisma.$disconnect());
