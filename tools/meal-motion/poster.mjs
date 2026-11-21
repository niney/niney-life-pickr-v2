// 그림 표지 만들기 — 사진 표지가 없는 편의 목록 카드·공유 미리보기에 쓸 가로 그림 한 장(1200×630 JPEG).
//   pnpm --filter friendly export:meal-story --slug=<slug> --out=../../tools/meal-motion/out/<slug>.json
//   npm run poster -- out/<slug>.json [--browser-executable=<크롬 헤드리스 경로>]
// 내보낸 JSON 의 posterFile(서버가 정한 자리 — content/meal-stories/<slug>/images/poster-<해시>.jpg)에 쓰고, 예전 그림 표지
// (poster-*.jpg)는 지운다. 끝에 원고(story.json)에 적을 줄을 알려 준다. 제목·머리말·그림체를 바꾸면 해시가 달라져 다시 만든다
// (점검이 잡는다).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const json = args.find((a) => !a.startsWith('--'));
if (!json) {
  console.error('사용: npm run poster -- out/<slug>.json [--browser-executable=<경로>]');
  process.exit(1);
}
const { posterFile, story } = JSON.parse(fs.readFileSync(json, 'utf8'));
if (!posterFile) {
  console.error(`${json} 에 posterFile 이 없다 — pnpm --filter friendly export:meal-story 로 다시 내보낸다`);
  process.exit(1);
}
const dir = path.dirname(posterFile);
fs.mkdirSync(dir, { recursive: true });

const quote = (s) => `"${s}"`;
const run = spawnSync(
  'npx',
  ['remotion', 'still', 'src/index.ts', 'Poster', quote(posterFile), `--props=${quote(json)}`, '--image-format=jpeg', '--jpeg-quality=88', ...args.filter((a) => a.startsWith('--')).map(quote)],
  { stdio: 'inherit', shell: true },
);
if (run.status !== 0 || !fs.existsSync(posterFile)) {
  console.error('그림 표지를 만들지 못했다');
  process.exit(run.status || 1);
}
const name = path.basename(posterFile);
for (const old of fs.readdirSync(dir)) {
  if (/^poster-[0-9a-f]+\.jpg$/.test(old) && old !== name) {
    fs.rmSync(path.join(dir, old));
    console.log(`예전 그림 표지 지움: ${old}`);
  }
}
console.log(`${posterFile} (${Math.round(fs.statSync(posterFile).size / 1000)}KB)`);
console.log(`원고(${story.slug}/story.json)에 적는다:  "poster": "${name}",`);
