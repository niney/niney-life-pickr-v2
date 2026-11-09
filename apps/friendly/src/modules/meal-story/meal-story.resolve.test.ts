import { describe, expect, it } from 'vitest';
import type { MealStorySceneType } from '@repo/api-contract';
import { checkMealStory } from './meal-story.check.js';
import { resolveMealStory } from './meal-story.resolve.js';
import { MealStoryScript, type MealStoryFoodsFileType, type MealStoryScriptType } from './meal-story.script.js';
import type { LoadedMealStory } from './meal-story.store.js';

// 원고 → 화면 스토리: 숫자는 가리킴에서 계산하고(섭취기준·식품 100g당·레시피 합계·내 기록), 못 푼 가리킴은 issues 로.

const base = (over: Partial<MealStoryScriptType> = {}): MealStoryScriptType =>
  MealStoryScript.parse({
    slug: 'test-story',
    status: 'draft',
    title: '시험 스토리',
    summary: '시험용 요약',
    publishedAt: '2026-11-09',
    reviewedAt: null,
    sources: [{ id: 'my-book', label: '시험 출처' }],
    foods: [
      { id: 'noodle', label: '국수', ref: { db: 'raw', code: 'R101-000000001-0000' } },
      { id: 'sauce', label: '소스', ref: { db: 'processed', code: 'P113-000000001-0000' } },
      { id: 'herb', label: '허브', manual: { per100: { kcal: 30, sodiumMg: null }, source: 'my-book' } },
    ],
    recipe: {
      name: '시험 국수',
      servings: 2,
      dishType: 'noodle',
      ingredients: [
        { food: 'noodle', grams: 200, label: '국수 200g' },
        { food: 'sauce', grams: 100, label: '소스', part: 'sauce' },
        { food: 'herb', grams: 10, label: '허브 조금', part: 'sauce' },
      ],
      steps: [{ text: '삶는다', image: 'step-1.jpg' }, { text: '버무린다' }],
    },
    scenes: [
      { type: 'cover', kicker: '시험', title: '시험 표지' },
      {
        type: 'stat',
        title: '기준',
        figures: [
          { label: '성인 기준', value: { kdri: 'sodium' } },
          { label: '내 평균', value: { my: 'sodium' } },
        ],
      },
      {
        type: 'bars',
        title: '비교',
        bars: [
          { label: '소스 150g', value: { food: 'sauce', nutrient: 'sodiumMg', grams: 150 } },
          { label: '직접', value: { recipe: 'sodiumMg', part: 'sauce' }, aside: { recipe: 'kcal', part: 'sauce' } },
        ],
      },
      { type: 'step', step: 1 },
      { type: 'nutrition', title: '영양', nutrients: ['kcal', 'sodiumMg'], cautions: ['potassium'] },
      { type: 'outro', title: '끝', actions: ['record', 'share'] },
    ],
    ...over,
  });

const foods: MealStoryFoodsFileType = {
  generatedBy: 'build:meal-stories',
  foods: {
    noodle: { per100: { kcal: 350, sodiumMg: 5 }, basis: '100g', provenance: '원재료 R101', source: 'mfds-raw' },
    sauce: { per100: { kcal: 70, sodiumMg: 600 }, basis: '100g', provenance: '가공 P113', source: 'mfds-processed' },
  },
};

const images = new Set(['step-1.jpg']);
const imageUrl = (f: string) => (images.has(f) ? `/img/${f}` : null);

const sceneOf = <T extends MealStorySceneType['type']>(scenes: MealStorySceneType[], type: T) =>
  scenes.find((s) => s.type === type) as Extract<MealStorySceneType, { type: T }>;

describe('resolveMealStory', () => {
  it('섭취기준 — 성인 값과 나이별로 다른 값을 덧말로(나트륨 2,300mg · 65~74세 2,100 · 75세 이상 1,700)', () => {
    const { story } = resolveMealStory(base(), foods, imageUrl);
    const stat = sceneOf(story.scenes, 'stat');
    expect(stat.figures[0]!.figure).toMatchObject({
      value: 2300,
      unit: 'mg',
      detail: '65~74세 2,100mg · 75세 이상 1,700mg',
      sources: ['kdri-2020'],
      my: null,
    });
    // 내 기록은 서버가 모른다 — 화면이 통계로 채운다.
    expect(stat.figures[1]!.figure).toMatchObject({ value: null, my: 'sodium', basis: '내 최근 2주 하루 평균' });
  });

  it('식품 값은 100g당 × 그램, 레시피 값은 인분으로 나눈 합계(묶음만 따로) — 값을 모르는 재료는 빼고 덧말로 밝힌다', () => {
    const { story, issues } = resolveMealStory(base(), foods, imageUrl);
    const bars = sceneOf(story.scenes, 'bars');
    expect(bars.bars[0]!.figure).toMatchObject({ value: 900, unit: 'mg', basis: '소스 150g', sources: ['mfds-processed'] });
    // 소스 100g(600mg) + 허브(나트륨 모름) → 2인분 → 300mg.
    expect(bars.bars[1]!.figure).toMatchObject({ value: 300, detail: '값을 모르는 재료(허브 조금)는 빼고 셌어요' });
    // 옆 값(열량) — 소스 70 + 허브 3 = 73kcal → 2인분 36.5 → 37.
    expect(bars.bars[1]!.aside).toMatchObject({ label: '열량', figure: { value: 37, unit: 'kcal' } });
    const nutrition = sceneOf(story.scenes, 'nutrition');
    // 전체 열량 (700 + 70 + 3) / 2 = 386.5 → 387, 나트륨 (10 + 600) / 2 = 305.
    expect(nutrition.rows.map((r) => [r.key, r.figure.value])).toEqual([
      ['kcal', 387],
      ['sodiumMg', 305],
    ]);
    expect(nutrition.cautions[0]).toContain('칼륨');
    expect(issues).toEqual([]);
  });

  it('출처 — 원고가 적은 것 뒤에 값에 쓰인 기본 출처, 사진은 있는 것만 주소', () => {
    const { story } = resolveMealStory(base(), foods, imageUrl);
    expect(story.sources.map((s) => s.id)).toEqual(['my-book', 'kdri-2020', 'mfds-processed', 'mfds-raw']);
    expect(sceneOf(story.scenes, 'step')).toMatchObject({ number: 1, total: 2, text: '삶는다', image: '/img/step-1.jpg' });
    expect(story.recipe?.steps[1]?.image).toBeNull();
  });

  it('못 푼 가리킴은 issues — 없는 출처·단계·사진, foods.json 에 없는 식품', () => {
    const script = base({
      cover: 'cover.jpg',
      scenes: [
        { type: 'cover', kicker: '시험', title: '표지' },
        { type: 'stat', title: '값', figures: [{ label: '고정값', value: { value: 10, unit: 'g', source: 'nope' } }] },
        { type: 'step', step: 5 },
      ],
    });
    const { issues } = resolveMealStory(script, { generatedBy: 'build:meal-stories', foods: {} }, imageUrl);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("출처 'nope'"),
        expect.stringContaining('5단계가 없다'),
        expect.stringContaining("사진 'cover.jpg'"),
        expect.stringContaining('noodle: foods.json 에 값이 없다'),
      ]),
    );
  });
});

describe('checkMealStory', () => {
  const loaded = (script: MealStoryScriptType): LoadedMealStory => ({
    ...resolveMealStory(script, foods, imageUrl),
    script,
    dir: '/x',
  });

  it('효능 단정·글에 박힌 영양 값은 오류, 게시하려면 검수일·표지', () => {
    const script = base({
      status: 'published',
      summary: '고혈압을 예방해요',
      scenes: [
        { type: 'cover', kicker: '시험', title: '나트륨 2300mg 줄이기' },
        { type: 'list', title: '방법', items: [{ title: '국물 남기기' }, { title: '1인분만' }] },
        { type: 'outro', title: '끝', actions: ['share'] },
      ],
    });
    const r = checkMealStory(loaded(script));
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('질병 예방을 단정하지 않는다'),
        expect.stringContaining('영양 값은 글에 적지 않고'),
        expect.stringContaining('검수일'),
        expect.stringContaining('표지 사진'),
      ]),
    );
    // '1인분'은 양을 세는 말이라 숫자 경고가 아니다.
    expect(r.warnings.some((w) => w.includes('1인분만'))).toBe(false);
    // 손으로 적은 값은 사람 확인 목록에.
    expect(r.review.some((x) => x.includes('허브') && x.includes('손으로 적은 값'))).toBe(true);
  });
});
