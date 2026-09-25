// 주차 적재 상태 한 줄 — deploy.sh 가 파싱한다(stat_val 이 키 단위로 뽑는다):
//   "ok lots=N std=S seoul=U geocoded=G ev=E chargers=C"
//   (N = 주차장 수(0 = 미적재), S/U = 원천별, G = 좌표 확보, E = 충전소 수, C = 충전기 수)
//   "missing"  (테이블 없음 — 마이그레이션 전)
// 실행: pnpm --filter friendly status:parking

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  try {
    const [lots, ev, chargers] = await Promise.all([
      prisma.parkingSync.findFirst({ where: { kind: 'lots' }, orderBy: { loadedAt: 'desc' } }),
      prisma.parkingSync.findFirst({ where: { kind: 'ev' }, orderBy: { loadedAt: 'desc' } }),
      prisma.evCharger.count(),
    ]);
    const detail = lots?.detail ? (JSON.parse(lots.detail) as Record<string, number>) : {};
    console.log(
      `ok lots=${lots?.count ?? 0} std=${detail['std'] ?? 0} seoul=${detail['seoul'] ?? 0} geocoded=${lots?.geocoded ?? 0} ev=${ev?.count ?? 0} chargers=${chargers}`,
    );
  } catch (e) {
    console.log('missing');
    console.error(e instanceof Error ? e.message : String(e));
  }
};

main().finally(() => prisma.$disconnect());
