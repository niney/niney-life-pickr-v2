// 집값 적재 상태 한 줄 — deploy.sh 가 파싱한다(stat_val 이 키 단위로 뽑아 항목 추가는 안전):
//   "ok complexes=N geocoded=G trades=T rents=R from=YYYYMM to=YYYYMM stats=1|0 prices=P kapt=K buildings=B"
//   (N = 아파트 단지 수, G = 좌표 확보, T/R = 장부 기준 매매/전월세 건수, from/to = 적재된 계약년월
//    범위(없으면 0), stats = 통계 표 재계산 이력 유무, P = 공시가격이 붙은 단지 수, K = K-apt 단지코드가
//    붙은 단지 수, B = 건축물대장을 조회한 단지 수)
//   "missing"  (테이블 없음 — 마이그레이션 전)
// 실행: pnpm --filter friendly status:housing

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  try {
    const [complexSync, statsSync, complexes, geocoded, ledger, prices, kapt, buildings] = await Promise.all([
      prisma.housingSync.findFirst({ where: { kind: 'complex' }, orderBy: { loadedAt: 'desc' } }),
      prisma.housingSync.findFirst({ where: { kind: 'stats' }, orderBy: { loadedAt: 'desc' } }),
      prisma.housingComplex.count({ where: { kind: 'apt' } }),
      prisma.housingComplex.count({ where: { kind: 'apt', lat: { not: null } } }),
      prisma.housingTradeSync.groupBy({ by: ['dealType'], _sum: { count: true }, _min: { dealYm: true }, _max: { dealYm: true } }),
      prisma.housingComplexPrice.count({ where: { band: 'all' } }),
      prisma.housingComplex.count({ where: { kind: 'apt', kaptCode: { not: null } } }),
      prisma.housingComplex.count({ where: { kind: 'apt', buildingFetchedAt: { not: null } } }),
    ]);
    const sum = (types: string[]): number => ledger.filter((l) => types.includes(l.dealType)).reduce((a, l) => a + (l._sum.count ?? 0), 0);
    const yms = ledger.flatMap((l) => [l._min.dealYm, l._max.dealYm]).filter((v): v is string => typeof v === 'string');
    const from = yms.length > 0 ? yms.reduce((a, b) => (a < b ? a : b)) : '0';
    const to = yms.length > 0 ? yms.reduce((a, b) => (a > b ? a : b)) : '0';
    console.log(
      `ok complexes=${complexSync ? complexes : 0} geocoded=${complexSync ? geocoded : 0} trades=${sum(['trade'])} rents=${sum(['jeonse', 'monthly'])} from=${from} to=${to} stats=${statsSync ? 1 : 0} prices=${prices} kapt=${kapt} buildings=${buildings}`,
    );
  } catch (e) {
    // 테이블 없음(P2021) 등 — 배포 스크립트가 "missing" 으로 분기한다.
    console.log('missing');
    console.error(e instanceof Error ? e.message : String(e));
  }
};

main().finally(() => prisma.$disconnect());
