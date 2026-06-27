import { PrismaClient } from '@prisma/client';
import { normalizeToPlaceId } from '../src/modules/crawl/url-normalizer.js';
import {
  closeBrowser,
  fetchNaverPlaceWithPlaywright,
} from '../src/modules/crawl/adapters/naver-place.playwright.adapter.js';
import { RestaurantService } from '../src/modules/restaurant/restaurant.service.js';

const inputUrl =
  process.argv[2]?.trim() ?? 'https://m.place.naver.com/restaurant/1772072886/menu/list';

process.env.CRAWL_VISITOR_MAX_PAGES ??= '0';

const prisma = new PrismaClient();

const toJsonSafe = (value: unknown): unknown =>
  typeof value === 'bigint'
    ? Number(value)
    : Array.isArray(value)
      ? value.map(toJsonSafe)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonSafe(item)]))
        : value;

try {
  const normalized = await normalizeToPlaceId(inputUrl);
  const data = await fetchNaverPlaceWithPlaywright(normalized.placeId, normalized.canonicalUrl);
  const service = new RestaurantService(prisma);
  const row = await service.upsertRestaurantFromCrawl(data);
  const groups = await prisma.$queryRawUnsafe<Array<{ name: string; menuCount: number }>>(
    [
      'SELECT g.name, COUNT(m.id) AS menuCount',
      'FROM restaurant_menu_groups g',
      'LEFT JOIN restaurant_menus m ON m.groupId = g.id',
      'GROUP BY g.id',
      'ORDER BY g.sortOrder ASC',
    ].join(' '),
  );
  const counts = await prisma.$queryRawUnsafe<
    Array<{ restaurants: number; groups: number; menus: number }>
  >(
    [
      'SELECT',
      '(SELECT COUNT(*) FROM restaurants) AS restaurants,',
      '(SELECT COUNT(*) FROM restaurant_menu_groups) AS groups,',
      '(SELECT COUNT(*) FROM restaurant_menus) AS menus',
    ].join(' '),
  );
  const snapshot = await prisma.$queryRawUnsafe<Array<{ snapshotJson: string }>>(
    'SELECT snapshotJson FROM restaurants WHERE id = ?',
    row.id,
  );
  const parsed = JSON.parse(snapshot[0]?.snapshotJson ?? '{}') as {
    menus?: unknown[];
    menuGroups?: unknown[];
  };

  console.log(
    JSON.stringify(
      {
        restaurantId: row.id,
        crawlMenus: data.menus.length,
        crawlGroups: data.menuGroups?.length ?? 0,
        dbCounts: toJsonSafe(counts[0]),
        groups: toJsonSafe(groups),
        snapshotMenus: parsed.menus?.length ?? null,
        snapshotGroups: parsed.menuGroups?.length ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  await closeBrowser().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
}
