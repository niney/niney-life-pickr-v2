import type {
  MealStoryFigureType,
  MealStoryIngredientType,
  MealStoryListItemType,
  MealStoryNutrientType,
  MealStoryNutritionRowType,
  MealStorySceneType,
  MealStoryType,
} from '@repo/api-contract';
import {
  MEAL_STORY_BUILTIN_SOURCES,
  MEAL_STORY_NUTRIENTS,
  MEAL_STORY_RECIPE_NUTRIENTS,
  SODIUM_TO_SALT,
  cautionText,
  fractionOf,
  kdriFigure,
  roundForUnit,
} from './meal-story.defs.js';
import type {
  MealStoryFoodsFileType,
  MealStoryPer100CountsType,
  MealStoryPer100Type,
  MealStoryScriptSceneType,
  MealStoryScriptType,
  MealStoryValueRefType,
} from './meal-story.script.js';

// 원고 → 화면이 받는 스토리. 숫자는 여기서 모두 계산한다(원고에는 가리키는 말만 있다). 순수 함수 — 파일·DB 를 모른다.
// 못 푼 가리킴(없는 식품·출처·단계)은 issues 로 모은다. 서버는 issues 가 있어도 보여 주고(값은 null), 점검 스크립트와
// 내용 테스트는 issues 를 실패로 센다.

export interface ResolvedMealStory {
  story: MealStoryType;
  listItem: MealStoryListItemType;
  issues: string[];
}

interface FoodValues {
  label: string;
  per100: MealStoryPer100Type;
  source: string;
  /** 묶음 중앙값이면 — 제품 수와, 값을 적은 제품이 그보다 적은 영양소의 수. */
  group?: { count: number; counts: MealStoryPer100CountsType };
}

const MY_BASIS = '내 최근 2주 하루 평균';

export const resolveMealStory = (
  script: MealStoryScriptType,
  foodsFile: MealStoryFoodsFileType | null,
  imageUrl: (file: string) => string | null,
): ResolvedMealStory => {
  const issues: string[] = [];
  const usedSources = new Set<string>();
  const scriptSources = new Map(script.sources.map((s) => [s.id, s]));

  const foods = new Map<string, FoodValues>();
  for (const spec of script.foods) {
    if (spec.manual) {
      if (!scriptSources.has(spec.manual.source)) issues.push(`식품 ${spec.id}: 출처 '${spec.manual.source}' 가 sources 에 없다`);
      foods.set(spec.id, { label: spec.label, per100: spec.manual.per100, source: spec.manual.source });
      continue;
    }
    const built = foodsFile?.foods[spec.id];
    if (!built) {
      issues.push(`식품 ${spec.id}: foods.json 에 값이 없다 — pnpm --filter friendly build:meal-stories 를 돌린다`);
      foods.set(spec.id, { label: spec.label, per100: {}, source: spec.ref?.db === 'processed' || spec.group?.db === 'processed' ? 'mfds-processed' : 'mfds-raw' });
      continue;
    }
    foods.set(spec.id, {
      label: spec.label,
      per100: built.per100,
      source: built.source,
      group: built.matched ? { count: built.matched.count, counts: built.matched.counts ?? {} } : undefined,
    });
  }

  const unitOf = (n: MealStoryNutrientType) => MEAL_STORY_NUTRIENTS[n].unit;
  const figure = (f: Partial<MealStoryFigureType> & { unit: string }): MealStoryFigureType => ({
    value: f.value ?? null,
    unit: f.unit,
    basis: f.basis ?? null,
    detail: f.detail ?? null,
    sources: f.sources ?? [],
    my: f.my ?? null,
    equivalent: f.equivalent ?? null,
  });

  const recipe = script.recipe ?? null;
  const recipeFigure = (n: MealStoryNutrientType, part: string | undefined, where: string): MealStoryFigureType => {
    const unit = unitOf(n);
    if (!recipe) {
      issues.push(`${where}: 레시피가 없는데 recipe 값을 가리킨다`);
      return figure({ unit });
    }
    const rows = recipe.ingredients.filter((i) => part === undefined || i.part === part);
    if (rows.length === 0) issues.push(`${where}: 묶음 '${part}' 에 든 재료가 없다`);
    let sum = 0;
    let known = 0;
    const missing: string[] = [];
    const sources = new Set<string>();
    for (const ing of rows) {
      const food = foods.get(ing.food);
      if (!food) {
        issues.push(`${where}: 재료 ${ing.label} 의 식품 '${ing.food}' 가 foods 에 없다`);
        missing.push(ing.label);
        continue;
      }
      const v = food.per100[n];
      if (v === null || v === undefined) {
        missing.push(ing.label);
        continue;
      }
      sum += (v * ing.grams) / 100;
      known += 1;
      sources.add(food.source);
    }
    for (const s of sources) usedSources.add(s);
    const labels = rows.map((r) => r.label);
    const basis =
      part === undefined
        ? '1인분'
        : `1인분 중 ${labels.slice(0, 4).join('·')}${labels.length > 4 ? ` 외 ${labels.length - 4}가지` : ''}`;
    return figure({
      value: known === 0 ? null : roundForUnit(sum / recipe.servings, unit),
      unit,
      basis,
      detail: missing.length > 0 && known > 0 ? `값을 모르는 재료(${missing.join('·')})는 빼고 셌어요` : null,
      sources: [...sources],
    });
  };

  // 묶음 중 일부 제품만 그 영양소를 적었으면 밝힌다(통밀 파스타 식이섬유 — 라벨에 없는 제품이 많다).
  const partialNote = (food: FoodValues, n: MealStoryNutrientType): string | null => {
    const c = food.group?.counts[n];
    return food.group && c !== undefined && c < food.group.count
      ? `${food.label}의 ${MEAL_STORY_NUTRIENTS[n].label} 값은 표시한 제품 ${c}개의 중앙값이에요`
      : null;
  };

  const valueFigure = (ref: MealStoryValueRefType, where: string): MealStoryFigureType => {
    if ('kdri' in ref) {
      usedSources.add('kdri-2020');
      const k = kdriFigure(ref.kdri, ref.sex);
      return figure({ value: k.value, unit: k.unit, basis: k.basis, detail: k.detail, sources: ['kdri-2020'] });
    }
    if ('food' in ref) {
      const unit = unitOf(ref.nutrient);
      const food = foods.get(ref.food);
      if (!food) {
        issues.push(`${where}: 식품 '${ref.food}' 가 foods 에 없다`);
        return figure({ unit });
      }
      const v = food.per100[ref.nutrient];
      if (v === null || v === undefined) issues.push(`${where}: ${food.label} 의 ${MEAL_STORY_NUTRIENTS[ref.nutrient].label} 값이 없다`);
      else usedSources.add(food.source);
      return figure({
        value: v === null || v === undefined ? null : roundForUnit((v * ref.grams) / 100, unit),
        unit,
        basis: `${food.label} ${ref.grams.toLocaleString('ko-KR')}g`,
        detail: v === null || v === undefined ? null : partialNote(food, ref.nutrient),
        sources: v === null || v === undefined ? [] : [food.source],
      });
    }
    if ('foods' in ref) {
      const unit = unitOf(ref.nutrient);
      let sum = 0;
      let complete = true;
      const parts: string[] = [];
      const notes: string[] = [];
      const sources = new Set<string>();
      for (const part of ref.foods) {
        const food = foods.get(part.food);
        const grams = `${part.grams.toLocaleString('ko-KR')}g`;
        if (!food) {
          issues.push(`${where}: 식품 '${part.food}' 가 foods 에 없다`);
          parts.push(`${part.food} ${grams}`);
          complete = false;
          continue;
        }
        parts.push(`${food.label} ${grams}`);
        const v = food.per100[ref.nutrient];
        if (v === null || v === undefined) {
          issues.push(`${where}: ${food.label} 의 ${MEAL_STORY_NUTRIENTS[ref.nutrient].label} 값이 없다`);
          complete = false;
          continue;
        }
        sum += (v * part.grams) / 100;
        sources.add(food.source);
        const note = partialNote(food, ref.nutrient);
        if (note) notes.push(note);
      }
      // 하나라도 모르면 합을 내지 않는다(반쪽 합은 틀린 값이다).
      if (complete) for (const s of sources) usedSources.add(s);
      return figure({
        value: complete ? roundForUnit(sum, unit) : null,
        unit,
        basis: parts.join(' + '),
        detail: complete && notes.length > 0 ? [...new Set(notes)].join(' · ') : null,
        sources: complete ? [...sources] : [],
      });
    }
    if ('recipe' in ref) return recipeFigure(ref.recipe, ref.part, where);
    if ('my' in ref) return figure({ unit: '', basis: MY_BASIS, my: ref.my });
    if (!scriptSources.has(ref.source)) issues.push(`${where}: 출처 '${ref.source}' 가 sources 에 없다`);
    usedSources.add(ref.source);
    return figure({ value: ref.value, unit: ref.unit, sources: [ref.source] });
  };

  // 나트륨을 가리키는 값인가 — 큰 숫자 장면에서 소금으로도 보여 준다.
  const isSodium = (ref: MealStoryValueRefType): boolean =>
    ('kdri' in ref && ref.kdri === 'sodium') ||
    ('my' in ref && ref.my === 'sodium') ||
    (('food' in ref || 'foods' in ref) && ref.nutrient === 'sodiumMg') ||
    ('recipe' in ref && ref.recipe === 'sodiumMg');

  /** 큰 숫자 장면의 숫자 — 나트륨이면 소금 환산을 붙인다(내 기록은 화면이 같은 per 로 나눈다). */
  const statFigure = (ref: MealStoryValueRefType, where: string): MealStoryFigureType => {
    const f = valueFigure(ref, where);
    if (!isSodium(ref) || (f.value === null && !f.my)) return f;
    usedSources.add(SODIUM_TO_SALT.source);
    return {
      ...f,
      sources: [...f.sources, SODIUM_TO_SALT.source],
      equivalent: {
        label: SODIUM_TO_SALT.label,
        value: f.value === null ? null : roundForUnit(f.value / SODIUM_TO_SALT.per, SODIUM_TO_SALT.unit),
        unit: SODIUM_TO_SALT.unit,
        per: SODIUM_TO_SALT.per,
      },
    };
  };

  const asideLabel = (ref: MealStoryValueRefType, where: string): string => {
    if ('food' in ref || 'foods' in ref) return MEAL_STORY_NUTRIENTS[ref.nutrient].label;
    if ('recipe' in ref) return MEAL_STORY_NUTRIENTS[ref.recipe].label;
    issues.push(`${where}: aside 는 food·recipe 값만 쓴다`);
    return '';
  };

  const ingredients: MealStoryIngredientType[] = (recipe?.ingredients ?? []).map((i) => ({
    label: i.label,
    grams: i.grams,
    note: i.note ?? null,
    food: foods.get(i.food)?.label ?? i.food,
    icon: i.icon ?? null,
  }));
  if (recipe) {
    for (const i of recipe.ingredients) {
      if (!foods.has(i.food)) issues.push(`재료 ${i.label}: 식품 '${i.food}' 가 foods 에 없다`);
    }
  }

  // 레시피 영양 표의 줄 — 늘 보이는 줄 뒤에, 이 편의 영양정보 장면이 가리키는 그 밖의 영양소(칼슘)를 붙인다.
  const recipeNutrients: MealStoryNutrientType[] = [...MEAL_STORY_RECIPE_NUTRIENTS];
  for (const s of script.scenes) {
    if (s.type !== 'nutrition') continue;
    for (const n of s.nutrients) if (!recipeNutrients.includes(n)) recipeNutrients.push(n);
  }
  const nutritionRows = (keys: readonly MealStoryNutrientType[], where: string): MealStoryNutritionRowType[] =>
    keys.map((key) => ({ key, label: MEAL_STORY_NUTRIENTS[key].label, figure: recipeFigure(key, undefined, where) }));

  const image = (file: string | undefined, where: string): string | null => {
    if (!file) return null;
    const url = imageUrl(file);
    if (!url) issues.push(`${where}: 사진 '${file}' 이 images/ 에 없다`);
    return url;
  };

  const scene = (s: MealStoryScriptSceneType, i: number): MealStorySceneType => {
    const where = `장면 ${i + 1}(${s.type})`;
    switch (s.type) {
      case 'cover':
        return {
          type: 'cover',
          kicker: s.kicker,
          title: s.title,
          subtitle: s.subtitle ?? null,
          image: image(s.image ?? script.cover, where),
        };
      case 'stat':
        return {
          type: 'stat',
          title: s.title,
          figures: s.figures.map((f, k) => ({ label: f.label, figure: statFigure(f.value, `${where} 숫자 ${k + 1}`) })),
          note: s.note ?? null,
        };
      case 'bars': {
        const bars = s.bars.map((b, k) => ({
          label: b.label,
          figure: valueFigure(b.value, `${where} 막대 ${k + 1}`),
          aside: b.aside
            ? { label: asideLabel(b.aside, `${where} 막대 ${k + 1}`), figure: valueFigure(b.aside, `${where} 막대 ${k + 1} 옆 값`) }
            : null,
          highlight: b.highlight ?? false,
        }));
        // 둘을 견주는 장면이고 단위가 같으면 — 작은 쪽이 큰 쪽의 '약 N분의 1'.
        const [a, b] = bars;
        let fraction: { bar: number; denominator: number } | null = null;
        if (bars.length === 2 && a && b && a.figure.value !== null && b.figure.value !== null && a.figure.unit === b.figure.unit) {
          const bar = a.figure.value <= b.figure.value ? 0 : 1;
          const denominator = fractionOf(Math.min(a.figure.value, b.figure.value), Math.max(a.figure.value, b.figure.value));
          if (denominator !== null) fraction = { bar, denominator };
        }
        return { type: 'bars', title: s.title, bars, fraction, note: s.note ?? null };
      }
      case 'list':
        return {
          type: 'list',
          title: s.title,
          items: s.items.map((it) => ({ title: it.title, text: it.text ?? null, icon: it.icon ?? null })),
          note: s.note ?? null,
        };
      case 'ingredients':
        if (!recipe) issues.push(`${where}: 레시피가 없다`);
        return { type: 'ingredients', title: s.title, servings: recipe?.servings ?? 1, items: ingredients };
      case 'step': {
        const step = recipe?.steps[s.step - 1];
        if (!step) issues.push(`${where}: 레시피 ${s.step}단계가 없다`);
        return {
          type: 'step',
          number: s.step,
          total: recipe?.steps.length ?? 0,
          text: step?.text ?? '',
          tip: step?.tip ?? null,
          image: image(step?.image, where),
          icon: step?.icon ?? null,
        };
      }
      case 'nutrition':
        return {
          type: 'nutrition',
          title: s.title,
          servings: recipe?.servings ?? 1,
          rows: nutritionRows(s.nutrients, where),
          cautions: (s.cautions ?? []).map(cautionText).filter((c) => c.length > 0),
          note: s.note ?? null,
        };
      case 'outro':
        if (!recipe && s.actions.some((a) => a === 'record' || a === 'recipe')) {
          issues.push(`${where}: 레시피가 없는데 기록·레시피 버튼을 단다`);
        }
        return { type: 'outro', title: s.title, text: s.text ?? null, actions: s.actions };
    }
  };

  const scenes = script.scenes.map(scene);
  const coverUrl = image(script.cover, '표지 사진');
  const recipeOut: MealStoryType['recipe'] = recipe
    ? {
        name: recipe.name,
        servings: recipe.servings,
        dishType: recipe.dishType,
        ingredients,
        steps: recipe.steps.map((st, k) => ({
          text: st.text,
          tip: st.tip ?? null,
          image: image(st.image, `레시피 ${k + 1}단계`),
        })),
        nutrition: nutritionRows(recipeNutrients, '레시피 영양'),
      }
    : null;

  // 출처 — 원고가 적은 것 + 값에 쓰인 기본 출처(섭취기준·식품 표준데이터). 원고 차례 뒤에 기본 출처.
  const sources = script.sources.map((s) => ({ id: s.id, label: s.label, url: s.url ?? null }));
  for (const id of usedSources) {
    if (scriptSources.has(id)) continue;
    const label = MEAL_STORY_BUILTIN_SOURCES[id];
    if (label) sources.push({ id, label, url: null });
    else issues.push(`출처 '${id}' 를 알 수 없다`);
  }

  const story: MealStoryType = {
    slug: script.slug,
    status: script.status,
    title: script.title,
    summary: script.summary,
    topic: script.topic ?? null,
    publishedAt: script.publishedAt,
    reviewedAt: script.reviewedAt,
    coverUrl,
    scenes,
    recipe: recipeOut,
    sources,
  };
  const listItem: MealStoryListItemType = {
    slug: story.slug,
    status: story.status,
    title: story.title,
    summary: story.summary,
    topic: story.topic,
    publishedAt: story.publishedAt,
    coverUrl,
    sceneCount: scenes.length,
    // 카탈로그 음식은 DB 에 있다 — 목록 라우트가 채운다(mealStoryFoodIds).
    recipeFoodId: null,
  };
  return { story, listItem, issues: [...new Set(issues)] };
};
