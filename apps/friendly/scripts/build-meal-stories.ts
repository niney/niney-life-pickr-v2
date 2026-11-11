// 건강식단 스토리 만들기 보조 — 원고(content/meal-stories/<slug>/story.json)를 화면에 올릴 준비를 한다.
//
// 실행: pnpm --filter friendly build:meal-stories [--slug=<slug>]
//   1) foods.json — 원고 foods 의 식품코드(ref)·제품 묶음(group)을 식약처 표준데이터(data/open/food/ 의 15100065·15100066
//      CSV, git 밖)에서 풀어 100g당 값을 쓴다. 원고에는 숫자를 옮겨 적지 않는다.
//   2) 사진 — originals/ 의 사진(git 밖)을 긴 변 1440px JPEG 로 줄여 images/<같은 이름>.jpg 로 쓴다. 회전은 EXIF 대로
//      바로잡고 위치·기기 정보(EXIF)는 지운다. 원본이 결과보다 새것일 때만 다시 만든다.
// 식품코드 찾기: pnpm --filter friendly build:meal-stories --find=스파게티[,파마산] — 두 표준데이터에서 이름에 그 말이 든 식품의
//   코드·이름·분류·100g당 열량·나트륨을 보여 주고 끝난다(원고 foods 의 ref.code 로 쓴다).
// 이어서 pnpm --filter friendly check:meal-stories 로 점검한다. 절차 전체는 docs/meal-story-authoring.md.

/* eslint-disable no-console */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MEAL_STORY_IMAGE_PATTERN } from '@repo/api-contract';
import { MEAL_STORY_NUTRIENTS } from '../src/modules/meal-story/meal-story.defs.js';
import { buildMealStoryFoods, loadFoodTables } from '../src/modules/meal-story/meal-story.foods.js';
import { MealStoryScript } from '../src/modules/meal-story/meal-story.script.js';
import {
  MEAL_STORY_FILE,
  MEAL_STORY_FOODS_FILE,
  MEAL_STORY_IMAGE_DIR,
  mealStoryDir,
} from '../src/modules/meal-story/meal-story.store.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ONLY = arg('slug');
const ORIGINALS = 'originals';
const MAX_EDGE = 1440;
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const mtime = async (p: string): Promise<number | null> => {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return null;
  }
};

const buildImages = async (dir: string): Promise<number> => {
  const from = join(dir, ORIGINALS);
  if (!existsSync(from)) return 0;
  await mkdir(join(dir, MEAL_STORY_IMAGE_DIR), { recursive: true });
  let made = 0;
  for (const name of await readdir(from)) {
    const ext = extname(name).toLowerCase();
    if (!PHOTO_EXT.has(ext)) {
      console.log(`  사진 건너뜀: ${name} (jpg·png·webp 만 — 아이폰 HEIC 는 JPG 로 내보낸다)`);
      continue;
    }
    const out = `${basename(name, extname(name)).toLowerCase()}.jpg`;
    if (!MEAL_STORY_IMAGE_PATTERN.test(out)) {
      console.log(`  사진 이름이 규칙에 안 맞음: ${name} → 소문자·숫자·하이픈만(예: step-1.jpg)`);
      process.exitCode = 1;
      continue;
    }
    const src = join(from, name);
    const dst = join(dir, MEAL_STORY_IMAGE_DIR, out);
    const [srcM, dstM] = [await mtime(src), await mtime(dst)];
    if (dstM !== null && srcM !== null && dstM >= srcM) continue;
    const info = await sharp(src)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(dst);
    console.log(`  사진 ${name} → images/${out} (${info.width}×${info.height}, ${Math.round(info.size / 1000)}KB)`);
    made += 1;
  }
  return made;
};

const FIND = arg('find');
const FIND_LIMIT = 40;

/** 식품코드 찾기 — 원고를 쓸 때 ref.code 를 고르는 용도. */
const find = (words: string[]): void => {
  const { tables, paths } = loadFoodTables([process.cwd(), REPO_ROOT]);
  for (const db of ['raw', 'processed'] as const) {
    const rows = tables[db];
    if (!rows) {
      console.log(`[${db}] 표준데이터 없음(data/open/food/)`);
      continue;
    }
    const hits = rows.filter((r) => words.some((w) => r.name.includes(w)));
    console.log(`\n[${db}] ${paths[db]} — ${hits.length}건${hits.length > FIND_LIMIT ? ` (앞 ${FIND_LIMIT}건)` : ''}`);
    for (const r of hits.slice(0, FIND_LIMIT)) {
      console.log(`  ${r.code} | ${r.category} | ${r.name} | ${r.basis}당 열량 ${r.per100.kcal ?? '—'} · 나트륨 ${r.per100.sodiumMg ?? '—'}`);
    }
  }
};

const main = async (): Promise<void> => {
  if (FIND) {
    find(FIND.split(',').map((w) => w.trim()).filter(Boolean));
    return;
  }
  const root = mealStoryDir();
  const slugs = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map((d) => d.name)
    .filter((s) => !ONLY || s === ONLY);
  if (slugs.length === 0) {
    console.log(`스토리가 없다(${root}${ONLY ? `, --slug=${ONLY}` : ''})`);
    return;
  }
  const { tables, paths } = loadFoodTables([process.cwd(), REPO_ROOT]);
  console.log(`표준데이터: 원재료 ${paths.raw ?? '없음'} · 가공식품 ${paths.processed ?? '없음'}`);

  for (const slug of slugs) {
    const dir = join(root, slug);
    console.log(`\n[${slug}]`);
    const parsed = MealStoryScript.safeParse(JSON.parse(await readFile(join(dir, MEAL_STORY_FILE), 'utf8')));
    if (!parsed.success) {
      for (const i of parsed.error.issues.slice(0, 10)) console.log(`  형식 오류 ${i.path.join('.') || '(전체)'}: ${i.message}`);
      process.exitCode = 1;
      continue;
    }
    const { file, problems } = buildMealStoryFoods(parsed.data, tables);
    for (const p of problems) console.log(`  ✗ ${p}`);
    if (problems.length > 0) process.exitCode = 1;
    const text = `${JSON.stringify(file, null, 2)}\n`;
    const path = join(dir, MEAL_STORY_FOODS_FILE);
    const before = existsSync(path) ? await readFile(path, 'utf8') : null;
    if (before !== text) {
      await writeFile(path, text, 'utf8');
      console.log(`  foods.json 씀 (${Object.keys(file.foods).length}개)`);
    } else {
      console.log('  foods.json 그대로');
    }
    for (const [id, f] of Object.entries(file.foods)) {
      const values = (['kcal', 'sodiumMg', 'potassiumMg', 'proteinG', 'fiberG', 'calciumMg', 'vitaminCMg'] as const)
        .map((k) => `${MEAL_STORY_NUTRIENTS[k].label} ${f.per100[k] ?? '—'}`)
        .join(' · ');
      console.log(`  ${id}: ${f.basis}당 ${values}\n      ← ${f.provenance}${f.matched ? `\n      제품: ${f.matched.names.join(', ')}` : ''}`);
    }
    const made = await buildImages(dir);
    if (made > 0) console.log(`  사진 ${made}장 만듦`);
  }
};

void main();
