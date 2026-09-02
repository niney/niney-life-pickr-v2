// 타로 덱 빌드 — 제미나이 원본(assets-src/tarot/raw/<cardId>.png|jpg|webp) → 7:12 중앙 크롭
// → webp 1024×1756 / 512×878 → apps/web/public/tarot/cards/. 뒷면(back)은 상하좌우 강제 대칭.
//
// 실행: pnpm --filter friendly build:tarot-deck [--src=<dir>] [--out=<dir>] [--only=major-00,back]
//        [--quality=82] [--no-symmetrize] [--placeholders]
//   --placeholders   원본이 없는 카드는 이름만 적힌 임시 카드를 만든다(2차 개발용). 실제 이미지가
//                    들어오면 다시 실행해 덮어쓴다. manifest.json 에 placeholder 여부가 남는다.
//   --no-symmetrize  뒷면 대칭 처리 생략(이미 완전 대칭인 원본).
//   --only           쉼표 구분 cardId 만 처리. manifest 의 다른 항목은 유지.
// 산출물 목록·누락 카드는 manifest.json 과 콘솔에 남긴다. 원본 디렉터리는 gitignore, 산출물은 커밋.
// 카드 id·치수의 단일 출처는 @repo/utils(tarotCards.ts / tarot.ts).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { TAROT_CARDS, TAROT_CARD_DIMENSIONS, TAROT_IMAGE_SIZES, type TarotCard } from '@repo/utils';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SRC = path.resolve(REPO_ROOT, opt('src', 'assets-src/tarot/raw'));
const OUT = path.resolve(REPO_ROOT, opt('out', 'apps/web/public/tarot/cards'));
const QUALITY = Number(opt('quality', '82'));
const ONLY = new Set(opt('only', '').split(',').map((s) => s.trim()).filter(Boolean));
const SYMMETRIZE = !args.includes('--no-symmetrize');
const PLACEHOLDERS = args.includes('--placeholders');

const FULL = TAROT_CARD_DIMENSIONS[1024];
const EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const BACK_ID = 'back';

interface ManifestEntry {
  placeholder: boolean;
  source: string | null;
  builtAt: string;
}
interface Manifest {
  generatedAt: string;
  sizes: readonly number[];
  cards: Record<string, ManifestEntry>;
  missing: string[];
}

const findSource = (id: string): string | null =>
  EXTS.map((e) => path.join(SRC, `${id}.${e}`)).find((p) => existsSync(p)) ?? null;

// 원본을 7:12 로 중앙 크롭해 1024×1756 PNG 버퍼로. 좌우가 넓으면 폭을, 위아래가 길면 높이를 자른다.
const cropToCard = async (file: string): Promise<Buffer> => {
  const img = sharp(file);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error(`${file}: 크기를 읽지 못함`);
  const target = FULL.width / FULL.height;
  let cw = w;
  let ch = h;
  if (w / h > target) cw = Math.round(h * target);
  else ch = Math.round(w / target);
  const left = Math.floor((w - cw) / 2);
  const top = Math.floor((h - ch) / 2);
  return img
    .extract({ left, top, width: cw, height: ch })
    .resize(FULL.width, FULL.height, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
};

const blank = (w: number, h: number): sharp.Sharp =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } });

// 왼쪽 절반을 오른쪽에 거울로, 그 결과의 위 절반을 아래에 거울로 — 180° 회전해도 같은 뒷면.
const symmetrize = async (buf: Buffer, w: number, h: number): Promise<Buffer> => {
  const halfW = w / 2;
  const halfH = h / 2;
  const left = await sharp(buf).extract({ left: 0, top: 0, width: halfW, height: h }).png().toBuffer();
  const leftMirror = await sharp(left).flop().png().toBuffer();
  const lr = await blank(w, h)
    .composite([
      { input: left, left: 0, top: 0 },
      { input: leftMirror, left: halfW, top: 0 },
    ])
    .png()
    .toBuffer();
  const top = await sharp(lr).extract({ left: 0, top: 0, width: w, height: halfH }).png().toBuffer();
  const topMirror = await sharp(top).flip().png().toBuffer();
  return blank(w, h)
    .composite([
      { input: top, left: 0, top: 0 },
      { input: topMirror, left: 0, top: halfH },
    ])
    .png()
    .toBuffer();
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

// 개발용 임시 카드 — 남색 바탕 + 금색 테두리 + 이름. 실제 덱이 오면 덮어쓴다.
const placeholderSvg = (card: TarotCard | null): string => {
  const { width: w, height: h } = FULL;
  const title = card ? card.nameKo : '뒷면';
  const sub = card ? card.nameEn : 'CARD BACK';
  const mark = card
    ? card.arcana === 'major'
      ? ROMAN[card.number]!
      : card.number <= 10
        ? String(card.number)
        : card.nameEn.split(' ')[0]!.toUpperCase()
    : '✦';
  const korean = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#22306a"/><stop offset="1" stop-color="#090b1a"/></radialGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect x="48" y="48" width="${w - 96}" height="${h - 96}" fill="none" stroke="#c9a227" stroke-width="6" rx="28"/>
  <circle cx="${w / 2}" cy="640" r="220" fill="none" stroke="#c9a227" stroke-width="4" opacity="0.7"/>
  <text x="${w / 2}" y="690" font-size="150" text-anchor="middle" fill="#c9a227" font-family="Georgia,serif">${esc(mark)}</text>
  <text x="${w / 2}" y="1200" font-size="96" font-weight="700" text-anchor="middle" fill="#f3e9c6" font-family="${korean}">${esc(title)}</text>
  <text x="${w / 2}" y="1290" font-size="52" letter-spacing="4" text-anchor="middle" fill="#c9a227" font-family="Georgia,serif">${esc(sub)}</text>
  <text x="${w / 2}" y="${h - 110}" font-size="34" letter-spacing="6" text-anchor="middle" fill="#6f79ad" font-family="sans-serif">PLACEHOLDER</text>
</svg>`;
};

const writeSizes = async (id: string, base: Buffer): Promise<void> => {
  for (const size of TAROT_IMAGE_SIZES) {
    const { width, height } = TAROT_CARD_DIMENSIONS[size];
    await sharp(base)
      .resize(width, height, { kernel: 'lanczos3' })
      .webp({ quality: QUALITY, effort: 5 })
      .toFile(path.join(OUT, `${id}-${size}.webp`));
  }
};

const loadManifest = (): Manifest => {
  const p = path.join(OUT, 'manifest.json');
  if (!existsSync(p)) return { generatedAt: '', sizes: TAROT_IMAGE_SIZES, cards: {}, missing: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Manifest;
  } catch {
    return { generatedAt: '', sizes: TAROT_IMAGE_SIZES, cards: {}, missing: [] };
  }
};

const main = async (): Promise<void> => {
  mkdirSync(OUT, { recursive: true });
  const manifest = loadManifest();
  const ids = [...TAROT_CARDS.map((c) => c.id), BACK_ID].filter((id) => ONLY.size === 0 || ONLY.has(id));
  const cardById = new Map(TAROT_CARDS.map((c) => [c.id, c]));
  let built = 0;
  let placeholders = 0;
  const missing: string[] = [];
  const now = new Date().toISOString();

  for (const id of ids) {
    const src = findSource(id);
    if (src) {
      let base = await cropToCard(src);
      if (id === BACK_ID && SYMMETRIZE) base = await symmetrize(base, FULL.width, FULL.height);
      await writeSizes(id, base);
      manifest.cards[id] = { placeholder: false, source: path.relative(REPO_ROOT, src), builtAt: now };
      built++;
      console.log(`✓ ${id}  ← ${path.basename(src)}${id === BACK_ID && SYMMETRIZE ? ' (대칭 처리)' : ''}`);
      continue;
    }
    if (PLACEHOLDERS) {
      const svg = placeholderSvg(id === BACK_ID ? null : (cardById.get(id) ?? null));
      const base = await sharp(Buffer.from(svg)).png().toBuffer();
      await writeSizes(id, base);
      manifest.cards[id] = { placeholder: true, source: null, builtAt: now };
      placeholders++;
      console.log(`· ${id}  (placeholder)`);
      continue;
    }
    missing.push(id);
  }

  // --only 실행이면 나머지 누락 목록은 기존 manifest 것을 유지한다.
  const allIds = [...TAROT_CARDS.map((c) => c.id), BACK_ID];
  manifest.missing = allIds.filter((id) => !manifest.cards[id] || missing.includes(id));
  manifest.generatedAt = now;
  manifest.sizes = TAROT_IMAGE_SIZES;
  writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const realTotal = Object.values(manifest.cards).filter((e) => !e.placeholder).length;
  console.log(
    `\n원본 ${SRC}\n산출 ${OUT}\n이번 실행: 실제 ${built} · placeholder ${placeholders} · 누락 ${missing.length}` +
      `\n누적: 실제 이미지 ${realTotal}/${allIds.length}` +
      (manifest.missing.length ? `\n아직 없는 카드(${manifest.missing.length}): ${manifest.missing.join(', ')}` : '\n덱 완성.'),
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
