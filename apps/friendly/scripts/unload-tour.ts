// 여행로그(AI 허브 71780) 폐기 — Tour* 테이블 10개 + 맛집 매칭(RestaurantTourMatch)·사업자 상태(TourPlaceBizStatus)를 비우고
// count 0 인 적재 이력을 남긴다. AI 허브 이용정책의 "이용 중지·환수·폐기 요구" 에 한 명령으로 응하기 위한 스크립트
// (docs/PLAN-tour-log.md §이용조건). 썸네일 파일(TOUR_THUMBS_DIR)은 DB 밖이라 직접 지운다.
//
// 실행: pnpm --filter friendly unload:tour --yes

import { PrismaClient } from '@prisma/client';
import { getTourLoadStatus, unloadTourTables } from '../src/modules/tour/tour-master.service.js';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  if (!process.argv.includes('--yes')) {
    console.error('Tour* 테이블을 전부 비웁니다. 확인했으면 --yes 를 붙여 다시 실행하세요.');
    process.exitCode = 1;
    return;
  }
  const before = await getTourLoadStatus(prisma);
  console.log(`\n=== 여행로그 폐기 ===\n현재: 장소 ${before.places.toLocaleString('ko-KR')} · ${before.sourceFile ?? '-'} · ${before.loadedAt?.toISOString() ?? '-'}`);
  await unloadTourTables(prisma);
  const after = await getTourLoadStatus(prisma);
  console.log(`완료: 장소 ${after.places} · loaded=${after.loaded}\n썸네일 폴더(TOUR_THUMBS_DIR 또는 data/open/tour/*/thumbs)는 직접 삭제하세요.`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
