import { describe, expect, it } from 'vitest';
import type { MealStorySceneType } from '@repo/api-contract';
import { checkMealStory, kickerClashWarnings } from './meal-story.check.js';
import { buildMealStoryFoods, type FoodRow } from './meal-story.foods.js';
import { fractionOf, kdriFigure } from './meal-story.defs.js';
import { resolveMealStory } from './meal-story.resolve.js';
import {
  MealStoryScript,
  type MealStoryFoodsFileType,
  type MealStoryPer100Type,
  type MealStoryScriptType,
} from './meal-story.script.js';
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
      // 나트륨 숫자는 소금으로도 — 서버가 환산하고(÷ 400) 출처를 붙인다.
      sources: ['kdri-2020', 'who-sodium-2012'],
      my: null,
      equivalent: { label: '소금', value: 5.8, unit: 'g', per: 400 },
    });
    // 내 기록은 서버가 모른다 — 화면이 통계로 채우고, 소금 환산도 같은 per 로 나눈다(값은 null).
    expect(stat.figures[1]!.figure).toMatchObject({
      value: null,
      my: 'sodium',
      basis: '내 최근 2주 하루 평균',
      sources: ['who-sodium-2012'],
      equivalent: { label: '소금', value: null, unit: 'g', per: 400 },
    });
  });

  it('남녀 값이 다른 기준(식이섬유) — 성별을 고르면 그 값과 그 성별 안의 나이 차이만, 안 고르면 남자 값에 여자 값을 덧말로', () => {
    expect(kdriFigure('fiber', 'male')).toEqual({
      value: 30,
      unit: 'g',
      basis: '성인 남자 하루 충분섭취량',
      // 값이 같은 이어진 나이는 하나로 묶는다(영상 쪽지 한 줄에 들어가게).
      detail: '65세 이상 25g',
    });
    expect(kdriFigure('fiber', 'female')).toEqual({ value: 20, unit: 'g', basis: '성인 여자 하루 충분섭취량', detail: null });
    // 성별을 고르지 않으면 앞의 숫자가 남자 값임을 basis 가 밝히고, 여자 값과 나이 차이를 덧말에 모은다.
    const both = kdriFigure('fiber');
    expect(both).toMatchObject({ value: 30, basis: '성인 남자 하루 충분섭취량' });
    expect(both.detail).toContain('여자 20g');
    expect(both.detail).toContain('65~74세 남자 25g');
    // 남녀 값이 같은 기준(나트륨)은 그대로 '성인'.
    expect(kdriFigure('sodium').basis).toBe('성인 하루 기준(이보다 적게)');

    const { story, issues } = resolveMealStory(
      base({
        scenes: [
          { type: 'cover', kicker: '시험', title: '시험 표지' },
          {
            type: 'stat',
            title: '기준',
            figures: [
              { label: '남자', value: { kdri: 'fiber', sex: 'male' } },
              { label: '여자', value: { kdri: 'fiber', sex: 'female' } },
              { label: '내 평균', value: { my: 'fiber' } },
            ],
          },
          { type: 'nutrition', title: '영양', nutrients: ['kcal', 'sodiumMg'], cautions: ['fiber'] },
          { type: 'outro', title: '끝', actions: ['share'] },
        ],
      }),
      foods,
      imageUrl,
    );
    expect(issues).toEqual([]);
    const stat = sceneOf(story.scenes, 'stat');
    expect(stat.figures.map((f) => [f.figure.value, f.figure.unit, f.figure.my])).toEqual([
      [30, 'g', null],
      [20, 'g', null],
      [null, '', 'fiber'],
    ]);
    // 식이섬유 숫자에는 소금 환산이 없다(나트륨만).
    expect(stat.figures.every((f) => f.figure.equivalent === null)).toBe(true);
    expect(stat.figures[0]!.figure.sources).toEqual(['kdri-2020']);
    // 주의 문구는 영양 탭과 같은 글(식이섬유 — 갑자기 늘리면 가스).
    expect(sceneOf(story.scenes, 'nutrition').cautions[0]).toContain('천천히 늘리세요');
  });

  it('칼슘 — 기준은 권장섭취량(남 800·여 700, 이어진 나이는 묶어서), 영양정보 장면이 가리키면 레시피 표에도 그 줄이 붙는다', () => {
    expect(kdriFigure('calcium', 'male')).toEqual({
      value: 800,
      unit: 'mg',
      basis: '성인 남자 하루 권장섭취량',
      detail: '50~64세 750mg · 65세 이상 700mg',
    });
    expect(kdriFigure('calcium', 'female')).toEqual({
      value: 700,
      unit: 'mg',
      basis: '성인 여자 하루 권장섭취량',
      detail: '50세 이상 800mg',
    });

    const withCalcium: MealStoryFoodsFileType = {
      generatedBy: 'build:meal-stories',
      foods: {
        noodle: { per100: { kcal: 350, sodiumMg: 5, calciumMg: 20 }, basis: '100g', provenance: '원재료 R101', source: 'mfds-raw' },
        sauce: { per100: { kcal: 70, sodiumMg: 600, calciumMg: 100 }, basis: '100g', provenance: '가공 P113', source: 'mfds-processed' },
      },
    };
    const script = (nutrients: string[]) =>
      base({
        scenes: [
          { type: 'cover', kicker: '시험', title: '시험 표지' },
          { type: 'nutrition', title: '영양', nutrients, cautions: ['calcium'] },
          { type: 'outro', title: '끝', actions: ['share'] },
        ],
      } as Partial<MealStoryScriptType>);
    const { story } = resolveMealStory(script(['kcal', 'calciumMg']), withCalcium, imageUrl);
    const scene = sceneOf(story.scenes, 'nutrition');
    // 국수 200g × 20 + 소스 100g × 100 = 140mg, 2인분이라 70mg(값을 모르는 허브는 빼고 덧말로).
    expect(scene.rows.map((r) => [r.key, r.figure.value, r.figure.unit])).toEqual([
      ['kcal', 387, 'kcal'],
      ['calciumMg', 70, 'mg'],
    ]);
    expect(scene.cautions[0]).toContain('나눠 먹는 편이');
    // 레시피 전체 보기의 표 — 늘 보이는 줄 뒤에 칼슘 줄.
    expect(story.recipe?.nutrition.map((r) => r.key).slice(-2)).toEqual(['potassiumMg', 'calciumMg']);
    // 영양정보 장면이 칼슘을 가리키지 않는 편은 표가 그대로다.
    const plain = resolveMealStory(script(['kcal', 'sodiumMg']), withCalcium, imageUrl).story;
    expect(plain.recipe?.nutrition.map((r) => r.key)).not.toContain('calciumMg');
  });

  it('비타민 C — 성인은 남녀·나이가 같아 덧말이 없고(100mg), 영양정보 장면이 가리키면 레시피 표에 그 줄이 붙는다', () => {
    expect(kdriFigure('vitaminC')).toEqual({ value: 100, unit: 'mg', basis: '성인 하루 권장섭취량', detail: null });
    expect(kdriFigure('vitaminC', 'female')).toMatchObject({ value: 100, detail: null });
    const withC: MealStoryFoodsFileType = {
      generatedBy: 'build:meal-stories',
      foods: {
        noodle: { per100: { kcal: 350, sodiumMg: 5, vitaminCMg: 0 }, basis: '100g', provenance: '원재료 R101', source: 'mfds-raw' },
        sauce: { per100: { kcal: 70, sodiumMg: 600, vitaminCMg: 110.6 }, basis: '100g', provenance: '가공 P113', source: 'mfds-processed' },
      },
    };
    const { story } = resolveMealStory(
      base({
        scenes: [
          { type: 'cover', kicker: '시험', title: '시험 표지' },
          { type: 'nutrition', title: '영양', nutrients: ['kcal', 'vitaminCMg'] },
          { type: 'outro', title: '끝', actions: ['share'] },
        ],
      } as Partial<MealStoryScriptType>),
      withC,
      imageUrl,
    );
    // 소스 100g × 110.6 = 110.6mg, 2인분이라 55.3 → mg 은 정수로.
    expect(sceneOf(story.scenes, 'nutrition').rows.map((r) => [r.key, r.label, r.figure.value])).toEqual([
      ['kcal', '열량', 387],
      ['vitaminCMg', '비타민 C', 55],
    ]);
    expect(story.recipe?.nutrition.map((r) => r.key).slice(-1)).toEqual(['vitaminCMg']);
  });

  it('막대 둘 — 작은 쪽이 큰 쪽의 약 N분의 1(어림이 15% 넘게 벗어나면 말하지 않는다), 큰 숫자 장면 밖의 숫자에는 소금 환산이 없다', () => {
    const { story } = resolveMealStory(base(), foods, imageUrl);
    const bars = sceneOf(story.scenes, 'bars');
    // 소스 150g 900mg · 직접 300mg → 둘째 막대가 첫째의 3분의 1.
    expect(bars.fraction).toEqual({ bar: 1, denominator: 3, multiple: false });
    // 강조한 막대가 큰 쪽이면 그 막대에 '약 N배' — 기준 막대에 'N분의 1'을 붙이면 거꾸로 읽힌다(한 접시가 권장량의 2배).
    const flipped = (highlight: [boolean, boolean]) =>
      sceneOf(
        resolveMealStory(
          base({
            scenes: [
              { type: 'cover', kicker: '시험', title: '시험 표지' },
              {
                type: 'bars',
                title: '비교',
                bars: [
                  { label: '소스 150g', value: { food: 'sauce', nutrient: 'sodiumMg', grams: 150 }, highlight: highlight[0] },
                  { label: '직접', value: { recipe: 'sodiumMg', part: 'sauce' }, highlight: highlight[1] },
                ],
              },
              { type: 'outro', title: '끝', actions: ['share'] },
            ],
          } as Partial<MealStoryScriptType>),
          foods,
          imageUrl,
        ).story.scenes,
        'bars',
      ).fraction;
    expect(flipped([true, false])).toEqual({ bar: 0, denominator: 3, multiple: true });
    expect(flipped([false, true])).toEqual({ bar: 1, denominator: 3, multiple: false });
    // 둘 다 강조했거나 아무것도 강조하지 않았으면 예전대로 작은 쪽에.
    expect(flipped([true, true])).toEqual({ bar: 1, denominator: 3, multiple: false });
    expect(bars.bars[0]!.figure.equivalent).toBeNull();
    expect(fractionOf(97, 953)).toBe(10);
    expect(fractionOf(100, 230)).toBe(2);
    // 2.4배·2.5배는 '2분의 1'도 '3분의 1'도 아니다.
    expect(fractionOf(100, 240)).toBeNull();
    expect(fractionOf(100, 250)).toBeNull();
    expect(fractionOf(100, 150)).toBeNull();
    expect(fractionOf(100, 100)).toBeNull();
    expect(fractionOf(0, 100)).toBeNull();
  });

  it('줄 세우기 — 줄마다 값을 계산하고 잣대·옆 글·소품·강조를 그대로 싣는다(못 푼 줄은 값 없이 issues). 주제는 열량도 된다', () => {
    const script = base({
      topic: { nutrient: 'kcal', direction: 'reduce' },
      scenes: [
        { type: 'cover', kicker: '시험', title: '시험 표지' },
        {
          type: 'lineup',
          title: '면끼리',
          basis: '삶은 면 100g',
          rows: [
            { label: '국수', value: { food: 'noodle', nutrient: 'kcal', grams: 100 }, icon: 'somen', highlight: true },
            { label: '소스', sub: '한 병 150g', value: { food: 'sauce', nutrient: 'kcal', grams: 150 } },
            { label: '허브', value: { food: 'herb', nutrient: 'kcal', grams: 10 } },
            { label: '없는 것', value: { food: 'ghost', nutrient: 'kcal', grams: 10 } },
          ],
          note: '덧말',
        },
        { type: 'outro', title: '끝', actions: ['share'] },
      ],
    });
    const { story, listItem, issues } = resolveMealStory(script, foods, imageUrl);
    expect(story.topic).toEqual({ nutrient: 'kcal', direction: 'reduce' });
    expect(listItem.topic).toEqual({ nutrient: 'kcal', direction: 'reduce' });
    // 목록 카드의 이름은 표지의 머리말 — 주제 이름(열량 줄이기)이 같은 편끼리도 구분된다.
    expect(listItem.kicker).toBe('시험');
    const noCover = base({ scenes: [{ type: 'list', title: '방법', items: [{ title: '하나' }, { title: '둘' }] }, { type: 'step', step: 1 }, { type: 'outro', title: '끝', actions: ['share'] }] });
    expect(resolveMealStory(noCover, foods, imageUrl).listItem.kicker).toBeNull();
    const lineup = sceneOf(story.scenes, 'lineup');
    expect(lineup.basis).toBe('삶은 면 100g');
    expect(lineup.note).toBe('덧말');
    expect(lineup.rows.map((r) => [r.label, r.sub, r.figure.value, r.figure.unit, r.icon, r.highlight])).toEqual([
      ['국수', null, 350, 'kcal', 'somen', true],
      ['소스', '한 병 150g', 105, 'kcal', null, false],
      ['허브', null, 3, 'kcal', null, false],
      ['없는 것', null, null, 'kcal', null, false],
    ]);
    expect(lineup.rows[0]!.figure).toMatchObject({ basis: '국수 100g', sources: ['mfds-raw'] });
    expect(issues).toEqual(["장면 2(lineup) 줄 4: 식품 'ghost' 가 foods 에 없다"]);
    // 줄은 넷에서 일곱 — 셋 이하는 막대(bars)로 쓴다.
    expect(() =>
      base({
        scenes: [
          { type: 'cover', kicker: '시험', title: '시험 표지' },
          { type: 'lineup', title: '면', rows: [{ label: '국수', value: { food: 'noodle', nutrient: 'kcal', grams: 100 } }] },
          { type: 'outro', title: '끝', actions: ['share'] },
        ],
      }),
    ).toThrow();
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
    expect(story.sources.map((s) => s.id)).toEqual(['my-book', 'kdri-2020', 'who-sodium-2012', 'mfds-processed', 'mfds-raw']);
    expect(sceneOf(story.scenes, 'step')).toMatchObject({ number: 1, total: 2, text: '삶는다', image: '/img/step-1.jpg' });
    expect(story.recipe?.steps[1]?.image).toBeNull();
  });

  it('섞은 값은 식품마다 100g당 × 그램의 합 — 묶음 중 일부 제품만 적은 영양소는 덧말로, 하나라도 모르면 합을 내지 않는다', () => {
    const half = [
      { food: 'noodle', grams: 40 },
      { food: 'wheat', grams: 40 },
    ];
    const script = base({
      foods: [
        { id: 'noodle', label: '국수', ref: { db: 'raw', code: 'R101-000000001-0000' } },
        { id: 'sauce', label: '소스', ref: { db: 'processed', code: 'P113-000000001-0000' } },
        { id: 'herb', label: '허브', manual: { per100: { kcal: 30, sodiumMg: null }, source: 'my-book' } },
        { id: 'wheat', label: '통밀국수', group: { db: 'processed', all: ['통밀'] } },
      ],
      scenes: [
        { type: 'cover', kicker: '시험', title: '시험 표지' },
        {
          type: 'bars',
          title: '섞기',
          bars: [
            { label: '반반', value: { foods: half, nutrient: 'fiberG' }, aside: { foods: half, nutrient: 'kcal' } },
            { label: '통밀', value: { food: 'wheat', nutrient: 'fiberG', grams: 80 }, highlight: true },
            {
              label: '모름',
              value: {
                foods: [
                  { food: 'noodle', grams: 40 },
                  { food: 'herb', grams: 40 },
                ],
                nutrient: 'sodiumMg',
              },
            },
          ],
        },
        { type: 'outro', title: '끝', actions: ['share'] },
      ],
    });
    const file: MealStoryFoodsFileType = {
      generatedBy: 'build:meal-stories',
      foods: {
        ...foods.foods,
        noodle: { per100: { kcal: 350, sodiumMg: 5, fiberG: 2.5 }, basis: '100g', provenance: '원재료 R101', source: 'mfds-raw' },
        wheat: {
          per100: { kcal: 325, fiberG: 8 },
          basis: '100g',
          provenance: "가공 '통밀' 제품 17개의 중앙값",
          source: 'mfds-processed',
          matched: { count: 17, names: ['통밀국수'], counts: { fiberG: 4 } },
        },
      },
    };
    const { story, issues } = resolveMealStory(script, file, imageUrl);
    const bars = sceneOf(story.scenes, 'bars');
    const partial = '통밀국수의 식이섬유 값은 표시한 제품 4개의 중앙값이에요';
    // 식이섬유 2.5×0.4 + 8×0.4 = 4.2g, 열량 140 + 130 = 270kcal(열량은 모든 제품이 적어 덧말 없음).
    expect(bars.bars[0]!.figure).toMatchObject({
      value: 4.2,
      unit: 'g',
      basis: '국수 40g + 통밀국수 40g',
      detail: partial,
      sources: ['mfds-raw', 'mfds-processed'],
    });
    expect(bars.bars[0]!.aside).toMatchObject({ label: '열량', figure: { value: 270, unit: 'kcal', detail: null } });
    expect(bars.bars[1]!.figure).toMatchObject({ value: 6.4, basis: '통밀국수 80g', detail: partial });
    expect(bars.bars[2]!.figure).toMatchObject({ value: null, basis: '국수 40g + 허브 40g', sources: [] });
    expect(issues).toEqual(['장면 2(bars) 막대 3: 허브 의 나트륨 값이 없다']);
    // 막대가 셋이면 '약 N분의 1'은 없다.
    expect(bars.fraction).toBeNull();
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

describe('buildMealStoryFoods', () => {
  it('묶음은 제품 중앙값(같은 제품 두 번은 한 번) — 값을 적은 제품이 묶음보다 적으면 그 수를, 최소 수보다 적으면 값을 비운다', () => {
    const row = (name: string, per100: MealStoryPer100Type, category = '면류'): FoodRow => ({
      code: 'P108-000000001-0000',
      name,
      category,
      basis: '100g',
      per100,
    });
    const script = base({
      foods: [
        {
          id: 'wheat',
          label: '통밀 스파게티',
          group: { db: 'processed', all: ['통밀'], any: ['스파게티'], none: ['렌틸'], category: '면류', min: 2 },
        },
      ],
    });
    const { file, problems } = buildMealStoryFoods(script, {
      processed: [
        row('통밀 스파게티', { kcal: 295, fiberG: 10, sodiumMg: 5 }),
        row('통밀 스파게티', { kcal: 295, fiberG: 10, sodiumMg: 5 }),
        row('통밀스파게티', { kcal: 325, fiberG: null }),
        row('유기농 통밀 스파게티', { kcal: 350, fiberG: 8 }),
        row('렌틸 통밀 스파게티', { kcal: 334, fiberG: 5.9 }),
        row('통밀 스파게티 과자', { kcal: 480, fiberG: 6 }, '과자류'),
      ],
    });
    expect(problems).toEqual([]);
    expect(file.foods.wheat).toMatchObject({
      // 나트륨은 한 제품만 적었다 → 비운다(최소 2).
      per100: { kcal: 325, fiberG: 9, sodiumMg: null },
      matched: { count: 3, counts: { fiberG: 2 } },
    });
    expect(file.foods.wheat?.matched?.counts).toEqual({ fiberG: 2 });
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

  it('줄 세우기 — 이름과 옆 글이 길면 영상 경고, 가장 작은 값·큰 값을 사람 확인 목록에 찍는다(제목의 말과 맞춰 보게)', () => {
    const script = base({
      scenes: [
        { type: 'cover', kicker: '시험', title: '시험 표지' },
        {
          type: 'lineup',
          title: '면끼리',
          rows: [
            { label: '국수', value: { food: 'noodle', nutrient: 'kcal', grams: 100 } },
            { label: '이름이 꽤 긴 소스 이름', sub: '한 병에 150g 들어 있음', value: { food: 'sauce', nutrient: 'kcal', grams: 150 } },
            { label: '허브', value: { food: 'herb', nutrient: 'kcal', grams: 10 } },
            { label: '국수 반', sub: '50g', value: { food: 'noodle', nutrient: 'kcal', grams: 50 } },
          ],
        },
        { type: 'outro', title: '끝', actions: ['share'] },
      ],
    });
    const r = checkMealStory(loaded(script));
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.includes('영상에서'))).toEqual([expect.stringContaining('장면 2 줄 2 이름')]);
    expect(r.review).toEqual(expect.arrayContaining([expect.stringContaining("장면 2 '면끼리': 가장 작은 값 허브 3kcal · 가장 큰 값 국수 350kcal (약 117배)")]));
    // 글에 박힌 영양 값은 줄 이름에서도 막는다(양 — 그램 — 은 괜찮다).
    const bad = base({
      scenes: [
        { type: 'cover', kicker: '시험', title: '시험 표지' },
        {
          type: 'lineup',
          title: '면끼리',
          rows: [
            { label: '국수 350kcal', value: { food: 'noodle', nutrient: 'kcal', grams: 100 } },
            { label: '소스', value: { food: 'sauce', nutrient: 'kcal', grams: 150 } },
            { label: '허브', value: { food: 'herb', nutrient: 'kcal', grams: 10 } },
            { label: '국수 반', value: { food: 'noodle', nutrient: 'kcal', grams: 50 } },
          ],
        },
        { type: 'outro', title: '끝', actions: ['share'] },
      ],
    });
    expect(checkMealStory(loaded(bad)).errors).toEqual([expect.stringContaining('장면 2 줄 1 이름')]);
  });

  it('머리말이 다른 편과 같으면 경고 — 목록 카드는 머리말로 구분한다(머리말이 없는 편·혼자인 머리말은 조용히)', () => {
    const kickers = new Map<string, string | null>([
      ['noodles', '열량 줄이기'],
      ['rice', '열량 줄이기'],
      ['pasta', '나트륨 줄이기'],
      ['bare', null],
    ]);
    expect(kickerClashWarnings('noodles', kickers)).toEqual([expect.stringContaining("머리말 '열량 줄이기' 이 다른 편(rice)과 같다")]);
    expect(kickerClashWarnings('rice', kickers)).toEqual([expect.stringContaining('다른 편(noodles)')]);
    expect(kickerClashWarnings('pasta', kickers)).toEqual([]);
    expect(kickerClashWarnings('bare', kickers)).toEqual([]);
    expect(kickerClashWarnings('unknown', kickers)).toEqual([]);
  });

  it('영상 틀의 한도 — 형식은 통과해도 영상에서 글씨가 작아지거나 잘리는 원고는 경고로 알린다', () => {
    const fine = checkMealStory(loaded(base()));
    expect(fine.warnings.filter((w) => w.includes('영상에서'))).toEqual([]);

    const script = base({
      scenes: [
        { type: 'cover', kicker: '시험', title: '표지 제목은 세 줄이 되어도 괜찮은 큰 카드예요' },
        {
          type: 'bars',
          title: '머리 제목이 두 줄을 넘을 만큼 아주 긴 막대 장면',
          bars: [
            { label: '이름표가 값 쪽지와 겹칠 만큼 아주 긴 막대', value: { food: 'sauce', nutrient: 'sodiumMg', grams: 150 } },
            { label: '직접', value: { recipe: 'sodiumMg' } },
          ],
        },
        {
          type: 'list',
          title: '방법',
          items: [
            { title: '하나', text: '두 줄까지는 보이는 길이의 설명이라 경고하지 않아요 괜찮아요' },
            { title: '둘', text: '두 줄을 넘는 설명은 영상에서 끝이 잘려요 그래서 미리 알려 줘요 이만큼 길면 넘쳐요 정말로 넘쳐요' },
          ],
        },
        { type: 'ingredients', title: '재료' },
        { type: 'outro', title: '끝', actions: ['share'] },
      ],
      recipe: {
        name: '시험 국수',
        servings: 2,
        dishType: 'noodle',
        ingredients: Array.from({ length: 10 }, (_, i) => ({ food: 'noodle', grams: 10, label: `재료 ${i + 1}` })),
        steps: [{ text: '삶는다' }],
      },
    });
    const r = checkMealStory(loaded(script));
    const motion = r.warnings.filter((w) => w.includes('영상에서'));
    expect(motion).toEqual([
      expect.stringContaining('장면 2 제목'),
      expect.stringContaining('장면 2 막대 1 이름'),
      expect.stringContaining('장면 3 항목 2 설명'),
      expect.stringContaining('장면 4 재료: 10개'),
    ]);
    // 한도는 경고일 뿐 — 글로 보기에는 다 보이므로 오류로 막지 않는다.
    expect(r.errors.filter((e) => e.includes('영상에서'))).toEqual([]);
  });
});
