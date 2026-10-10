import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  closeCatchtableSearchBrowser,
  searchCatchtablePlaces,
} from '../src/modules/crawl/adapters/catchtable-search.playwright.adapter.js';
import {
  closeCatchtableShopBrowser,
  fetchCatchtableShopMenus,
} from '../src/modules/crawl/adapters/catchtable-shop.playwright.adapter.js';

// 메뉴판 읽기(어드민 테스트·eval:menu-boards)의 샘플 사진 수집.
//
// 캐치테이블 가게의 메뉴판 사진(menuBoards)과 가게가 직접 올린 메뉴 목록(menus: 이름·가격)을 같이 저장한다.
// 목록은 사진과 완전히 같지 않은 "약한 정답"이다(사진에 없는 메뉴가 목록에 있거나 그 반대). 회귀 평가는 사진을 직접
// 보고 쓴 검수 정답(golden/menu-boards)으로 한다.
//
//   pnpm --filter friendly collect:menu-boards [-- --shops 30 --per-shop 3 --out data/menu-boards]
//
// 출력: <out>/<shopRef>/meta.json + board-<n>.<ext>. 이미 있는 가게는 건너뛴다(이어 받기).

const DEFAULT_KEYWORDS = [
  '김치찌개', '국밥', '칼국수', '냉면', '삼겹살', '갈비', '돈까스', '중식', '짬뽕', '분식',
  '파스타', '스시', '라멘', '이자카야', '쌀국수', '버거', '베이커리', '카페', '한정식', '해물',
];

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (key?.startsWith('--')) args.set(key.slice(2), process.argv[i + 1] ?? '');
}
const TARGET_SHOPS = Number(args.get('shops') ?? 30);
const PER_SHOP = Number(args.get('per-shop') ?? 3);
const PER_KEYWORD = Number(args.get('per-keyword') ?? 3);
const MIN_MENUS = Number(args.get('min-menus') ?? 5);
const OUT = resolve(args.get('out') ?? 'data/menu-boards');
const KEYWORDS = args.get('keywords')?.split(',').map((k) => k.trim()).filter(Boolean) ?? DEFAULT_KEYWORDS;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const extOf = (url: string, contentType: string | null): string => {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  const m = /\.(jpe?g|png|webp)(?:$|\?)/i.exec(url);
  return m ? m[1]!.toLowerCase().replace('jpeg', 'jpg') : 'jpg';
};

const download = async (url: string): Promise<{ bytes: Buffer; ext: string }> => {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://app.catchtable.co.kr/' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), ext: extOf(url, res.headers.get('content-type')) };
};

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const done = new Set((await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name));
  let accepted = done.size;
  const seen = new Set<string>(done);
  console.log(`출력 ${OUT} — 이미 ${accepted}곳, 목표 ${TARGET_SHOPS}곳`);

  for (const keyword of KEYWORDS) {
    if (accepted >= TARGET_SHOPS) break;
    let fromKeyword = 0;
    const search = await searchCatchtablePlaces(keyword);
    for (const item of search.items) {
      if (accepted >= TARGET_SHOPS || fromKeyword >= PER_KEYWORD) break;
      if (seen.has(item.shopRef)) continue;
      seen.add(item.shopRef);
      await sleep(1200);
      let menus;
      try {
        menus = await fetchCatchtableShopMenus(item.shopRef);
      } catch (error) {
        console.log(`  ${item.shopName}: 메뉴 조회 실패 — ${(error as Error).message}`);
        continue;
      }
      const named = menus.menus.filter((m) => m.name.trim());
      if (menus.menuBoards.length === 0 || named.length < MIN_MENUS) continue;

      const dir = join(OUT, item.shopRef);
      const boards = [];
      for (const [i, board] of menus.menuBoards.slice(0, PER_SHOP).entries()) {
        try {
          const { bytes, ext } = await download(board.imageUrl);
          const file = `board-${i + 1}.${ext}`;
          if (!existsSync(dir)) await mkdir(dir, { recursive: true });
          await writeFile(join(dir, file), bytes);
          boards.push({ file, url: board.imageUrl, width: board.width, height: board.height, type: board.type });
        } catch (error) {
          console.log(`  ${item.shopName}: 사진 ${i + 1} 실패 — ${(error as Error).message}`);
        }
      }
      if (boards.length === 0) continue;
      const meta = {
        shopRef: item.shopRef,
        shopName: item.shopName,
        foodKind: item.foodKind,
        keyword,
        menuBoardTotal: menus.menuBoards.length,
        boards,
        menus: named.map((m) => ({
          name: m.name.trim(),
          minPrice: m.minPrice,
          maxPrice: m.maxPrice,
          description: m.description,
        })),
        fetchedAt: menus.fetchedAt,
      };
      await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
      accepted += 1;
      fromKeyword += 1;
      console.log(`[${accepted}/${TARGET_SHOPS}] ${item.shopName} (${keyword}) — 사진 ${boards.length}/${menus.menuBoards.length}장, 메뉴 ${named.length}개`);
    }
  }
  console.log(`끝 — ${accepted}곳`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([closeCatchtableSearchBrowser(), closeCatchtableShopBrowser()]);
  });
