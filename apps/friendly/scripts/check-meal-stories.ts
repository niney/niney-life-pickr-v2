// 건강식단 스토리 점검 — 올리기 전에 돌린다. 오류가 있으면 끝 코드 1.
//
// 실행: pnpm --filter friendly check:meal-stories [--slug=<slug>]
//   형식(zod) → 가리킴(없는 식품·출처·단계·사진) → 말투(효능 단정·글에 박힌 영양 값) → 게시 조건(검수일·표지)
//   → 사진 크기 → foods.json 이 표준데이터와 같은지(data/open/food/ 가 있을 때) → 계산된 숫자 전부와 출처 목록.
// 마지막 두 목록은 사람이 원본과 맞춰 보는 용도다. 절차 전체는 docs/meal-story-authoring.md.

/* eslint-disable no-console */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { MealStoryFigureType, MealStoryType } from '@repo/api-contract';
import { checkMealStory, type ImageInfo } from '../src/modules/meal-story/meal-story.check.js';
import { formatAmount } from '../src/modules/meal-story/meal-story.defs.js';
import { buildMealStoryFoods, loadFoodTables } from '../src/modules/meal-story/meal-story.foods.js';
import { MealStoryFoodsFile, type MealStoryFoodsFileType } from '../src/modules/meal-story/meal-story.script.js';
import {
  MEAL_STORY_FOODS_FILE,
  MEAL_STORY_IMAGE_DIR,
  loadMealStoryDir,
  mealStoryDir,
} from '../src/modules/meal-story/meal-story.store.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const ONLY = process.argv.find((a) => a.startsWith('--slug='))?.slice('--slug='.length) ?? null;

const fig = (f: MealStoryFigureType): string => {
  if (f.my) return `(내 기록 ${f.my} — 화면이 채움)`;
  const v = f.value === null ? '값 없음' : formatAmount(f.value, f.unit);
  return `${v}${f.basis ? ` · ${f.basis}` : ''}${f.detail ? ` · ${f.detail}` : ''}${f.sources.length ? ` [${f.sources.join(', ')}]` : ''}`;
};

const figureLines = (story: MealStoryType): string[] => {
  const out: string[] = [];
  story.scenes.forEach((s, i) => {
    const w = `장면 ${i + 1}`;
    if (s.type === 'stat') s.figures.forEach((f) => out.push(`${w} · ${f.label}: ${fig(f.figure)}`));
    if (s.type === 'bars') {
      s.bars.forEach((b) => {
        out.push(`${w} · ${b.label}: ${fig(b.figure)}`);
        if (b.aside) out.push(`${w} · ${b.label} 옆 ${b.aside.label}: ${fig(b.aside.figure)}`);
      });
    }
    if (s.type === 'nutrition') s.rows.forEach((r) => out.push(`${w} · ${r.label}: ${fig(r.figure)}`));
  });
  return out;
};

const imagesOf = async (dir: string): Promise<ImageInfo[]> => {
  let names: string[];
  try {
    names = await readdir(join(dir, MEAL_STORY_IMAGE_DIR));
  } catch {
    return [];
  }
  const out: ImageInfo[] = [];
  for (const file of names) {
    const p = join(dir, MEAL_STORY_IMAGE_DIR, file);
    const meta = await sharp(p).metadata().catch(() => null);
    out.push({ file, bytes: (await stat(p)).size, width: meta?.width ?? null, height: meta?.height ?? null });
  }
  return out;
};

const main = async (): Promise<void> => {
  const root = mealStoryDir();
  const slugs = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map((d) => d.name)
    .filter((s) => !ONLY || s === ONLY);
  const { tables, paths } = loadFoodTables([process.cwd(), REPO_ROOT]);
  const haveTables = !!paths.raw || !!paths.processed;
  let failed = false;

  for (const slug of slugs) {
    const dir = join(root, slug);
    console.log(`\n[${slug}]`);
    let loaded;
    try {
      loaded = await loadMealStoryDir(dir);
    } catch (e) {
      console.log(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
      failed = true;
      continue;
    }
    let foodsFile: MealStoryFoodsFileType | null;
    try {
      foodsFile = MealStoryFoodsFile.parse(JSON.parse(await readFile(join(dir, MEAL_STORY_FOODS_FILE), 'utf8')));
    } catch {
      foodsFile = null;
    }
    const result = checkMealStory(loaded, { images: await imagesOf(dir), foodsFile });
    if (haveTables) {
      const rebuilt = buildMealStoryFoods(loaded.script, tables);
      const same = JSON.stringify(rebuilt.file) === JSON.stringify(foodsFile);
      if (!same) result.errors.push('foods.json 이 표준데이터·원고와 다르다 — pnpm --filter friendly build:meal-stories');
      for (const p of rebuilt.problems) result.errors.push(p);
    } else {
      result.warnings.push('data/open/food/ 표준데이터가 없어 foods.json 을 원본과 맞춰 보지 못했다');
    }

    console.log(`  ${loaded.script.status === 'published' ? '게시' : '초안'} · 장면 ${loaded.story.scenes.length}장 · 검수일 ${loaded.script.reviewedAt ?? '없음'}`);
    for (const e of result.errors) console.log(`  ✗ ${e}`);
    for (const w of result.warnings) console.log(`  △ ${w}`);
    console.log('  ── 계산된 숫자');
    for (const l of figureLines(loaded.story)) console.log(`    ${l}`);
    console.log('  ── 값의 출처(사람이 원본과 맞춰 본다)');
    for (const r of result.review) console.log(`    ${r}`);
    for (const s of loaded.story.sources) console.log(`    [${s.id}] ${s.label}${s.url ? ` ${s.url}` : ''}`);
    if (result.errors.length > 0) failed = true;
  }
  if (failed) {
    console.log('\n점검 실패');
    process.exitCode = 1;
  } else {
    console.log(`\n점검 통과 (${slugs.length}편)`);
  }
};

void main();
