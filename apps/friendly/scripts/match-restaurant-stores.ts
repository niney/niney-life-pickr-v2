// 맛집 ↔ 상가업소 매칭 갱신 — 좌표 있는 canonical 전부를 돌며 LifeStore(음식·카페) 80m 안 상호 유사 업소를
// 붙이고, 재적재본에서 사라진 업소는 "폐업 의심"(missing) 플래그만 세운다(목록 유지). load:life-stores 뒤에
// 실행(deploy.sh 가 이어서 부른다).
//
// 실행: pnpm --filter friendly match:restaurant-stores [--dry-run]
//   --dry-run  판정만 하고 쓰지 않는다(리포트만).

import { PrismaClient } from '@prisma/client';
import { matchRestaurantStores } from '../src/modules/restaurant/restaurant-store-match.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const stores = await prisma.lifeStore.count();
  console.log(`\n=== 맛집 ↔ 상가업소 매칭 ${DRY_RUN ? '(--dry-run)' : ''} ===\nLifeStore ${stores.toLocaleString('ko-KR')}행`);
  if (stores === 0) {
    console.error('LifeStore 가 비어 있습니다 — 먼저 pnpm --filter friendly load:life-stores');
    process.exitCode = 1;
    return;
  }
  const t0 = Date.now();
  let lastLog = 0;
  const r = await matchRestaurantStores(prisma, {
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
  console.log(`[폐업 의심] 이번에 사라짐 ${r.newlyMissing} · 계속 ${r.stillMissing} · 미매칭 ${r.unmatched} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  if (DRY_RUN) console.log('\n--dry-run — 쓰기 생략.');
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
