import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Source = 'naver' | 'catchtable' | 'diningcode' | 'tabling' | 'tabling-place';

interface Target {
  source: Source;
  inputUrl: string;
  id?: string;
}

interface ProbeMenu {
  category: string | null;
  name: string;
  price: string | null;
  description: string | null;
  flags: string[];
  imageUrls: string[];
}

interface ProbeResult {
  source: Source;
  id: string;
  inputUrl: string;
  rawSourceUrl: string | null;
  restaurantName: string | null;
  fetchedAt: string;
  elapsedMs: number;
  menuCount: number;
  menus: ProbeMenu[];
  meta: Record<string, unknown>;
}

const usage = (): string =>
  [
    'Usage:',
    '  pnpm --filter friendly probe:menu-extraction -- <restaurant-url>',
    '',
    'Supported URL examples:',
    '  https://m.place.naver.com/restaurant/<placeId>/home',
    '  https://app.catchtable.co.kr/ct/shop/<shopRef>',
    '  https://www.diningcode.com/profile.php?rid=<vRid>',
    '  https://www.tabling.co.kr/restaurant/<idx>',
  ].join('\n');

const requireArg = (): string => {
  const input = process.argv[2]?.trim();
  if (!input) {
    console.error(usage());
    process.exit(1);
  }
  return input;
};

const parseUrl = (input: string): URL => {
  try {
    return new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
};

const hostEndsWith = (url: URL, suffix: string): boolean =>
  url.hostname === suffix || url.hostname.endsWith(`.${suffix}`);

const detectTarget = (inputUrl: string): Target => {
  const url = parseUrl(inputUrl);

  if (hostEndsWith(url, 'naver.com') || url.hostname === 'naver.me') {
    return { source: 'naver', inputUrl };
  }

  if (hostEndsWith(url, 'catchtable.co.kr')) {
    const match = url.pathname.match(/\/ct\/shop\/([^/?#]+)/);
    if (!match?.[1]) {
      throw new Error('Catchtable URL must include /ct/shop/<shopRef>');
    }
    return {
      source: 'catchtable',
      inputUrl,
      id: decodeURIComponent(match[1]),
    };
  }

  if (hostEndsWith(url, 'diningcode.com')) {
    const rid = url.searchParams.get('rid');
    if (!rid) {
      throw new Error('Diningcode URL must include ?rid=<vRid>');
    }
    return {
      source: 'diningcode',
      inputUrl,
      id: rid,
    };
  }

  if (hostEndsWith(url, 'tabling.co.kr')) {
    const restaurant = url.pathname.match(/\/restaurant\/(\d+)/);
    if (restaurant?.[1]) {
      return {
        source: 'tabling',
        inputUrl,
        id: restaurant[1],
      };
    }

    const place = url.pathname.match(/\/place\/([0-9a-fA-F]{24})/);
    if (place?.[1]) {
      return {
        source: 'tabling-place',
        inputUrl,
        id: place[1],
      };
    }

    throw new Error('Tabling URL must include /restaurant/<idx> or /place/<objectId>');
  }

  throw new Error(`Unsupported host: ${url.hostname}`);
};

const priceOf = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
};

const printResult = async (result: ProbeResult): Promise<void> => {
  console.log('');
  console.log(`[menu-probe] source=${result.source} id=${result.id}`);
  console.log(`[menu-probe] restaurant=${result.restaurantName ?? '(unknown)'}`);
  console.log(`[menu-probe] rawSourceUrl=${result.rawSourceUrl ?? '-'}`);
  console.log(`[menu-probe] menuCount=${result.menuCount} elapsedMs=${result.elapsedMs}`);
  console.log('');

  if (result.menus.length === 0) {
    console.log('[menu-probe] no menus extracted');
  } else {
    result.menus.forEach((menu, index) => {
      const bits = [
        `${String(index + 1).padStart(2, '0')}.`,
        menu.category ? `[${menu.category}]` : '[uncategorized]',
        menu.name,
        menu.price ? `price=${menu.price}` : 'price=-',
      ];
      if (menu.flags.length > 0) bits.push(`flags=${menu.flags.join(',')}`);
      console.log(bits.join(' '));
      if (menu.description) console.log(`    desc=${menu.description}`);
      if (menu.imageUrls.length > 0) console.log(`    images=${menu.imageUrls.join(', ')}`);
    });
  }

  const debugDir = fileURLToPath(new URL('../src/modules/crawl/__debug__/', import.meta.url));
  await mkdir(debugDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(debugDir, `menu-probe-${result.source}-${result.id}-${stamp}.json`);
  await writeFile(file, JSON.stringify(result, null, 2), 'utf-8');
  console.log('');
  console.log(`[menu-probe] wrote ${file}`);
};

const probeNaver = async (target: Target): Promise<ProbeResult> => {
  process.env.CRAWL_VISITOR_MAX_PAGES ??= '0';
  process.env.CRAWL_VISITOR_HOLD_MS ??= '0';

  const { normalizeToPlaceId } = await import('../src/modules/crawl/url-normalizer.js');
  const { fetchNaverPlaceWithPlaywright, closeBrowser } =
    await import('../src/modules/crawl/adapters/naver-place.playwright.adapter.js');

  const normalized = await normalizeToPlaceId(target.inputUrl);
  const t0 = Date.now();
  try {
    const data = await fetchNaverPlaceWithPlaywright(normalized.placeId, normalized.canonicalUrl);
    const groups = data.menuGroups ?? [];
    const categoryByMenu = new Map<string, string>();
    for (const group of groups) {
      if (group.name === '대표메뉴') continue;
      for (const menu of group.menus) {
        const key = `${menu.name.replace(/\s+/g, ' ').trim()}|${menu.price ?? ''}`;
        if (!categoryByMenu.has(key)) categoryByMenu.set(key, group.name);
      }
    }
    return {
      source: 'naver',
      id: data.placeId,
      inputUrl: target.inputUrl,
      rawSourceUrl: data.rawSourceUrl,
      restaurantName: data.name,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - t0,
      menuCount: data.menus.length,
      menus: data.menus.map((m) => ({
        category:
          categoryByMenu.get(`${m.name.replace(/\s+/g, ' ').trim()}|${m.price ?? ''}`) ?? null,
        name: m.name,
        price: priceOf(m.price),
        description: m.description,
        flags: m.recommend ? ['recommend'] : [],
        imageUrls: m.imageUrls,
      })),
      meta: {
        category: data.category,
        reviewCount: data.reviewCount,
        visitorReviewsLoaded: data.visitorReviews.length,
        canonicalUrl: normalized.canonicalUrl,
        menuGroups: groups.map((group) => ({
          name: group.name,
          source: group.source,
          menuCount: group.menus.length,
        })),
      },
    };
  } finally {
    await closeBrowser().catch(() => undefined);
  }
};

const probeCatchtable = async (target: Target): Promise<ProbeResult> => {
  if (!target.id) throw new Error('Missing catchtable shopRef');
  const { fetchCatchtableShop, fetchCatchtableShopMenus, closeCatchtableShopBrowser } =
    await import('../src/modules/crawl/adapters/catchtable-shop.playwright.adapter.js');

  const t0 = Date.now();
  try {
    const [detail, menus] = await Promise.all([
      fetchCatchtableShop(target.id),
      fetchCatchtableShopMenus(target.id),
    ]);
    return {
      source: 'catchtable',
      id: target.id,
      inputUrl: target.inputUrl,
      rawSourceUrl: detail.rawSourceUrl,
      restaurantName: detail.shopName,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - t0,
      menuCount: menus.menus.length,
      menus: menus.menus.map((m) => ({
        category: null,
        name: m.name,
        price:
          m.minPrice && m.maxPrice && m.minPrice !== m.maxPrice
            ? `${m.minPrice}~${m.maxPrice}`
            : priceOf(m.minPrice ?? m.maxPrice),
        description: m.description,
        flags: [
          m.isRepresentative ? 'representative' : null,
          m.isRecommended ? 'recommended' : null,
          m.isNew ? 'new' : null,
        ].filter((v): v is string => v !== null),
        imageUrls: m.imageUrl ? [m.imageUrl] : [],
      })),
      meta: {
        category: detail.category,
        landName: detail.landName,
        detailLazyMenuCount: detail.menus?.length ?? null,
        menuBoardCount: menus.menuBoards.length,
        menuDetailInfo: menus.menuDetailInfo,
      },
    };
  } finally {
    await closeCatchtableShopBrowser().catch(() => undefined);
  }
};

const probeDiningcode = async (target: Target): Promise<ProbeResult> => {
  if (!target.id) throw new Error('Missing diningcode vRid');
  const { fetchDiningcodeShop } =
    await import('../src/modules/crawl/adapters/diningcode-shop.http.adapter.js');

  const t0 = Date.now();
  const data = await fetchDiningcodeShop(target.id);
  return {
    source: 'diningcode',
    id: data.vRid,
    inputUrl: target.inputUrl,
    rawSourceUrl: data.rawSourceUrl,
    restaurantName: data.fullName,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    menuCount: data.menus.length,
    menus: data.menus.map((m) => ({
      category: null,
      name: m.name,
      price: priceOf(m.price),
      description: m.description,
      flags: [
        m.best ? 'best' : null,
        m.rank > 0 ? `rank:${m.rank}` : null,
        m.selectionCount > 0 ? `selectionCount:${m.selectionCount}` : null,
        m.reviewCount > 0 ? `reviewCount:${m.reviewCount}` : null,
      ].filter((v): v is string => v !== null),
      imageUrls: [],
    })),
    meta: {
      categories: data.categories,
      menuTotalCount: data.menuTotalCount,
      hasPopularMenu: data.hasPopularMenu,
    },
  };
};

const probeTabling = async (target: Target): Promise<ProbeResult> => {
  if (!target.id) throw new Error('Missing tabling idx');
  const idx = Number(target.id);
  if (!Number.isInteger(idx) || idx <= 0) throw new Error(`Invalid tabling idx: ${target.id}`);
  const { fetchTablingShop } =
    await import('../src/modules/crawl/adapters/tabling-shop.http.adapter.js');

  const t0 = Date.now();
  const data = await fetchTablingShop(idx);
  const menus = data.menuCategories.flatMap((category) =>
    category.menus.map(
      (m): ProbeMenu => ({
        category: category.categoryName,
        name: m.name,
        price: priceOf(m.price),
        description: m.description,
        flags: [m.isMain ? 'main' : null, m.isFeatured ? 'featured' : null].filter(
          (v): v is string => v !== null,
        ),
        imageUrls: m.imageUrl ? [m.imageUrl] : [],
      }),
    ),
  );
  return {
    source: 'tabling',
    id: String(data.idx),
    inputUrl: target.inputUrl,
    rawSourceUrl: data.rawSourceUrl,
    restaurantName: data.name,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    menuCount: menus.length,
    menus,
    meta: {
      category: data.category,
      menuCategoryCount: data.menuCategories.length,
      reviewTotalCount: data.reviewTotalCount,
    },
  };
};

const probeTablingPlace = async (target: Target): Promise<ProbeResult> => {
  if (!target.id) throw new Error('Missing tabling place objectId');
  const { fetchTablingPlace } =
    await import('../src/modules/crawl/adapters/tabling-place.http.adapter.js');

  const t0 = Date.now();
  const data = await fetchTablingPlace(target.id);
  return {
    source: 'tabling-place',
    id: data.objectId,
    inputUrl: target.inputUrl,
    rawSourceUrl: data.rawSourceUrl,
    restaurantName: data.name,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    menuCount: 0,
    menus: [],
    meta: {
      cuisines: data.cuisines,
      note: 'Tabling place tier is JSON-LD only and has no menu endpoint.',
    },
  };
};

const main = async (): Promise<void> => {
  const input = requireArg();
  const target = detectTarget(input);
  console.log(`[menu-probe] detected source=${target.source} id=${target.id ?? '(resolve)'}`);

  const result =
    target.source === 'naver'
      ? await probeNaver(target)
      : target.source === 'catchtable'
        ? await probeCatchtable(target)
        : target.source === 'diningcode'
          ? await probeDiningcode(target)
          : target.source === 'tabling'
            ? await probeTabling(target)
            : await probeTablingPlace(target);

  await printResult(result);
};

main().catch((err: unknown) => {
  console.error('[menu-probe] failed');
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
