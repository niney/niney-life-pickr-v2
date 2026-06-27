import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

interface MenuProbeRow {
  group: string | null;
  id: string | null;
  name: string;
  price: string | null;
  description: string | null;
  representative: boolean;
}

interface MethodResult {
  method: string;
  description: string;
  elapsedMs: number;
  rowCount: number;
  uniqueCount: number;
  rows: MenuProbeRow[];
}

interface ProbeReport {
  inputUrl: string;
  placeId: string;
  canonicalUrl: string;
  menuListUrl: string;
  restaurantName: string | null;
  fetchedAt: string;
  methods: MethodResult[];
  comparison: {
    visibleGroupRows: number;
    visibleUniqueWithoutRepresentativeGroup: number;
    currentHomeExactOverlapWithBest: number;
    currentHomeMissingFromBest: MenuProbeRow[];
    bestExtraComparedToCurrentHome: MenuProbeRow[];
  };
}

const usage = (): string =>
  'Usage: pnpm --filter friendly probe:naver-menu-methods -- <naver-place-url>';

const requireArg = (): string => {
  const input = process.argv[2]?.trim();
  if (!input) {
    console.error(usage());
    process.exit(1);
  }
  return input;
};

const priceText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  const n = Number(text.replace(/[^\d]/g, ''));
  if (Number.isFinite(n) && n > 0) return `${n.toLocaleString('ko-KR')}원`;
  return text;
};

const keyOf = (row: Pick<MenuProbeRow, 'name' | 'price'>): string =>
  `${row.name.replace(/\s+/g, ' ').trim()}|${row.price ?? ''}`;

const uniqueRows = (rows: MenuProbeRow[]): MenuProbeRow[] => {
  const out: MenuProbeRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.id ?? keyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
};

const printMethod = (method: MethodResult): void => {
  console.log('');
  console.log(
    `[${method.method}] rows=${method.rowCount} unique=${method.uniqueCount} elapsedMs=${method.elapsedMs}`,
  );
  console.log(`  ${method.description}`);
  method.rows.forEach((row, index) => {
    const prefix = `${String(index + 1).padStart(2, '0')}.`;
    const group = row.group ? `[${row.group}]` : '[uncategorized]';
    const rep = row.representative ? ' 대표' : '';
    console.log(`${prefix} ${group}${rep} ${row.name} - ${row.price ?? '-'}`);
    if (row.description) console.log(`    ${row.description}`);
  });
};

const closeNaverBrowser = async (): Promise<void> => {
  const { closeBrowser } =
    await import('../src/modules/crawl/adapters/naver-place.playwright.adapter.js');
  await closeBrowser().catch(() => undefined);
};

const runCurrentHomeMethod = async (
  placeId: string,
  canonicalUrl: string,
): Promise<{ name: string | null; result: MethodResult }> => {
  process.env.CRAWL_VISITOR_MAX_PAGES ??= '0';
  process.env.CRAWL_VISITOR_HOLD_MS ??= '0';

  const { fetchNaverPlaceWithPlaywright } =
    await import('../src/modules/crawl/adapters/naver-place.playwright.adapter.js');

  const t0 = Date.now();
  try {
    const data = await fetchNaverPlaceWithPlaywright(placeId, canonicalUrl);
    const rows = data.menus.map(
      (menu): MenuProbeRow => ({
        group: null,
        id: null,
        name: menu.name,
        price: priceText(menu.price),
        description: menu.description,
        representative: menu.recommend === true,
      }),
    );
    return {
      name: data.name,
      result: {
        method: 'actual-adapter',
        description:
          '현 크롤러 경로: /menu/list Baemin 그룹 우선, 실패 시 /home Apollo 메뉴 fallback',
        elapsedMs: Date.now() - t0,
        rowCount: rows.length,
        uniqueCount: uniqueRows(rows).length,
        rows,
      },
    };
  } finally {
    await closeNaverBrowser();
  }
};

const clickExpandableMenuButtons = async (page: import('playwright').Page): Promise<void> => {
  for (let i = 0; i < 10; i += 1) {
    const loc = page.locator(
      'button:has-text("펼쳐서 더보기"), a[role="button"]:has-text("펼쳐서 더보기")',
    );
    const count = await loc.count().catch(() => 0);
    if (count > 0) {
      await loc
        .first()
        .click({ timeout: 2_000 })
        .catch(() => undefined);
      await page.waitForTimeout(350);
    }
    await page.evaluate(() => window.scrollBy(0, 700)).catch(() => undefined);
    await page.waitForTimeout(250);
  }
};

const runMenuListMethods = async (
  placeId: string,
  menuListUrl: string,
): Promise<{ native: MethodResult; baeminGroupRows: MethodResult; baeminUnique: MethodResult }> => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    locale: 'ko-KR',
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  try {
    await page.goto(menuListUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    await clickExpandableMenuButtons(page);

    await page.evaluate('globalThis.__name = (fn) => fn');
    const extracted = await page.evaluate((pid) => {
      const state = (globalThis as unknown as { __APOLLO_STATE__?: Record<string, unknown> })
        .__APOLLO_STATE__;
      const s = state && typeof state === 'object' ? state : {};
      const isObject = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null && !Array.isArray(v);
      const deref = (v: unknown): Record<string, unknown> | null => {
        if (isObject(v) && typeof v['__ref'] === 'string') {
          const resolved = s[v['__ref']];
          return isObject(resolved) ? resolved : null;
        }
        return isObject(v) ? v : null;
      };
      const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
      const bool = (v: unknown): boolean => v === true;
      const makeMenu = (
        raw: Record<string, unknown>,
        group: string | null,
      ): MenuProbeRow | null => {
        const name = str(raw['name']) ?? str(raw['menuName']);
        if (!name) return null;
        return {
          group,
          id: str(raw['id']) ?? str(raw['menuId']),
          name,
          price: str(raw['price']) ?? str(raw['priceText']) ?? str(raw['menuPrice']),
          description: str(raw['desc']) ?? str(raw['description']),
          representative:
            bool(raw['isRepresentative']) || bool(raw['recommend']) || bool(raw['isRecommend']),
        };
      };

      const nativeRows: MenuProbeRow[] = [];
      for (const key of Object.keys(s)) {
        if (!key.startsWith(`Menu:${pid}_`) && !key.startsWith(`Menu:${pid}-`)) continue;
        const obj = deref(s[key]);
        if (!obj) continue;
        const menu = makeMenu(obj, null);
        if (menu) nativeRows.push(menu);
      }

      const groupRows: MenuProbeRow[] = [];
      const groupKeys = Object.keys(s)
        .filter((key) => key.startsWith('PlaceDetail_BaeminMenuGroup:'))
        .sort((a, b) => {
          const av = s[a];
          const bv = s[b];
          const ao = isObject(av) && typeof av['order'] === 'number' ? av['order'] : 0;
          const bo = isObject(bv) && typeof bv['order'] === 'number' ? bv['order'] : 0;
          return ao - bo || a.localeCompare(b);
        });
      for (const key of groupKeys) {
        const group = deref(s[key]);
        if (!group) continue;
        const groupName = str(group['name']) ?? str(group['groupName']) ?? str(group['title']);
        const menuRefs = Array.isArray(group['menus']) ? group['menus'] : [];
        for (const ref of menuRefs) {
          const raw = deref(ref);
          if (!raw) continue;
          const menu = makeMenu(raw, groupName);
          if (menu) groupRows.push(menu);
        }
      }
      return { nativeRows, groupRows };
    }, placeId);

    const nativeRows = extracted.nativeRows.map((row) => ({ ...row, price: priceText(row.price) }));
    const groupRows = extracted.groupRows.map((row) => ({ ...row, price: priceText(row.price) }));
    const uniqueBestRows = uniqueRows(groupRows.filter((row) => row.group !== '대표메뉴'));
    const elapsedMs = Date.now() - t0;

    return {
      native: {
        method: 'menu-list-native-menu-cache',
        description: '/menu/list에서 기존 Menu:<placeId>_* 캐시만 사용',
        elapsedMs,
        rowCount: nativeRows.length,
        uniqueCount: uniqueRows(nativeRows).length,
        rows: uniqueRows(nativeRows),
      },
      baeminGroupRows: {
        method: 'menu-list-baemin-groups-visible',
        description:
          '/menu/list의 PlaceDetail_BaeminMenuGroup 전체. 대표메뉴 섹션 중복 포함 화면 행 기준',
        elapsedMs,
        rowCount: groupRows.length,
        uniqueCount: uniqueRows(groupRows).length,
        rows: groupRows,
      },
      baeminUnique: {
        method: 'menu-list-baemin-groups-unique',
        description: '대표메뉴 섹션을 중복 소개 영역으로 보고 제외한 실제 메뉴 unique 기준',
        elapsedMs,
        rowCount: uniqueBestRows.length,
        uniqueCount: uniqueBestRows.length,
        rows: uniqueBestRows,
      },
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
};

const saveReport = async (report: ProbeReport): Promise<string> => {
  const debugDir = fileURLToPath(new URL('../src/modules/crawl/__debug__/', import.meta.url));
  await mkdir(debugDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(debugDir, `naver-menu-methods-${report.placeId}-${stamp}.json`);
  await writeFile(file, JSON.stringify(report, null, 2), 'utf-8');
  return file;
};

const main = async (): Promise<void> => {
  const inputUrl = requireArg();
  const { normalizeToPlaceId } = await import('../src/modules/crawl/url-normalizer.js');
  const normalized = await normalizeToPlaceId(inputUrl);
  const menuListUrl = `https://m.place.naver.com/restaurant/${normalized.placeId}/menu/list`;

  console.log(`[naver-menu-methods] placeId=${normalized.placeId}`);
  console.log(`[naver-menu-methods] menuListUrl=${menuListUrl}`);

  const current = await runCurrentHomeMethod(normalized.placeId, normalized.canonicalUrl);
  const menuList = await runMenuListMethods(normalized.placeId, menuListUrl);

  const currentKeys = new Set(current.result.rows.map(keyOf));
  const bestKeys = new Set(menuList.baeminUnique.rows.map(keyOf));
  const overlap = current.result.rows.filter((row) => bestKeys.has(keyOf(row))).length;
  const currentMissingFromBest = current.result.rows.filter((row) => !bestKeys.has(keyOf(row)));
  const bestExtraComparedToCurrent = menuList.baeminUnique.rows.filter(
    (row) => !currentKeys.has(keyOf(row)),
  );

  const report: ProbeReport = {
    inputUrl,
    placeId: normalized.placeId,
    canonicalUrl: normalized.canonicalUrl,
    menuListUrl,
    restaurantName: current.name,
    fetchedAt: new Date().toISOString(),
    methods: [current.result, menuList.native, menuList.baeminGroupRows, menuList.baeminUnique],
    comparison: {
      visibleGroupRows: menuList.baeminGroupRows.rowCount,
      visibleUniqueWithoutRepresentativeGroup: menuList.baeminUnique.uniqueCount,
      currentHomeExactOverlapWithBest: overlap,
      currentHomeMissingFromBest: currentMissingFromBest,
      bestExtraComparedToCurrentHome: bestExtraComparedToCurrent,
    },
  };

  console.log(`[naver-menu-methods] restaurant=${report.restaurantName ?? '(unknown)'}`);
  for (const method of report.methods) printMethod(method);
  console.log('');
  console.log('[comparison]');
  console.log(
    `  current-home exact overlap with baemin unique: ${overlap}/${menuList.baeminUnique.uniqueCount}`,
  );
  console.log(`  current-home only: ${currentMissingFromBest.length}`);
  console.log(`  baemin unique only: ${bestExtraComparedToCurrent.length}`);

  const file = await saveReport(report);
  console.log(`[naver-menu-methods] wrote ${file}`);
};

main().catch((err: unknown) => {
  console.error('[naver-menu-methods] failed');
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
