import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkMealStory } from './meal-story.check.js';
import { MealStoryFoodsFile } from './meal-story.script.js';
import { loadMealStoryDir } from './meal-story.store.js';

// 저장소에 든 건강식단 스토리 원고 전부 — 형식·가리킴·말투 점검을 통과해야 한다(check:meal-stories 와 같은 규칙,
// 사진 크기와 표준데이터 대조는 그 스크립트에서만). 원고를 고치면 pnpm test 가 바로 잡는다.

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/meal-stories');
const slugs = readdirSync(CONTENT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
  .map((d) => d.name);

describe('건강식단 스토리 원고', () => {
  it('원고가 하나 이상 있다', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it.each(slugs)('%s — 형식·가리킴·말투 점검 통과, 폴더 이름 = slug', async (slug) => {
    const dir = join(CONTENT, slug);
    const loaded = await loadMealStoryDir(dir);
    expect(loaded.script.slug).toBe(slug);
    // foods.json 이 없으면(build 를 안 돌렸으면) 가리킴 점검이 '값이 없다'로 잡는다.
    const foodsPath = join(dir, 'foods.json');
    const foodsFile = existsSync(foodsPath)
      ? MealStoryFoodsFile.parse(JSON.parse(readFileSync(foodsPath, 'utf8')))
      : null;
    const result = checkMealStory(loaded, { foodsFile });
    expect(result.errors).toEqual([]);
  });
});
