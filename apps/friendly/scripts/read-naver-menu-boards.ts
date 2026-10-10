// 네이버 맛집 메뉴판 사진 일괄 읽기 — 크롤 직후 자동 읽기(crawl.service)와 같은 리더로, 이미 크롤된 가게의 안 읽었거나
// 옛 프롬프트 버전으로 읽은 메뉴판 사진을 읽어 스냅샷에 붙이고 등록 메뉴와 짝(menuBoardMenus, 구분값 origin)을 만든다.
// 사진 목록(menuBoardImages)이 없는 옛 스냅샷은 먼저 backfill:naver-menus 로 받는다.
//
// 실행: pnpm --filter friendly read:naver-menu-boards [-- --place=a,b] [--limit=N]
//   (기본) 다시 읽을 메뉴판 사진이 있는 네이버 가게 전부, 최근 크롤 순. 한 가게씩 차례로(동시 호출 없음).

import { PrismaClient } from '@prisma/client';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { NaverMenuBoardReader } from '../src/modules/menu-board/menu-board.naver.js';
import { MENU_BOARD_PROMPT_VERSION } from '../src/modules/menu-board/menu-board.prompt.js';
import { MenuBoardService } from '../src/modules/menu-board/menu-board.service.js';
import { RestaurantService } from '../src/modules/restaurant/restaurant.service.js';

const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const PLACES = arg('place')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const LIMIT = Number(arg('limit') ?? '0') || null;

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const restaurants = new RestaurantService(prisma);
  const reader = new NaverMenuBoardReader(
    restaurants,
    new MenuBoardService(new AiConfigService(prisma, buildLlmProviderEnv())),
  );
  // 스냅샷 전체를 올리지 않고 SQLite JSON 함수로 다시 읽을 사진(안 읽음·옛 프롬프트 버전)이 있는 가게만 고른다.
  const rows = await prisma.$queryRaw<{ placeId: string; name: string; pending: number }[]>`
    SELECT r.placeId AS placeId, r.name AS name,
           (SELECT COUNT(*) FROM json_each(r.snapshotJson, '$.menuBoardImages') AS j
             WHERE json_extract(j.value, '$.read') IS NULL
                OR COALESCE(json_extract(j.value, '$.read.promptVersion'), 1) < ${MENU_BOARD_PROMPT_VERSION}) AS pending
      FROM restaurants r
     WHERE r.source = 'naver' AND r.placeId IS NOT NULL AND json_valid(r.snapshotJson)
     ORDER BY r.lastCrawledAt DESC`;
  const targets = rows
    .filter((r) => (PLACES ? PLACES.includes(r.placeId) : Number(r.pending) > 0))
    .slice(0, LIMIT ?? undefined);
  console.log(
    `=== 메뉴판 사진 읽기(프롬프트 v${MENU_BOARD_PROMPT_VERSION}) — 대상 ${targets.length}곳 · 읽을 사진 ${targets.reduce((n, t) => n + Number(t.pending), 0)}장 ===`,
  );

  let read = 0;
  let failed = 0;
  for (const [index, t] of targets.entries()) {
    const startedAt = Date.now();
    const summary = await reader.readPending(t.placeId);
    const head = `[${index + 1}/${targets.length}] ${t.placeId} ${t.name}`;
    if (!summary) {
      console.log(`${head} — 사진 목록 없음(backfill:naver-menus 먼저)`);
      continue;
    }
    if (summary.noProvider) {
      console.log(`${head} — 메뉴판 읽기 모델·키가 없어 멈춤`);
      break;
    }
    read += summary.read;
    failed += summary.failed.length;
    console.log(
      `${head} — 읽음 ${summary.read}장(전체 ${summary.total}, 이미 ${summary.alreadyRead}) · 사진에만 있는 메뉴 ${summary.added}개` +
        `${summary.failed.length ? ` · 실패 ${summary.failed.length}장 (${summary.failed[0]!.error})` : ''} · ${((Date.now() - startedAt) / 1000).toFixed(1)}초`,
    );
  }
  console.log(`\n[결과] 읽음 ${read}장 · 실패 ${failed}장`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
