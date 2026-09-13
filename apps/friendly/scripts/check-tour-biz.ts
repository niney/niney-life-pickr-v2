// 여행로그 장소 폐업 확인 — 영수증 사업자번호로 국세청 「사업자등록정보 진위확인 및 상태조회」(data.go.kr 15081808)를
// 100건/콜로 조회해 TourPlaceBizStatus 에 저장한다. DATA_GO_KR_API_KEY 에 15081808 활용신청이 되어 있어야 한다.
//
// 실행: pnpm --filter friendly check:tour-biz [--max-calls=10] [--min-travelers=3] [--region=jeju|all] [--force]
//   --force  30일 안에 조회한 장소도 다시.

import { PrismaClient } from '@prisma/client';
import { checkTourBizStatus } from '../src/modules/tour/tour-biz-status.service.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const serviceKey = process.env.DATA_GO_KR_API_KEY ?? '';
  const region = opt('region') === 'all' ? 'all' : 'jeju';
  console.log(`\n=== 여행로그 장소 폐업 확인(국세청) === region=${region}`);
  if (!serviceKey) {
    console.error('DATA_GO_KR_API_KEY 가 없습니다 — .env 확인(15081808 활용신청 필요).');
    process.exitCode = 1;
    return;
  }
  const r = await checkTourBizStatus(prisma, {
    serviceKey,
    maxCalls: Number(opt('max-calls') ?? 10),
    minTravelers: Number(opt('min-travelers') ?? 3),
    region,
    force: args.includes('--force'),
    onProgress: (done, total) => console.log(`  ${done.toLocaleString('ko-KR')}/${total.toLocaleString('ko-KR')} …`),
  });
  console.log(`\n[대상] 사업자번호 있는 장소 ${r.candidates.toLocaleString('ko-KR')} · 조회 필요 ${r.pending.toLocaleString('ko-KR')} · 호출 ${r.calls} · 갱신 ${r.checked.toLocaleString('ko-KR')}`);
  console.log(`[상태] 계속사업자 ${r.byStatus.open} · 휴업 ${r.byStatus.suspended} · 폐업 ${r.byStatus.closed} · 미등록 ${r.byStatus.unknown}`);
  if (r.stopped !== 'done') console.log(`[중단] ${r.stopped}${r.error ? ` — ${r.error}` : ''}`);
  if (r.stopped === 'auth' || r.stopped === 'error') process.exitCode = 1;
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
