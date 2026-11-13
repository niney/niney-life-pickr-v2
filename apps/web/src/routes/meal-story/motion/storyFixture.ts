import type { MealStoryFigureType, MealStoryType } from '@repo/api-contract';
import type { MotionMine } from './types';

// 변형 점검용 가짜 원고 — 첫 편에 없는 모양을 한 편에 모았다(사진 있는 표지·단계, 일반 숫자 장면, 소품 이름 없는 항목,
// 값 없는 막대, 줄 세우기의 가장 빽빽한 경우와 성긴 경우, 계약 한도까지 찬 줄 수·글 길이). 장면 그림 테스트(chapters.test)가 예외·넘침 없이 그려지는지 보고,
// MP4 도구의 Variants 컴포지션이 눈으로 볼 프레임을 뽑는다. 숫자는 모두 지어낸 값이다 — 서비스 화면에 쓰지 않는다.

const fig = (over: Partial<MealStoryFigureType> = {}): MealStoryFigureType => ({
  value: null,
  unit: 'mg',
  basis: null,
  detail: null,
  sources: [],
  my: null,
  equivalent: null,
  ...over,
});

// 사진 자리 확인용 그림(파일 없이) — 주황 바탕에 동그라미.
const PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='800' height='600' fill='#e9a15b'/><circle cx='400' cy='300' r='190' fill='#f6e3c0'/><circle cx='400' cy='300' r='120' fill='#d9502f'/></svg>",
)}`;

const LONG_NOTE = '덧말이 한도(아흔 자)까지 길어도 무대 안에 들어가는지 봅니다. 줄이 넷까지 늘어나도 위쪽 줄과 겹치지 않아야 하고 바닥을 넘지 않아야 합니다.';

export const variantStory: MealStoryType = {
  slug: 'variants',
  status: 'draft',
  title: '변형 점검',
  summary: '장면 틀의 모든 변형',
  topic: { nutrient: 'sodium', direction: 'reduce' },
  look: 'paper',
  publishedAt: '2026-11-10',
  reviewedAt: null,
  coverUrl: null,
  scenes: [
    { type: 'cover', kicker: '변형 점검', title: '사진이 있는 표지와 조금 긴 제목', subtitle: '부제가 두 줄로 넘어갈 만큼 길 때도 제목 카드 안에 들어가야 해요', image: PHOTO },
    {
      type: 'stat',
      title: '하루 나트륨, 이보다 적게',
      figures: [
        { label: '성인 하루 기준', figure: fig({ value: 2300, detail: '65~74세 2,100mg · 75세 이상 1,700mg', equivalent: { label: '소금', value: 5.8, unit: 'g', per: 400 } }) },
        { label: '내 최근 2주 하루 평균', figure: fig({ unit: '', my: 'sodium', equivalent: { label: '소금', value: null, unit: 'g', per: 400 } }) },
      ],
      note: '이보다 많이 먹는다면 줄이는 만큼 만성질환 위험을 낮출 수 있다는 기준이에요.',
    },
    {
      type: 'stat',
      title: '식이섬유는 얼마나 먹을까요',
      figures: [
        { label: '성인 하루 충분섭취량', figure: fig({ value: 25, unit: 'g', detail: '여성 20g · 남성 25~30g' }) },
        { label: '내 최근 2주 하루 평균', figure: fig({ unit: '', my: 'fiber' }) },
        { label: '값을 구하지 못한 숫자', figure: fig({ unit: 'g' }) },
      ],
      note: '일반 숫자 장면 — 숟가락이 아닌 주제는 이 모양으로 나와요.',
    },
    {
      type: 'bars',
      title: '막대 둘 — 차이가 큰 비교',
      bars: [
        { label: '시판 토마토 소스 150g', figure: fig({ value: 953 }), aside: null, highlight: false },
        { label: '직접 만든 소스(1인분)', figure: fig({ value: 97 }), aside: { label: '열량', figure: fig({ value: 190, unit: 'kcal' }) }, highlight: true },
      ],
      fraction: { bar: 1, denominator: 10, multiple: false },
      note: '시판 소스는 여러 제품의 중앙값이에요. 제품마다 차이가 커서 성분표를 보고 고르세요.',
    },
    {
      type: 'bars',
      title: '막대 넷에 옆 값과 덧말과 각주까지 다 있을 때',
      bars: [
        { label: '이름이 한도까지 아주 긴 막대의 이름표입니다 끝', figure: fig({ value: 9.4, unit: 'g' }), aside: { label: '열량', figure: fig({ value: 292, unit: 'kcal' }) }, highlight: false },
        { label: '반반(건면 40g + 통밀 40g)', figure: fig({ value: 4.3, unit: 'g', detail: '통밀 스파게티의 식이섬유 값은 표시한 제품 4개의 중앙값이에요' }), aside: { label: '열량', figure: fig({ value: 275, unit: 'kcal' }) }, highlight: true },
        { label: '값이 없는 막대', figure: fig({ unit: 'g' }), aside: { label: '열량', figure: fig({ unit: 'kcal' }) }, highlight: false },
        { label: '곤약면 200g', figure: fig({ value: 0.2, unit: 'g' }), aside: { label: '열량', figure: fig({ value: 14, unit: 'kcal' }) }, highlight: false },
      ],
      fraction: null,
      note: LONG_NOTE,
    },
    {
      // 가장 빽빽한 줄 세우기 — 일곱 줄 + 잣대 + 덧말 세 줄 + 각주. 값이 서로 비슷해 점선이 내려온다.
      type: 'lineup',
      title: '줄 세우기 일곱 줄에 잣대와 덧말',
      basis: '잣대가 한도까지 긴 글 삶은 면 100g',
      rows: [
        { label: '쌀국수', sub: null, figure: fig({ value: 132, unit: 'kcal' }), icon: 'ricenoodle', highlight: false },
        { label: '이름이 한도까지 긴 면이름', sub: '옆 글도 한도까지 길다 50g', figure: fig({ value: 131, unit: 'kcal' }), icon: 'udon', highlight: false },
        { label: '소면', sub: '마른 면 100g', figure: fig({ value: 126, unit: 'kcal', detail: '소면 값은 표시한 제품 4개의 중앙값이에요' }), icon: 'somen', highlight: true },
        { label: '소품 없는 줄', sub: null, figure: fig({ value: 123, unit: 'kcal' }), icon: null, highlight: false },
        { label: '값 없는 줄', sub: null, figure: fig({ unit: 'kcal' }), icon: 'soba', highlight: false },
        { label: '당면', sub: null, figure: fig({ value: 120, unit: 'kcal' }), icon: 'glassnoodle', highlight: false },
        { label: '메밀국수', sub: null, figure: fig({ value: 114, unit: 'kcal' }), icon: 'soba', highlight: false },
      ],
      note: '덧말이 한도(예순 자)까지 길어 세 줄이 되어도 일곱 줄과 겹치지 않고 무대 바닥을 넘지 않아야 해요.',
    },
    {
      // 성긴 줄 세우기 — 넷, 잣대·덧말 없음, 값 차이가 크고(점선 없음) 천 단위 쉼표가 든 값.
      type: 'lineup',
      title: '줄 넷 — 차이가 큰 값',
      basis: null,
      rows: [
        { label: '마른 소면', sub: '100g', figure: fig({ value: 1274 }), icon: 'somen', highlight: false },
        { label: '잔멸치', sub: null, figure: fig({ value: 620 }), icon: 'anchovy', highlight: true },
        { label: '삶은 소면', sub: '290g', figure: fig({ value: 197 }), icon: 'somen', highlight: true },
        { label: '곤약면', sub: '한 봉 200g', figure: fig({ value: 4 }), icon: 'konjac', highlight: true },
      ],
      note: null,
    },
    {
      type: 'list',
      title: '목록 여섯 줄',
      items: [
        { title: '국물은 남기기', text: '건더기 위주로 먹고 국물은 덜 먹어요', icon: 'bowl' },
        { title: '소품 이름이 없는 항목', text: '이름이 없으면 첫 글자 동그라미가 대신 나와요', icon: null },
        { title: '설명이 아주 긴 항목', text: '설명이 한도까지 길면 영상에서는 자리가 모자라 한두 줄만 보이고 나머지는 말줄임표로 줄어들어요 끝까지 다 보이지 않아요', icon: 'lemon' },
        { title: '설명이 없는 항목', text: null, icon: 'magnifier' },
        { title: '제목이 한도까지 아주 긴 항목의 제목입니다', text: '짧은 설명', icon: 'dip' },
        { title: '여섯째', text: '마지막 줄', icon: 'timer' },
      ],
      note: '목록 아래 덧말이 두 줄로 넘어가도 여섯 줄과 겹치지 않아야 해요. 바닥에서부터 자리를 잡아요.',
    },
    {
      type: 'ingredients',
      title: '재료',
      servings: 2,
      items: [
        { label: '스파게티 건면', grams: 160, note: '소금 없이 삶기', food: 'x', icon: 'noodle' },
        { label: '이름이 아주 긴 재료 한 줄에 다 들어가는지 보는 이름', grams: 1250, note: '메모도 길다', food: 'x', icon: 'tomato' },
        { label: '양파 1/2개', grams: 100, note: null, food: 'x', icon: 'onion' },
        { label: '마늘 4쪽', grams: 20, note: '다져서', food: 'x', icon: 'garlic' },
        { label: '올리브유 4작은술', grams: 20, note: null, food: 'x', icon: 'oil' },
        { label: '바질 잎 12장', grams: 6, note: null, food: 'x', icon: 'leaf' },
        { label: '파마산 치즈 2큰술(간 것)', grams: 10, note: null, food: 'x', icon: 'cheese' },
        { label: '소품 이름이 없는 재료', grams: 7.5, note: null, food: 'x', icon: null },
        { label: '후추', grams: 1, note: '조금', food: 'x', icon: 'shaker' },
        { label: '레몬즙', grams: 5, note: null, food: 'x', icon: 'lemon' },
        { label: '방울토마토', grams: 80, note: null, food: 'x', icon: 'tomato' },
        { label: '물', grams: 1000, note: '면 삶을 물', food: 'x', icon: 'pot' },
      ],
    },
    {
      type: 'step',
      number: 1,
      total: 2,
      text: '사진이 있는 단계예요. 올리브유에 다진 마늘과 양파를 약한 불로 볶아 향을 낸 뒤, 깍둑 썬 토마토를 넣고 10분쯤 눌러 가며 끓여요.',
      tip: '팁도 두 줄로 넘어갈 만큼 길 때 — 면 삶은 물을 한 국자 남겨 두면 소스와 버무릴 때 잘 섞여요.',
      image: PHOTO,
      icon: 'pan',
    },
    { type: 'step', number: 2, total: 2, text: '팁도 소품 이름도 없는 짧은 단계예요.', tip: null, image: null, icon: null },
    {
      type: 'nutrition',
      title: '영양정보',
      servings: 2,
      rows: [
        { key: 'kcal', label: '열량', figure: fig({ value: 481, unit: 'kcal' }) },
        { key: 'sodiumMg', label: '나트륨', figure: fig({ value: 99 }) },
        { key: 'potassiumMg', label: '칼륨', figure: fig({ value: 960 }) },
        { key: 'proteinG', label: '단백질', figure: fig({ value: 15, unit: 'g' }) },
        { key: 'fiberG', label: '식이섬유', figure: fig({ value: 9.9, unit: 'g' }) },
        { key: 'sugarG', label: '당류', figure: fig({ unit: 'g' }) },
      ],
      cautions: [
        '신장 질환이 있거나 칼륨을 줄이라는 안내를 받았다면 토마토 양은 의사와 정하세요.',
        '주의 문구가 둘일 때도 라벨과 겹치지 않고 무대 안에 들어가야 해요.',
      ],
      note: '덧말까지 있어서 쪽지가 셋이 되는 가장 빽빽한 경우예요.',
    },
    { type: 'outro', title: '마무리 제목도 두 줄이 될 만큼 길 때', text: '기록해 두면 통계에서 나트륨이 줄어드는 게 보여요. 마무리 글이 길어 세 줄이 되어도 단추 자리를 가리지 않아야 해요.', actions: ['record', 'recipe', 'stats', 'share'] },
  ],
  recipe: null,
  sources: [],
};

/** 칠판 메뉴판 그림체 점검 — 같은 변형 원고에서 칠판이 그리는 장면만(레시피 장면은 칠판에 없다). */
export const variantChalkStory: MealStoryType = {
  ...variantStory,
  slug: 'variants-chalk',
  look: 'chalk',
  scenes: variantStory.scenes.filter((s) => s.type !== 'ingredients' && s.type !== 'step' && s.type !== 'nutrition'),
};

/** 로그인한 사람의 값(예시) — 나트륨은 기준을 넘고, 식이섬유는 기록이 모자란 경우. */
export const variantMine: MotionMine = {
  sodium: { value: 3120, unit: 'mg', percent: 136, standard: 2300, statusLabel: '많음', over: true, change: null },
};

/** 식이섬유 값이 있는 사람 — 내 기준(여자 20g)이 원고의 첫 기준 숫자와 다르고, 판정은 '조금 부족'. 일반 숫자 장면의 쪽지를 본다. */
export const variantMineFiber: MotionMine = {
  fiber: { value: 16.4, unit: 'g', percent: 82, standard: 20, statusLabel: '조금 부족', over: false, change: null },
};

/** 내 기준이 원고의 성인 기준과 다른 사람(65~74세 2,100mg) — 2,200mg 은 성인 기준 안이지만 내 기준으로는 넘는다. */
export const variantMineSenior: MotionMine = {
  sodium: { value: 2200, unit: 'mg', percent: 105, standard: 2100, statusLabel: '많음', over: true, change: null },
};

/** 직전 2주보다 달라진 사람 — 내 값 칸에 변화 쪽지가 하나 더 붙는다(나트륨은 줄고 식이섬유는 늘었다). */
export const variantMineChanged: MotionMine = {
  sodium: { value: 2760, unit: 'mg', percent: 120, standard: 2300, statusLabel: '많음', over: true, change: '직전 2주보다 12% 줄었어요' },
  fiber: { value: 16.4, unit: 'g', percent: 82, standard: 20, statusLabel: '조금 부족', over: false, change: '직전 2주보다 20% 늘었어요' },
};
