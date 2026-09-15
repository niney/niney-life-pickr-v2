// 여행로그(AI 허브 71780·71779) 폐기 — Tour* 테이블 10개 + 맛집 매칭(RestaurantTourMatch)·사업자 상태(TourPlaceBizStatus)를
// 데이터셋 단위(또는 전부) 비우고 count 0 인 적재 이력을 남긴다. AI 허브 이용정책의 "이용 중지·환수·폐기 요구" 에 한 명령으로
// 응하기 위한 스크립트(docs/PLAN-tour-log.md §이용조건). 썸네일 파일(export 폴더의 thumbs/)은 DB 밖이라 직접 지운다.
//
// 실행: pnpm --filter friendly unload:tour --yes [--dataset jeju|west]   (--dataset 없으면 전부)

import { PrismaClient } from '@prisma/client';
import { TOUR_DATASET_KEYS, isTourDatasetKey } from '@repo/utils';
import { getTourLoadStatus, unloadTourTables } from '../src/modules/tour/tour-master.service.js';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const datasetArg = args.includes('--dataset') ? args[args.indexOf('--dataset') + 1] : undefined;

const main = async (): Promise<void> => {
  if (datasetArg !== undefined && !isTourDatasetKey(datasetArg)) {
    console.error(`--dataset 은 ${TOUR_DATASET_KEYS.join('|')} 중 하나여야 합니다: ${datasetArg}`);
    process.exitCode = 1;
    return;
  }
  if (!args.includes('--yes')) {
    console.error(`Tour* 테이블을 ${datasetArg ? `[${datasetArg}] 데이터셋만` : '전부'} 비웁니다. 확인했으면 --yes 를 붙여 다시 실행하세요.`);
    process.exitCode = 1;
    return;
  }
  const before = await getTourLoadStatus(prisma);
  console.log(`\n=== 여행로그 폐기 ${datasetArg ? `[${datasetArg}]` : '(전부)'} ===`);
  console.log(`현재: ${before.datasets.map((d) => `${d.label} ${d.loaded ? d.places.toLocaleString('ko-KR') + '곳 · ' + (d.sourceFile ?? '-') : '없음'}`).join(' · ')}`);
  await unloadTourTables(prisma, datasetArg);
  const after = await getTourLoadStatus(prisma);
  console.log(`완료: 장소 ${after.places} · loaded=${after.loaded} · ${after.datasets.map((d) => `${d.label} ${d.places}`).join(' · ')}`);
  console.log('썸네일 폴더(data/open/tour/<export>/thumbs 또는 TOUR_THUMBS_DIR*)는 직접 삭제하세요.');
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
