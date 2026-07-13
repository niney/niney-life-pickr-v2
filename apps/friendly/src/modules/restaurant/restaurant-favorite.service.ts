import type { PrismaClient } from '@prisma/client';
import {
  RESTAURANT_FAVORITES_MAX,
  type RestaurantFavoriteItemType,
  type RestaurantFavoriteUpsertBodyType,
  type RestaurantFavoritesResultType,
  type RestaurantFavoritesSyncBodyType,
} from '@repo/api-contract';

// 라우트가 HTTP status 로 변환하는 도메인 에러 (bus-favorite 모듈과 동일 스타일).
// 현재는 상한 초과(400) 하나뿐 — 소유자 스코프는 (userId, ...) 쿼리로 강제하고,
// DELETE 는 멱등(deleteMany)이라 not_found 를 던지지 않는다.
export class RestaurantFavoriteError extends Error {
  constructor(
    public readonly code: 'limit_exceeded',
    message: string,
  ) {
    super(message);
    this.name = 'RestaurantFavoriteError';
  }
}

// 사용자별 맛집 즐겨찾기 — 식당(placeId) 1종. 모든 메서드가 userId 를 받아
// 본인 데이터만 다루도록 강제한다. 변경 계열(PUT/DELETE/sync)은 계약대로 변경
// 후 "전체 목록"을 반환해 클라이언트가 diff 없이 캐시를 통째로 교체한다.
export class RestaurantFavoriteService {
  constructor(private readonly prisma: PrismaClient) {}

  // 정렬 계약: createdAt asc(등록순). 같은 밀리초에 여러 행이 생기는
  // sync(createMany) 대비 id(cuid는 시간 선두라 삽입순 근사) 를 안정 tie-break 로
  // 둬 목록 순서가 흔들리지 않게 한다.
  async list(userId: string): Promise<RestaurantFavoritesResultType> {
    const rows = await this.prisma.restaurantFavorite.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
      items: rows.map((r) => ({
        placeId: r.placeId,
        name: r.name,
        category: r.category,
        address: r.address,
        thumbnailUrl: r.thumbnailUrl,
        latitude: r.latitude,
        longitude: r.longitude,
      })),
    };
  }

  // upsert — 이미 있으면 스냅샷 갱신(상한 무관), 없으면 create.
  // 새 항목 추가 시에만 상한 검사(현재 개수 >= MAX 면 400).
  async upsert(
    userId: string,
    placeId: string,
    body: RestaurantFavoriteUpsertBodyType,
  ): Promise<RestaurantFavoritesResultType> {
    const existing = await this.prisma.restaurantFavorite.findUnique({
      where: { userId_placeId: { userId, placeId } },
      select: { id: true },
    });
    if (!existing) await this.assertUnderLimit(userId);

    const snapshot = {
      name: body.name,
      category: body.category,
      address: body.address,
      thumbnailUrl: body.thumbnailUrl,
      latitude: body.latitude,
      longitude: body.longitude,
    };
    await this.prisma.restaurantFavorite.upsert({
      where: { userId_placeId: { userId, placeId } },
      create: { userId, placeId, ...snapshot },
      update: snapshot,
    });
    return this.list(userId);
  }

  // 없어도 성공(멱등) — deleteMany 는 매칭 0건이면 count 0 으로 조용히 통과.
  async remove(userId: string, placeId: string): Promise<RestaurantFavoritesResultType> {
    await this.prisma.restaurantFavorite.deleteMany({ where: { userId, placeId } });
    return this.list(userId);
  }

  // 로그인 직후 게스트 저장분 union 병합 — 서버에 없는 항목만 insert, 이미
  // 있으면 서버 값 유지(스냅샷 덮어쓰지 않음). 상한 도달 시 초과분은 조용히
  // skip(에러 아님 — 로그인 직후 병합이 끊기면 안 됨). 같은 body 재호출 멱등.
  async sync(
    userId: string,
    body: RestaurantFavoritesSyncBodyType,
  ): Promise<RestaurantFavoritesResultType> {
    const existing = await this.prisma.restaurantFavorite.findMany({
      where: { userId },
      select: { placeId: true },
    });

    const placeIds = new Set(existing.map((r) => r.placeId));
    let count = placeIds.size;
    const toCreate: Array<{ userId: string } & RestaurantFavoriteItemType> = [];
    for (const item of body.items) {
      if (placeIds.has(item.placeId)) continue; // 서버 값 유지
      if (count >= RESTAURANT_FAVORITES_MAX) break; // 상한 초과분 조용히 skip
      placeIds.add(item.placeId); // body 내 중복 방어
      toCreate.push({ userId, ...item });
      count += 1;
    }

    if (toCreate.length > 0) {
      await this.prisma.restaurantFavorite.createMany({ data: toCreate });
    }

    return this.list(userId);
  }

  private async assertUnderLimit(userId: string): Promise<void> {
    const count = await this.prisma.restaurantFavorite.count({ where: { userId } });
    if (count >= RESTAURANT_FAVORITES_MAX) {
      throw new RestaurantFavoriteError(
        'limit_exceeded',
        `즐겨찾기는 최대 ${RESTAURANT_FAVORITES_MAX}개까지 저장할 수 있습니다.`,
      );
    }
  }
}
