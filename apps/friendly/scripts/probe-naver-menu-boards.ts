// 네이버 플레이스 '메뉴판 이미지로 보기' 프리뷰 — 메뉴판 사진을 메뉴판 읽기(kimi-k3)로 읽어 네이버 등록 메뉴와 대조한다.
// 사진은 Apollo 상태의 placeDetail(...).menuImages — 크롤러와 같은 추출(extractNaverMenuBoardImages)로 주소·올린
// 날짜를 뽑는다. 크롤된 가게는 스냅샷 menuBoardImages 에도 있지만, 프리뷰는 페이지를 새로 받아 등록 메뉴와 함께 본다.
// DB 는 읽기만 한다.
//
// 실행: pnpm --filter friendly probe:naver-menu-boards [-- --places=<placeId>,<placeId>] [--limit=10]
//   --places 없으면 DB 의 네이버 맛집에서 --limit 곳.
//   --rescore  모델·네이버를 다시 부르지 않고 지난 report.json 으로 대조·HTML 만 다시 만든다(비교 규칙을 고친 뒤).
// 결과(git 제외):
//   data/menu-boards/naver-<placeId>/meta.json + board-N.* — 어드민 '메뉴판 읽기' 샘플 목록에 그대로 뜬다
//   data/menu-boards/naver-preview/index.html·report.json — 가게별 대조(겹침·사진에만·등록에만·가격 다름·표기 다름)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { MenuBoardItemType } from '@repo/api-contract';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import {
  extractNaverMenuBoardImages,
  extractNaverPlaceMenus,
} from '../src/modules/crawl/adapters/naver-place.playwright.adapter.js';
import { buildMenuBoardMenus, menuMatchName } from '../src/modules/menu-board/menu-board.naver-match.js';
import { dedupeItems, headName } from '../src/modules/menu-board/menu-board.score.js';
import { MENU_BOARDS_DIR, MenuBoardService } from '../src/modules/menu-board/menu-board.service.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const PLACES = opt('places')?.split(',').map((p) => p.trim()).filter(Boolean) ?? null;
const LIMIT = Number(opt('limit') ?? 10);
const RESCORE = args.includes('--rescore');
const OUT = join(MENU_BOARDS_DIR, 'naver-preview');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fetchApolloState = async (placeId: string): Promise<Record<string, unknown>> => {
  const res = await fetch(`https://pcmap.place.naver.com/restaurant/${placeId}/menu/list`, {
    headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko' },
  });
  if (!res.ok) throw new Error(`메뉴 페이지 HTTP ${res.status}`);
  const html = await res.text();
  const m = /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});\s*window\./.exec(html);
  if (!m) throw new Error('메뉴 페이지에 __APOLLO_STATE__ 가 없다');
  return JSON.parse(m[1]!) as Record<string, unknown>;
};

const extOf = (url: string, contentType: string | null): string => {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  return /\.(png|webp)$/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
};

interface Photo {
  file: string;
  url: string;
  uploadedOn: string | null;
  items: MenuBoardItemType[];
  durationMs: number | null;
  error: string | null;
}

interface PlaceResult {
  placeId: string;
  name: string;
  category: string | null;
  photos: Photo[];
  registered: { name: string; price: string | null }[];
  registeredComplete: boolean;
  read: MenuBoardItemType[]; // 사진 전체에서 읽은 메뉴(같은 이름은 한 번)
  both: { name: string; price: string | null }[];
  onlyPhoto: MenuBoardItemType[];
  onlyRegistered: { name: string; price: string | null }[];
  priceDiff: { name: string; registered: string | null; photo: string | null }[];
  // 등록 가격이 '39,000~49,000원' 같은 범위(크기별)라 가격을 견주지 않은 메뉴 — 사진은 첫 가격(대개 가장 큰 크기)만 읽는다.
  priceRange: { name: string; registered: string | null; photo: string | null }[];
  nameDiff: { registered: string; photo: string }[];
  error: string | null;
}

// 크롤 저장과 같은 짝짓기(buildMenuBoardMenus — 최근 사진 우선, 영문 병기 빼고, 구분값 origin)로 대조한다.
const compare = (registered: PlaceResult['registered'], photos: Photo[]) => {
  const menus = buildMenuBoardMenus(
    registered,
    photos.map((p) => ({ url: p.url, uploadedOn: p.uploadedOn, read: { items: p.items, model: '', readAt: '' } })),
  );
  const matchedNames = new Set(menus.flatMap((m) => (m.registeredName ? [m.registeredName] : [])));
  const pick = (check: string) =>
    menus
      .filter((m) => m.priceCheck === check)
      .map((m) => ({ name: m.registeredName!, registered: m.registeredPrice, photo: m.price }));
  return {
    both: registered.filter((m) => matchedNames.has(m.name)),
    onlyPhoto: menus
      .filter((m) => m.origin === 'menu-board')
      .map((m) => ({ name: m.name, price: m.price, description: m.description })),
    onlyRegistered: registered.filter((m) => !matchedNames.has(m.name)),
    priceDiff: pick('different'),
    priceRange: pick('range'),
    nameDiff: menus
      .filter((m) => m.registeredName && headName(menuMatchName(m.registeredName)) !== headName(menuMatchName(m.name)))
      .map((m) => ({ registered: m.registeredName!, photo: m.name })),
  };
};

const esc = (s: string | null | undefined): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const renderHtml = (results: PlaceResult[], model: string): string => {
  const total = (f: (r: PlaceResult) => number) => results.reduce((n, r) => n + f(r), 0);
  const rows = results
    .map(
      (r) =>
        `<tr><td><a href="#p${r.placeId}">${esc(r.name)}</a><div class="sub">${esc(r.category)}</div></td>` +
        `<td>${r.photos.length}</td><td>${r.photos.filter((p) => !p.error && p.items.length === 0).length}</td>` +
        `<td>${r.registered.length}${r.registeredComplete ? '' : '?'}</td><td>${r.read.length}</td><td>${r.both.length}</td>` +
        `<td class="hi">${r.onlyPhoto.length}</td><td>${r.onlyRegistered.length}</td><td class="hi">${r.priceDiff.length}</td>` +
        `<td>${r.priceRange.length}</td><td>${r.nameDiff.length}</td></tr>`,
    )
    .join('');
  const list = (title: string, items: string[], cls = '') =>
    items.length ? `<div><h4 class="${cls}">${title} ${items.length}</h4><ul>${items.join('')}</ul></div>` : '';
  const cards = results
    .map((r) => {
      const thumbs = r.photos
        .map(
          (p) =>
            `<a href="../naver-${r.placeId}/${p.file}" target="_blank" class="thumb${p.items.length === 0 ? ' empty' : ''}">` +
            `<img src="../naver-${r.placeId}/${p.file}" loading="lazy"><span>${p.file} · ${p.uploadedOn ?? '날짜 모름'} · ${
              p.error ? '실패' : p.items.length === 0 ? '메뉴 없음' : `${p.items.length}개`
            }</span></a>`,
        )
        .join('');
      const perPhoto = r.photos
        .map(
          (p) =>
            `<details><summary>${p.file} — ${p.error ? esc(p.error) : `${p.items.length}개 · ${((p.durationMs ?? 0) / 1000).toFixed(1)}초`}</summary><ol>${p.items
              .map((i) => `<li>${esc(i.name)} <b>${esc(i.price)}</b>${i.description ? ` <i>${esc(i.description)}</i>` : ''}</li>`)
              .join('')}</ol></details>`,
        )
        .join('');
      return `<section id="p${r.placeId}"><h3>${esc(r.name)} <small>${esc(r.category)} · 메뉴판 사진 ${r.photos.length}장 · 읽은 메뉴 ${r.read.length} · 등록 메뉴 ${r.registered.length}</small></h3>
${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}<div class="thumbs">${thumbs}</div><div class="cols">
${list('사진에만 있음', r.onlyPhoto.map((i) => `<li>${esc(i.name)} <b>${esc(i.price)}</b></li>`), 'hi')}
${list('가격 다름(등록 → 사진)', r.priceDiff.map((d) => `<li>${esc(d.name)} <b>${esc(d.registered)} → ${esc(d.photo)}</b></li>`), 'hi')}
${list('등록에만 있음', r.onlyRegistered.map((m) => `<li>${esc(m.name)} <b>${esc(m.price)}</b></li>`))}
${list('크기별 가격이라 비교 생략(등록 범위 / 사진 첫 가격)', r.priceRange.map((d) => `<li>${esc(d.name)} <b>${esc(d.registered)} / ${esc(d.photo)}</b></li>`))}
${list('표기 다름(등록 / 사진)', r.nameDiff.map((d) => `<li>${esc(d.registered)} / ${esc(d.photo)}</li>`))}
${list('겹침', r.both.map((m) => `<li>${esc(m.name)}</li>`))}
</div>${perPhoto}</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>네이버 메뉴판 사진 프리뷰</title><style>
body{font-family:'Malgun Gothic',sans-serif;margin:24px;color:#222;max-width:1400px}h1{font-size:20px}h3{margin:0 0 8px;font-size:17px}
h3 small{font-weight:normal;color:#666;font-size:13px}table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #ddd;padding:4px 8px;text-align:right}
td:first-child,th:first-child{text-align:left}.sub{color:#888;font-size:11px}.hi{background:#fff4dc}section{border:1px solid #ddd;border-radius:8px;padding:14px;margin:18px 0}
.thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.thumb{display:flex;flex-direction:column;width:150px;font-size:11px;color:#555;text-decoration:none}
.thumb img{width:150px;height:110px;object-fit:cover;border:1px solid #ccc;border-radius:4px}.thumb.empty img{opacity:.45}
.cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:4px 18px;font-size:13px}.cols h4{margin:6px 0 2px}h4.hi{background:#fff4dc;padding:2px 4px}
ul,ol{margin:0;padding-left:18px}b{font-weight:600}i{color:#777}.err{color:#c00}details{font-size:12px;margin:2px 0}
</style><h1>네이버 메뉴판 사진 프리뷰 — ${results.length}곳 · 사진 ${total((r) => r.photos.length)}장 · ${esc(model)}</h1>
<p>사진에서 읽은 메뉴(같은 이름 한 번)를 네이버 등록 메뉴와 이름 유사도·가격으로 짝지었다. '사진에만'·'가격 다름'이 활용 후보(등록 메뉴 보강·가격 최신화).
등록 메뉴 수 뒤 '?' 는 페이지가 전부 담았는지 확실하지 않은 곳.</p>
<table><tr><th>가게</th><th>사진</th><th>메뉴 없는 사진</th><th>등록</th><th>읽음</th><th>겹침</th><th>사진에만</th><th>등록에만</th><th>가격 다름</th><th>크기별(생략)</th><th>표기 다름</th></tr>${rows}
<tr><th>합계</th><th>${total((r) => r.photos.length)}</th><th>${total((r) => r.photos.filter((p) => !p.error && p.items.length === 0).length)}</th><th>${total((r) => r.registered.length)}</th><th>${total((r) => r.read.length)}</th><th>${total((r) => r.both.length)}</th><th>${total((r) => r.onlyPhoto.length)}</th><th>${total((r) => r.onlyRegistered.length)}</th><th>${total((r) => r.priceDiff.length)}</th><th>${total((r) => r.priceRange.length)}</th><th>${total((r) => r.nameDiff.length)}</th></tr></table>
${cards}</html>`;
};

const rescore = async (): Promise<void> => {
  const path = join(OUT, 'report.json');
  const previous = JSON.parse(await readFile(path, 'utf-8')) as { model: string; createdAt: string; results: PlaceResult[] };
  const results = previous.results.map((r) => ({ ...r, ...compare(r.registered, r.photos) }));
  await writeFile(path, JSON.stringify({ ...previous, results }, null, 1));
  await writeFile(join(OUT, 'index.html'), renderHtml(results, previous.model));
  for (const r of results) {
    console.log(`${r.name} — 사진에만 ${r.onlyPhoto.length} · 등록에만 ${r.onlyRegistered.length} · 가격 다름 ${r.priceDiff.length} · 범위 ${r.priceRange.length}`);
  }
  console.log(`
리포트 ${join(OUT, 'index.html')}`);
};

const main = async (): Promise<void> => {
  if (RESCORE) return rescore();
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.restaurant.findMany({
      where: { source: 'naver', placeId: PLACES ? { in: PLACES } : { not: null } },
      select: { placeId: true, name: true, category: true },
      orderBy: { name: 'asc' },
      ...(PLACES ? {} : { take: LIMIT }),
    });
    const places = PLACES ? PLACES.map((id) => rows.find((r) => r.placeId === id) ?? { placeId: id, name: id, category: null }) : rows;
    const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
    const service = new MenuBoardService(aiConfig);
    const model = (await aiConfig.getResolved('ollama-cloud', 'menu-board'))?.defaultModel ?? '?';
    await mkdir(OUT, { recursive: true });
    const results: PlaceResult[] = [];

    for (const [index, place] of places.entries()) {
      const placeId = place.placeId!;
      const base: PlaceResult = {
        placeId,
        name: place.name,
        category: place.category,
        photos: [],
        registered: [],
        registeredComplete: false,
        read: [],
        both: [],
        onlyPhoto: [],
        onlyRegistered: [],
        priceDiff: [],
        nameDiff: [],
        priceRange: [],
        error: null,
      };
      try {
        const state = await fetchApolloState(placeId);
        const { menus, complete } = extractNaverPlaceMenus(state, placeId);
        base.registered = menus.map((m) => ({ name: m.name, price: m.price ?? null }));
        base.registeredComplete = complete;
        const boards = extractNaverMenuBoardImages(state, placeId) ?? [];
        const dir = join(MENU_BOARDS_DIR, `naver-${placeId}`);
        await mkdir(dir, { recursive: true });
        for (const [i, { url, uploadedOn }] of boards.entries()) {
          const res = await fetch(url, { headers: { 'user-agent': UA } });
          const file = `board-${i + 1}.${extOf(url, res.headers.get('content-type'))}`;
          const photo: Photo = { file, url, uploadedOn, items: [], durationMs: null, error: null };
          try {
            if (!res.ok) throw new Error(`사진 HTTP ${res.status}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            await writeFile(join(dir, file), buffer);
            const read = await service.read(buffer);
            photo.items = read.items;
            photo.durationMs = read.durationMs;
          } catch (e) {
            photo.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
          }
          base.photos.push(photo);
          console.log(
            `  [${place.name}] ${file} — ${photo.error ? `실패 ${photo.error}` : `${photo.items.length}개 · ${((photo.durationMs ?? 0) / 1000).toFixed(1)}초`}`,
          );
        }
        // 어드민 '메뉴판 읽기' 샘플 목록 형식(collect:menu-boards 와 같은 meta.json).
        await writeFile(
          join(dir, 'meta.json'),
          JSON.stringify(
            {
              shopRef: `naver-${placeId}`,
              shopName: `${place.name} (네이버)`,
              source: 'naver',
              placeId,
              boards: base.photos.map((p) => ({ file: p.file, url: p.url })),
              menus: base.registered.map((m) => ({ name: m.name, minPrice: m.price })),
              fetchedAt: new Date().toISOString(),
            },
            null,
            1,
          ),
        );
        base.read = dedupeItems(base.photos.flatMap((p) => p.items));
        Object.assign(base, compare(base.registered, base.photos));
      } catch (e) {
        base.error = e instanceof Error ? e.message : String(e);
      }
      results.push(base);
      console.log(
        `[${index + 1}/${places.length}] ${place.name} — 사진 ${base.photos.length} · 읽음 ${base.read.length} · 등록 ${base.registered.length} · ` +
          `사진에만 ${base.onlyPhoto.length} · 가격 다름 ${base.priceDiff.length}${base.error ? ` · 실패 ${base.error}` : ''}`,
      );
      await sleep(1000);
    }

    await writeFile(join(OUT, 'report.json'), JSON.stringify({ model, createdAt: new Date().toISOString(), results }, null, 1));
    await writeFile(join(OUT, 'index.html'), renderHtml(results, model));
    console.log(`\n리포트 ${join(OUT, 'index.html')}`);
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
