// 앱 3D 천문도용 한자 글리프 아틀라스 — 천간 10·지지 12·오행 5 = 27자를 흰 글자·투명 바탕으로 한 장(8×4칸)에
// 굽는다. 앱(expo-gl)엔 캔버스·CJK 폰트가 없어 웹처럼 런타임에 글자 텍스처를 못 그리므로 미리 만들어 번들한다.
// 색은 앱이 재질 색으로 곱해 입힌다(고리 금·천간 연금·오행 주사, 인장 한지색). 글꼴은 공유 카드 글리프
// (build-saju-glyphs.ts)와 같은 스택 — 개발 머신의 CJK 명조. 명조가 한 굵기뿐이라 같은 색 테두리 획으로
// 살짝 굵혀 3D 에서 작게 보일 때도 읽히게 한다.
//
// 실행: pnpm --filter friendly build:saju-glyph-atlas [--font="Noto Serif CJK KR"] [--cell=128]
// 산출: apps/mobile/assets/saju/glyph-atlas.png (칸 순서 = 천간 → 지지 → 오행, 왼쪽 위부터 가로로)
//       순서의 단일 출처는 앱 `src/components/saju/stage3d/glyphs.ts` 의 SAJU_GLYPH_ORDER 와 같아야 한다.

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SAJU_BRANCHES, SAJU_STEMS, SAJU_WUXING, SAJU_WUXING_META } from '@repo/utils';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const FONT = opt('font', 'Noto Serif CJK KR');
const CELL = Number(opt('cell', '128'));
const COLS = 8;
const ROWS = 4;
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const OUT = path.resolve(REPO_ROOT, 'apps/mobile/assets/saju/glyph-atlas.png');

const glyphs = [...SAJU_STEMS.map((s) => s.hanja), ...SAJU_BRANCHES.map((b) => b.hanja), ...SAJU_WUXING.map((e) => SAJU_WUXING_META[e].hanja)];

const svg = (ch: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}"><text x="50%" y="52%" font-size="${Math.round(CELL * 0.74)}" font-weight="700" font-family="'${FONT}','Noto Sans CJK KR','Batang',serif" fill="#ffffff" stroke="#ffffff" stroke-width="${(CELL * 0.022).toFixed(1)}" stroke-linejoin="round" text-anchor="middle" dominant-baseline="central">${ch}</text></svg>`;

const main = async (): Promise<void> => {
  if (glyphs.length > COLS * ROWS) throw new Error(`칸 부족: ${glyphs.length} > ${COLS * ROWS}`);
  mkdirSync(path.dirname(OUT), { recursive: true });
  const tiles = await Promise.all(glyphs.map((ch) => sharp(Buffer.from(svg(ch))).png().toBuffer()));
  await sharp({ create: { width: COLS * CELL, height: ROWS * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles.map((input, i) => ({ input, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL })))
    .png({ compressionLevel: 9 })
    .toFile(OUT);
  console.log(`${OUT} — ${glyphs.length}자, ${COLS}×${ROWS}칸 ${CELL}px (font: ${FONT})`);
  console.log(glyphs.join(''));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
