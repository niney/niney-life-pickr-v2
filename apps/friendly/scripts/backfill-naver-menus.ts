// 네이버 맛집 메뉴 백필 — 2026-09 네이버 메뉴 구조 개편(placeMenus) 뒤 파싱이 0건이 돼
// 메뉴 없이 저장된 가게의 메뉴만 다시 받는다. 홈 1장(+부족할 때만 /menu/list)만 열고
// 리뷰 서브페이지는 열지 않으므로 전체 재크롤보다 가볍다. 스냅샷의 menus/menuGroups 만
// 바꾸고 리뷰·요약·다른 필드는 건드리지 않는다.
//
// 실행: pnpm --filter friendly backfill:naver-menus [옵션]
//   (기본)          스냅샷 메뉴가 0건인 네이버 가게 전부, 최근 크롤 순
//   --all           메뉴가 있는 가게도 전부 다시 받는다(카테고리 그룹 갱신용)
//   --place=a,b     지정한 placeId 만
//   --limit=N       최대 N곳
//   --delay=ms      가게 사이 대기(기본 3000) — 네이버 레이트리밋 회피
//   --dry-run       받아서 결과만 출력, 쓰지 않는다

import { PrismaClient } from '@prisma/client';
import {
  closeBrowser,
  fetchNaverPlaceMenusWithPlaywright,
} from '../src/modules/crawl/adapters/naver-place.playwright.adapter.js';
import { RestaurantService } from '../src/modules/restaurant/restaurant.service.js';

const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const PLACES =
  arg('place')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? null;
const LIMIT = Number(arg('limit') ?? '0') || null;
const DELAY_MS = Number(arg('delay') ?? '3000');

const prisma = new PrismaClient();
const restaurants = new RestaurantService(prisma);

interface Target {
  placeId: string;
  name: string;
  menuCount: number;
}

const loadTargets = async (): Promise<Target[]> => {
  // snapshotJson 전체를 올리지 않고 SQLite JSON 함수로 메뉴 수만 본다.
  const rows = await prisma.$queryRaw<Array<{ placeId: string; name: string; menuCount: number }>>`
    SELECT placeId, name,
           COALESCE(json_array_length(snapshotJson, '$.menus'), 0) AS menuCount
    FROM restaurants
    WHERE source = 'naver' AND placeId IS NOT NULL
    ORDER BY lastCrawledAt DESC
  `;
  const targets = rows
    .map((r) => ({ ...r, menuCount: Number(r.menuCount) }))
    .filter((r) => (PLACES ? PLACES.includes(r.placeId) : ALL || r.menuCount === 0));
  return LIMIT ? targets.slice(0, LIMIT) : targets;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async (): Promise<void> => {
  const targets = await loadTargets();
  const scope = PLACES ? `지정 ${PLACES.length}곳` : ALL ? '네이버 전체' : '메뉴 0건';
  console.log(
    `\n=== 네이버 메뉴 백필 (${scope}${DRY_RUN ? ', --dry-run' : ''}) — 대상 ${targets.length}곳 ===`,
  );

  let updated = 0;
  let empty = 0;
  let failed = 0;
  for (const [index, t] of targets.entries()) {
    if (index > 0 && DELAY_MS > 0) await sleep(DELAY_MS);
    const head = `[${index + 1}/${targets.length}] ${t.placeId} ${t.name}`;
    try {
      const r = await fetchNaverPlaceMenusWithPlaywright(t.placeId);
      const { info } = r;
      const detail = `${info.source} · 메뉴 ${t.menuCount}→${info.menuCount} · 그룹 ${info.groupCount} · 전체 ${info.expectedCount ?? '?'} · menu/list ${info.menuListPage}`;
      if (r.menus.length === 0) {
        empty += 1;
        console.log(`${head} — 0건${info.suspicious ? ' ⚠️ 구조 변경 의심' : ''} (${detail})`);
        continue;
      }
      if (!DRY_RUN) await restaurants.updateNaverMenus(t.placeId, r.menus, r.menuGroups);
      updated += 1;
      console.log(`${head} — ${DRY_RUN ? '확인' : '갱신'} (${detail})`);
    } catch (e) {
      failed += 1;
      console.log(`${head} — 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(
    `\n[결과] ${DRY_RUN ? '확인' : '갱신'} ${updated} · 0건 ${empty} · 실패 ${failed}${DRY_RUN ? ' — --dry-run, 쓰기 생략' : ''}`,
  );
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowser();
    await prisma.$disconnect();
  });
