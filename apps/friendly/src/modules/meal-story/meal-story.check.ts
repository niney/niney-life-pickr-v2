import type { LoadedMealStory } from './meal-story.store.js';
import type { MealStoryFoodsFileType } from './meal-story.script.js';

// 건강식단 스토리 내용 점검 — check:meal-stories 와 내용 테스트(meal-story.content.test)가 같이 쓴다. 형식(zod)·가리킴
// (resolve issues) 다음 단계: 건강 정보 말투, 숫자가 글에 박히지 않았는지, 게시 조건, 사람이 확인할 값 목록.

export interface MealStoryCheckResult {
  errors: string[];
  warnings: string[];
  /** 사람이 원본과 맞춰 볼 것 — 식품 값의 출처, 손으로 적은 값. */
  review: string[];
}

// 효능을 단정하는 말 — 식단 정보는 '도움이 될 수 있다'까지만(식품 표시·광고 기준과 같은 결).
const CLAIM_PATTERNS: readonly { re: RegExp; why: string }[] = [
  { re: /치료|완치|낫(는|게|습)|고쳐/, why: '치료 효과를 말하지 않는다' },
  { re: /예방(된|합니|해 ?줘|해요|할 ?수)/, why: '질병 예방을 단정하지 않는다' },
  { re: /특효|만병|기적|신비/, why: '과장 표현' },
  { re: /해독|디톡스|독소/, why: '근거가 약한 해독 표현' },
  { re: /살(이)? ?(쫙|쭉)?빠(진|져|지|집)|다이어트 ?효과/, why: '체중 감량을 단정하지 않는다' },
  { re: /무조건|절대(로)? ?(먹|드)|100 ?%/, why: '단정 표현' },
];
// 영양 값 단위가 글에 박힌 숫자 — 값은 figure(kdri·food·recipe·value+source)로 가리킨다.
const NUMBER_IN_TEXT = /\d[\d,.]*\s*(mg|㎎|kcal|칼로리|μg)/i;

const MAX_IMAGE_BYTES = 600_000;
const MAX_IMAGE_EDGE = 1600;

interface TextField {
  where: string;
  text: string;
  /** 레시피 단계·재료처럼 양(그램·분)을 적어도 되는 글. */
  quantities: boolean;
}

const textFields = (s: LoadedMealStory): TextField[] => {
  const out: TextField[] = [
    { where: '제목', text: s.script.title, quantities: false },
    { where: '요약', text: s.script.summary, quantities: false },
  ];
  s.script.scenes.forEach((sc, i) => {
    const w = `장면 ${i + 1}`;
    const add = (part: string, text: string | undefined, quantities = false) => {
      if (text) out.push({ where: `${w} ${part}`, text, quantities });
    };
    switch (sc.type) {
      case 'cover':
        add('머리말', sc.kicker);
        add('제목', sc.title);
        add('부제', sc.subtitle);
        break;
      case 'stat':
        add('제목', sc.title);
        add('덧말', sc.note);
        sc.figures.forEach((f, k) => add(`숫자 ${k + 1} 이름`, f.label, true));
        break;
      case 'bars':
        add('제목', sc.title);
        add('덧말', sc.note);
        sc.bars.forEach((b, k) => add(`막대 ${k + 1} 이름`, b.label, true));
        break;
      case 'list':
        add('제목', sc.title);
        add('덧말', sc.note);
        sc.items.forEach((it, k) => {
          add(`항목 ${k + 1}`, it.title);
          add(`항목 ${k + 1} 설명`, it.text);
        });
        break;
      case 'ingredients':
      case 'nutrition':
        add('제목', sc.title);
        if (sc.type === 'nutrition') add('덧말', sc.note);
        break;
      case 'outro':
        add('제목', sc.title);
        add('글', sc.text);
        break;
      case 'step':
        break;
    }
  });
  const recipe = s.script.recipe;
  if (recipe) {
    out.push({ where: '레시피 이름', text: recipe.name, quantities: false });
    recipe.steps.forEach((st, k) => {
      out.push({ where: `레시피 ${k + 1}단계`, text: st.text, quantities: true });
      if (st.tip) out.push({ where: `레시피 ${k + 1}단계 팁`, text: st.tip, quantities: true });
    });
    recipe.ingredients.forEach((ing) => {
      out.push({ where: `재료 ${ing.label}`, text: ing.label, quantities: true });
      if (ing.note) out.push({ where: `재료 ${ing.label} 메모`, text: ing.note, quantities: true });
    });
  }
  return out;
};

/** 사진 크기 — 바이트·가로세로. 사진 검사는 부르는 쪽이 sharp 로 잰 값을 넘긴다(테스트는 생략 가능). */
export interface ImageInfo {
  file: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

export const checkMealStory = (
  s: LoadedMealStory,
  opts: { images?: ImageInfo[]; foodsFile?: MealStoryFoodsFileType | null } = {},
): MealStoryCheckResult => {
  const errors = [...s.issues];
  const warnings: string[] = [];
  const review: string[] = [];

  for (const f of textFields(s)) {
    for (const p of CLAIM_PATTERNS) {
      if (p.re.test(f.text)) errors.push(`${f.where}: '${f.text}' — ${p.why}`);
    }
    if (NUMBER_IN_TEXT.test(f.text)) {
      errors.push(`${f.where}: '${f.text}' — 영양 값은 글에 적지 않고 숫자(figure)로 가리킨다`);
    }
    // '1인분'처럼 양을 세는 말은 값이 아니다.
    if (!f.quantities && /\d/.test(f.text.replace(/\d+\s*인분/g, ''))) {
      warnings.push(`${f.where}: '${f.text}' — 글에 숫자가 있다(출처가 필요한 값이면 figure 로)`);
    }
  }

  const scenes = s.script.scenes;
  if (scenes[0]?.type !== 'cover') warnings.push('첫 장면은 표지(cover)가 좋다');
  if (scenes[scenes.length - 1]?.type !== 'outro') warnings.push('마지막 장면은 마무리(outro)가 좋다');
  if (scenes.length > 12) warnings.push(`장면이 ${scenes.length}장 — 12장 안쪽을 권한다`);
  const steps = scenes.filter((sc) => sc.type === 'step').map((sc) => (sc.type === 'step' ? sc.step : 0));
  const total = s.script.recipe?.steps.length ?? 0;
  if (s.script.recipe && steps.length > 0 && steps.length < total) {
    warnings.push(`레시피 ${total}단계 중 ${steps.length}단계만 장면에 있다(나머지는 레시피 전체 보기에만)`);
  }

  if (s.script.status === 'published') {
    if (!s.script.reviewedAt) errors.push('게시하려면 검수일(reviewedAt)이 있어야 한다');
    if (!s.script.cover) errors.push('게시하려면 표지 사진(cover)이 있어야 한다');
    if (s.script.recipe?.steps.some((st) => !st.image)) warnings.push('사진이 없는 레시피 단계가 있다');
  }

  // 사진 — 크기와 쓰이지 않는 파일.
  if (opts.images) {
    const used = new Set<string>(
      [
        s.script.cover,
        ...scenes.map((sc) => (sc.type === 'cover' ? sc.image : undefined)),
        ...(s.script.recipe?.steps.map((st) => st.image) ?? []),
      ].filter((x): x is string => !!x),
    );
    for (const img of opts.images) {
      if (!used.has(img.file)) warnings.push(`사진 ${img.file} 이 어디에도 쓰이지 않는다`);
      if (img.bytes > MAX_IMAGE_BYTES) errors.push(`사진 ${img.file} 이 ${Math.round(img.bytes / 1000)}KB — ${MAX_IMAGE_BYTES / 1000}KB 이하로(build:meal-stories 가 줄인다)`);
      const edge = Math.max(img.width ?? 0, img.height ?? 0);
      if (edge > MAX_IMAGE_EDGE) errors.push(`사진 ${img.file} 긴 변 ${edge}px — ${MAX_IMAGE_EDGE}px 이하로`);
    }
  }

  // 사람 확인 목록 — 값마다 어디서 왔는지.
  for (const spec of s.script.foods) {
    if (spec.manual) {
      review.push(`${spec.label}(${spec.id}): 손으로 적은 값 ${JSON.stringify(spec.manual.per100)} — 출처 ${spec.manual.source}${spec.manual.note ? ` (${spec.manual.note})` : ''}`);
      continue;
    }
    const built = opts.foodsFile?.foods[spec.id];
    if (built) {
      review.push(`${spec.label}(${spec.id}): ${built.provenance}${built.matched ? ` — ${built.matched.names.slice(0, 5).join(', ')}` : ''}`);
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], review };
};
