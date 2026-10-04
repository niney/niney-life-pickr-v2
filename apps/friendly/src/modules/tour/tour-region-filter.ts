// 여행로그 공개 집계의 지역 축(7차) — region 키 하나를 표별 where 조각으로 바꾼다. 인사이트·코스·숙소·지역비교·시드 콘솔이
// 전부 이 파일을 거쳐야 "같은 지역이 표마다 다르게 잘리는" 일이 없다.
//   jeju  : tour-c 의 isJeju(본섬+부속섬, bbox 보정) 그대로 — 여행은 nJeju>0, 방문 isJeju, 전이 bothJeju, 일차 isJejuDay.
//   시도   : 방문 sido(짧은 이름). 여행·일차는 로더가 채운 ",전북,대전," 꼴의 sidos 목록에 포함 여부, 전이는 from/to sido 둘 다.
//   west/east/capital : 서부권 7개·동부권 6개·수도권 3개 시도 합(위와 같은 규칙, utils TOUR_REGIONS.sidos). all: 조건 없음.
//   소비  : 지역 열이 없어 그 지역 여행 id 로(tourRegionSpendByTrips).

import { Prisma } from '@prisma/client';
import { TOUR_REGIONS, type TourRegionKey } from '@repo/utils';

type Where = Record<string, unknown>;

const sidosOf = (region: TourRegionKey): readonly string[] | null => (region === 'jeju' ? null : TOUR_REGIONS[region].sidos);

// ",전북,대전," 목록 열에 대한 "하나라도 포함" 조건.
const sidoListWhere = (column: string, sidos: readonly string[]): Where => ({ OR: sidos.map((s) => ({ [column]: { contains: `,${s},` } })) });

export const tourRegionTripWhere = (region: TourRegionKey): Where => {
  if (region === 'jeju') return { nJeju: { gt: 0 } };
  const sidos = sidosOf(region);
  return sidos ? sidoListWhere('visitSidos', sidos) : {};
};

export const tourRegionVisitWhere = (region: TourRegionKey): Where => {
  if (region === 'jeju') return { isJeju: true };
  const sidos = sidosOf(region);
  return sidos ? { sido: { in: [...sidos] } } : {};
};

// 서비스는 아래 SQL 판(tourRegionTransitionSql)을 쓴다 — 이 where 판은 두 판의 동치를 대조하는 테스트의 기준이다.
export const tourRegionTransitionWhere = (region: TourRegionKey): Where => {
  if (region === 'jeju') return { bothJeju: true };
  const sidos = sidosOf(region);
  return sidos ? { fromSido: { in: [...sidos] }, toSido: { in: [...sidos] } } : {};
};

export const tourRegionDayWhere = (region: TourRegionKey): Where => {
  if (region === 'jeju') return { isJejuDay: true };
  const sidos = sidosOf(region);
  return sidos ? sidoListWhere('sidos', sidos) : {};
};

export const tourRegionPlaceWhere = (region: TourRegionKey): Where => {
  if (region === 'jeju') return { isJeju: true };
  const sidos = sidosOf(region);
  return sidos ? { sido: { in: [...sidos] } } : {};
};

// 원시 SQL 판 — 인사이트·지역 비교가 큰 표(방문 11.5만·전이 10만 행)를 콜드로 읽을 때 쓴다. findMany 는 행마다 JS 변환 비용이
// 커서 같은 행을 $queryRaw 보다 2~4배 느리게·크게 올린다(PLAN-perf-2 D-2). 위 where 판과 같은 조건·같은 바인드여야 한다(테스트가
// 지역마다 두 판의 행 수를 비교한다). null = 조건 없음.
export const tourRegionVisitSql = (region: TourRegionKey): Prisma.Sql | null => {
  if (region === 'jeju') return Prisma.sql`isJeju = ${true}`;
  const sidos = sidosOf(region);
  return sidos ? Prisma.sql`sido IN (${Prisma.join([...sidos])})` : null;
};

export const tourRegionTransitionSql = (region: TourRegionKey): Prisma.Sql | null => {
  if (region === 'jeju') return Prisma.sql`bothJeju = ${true}`;
  const sidos = sidosOf(region);
  return sidos ? Prisma.sql`fromSido IN (${Prisma.join([...sidos])}) AND toSido IN (${Prisma.join([...sidos])})` : null;
};

// 소비 표엔 지역 열이 없고 여행 표와 관계도 없다 — 그 지역 여행 id 로 자른다. all 이면 조건 없이 한 번(travelIds=null), 그 밖은
// 여행 id 를 IN 청크로 나눠 `run` 을 부른다. 예전엔 지역과 무관하게 전 행을 읽고 JS 에서 걸렀다(제주 기준 3.7배 — PLAN-perf-2 D-2).
const TRIP_IN_CHUNK = 500;
export const tourRegionSpendByTrips = async <T>(region: TourRegionKey, tripIds: readonly string[], run: (travelIds: string[] | null) => Promise<T[]>): Promise<T[]> => {
  if (region === 'all') return run(null);
  const out: T[] = [];
  for (let i = 0; i < tripIds.length; i += TRIP_IN_CHUNK) {
    for (const row of await run(tripIds.slice(i, i + TRIP_IN_CHUNK))) out.push(row);
  }
  return out;
};

// 원시 SQL(시드 콘솔) — tour_places 별칭 p 기준.
export const tourRegionPlaceSql = (region: TourRegionKey, alias = 'p'): Prisma.Sql | null => {
  if (region === 'jeju') return Prisma.sql`${Prisma.raw(alias)}.isJeju = 1`;
  const sidos = sidosOf(region);
  return sidos ? Prisma.sql`${Prisma.raw(alias)}.sido IN (${Prisma.join([...sidos])})` : null;
};

// 전이 표의 "거점 다음" — from_name 에 거점 이름 조각이 있고 to_name 에는 없는 행.
export const tourRegionHubs = (region: TourRegionKey): readonly string[] => TOUR_REGIONS[region].hubs;
export const tourRegionHubLabel = (region: TourRegionKey): string => TOUR_REGIONS[region].hubLabel;
