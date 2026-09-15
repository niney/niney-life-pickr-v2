// 여행로그 공개 집계의 지역 축(7차) — region 키 하나를 표별 where 조각으로 바꾼다. 인사이트·코스·숙소·지역비교·시드 콘솔이
// 전부 이 파일을 거쳐야 "같은 지역이 표마다 다르게 잘리는" 일이 없다.
//   jeju  : tour-c 의 isJeju(본섬+부속섬, bbox 보정) 그대로 — 여행은 nJeju>0, 방문 isJeju, 전이 bothJeju, 일차 isJejuDay.
//   시도   : 방문 sido(짧은 이름). 여행·일차는 로더가 채운 ",전북,대전," 꼴의 sidos 목록에 포함 여부, 전이는 from/to sido 둘 다.
//   west  : 서부권 7개 시도 합(위와 같은 규칙). all: 조건 없음.

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

// 원시 SQL(시드 콘솔) — tour_places 별칭 p 기준.
export const tourRegionPlaceSql = (region: TourRegionKey, alias = 'p'): Prisma.Sql | null => {
  if (region === 'jeju') return Prisma.sql`${Prisma.raw(alias)}.isJeju = 1`;
  const sidos = sidosOf(region);
  return sidos ? Prisma.sql`${Prisma.raw(alias)}.sido IN (${Prisma.join([...sidos])})` : null;
};

// 전이 표의 "거점 다음" — from_name 에 거점 이름 조각이 있고 to_name 에는 없는 행.
export const tourRegionHubs = (region: TourRegionKey): readonly string[] => TOUR_REGIONS[region].hubs;
export const tourRegionHubLabel = (region: TourRegionKey): string => TOUR_REGIONS[region].hubLabel;
