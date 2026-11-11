import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkMealStory } from './meal-story.check.js';
import { MEAL_STORY_PER100_KEYS } from './meal-story.foods.js';
import { MealStoryFoodsFile } from './meal-story.script.js';
import { loadMealStoryDir } from './meal-story.store.js';

// 저장소에 든 건강식단 스토리 원고 전부 — 형식·가리킴·말투 점검을 통과해야 한다(check:meal-stories 와 같은 규칙,
// 사진 크기와 표준데이터 대조는 그 스크립트에서만). 원고를 고치면 pnpm test 가 바로 잡는다.
// 표준데이터가 없는 컴퓨터에서도 볼 수 있는 한 가지 — foods.json 의 값 이름이 지금 빌더의 값 이름과 같은지. 빌더에 영양 값을
// 더하고(2026-11-11 칼슘) 예전 편을 다시 만들지 않으면 check 는 ✗ 인데 테스트는 통과했다.

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

  it.each(slugs)('%s — foods.json 을 지금 빌더로 만들었다(표준데이터로 푼 식품은 값 이름이 모두 있다)', (slug) => {
    const foodsPath = join(CONTENT, slug, 'foods.json');
    if (!existsSync(foodsPath)) return;
    const file = MealStoryFoodsFile.parse(JSON.parse(readFileSync(foodsPath, 'utf8')));
    for (const [id, food] of Object.entries(file.foods)) {
      expect(Object.keys(food.per100), `${id} — pnpm --filter friendly build:meal-stories`).toEqual([...MEAL_STORY_PER100_KEYS]);
    }
  });
});
