import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TourInsightsQueryType } from '@repo/api-contract';
import { TOUR_REGION_KEYS } from '@repo/utils';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { attrSql, attrWhere, whereSql } from './tour-insights.service.js';
import { tourRegionSpendByTrips, tourRegionTransitionSql, tourRegionTransitionWhere, tourRegionVisitSql, tourRegionVisitWhere } from './tour-region-filter.js';

// 지역 축의 두 판(Prisma where ↔ 원시 SQL) 동치(PLAN-perf-2 D-2) — 인사이트·지역 비교는 큰 표를 $queryRaw 로 읽으므로, 지역 21개 ×
// 속성 필터 조합마다 방문·전이 표에서 두 판이 같은 행 수를 내야 한다. 격리 DB 에 시도·속성이 섞인 방문·전이를 심는다.
// + 소비 표의 여행 id 청크(all 이면 조건 없이 한 번).

const SIDOS = ['제주', '서울', '경기', '인천', '부산', '강원', '전북', '대전', '세종', null] as const;
const AGES = ['30', '50'] as const;
const GENDERS = ['남', '여'] as const;
const ACCOMPANY = ['나홀로 여행', '자녀 동반 여행'] as const;
const MONTHS = [6, 8] as const;
const NIGHTS = [0, 2, 4, 6] as const;
const FILTERS: Array<Omit<TourInsightsQueryType, 'region'>> = [
  {},
  { ageGrp: '30' },
  { nights: 4 },
  { nights: 0, gender: '여' },
  { accompany: '나홀로 여행', month: 6 },
  { ageGrp: '50', gender: '남', accompany: '자녀 동반 여행', month: 8, nights: 2 },
];

describe('tour region filter — where 판 ↔ SQL 판 (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    prisma = new PrismaClient();
    const pick = <T>(xs: readonly T[], i: number): T => xs[i % xs.length]!;
    await prisma.tourVisit.createMany({
      data: Array.from({ length: 160 }, (_, i) => {
        const sido = pick(SIDOS, i);
        return {
          id: `V${i}`,
          travelId: `T${i % 40}`,
          visitAreaId: String(i),
          visitOrder: i,
          visitDate: '2023-06-01',
          typeCd: '11',
          typeShort: '식당',
          isPrivate: i % 7 === 0,
          sido,
          // 부속섬·bbox 보정이 있어 isJeju 와 sido='제주' 가 늘 같지는 않다 — 일부러 어긋난 행도 둔다.
          isJeju: sido === '제주' ? i % 11 !== 0 : i % 13 === 0,
          isIsland: false,
          nPhotos: 0,
          nActivities: 0,
          ageGrp: pick(AGES, i >> 1),
          gender: pick(GENDERS, i >> 2),
          accompany: pick(ACCOMPANY, i >> 3),
          month: pick(MONTHS, i >> 4),
          nights: pick(NIGHTS, i >> 5),
        };
      }),
    });
    await prisma.tourTransition.createMany({
      data: Array.from({ length: 160 }, (_, i) => {
        const fromSido = pick(SIDOS, i);
        // 절반은 같은 시도 안의 이동(시도·권역 조건에 걸리게), 나머지는 시도를 건넌다.
        const toSido = i % 2 === 0 ? fromSido : pick(SIDOS, i * 3 + 1);
        return {
          travelId: `T${i % 40}`,
          fromVisitId: String(i),
          toVisitId: String(i + 1),
          fromSido,
          toSido,
          sameDay: true,
          viaPrivate: false,
          bothJeju: fromSido === '제주' && toSido === '제주',
          ageGrp: pick(AGES, i >> 1),
          gender: pick(GENDERS, i >> 2),
          accompany: pick(ACCOMPANY, i >> 3),
          month: pick(MONTHS, i >> 4),
          nights: pick(NIGHTS, i >> 5),
        };
      }),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    isolated.restore();
  });

  const rawCount = async (sql: Prisma.Sql): Promise<number> => Number((await prisma.$queryRaw<Array<{ n: number | bigint }>>(sql))[0]!.n);

  it('방문 — 지역 21개 × 속성 필터마다 같은 행 수', async () => {
    let nonEmpty = 0;
    for (const region of TOUR_REGION_KEYS) {
      for (const f of FILTERS) {
        const q = { region, ...f } as TourInsightsQueryType;
        const viaWhere = await prisma.tourVisit.count({ where: { ...attrWhere(q), isPrivate: false, ...tourRegionVisitWhere(region) } as Prisma.TourVisitWhereInput });
        const viaSql = await rawCount(Prisma.sql`SELECT COUNT(*) AS n FROM tour_visits ${whereSql([...attrSql(q), Prisma.sql`isPrivate = ${false}`, tourRegionVisitSql(region)])}`);
        expect({ region, f, n: viaSql }).toEqual({ region, f, n: viaWhere });
        if (viaWhere > 0) nonEmpty += 1;
      }
    }
    // 비교가 빈 결과끼리만 맞은 게 아니다.
    expect(nonEmpty).toBeGreaterThan(40);
  });

  it('전이 — 지역 21개 × 속성 필터마다 같은 행 수', async () => {
    let nonEmpty = 0;
    for (const region of TOUR_REGION_KEYS) {
      for (const f of FILTERS) {
        const q = { region, ...f } as TourInsightsQueryType;
        const viaWhere = await prisma.tourTransition.count({ where: { ...attrWhere(q), ...tourRegionTransitionWhere(region) } as Prisma.TourTransitionWhereInput });
        const viaSql = await rawCount(Prisma.sql`SELECT COUNT(*) AS n FROM tour_transitions ${whereSql([...attrSql(q), tourRegionTransitionSql(region)])}`);
        expect({ region, f, n: viaSql }).toEqual({ region, f, n: viaWhere });
        if (viaWhere > 0) nonEmpty += 1;
      }
    }
    expect(nonEmpty).toBeGreaterThan(30);
  });

  it('소비 여행 id 청크 — all 은 조건 없이 한 번, 그 밖은 500개씩 나눠 모두 돈다', async () => {
    const ids = Array.from({ length: 1201 }, (_, i) => `t${i}`);
    const calls: Array<string[] | null> = [];
    const run = async (travelIds: string[] | null) => {
      calls.push(travelIds);
      return travelIds ? travelIds.map((id) => ({ id })) : [{ id: 'all' }];
    };
    expect(await tourRegionSpendByTrips('all', ids, run)).toEqual([{ id: 'all' }]);
    expect(calls).toEqual([null]);
    calls.length = 0;
    const rows = await tourRegionSpendByTrips('jeju', ids, run);
    expect(calls.map((c) => c!.length)).toEqual([500, 500, 201]);
    expect(rows.map((r) => r.id)).toEqual(ids);
    calls.length = 0;
    expect(await tourRegionSpendByTrips('seoul', [], run)).toEqual([]);
    expect(calls).toEqual([]);
  });
});
