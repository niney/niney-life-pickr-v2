// 프레임 이미지(npm run frames 로 뽑은 JPEG)를 한 장 격자로 모은다 — 움직임 흐름을 한눈에 검수.
//   npm run sheet -- <frames-dir> <out.png> [--every=2] [--nth=6] [--cols=8] [--from=0] [--to=초] [--at=1.5,3,10]
//   --nth 는 frames 를 뽑을 때의 every-nth-frame(기본 6), --every 는 칸 사이 초, --at 은 칸을 직접 고른다(초).
// 이미지는 서버가 이미 쓰는 sharp 로 붙인다(apps/friendly 의존성 — 브라우저를 띄우지 않는다).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve(import.meta.dirname, '../../apps/friendly/package.json'));
const sharp = require('sharp');

const FPS = 30;
const [dir, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!dir || !out) {
  console.error('사용: npm run sheet -- <frames-dir> <out.png> [--every=2] [--nth=6] [--cols=8] [--from=0] [--to=초] [--at=1.5,3]');
  process.exit(1);
}
const opt = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const nth = Number(opt('nth', 6));
const cols = Number(opt('cols', 8));
const num = (f) => Number(/(\d+)\.\w+$/.exec(f)?.[1] ?? 0);
const files = fs
  .readdirSync(dir)
  .filter((f) => /\.(jpe?g|png)$/i.test(f))
  .sort((a, b) => num(a) - num(b));
if (files.length === 0) {
  console.error(`${dir} 에 프레임 이미지가 없다`);
  process.exit(1);
}
// k 번째 파일 = 프레임 k × nth.
const end = ((files.length - 1) * nth) / FPS;
const seconds = opt('at', null)
  ? opt('at').split(',').map(Number)
  : (() => {
      const list = [];
      const every = Number(opt('every', 2));
      for (let t = Number(opt('from', 0)); t <= Number(opt('to', end)) + 1e-9; t += every) list.push(t);
      return list;
    })();
const picks = [...new Set(seconds.map((t) => Math.min(files.length - 1, Math.max(0, Math.round((t * FPS) / nth)))))];

const { width: w, height: h } = await sharp(path.join(dir, files[0])).metadata();
const label = 24;
const gap = 6;
const rows = Math.ceil(picks.length / cols);
const layers = picks.flatMap((k, i) => {
  const left = gap + (i % cols) * (w + gap);
  const top = gap + Math.floor(i / cols) * (h + label + gap);
  const caption = `${((k * nth) / FPS).toFixed(1)}s · f${k * nth}`;
  return [
    { input: path.join(dir, files[k]), left, top },
    {
      input: Buffer.from(`<svg width="${w}" height="${label}"><text x="2" y="17" font-family="sans-serif" font-size="15" fill="#eeeeee">${caption}</text></svg>`),
      left,
      top: top + h,
    },
  ];
});
await sharp({ create: { width: gap + cols * (w + gap), height: gap + rows * (h + label + gap), channels: 3, background: '#222222' } })
  .composite(layers)
  .png()
  .toFile(out);
console.log(`${out} — ${picks.length}칸`);
