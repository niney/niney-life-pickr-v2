import type { PrismaClient } from '@prisma/client';
import {
  SUBWAY_FAVORITES_MAX,
  type SubwayFavoriteLineUpsertBodyType,
  type SubwayFavoriteStationUpsertBodyType,
  type SubwayFavoritesResultType,
  type SubwayFavoritesSyncBodyType,
} from '@repo/api-contract';

// 라우트가 HTTP status 로 변환하는 도메인 에러 (bus-favorite 와 동일 스타일).
// 현재는 상한 초과(400) 하나뿐 — 소유자 스코프는 (userId, ...) 쿼리로 강제하고,
// DELETE 는 멱등(deleteMany)이라 not_found 를 던지지 않는다.
export class SubwayFavoriteError extends Error {
  constructor(
    public readonly code: 'limit_exceeded',
    message: string,
  ) {
    super(message);
    this.name = 'SubwayFavoriteError';
  }
}

// lines 컬럼 join/split — 계약은 lineId[](오름차순), SQLite 는 배열 컬럼이 없어
// 콤마 결합 문자열로 저장한다. 변환은 서비스 경계에서만.
const joinLines = (lines: string[]): string => lines.join(',');
const splitLines = (lines: string): string[] => lines.split(',').filter((l) => l.length > 0);

// 사용자별 지하철 즐겨찾기 — 역 그룹(stationId) / 역×호선(stationId+lineId) 두 종류.
// 모든 메서드가 userId 를 받아 본인 데이터만 다룬다. 변경 계열(PUT/DELETE/sync)은
// 계약대로 변경 후 "전체 목록"을 반환해 클라이언트가 diff 없이 캐시를 통째로 교체.
export class SubwayFavoriteService {
  constructor(private readonly prisma: PrismaClient) {}

  // 정렬 계약: 둘 다 createdAt asc(등록순). 같은 밀리초 sync(createMany) 대비
  // id(cuid 는 시간 선두라 삽입순 근사)를 안정 tie-break 로 둔다.
  async list(userId: string): Promise<SubwayFavoritesResultType> {
    const [stations, lines] = await this.prisma.$transaction([
      this.prisma.subwayFavoriteStation.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.subwayFavoriteLine.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      stations: stations.map((s) => ({
        stationId: s.stationId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        lines: splitLines(s.lines),
      })),
      lines: lines.map((l) => ({
        stationId: l.stationId,
        lineId: l.lineId,
        stationName: l.stationName,
        lat: l.lat,
        lng: l.lng,
      })),
    };
  }

  // 역 upsert — 이미 있으면 스냅샷 갱신(상한 무관), 없으면 create(상한 검사).
  async upsertStation(
    userId: string,
    stationId: string,
    body: SubwayFavoriteStationUpsertBodyType,
  ): Promise<SubwayFavoritesResultType> {
    const existing = await this.prisma.subwayFavoriteStation.findUnique({
      where: { userId_stationId: { userId, stationId } },
      select: { id: true },
    });
    if (!existing) await this.assertUnderStationLimit(userId);

    await this.prisma.subwayFavoriteStation.upsert({
      where: { userId_stationId: { userId, stationId } },
      create: {
        userId,
        stationId,
        name: body.name,
        lines: joinLines(body.lines),
        lat: body.lat,
        lng: body.lng,
      },
      update: {
        name: body.name,
        lines: joinLines(body.lines),
        lat: body.lat,
        lng: body.lng,
      },
    });
    return this.list(userId);
  }

  // 없어도 성공(멱등) — deleteMany 는 매칭 0건이면 조용히 통과.
  async deleteStation(userId: string, stationId: string): Promise<SubwayFavoritesResultType> {
    await this.prisma.subwayFavoriteStation.deleteMany({ where: { userId, stationId } });
    return this.list(userId);
  }

  async upsertLine(
    userId: string,
    stationId: string,
    lineId: string,
    body: SubwayFavoriteLineUpsertBodyType,
  ): Promise<SubwayFavoritesResultType> {
    const existing = await this.prisma.subwayFavoriteLine.findUnique({
      where: { userId_stationId_lineId: { userId, stationId, lineId } },
      select: { id: true },
    });
    if (!existing) await this.assertUnderLineLimit(userId);

    await this.prisma.subwayFavoriteLine.upsert({
      where: { userId_stationId_lineId: { userId, stationId, lineId } },
      create: {
        userId,
        stationId,
        lineId,
        stationName: body.stationName,
        lat: body.lat,
        lng: body.lng,
      },
      update: { stationName: body.stationName, lat: body.lat, lng: body.lng },
    });
    return this.list(userId);
  }

  async deleteLine(
    userId: string,
    stationId: string,
    lineId: string,
  ): Promise<SubwayFavoritesResultType> {
    await this.prisma.subwayFavoriteLine.deleteMany({ where: { userId, stationId, lineId } });
    return this.list(userId);
  }

  // 로그인 직후 게스트 저장분 union 병합 — 서버에 없는 항목만 insert, 이미 있으면
  // 서버 값 유지(스냅샷 덮어쓰지 않음). 상한 도달 시 초과분 조용히 skip(에러 아님).
  // 같은 body 재호출 멱등.
  async sync(
    userId: string,
    body: SubwayFavoritesSyncBodyType,
  ): Promise<SubwayFavoritesResultType> {
    const [existingStations, existingLines] = await this.prisma.$transaction([
      this.prisma.subwayFavoriteStation.findMany({
        where: { userId },
        select: { stationId: true },
      }),
      this.prisma.subwayFavoriteLine.findMany({
        where: { userId },
        select: { stationId: true, lineId: true },
      }),
    ]);

    const stationIds = new Set(existingStations.map((s) => s.stationId));
    let stationCount = stationIds.size;
    const stationsToCreate: SubwayFavoriteStationCreate[] = [];
    for (const s of body.stations) {
      if (stationIds.has(s.stationId)) continue; // 서버 값 유지
      if (stationCount >= SUBWAY_FAVORITES_MAX) break; // 상한 초과분 조용히 skip
      stationIds.add(s.stationId); // body 내 중복 방어
      stationsToCreate.push({
        userId,
        stationId: s.stationId,
        name: s.name,
        lines: joinLines(s.lines),
        lat: s.lat,
        lng: s.lng,
      });
      stationCount += 1;
    }

    const lineKey = (stationId: string, lineId: string): string => `${stationId} ${lineId}`;
    const lineKeys = new Set(existingLines.map((l) => lineKey(l.stationId, l.lineId)));
    let lineCount = lineKeys.size;
    const linesToCreate: SubwayFavoriteLineCreate[] = [];
    for (const l of body.lines) {
      const key = lineKey(l.stationId, l.lineId);
      if (lineKeys.has(key)) continue;
      if (lineCount >= SUBWAY_FAVORITES_MAX) break;
      lineKeys.add(key);
      linesToCreate.push({
        userId,
        stationId: l.stationId,
        lineId: l.lineId,
        stationName: l.stationName,
        lat: l.lat,
        lng: l.lng,
      });
      lineCount += 1;
    }

    if (stationsToCreate.length > 0 || linesToCreate.length > 0) {
      await this.prisma.$transaction([
        ...(stationsToCreate.length > 0
          ? [this.prisma.subwayFavoriteStation.createMany({ data: stationsToCreate })]
          : []),
        ...(linesToCreate.length > 0
          ? [this.prisma.subwayFavoriteLine.createMany({ data: linesToCreate })]
          : []),
      ]);
    }

    return this.list(userId);
  }

  private async assertUnderStationLimit(userId: string): Promise<void> {
    const count = await this.prisma.subwayFavoriteStation.count({ where: { userId } });
    if (count >= SUBWAY_FAVORITES_MAX) {
      throw new SubwayFavoriteError(
        'limit_exceeded',
        `즐겨찾기는 최대 ${SUBWAY_FAVORITES_MAX}개까지 저장할 수 있습니다.`,
      );
    }
  }

  private async assertUnderLineLimit(userId: string): Promise<void> {
    const count = await this.prisma.subwayFavoriteLine.count({ where: { userId } });
    if (count >= SUBWAY_FAVORITES_MAX) {
      throw new SubwayFavoriteError(
        'limit_exceeded',
        `즐겨찾기는 최대 ${SUBWAY_FAVORITES_MAX}개까지 저장할 수 있습니다.`,
      );
    }
  }
}

interface SubwayFavoriteStationCreate {
  userId: string;
  stationId: string;
  name: string;
  lines: string;
  lat: number;
  lng: number;
}

interface SubwayFavoriteLineCreate {
  userId: string;
  stationId: string;
  lineId: string;
  stationName: string;
  lat: number;
  lng: number;
}
