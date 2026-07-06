// 수도권 전철 역 검색 — 로컬 역사마스터(SubwayStation) 단일 소스 조회.
//
// 버스와 달리 업스트림 콜이 없다(마스터를 load:subway-stations 로 전량 적재해
// 둔다). 캐시/쿼터/stale 개념이 없어 검색은 순수 DB 조회 + groupStations 그룹핑
// + 정렬 + 절단이다. source 는 계약상 항상 'db'.

import type { PrismaClient } from '@prisma/client';
import type { SubwayStationSearchResultType } from '@repo/api-contract';
import { groupStations } from './subway-master.service.js';

// 응답 상한 — total 은 절단 전 그룹 수(FE 가 '일부만 표시' 안내).
export const MAX_GROUPS = 30;

// 라우트가 HTTP status 로 변환하는 서비스 에러(bus.service 와 동일 규율).
// error-handler 는 statusCode >= 500 을 일괄 500 으로 뭉개므로 라우트가 직접 내린다.
export class SubwayServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    opts: { cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'SubwayServiceError';
  }
}

export interface SubwayServiceDeps {
  prisma: PrismaClient;
  // 테스트 주입용 — fetchedAt 폴백 시각 제어.
  now?: () => Date;
}

export class SubwayService {
  constructor(private readonly deps: SubwayServiceDeps) {}

  async searchStations(q: string): Promise<SubwayStationSearchResultType> {
    // 1차 방어는 스키마(SubwayStationSearchQuery 가 NFC 정규화 후 길이 검증) —
    // 여기는 라우트 밖 호출자 대비 이중 방어.
    const keyword = q.trim().normalize('NFC');
    const { prisma } = this.deps;

    // name 부분일치 + 최신 적재 시각(fetchedAt)을 병렬로. SQLite LIKE 는 한글을
    // 바이트 부분일치로 처리하므로 mode 옵션 불필요.
    const [rows, sync] = await Promise.all([
      prisma.subwayStation.findMany({ where: { name: { contains: keyword } } }),
      prisma.subwayMasterSync.findFirst({ orderBy: { loadedAt: 'desc' } }),
    ]);

    // 매칭 0 이면 마스터 자체가 비었는지 확인 — 빈 마스터(미적재)는 503, 단순
    // 무매칭은 빈 결과(200)로 구분한다.
    if (rows.length === 0) {
      const total = await prisma.subwayStation.count();
      if (total === 0) {
        throw new SubwayServiceError(
          '지하철 역 데이터가 없습니다 — load:subway-stations 실행 필요',
          503,
        );
      }
    }

    const groups = groupStations(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        lineId: r.lineId,
        lineName: r.lineName,
        lat: r.lat,
        lng: r.lng,
      })),
    );

    // 정렬: 전방일치 그룹 우선 → name 길이 → name 사전순(한국어).
    groups.sort((a, b) => {
      const aPrefix = a.name.startsWith(keyword) ? 0 : 1;
      const bPrefix = b.name.startsWith(keyword) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return a.name.localeCompare(b.name, 'ko');
    });

    const fetchedAt = (sync?.loadedAt ?? this.deps.now?.() ?? new Date()).toISOString();

    return {
      items: groups.slice(0, MAX_GROUPS),
      total: groups.length,
      fetchedAt,
      source: 'db',
    };
  }
}
