// 사주 공유 이미지용 한자 글리프 PNG — satori 에 넣는 IBM Plex Sans KR 에는 한자가 없어(□), 천간 10·지지 12·
// 오행 5 글자를 개발 머신의 CJK 폰트(Noto Serif CJK KR)로 한 번 렌더해 자산으로 커밋한다. 운영 서버엔 CJK
// 폰트가 없어도 된다. saju-share-card.ts 가 인장 안엔 <img>, 본문 텍스트엔 satori graphemeImages 로 쓴다.
//
// 실행: pnpm --filter friendly build:saju-glyphs [--font="Noto Serif CJK KR"] [--size=192]
// 산출: apps/friendly/assets/saju-glyphs/u<hex>.png (투명 배경 + 흰 글자, 색은 satori 쪽에서 못 바꾸므로
//       인주 위엔 흰 글자 그대로, 본문엔 한지색 별도 파일 -hanji 접미).

import { mkdirSync, writeFileSync } from 'node:fs';
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
const SIZE = Number(opt('size', '192'));
const OUT = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'assets/saju-glyphs');

const glyphs = [
  ...SAJU_STEMS.map((s) => s.hanja),
  ...SAJU_BRANCHES.map((b) => b.hanja),
  ...SAJU_WUXING.map((e) => SAJU_WUXING_META[e].hanja),
];

const svg = (ch: string, color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><text x="50%" y="52%" font-size="${Math.round(SIZE * 0.78)}" font-weight="700" font-family="'${FONT}','Noto Sans CJK KR','Batang',serif" fill="${color}" text-anchor="middle" dominant-baseline="central">${ch}</text></svg>`;

const main = async (): Promise<void> => {
  mkdirSync(OUT, { recursive: true });
  for (const ch of glyphs) {
    const hex = ch.codePointAt(0)!.toString(16);
    for (const [suffix, color] of [
      ['', '#f7eddc'],
      ['-hanji', '#e9e2d2'],
      ['-gold', '#d9b65b'],
    ] as const) {
      const png = await sharp(Buffer.from(svg(ch, color))).png().toBuffer();
      writeFileSync(path.join(OUT, `u${hex}${suffix}.png`), png);
    }
  }
  console.log(`${OUT} — ${glyphs.length}자 × 3색 생성 (font: ${FONT})`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
