// 맛집 ↔ 여행로그 장소 매칭 갱신 — 좌표 있고 식당 행이 있는 canonical 전부를 돌며 TourPlace(식당·상업·상점) 100m 안
// 상호 유사 장소(완전일치는 300m)를 1:1 로 붙인다. load:tour 뒤에 실행(deploy.sh 케이스 6 이 이어서 부른다).
//
// 실행: pnpm --filter friendly match:restaurant-tour [--dry-run]

import { PrismaClient } from '@prisma/client';
import { matchRestaurantTour } from '../src/modules/tour/restaurant-tour-match.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const places = await prisma.tourPlace.count();
  console.log(`\n=== 맛집 ↔ 여행로그 장소 매칭 ${DRY_RUN ? '(--dry-run)' : ''} ===\nTourPlace ${places.toLocaleString('ko-KR')}행`);
  if (places === 0) {
    console.error('TourPlace 가 비어 있습니다 — 먼저 pnpm --filter friendly load:tour');
    process.exitCode = 1;
    return;
  }
  const t0 = Date.now();
  let lastLog = 0;
  const r = await matchRestaurantTour(prisma, {
    dryRun: DRY_RUN,
    onProgress: (done, total) => {
      if (done - lastLog >= 2000 || done === total) {
        lastLog = done;
        console.log(`  ${done.toLocaleString('ko-KR')}/${total.toLocaleString('ko-KR')} …`);
      }
    },
  });
  const matched = r.created + r.rematched + r.kept + r.recovered;
  const rate = r.scanned > 0 ? ((matched / r.scanned) * 100).toFixed(1) : '0';
  console.log(`\n[결과] 검토 ${r.scanned.toLocaleString('ko-KR')} · 매칭 ${matched.toLocaleString('ko-KR')}(${rate}%) — 신규 ${r.created} · 옮김 ${r.rematched} · 유지 ${r.kept} · 복귀 ${r.recovered}`);
  console.log(`[사라짐] 이번에 ${r.newlyMissing} · 계속 ${r.stillMissing} · 미매칭 ${r.unmatched} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  if (DRY_RUN) console.log('\n--dry-run — 쓰기 생략.');
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
