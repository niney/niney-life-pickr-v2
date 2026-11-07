import type { NutrientKey } from '../food/food-nutrients.js';
import type { KdriNutrient } from './kdri.js';

// 영양소 점검이 보는 영양소 — 어디서 읽는지·영양제로 권할 수 있는지·고정 주의 문구. 주의 문구는 LLM 이 쓰지 않고
// 서버가 그대로 붙인다(복약·임신·질환에 관한 말을 모델이 지어내지 않게).

export interface NutrientDef {
  key: KdriNutrient;
  label: string;
  unit: string;
  // 식단 항목 저장 스냅샷(단백질·나트륨) 또는 카탈로그 100g당 값.
  from: { snapshot: 'proteinG' | 'sodiumMg' } | { per100: NutrientKey };
  // 영양제로 권할 수 있는지 — 단백질·식이섬유·칼륨·나트륨은 음식으로만 이야기한다.
  supplement: boolean;
  // 영양제를 고른다면 — 성분·형태·먹는 법(제품명 없음). 조언 LLM 이 이 안에서만 말하고, 폴백 문장도 이걸 쓴다.
  supplementForms: string | null;
  // 음식만으로 상한섭취량을 넘었다고 말할 수 있는지 — 니아신 상한은 보충제(니코틴산), 비타민 A 상한은 레티놀에만 해당해
  // 음식(카로티노이드 포함 RAE)으로는 판단하지 않는다. 상한 값 자체는 영양제 조언에 쓴다.
  foodUpperLimit: boolean;
  // 상한이 음식 전체가 아니라 특정 형태에만 해당할 때 그 기준과 단위(조언 문장이 "상한 1,000μg(영양제·강화식품의 엽산 기준)"으로
  // 밝히게). 엽산 섭취량은 μg DFE 지만 상한은 엽산(folic acid) μg 이다.
  upperLimitBasis?: string;
  upperLimitUnit?: string;
  // 과일·채소가 영양 정보 없이 기록되면 실제보다 적게 잡히는 영양소(원재료 DB 미적재).
  produceSensitive: boolean;
  // 이 영양소가 많은 흔한 음식(일반 영양 상식) — 카탈로그에 없는 과일·유제품까지 말할 수 있게 고정으로 둔다.
  typicalFoods: readonly string[];
  caution: string;
}

export const NUTRIENT_DEFS: readonly NutrientDef[] = [
  {
    key: 'protein',
    label: '단백질',
    unit: 'g',
    from: { snapshot: 'proteinG' },
    supplement: false,
    supplementForms: null,
    foodUpperLimit: false,
    produceSensitive: false,
    typicalFoods: ['달걀', '두부', '닭가슴살', '생선', '콩'],
    caution: '신장 질환이 있다면 단백질 섭취량을 의사와 정하세요.',
  },
  {
    key: 'fiber',
    label: '식이섬유',
    unit: 'g',
    from: { per100: 'fiberG' },
    supplement: false,
    supplementForms: null,
    foodUpperLimit: false,
    produceSensitive: true,
    typicalFoods: ['잡곡밥', '채소 반찬', '콩·버섯', '미역·김 같은 해조류', '과일'],
    caution: '갑자기 많이 늘리면 배에 가스가 찰 수 있어 물과 함께 천천히 늘리세요.',
  },
  {
    key: 'calcium',
    label: '칼슘',
    unit: 'mg',
    from: { per100: 'calciumMg' },
    supplement: true,
    supplementForms: '탄산칼슘(식사와 함께) 또는 구연산칼슘(공복에도 흡수가 괜찮음), 한 번에 500mg 이하로 나눠서',
    foodUpperLimit: true,
    produceSensitive: false,
    typicalFoods: ['우유·요거트·치즈', '두부', '멸치·뱅어포', '시금치·케일 같은 짙은 녹색 채소'],
    caution:
      '한 번에 많이 먹으면 흡수가 줄어 나눠 먹는 편이 낫고, 철분제와는 시간을 띄우세요. 신장결석이 있었다면 의사와 상의하세요.',
  },
  {
    key: 'iron',
    label: '철',
    unit: 'mg',
    from: { per100: 'ironMg' },
    supplement: true,
    supplementForms: '일반 철분제(황산제일철 등) 또는 위장 부담이 덜한 킬레이트철(비스글리시네이트철), 비타민 C 와 함께 먹고 차·커피·칼슘제와는 시간을 띄워서',
    foodUpperLimit: true,
    produceSensitive: false,
    typicalFoods: ['소고기 살코기', '선지', '굴·바지락', '시금치(비타민 C 와 함께)'],
    caution:
      '철은 필요 없는데 계속 먹으면 몸에 쌓여 해로울 수 있어요(특히 성인 남성·폐경 후 여성). 빈혈 검사로 부족을 확인한 뒤 먹는 편이 안전하고, 변비·속쓰림이 생길 수 있어요.',
  },
  {
    key: 'potassium',
    label: '칼륨',
    unit: 'mg',
    from: { per100: 'potassiumMg' },
    supplement: false,
    supplementForms: null,
    foodUpperLimit: false,
    produceSensitive: true,
    typicalFoods: ['바나나', '토마토', '감자·고구마', '시금치', '콩'],
    caution:
      '칼륨 보충제는 신장 질환이 있거나 일부 혈압약을 먹으면 위험할 수 있어 음식으로 채우는 편이 안전해요.',
  },
  {
    key: 'vitaminA',
    label: '비타민 A',
    unit: 'μg RAE',
    from: { per100: 'vitaminAUg' },
    supplement: true,
    supplementForms: '베타카로틴 위주의 종합비타민(몸이 필요한 만큼만 비타민 A 로 바꿈), 레티놀 단일 고용량은 피해서',
    foodUpperLimit: false,
    produceSensitive: true,
    typicalFoods: ['당근', '단호박', '시금치', '달걀노른자'],
    caution:
      '레티놀 형태는 많이 먹으면 해로울 수 있고 임신 중에는 특히 조심해야 해요. 흡연자는 고용량 베타카로틴을 피하세요.',
  },
  {
    key: 'vitaminD',
    label: '비타민 D',
    unit: 'μg',
    from: { per100: 'vitaminDUg' },
    supplement: true,
    supplementForms: '비타민 D3(콜레칼시페롤), 기름기 있는 식사와 함께',
    foodUpperLimit: true,
    produceSensitive: false,
    typicalFoods: ['연어·고등어·꽁치 같은 등푸른생선', '달걀노른자', '햇빛(한낮 15~20분)'],
    caution:
      '햇빛을 받으면 몸에서도 만들어져 식단만으로는 판단하기 어려워요. 혈액검사로 확인할 수 있고, 상한(하루 100μg=4,000IU)을 넘기지 마세요.',
  },
  {
    key: 'thiamin',
    label: '비타민 B1(티아민)',
    unit: 'mg',
    from: { per100: 'thiaminMg' },
    supplement: true,
    supplementForms: '비타민 B군 복합제(B 콤플렉스)나 종합비타민',
    foodUpperLimit: false,
    produceSensitive: false,
    typicalFoods: ['돼지고기', '잡곡', '콩'],
    caution: '물에 녹는 비타민이라 넘친 만큼은 대부분 몸 밖으로 나가요.',
  },
  {
    key: 'riboflavin',
    label: '비타민 B2(리보플라빈)',
    unit: 'mg',
    from: { per100: 'riboflavinMg' },
    supplement: true,
    supplementForms: '비타민 B군 복합제(B 콤플렉스)나 종합비타민',
    foodUpperLimit: false,
    produceSensitive: false,
    typicalFoods: ['우유·요거트', '달걀', '버섯', '고기'],
    caution: '물에 녹는 비타민이라 과잉 위험은 낮고, 먹으면 소변이 진한 노란색이 될 수 있어요.',
  },
  {
    key: 'niacin',
    label: '니아신(비타민 B3)',
    unit: 'mg',
    from: { per100: 'niacinMg' },
    supplement: true,
    supplementForms: '니코틴아미드 형태가 든 B군 복합제나 종합비타민(니코틴산 고용량은 피해서)',
    foodUpperLimit: false,
    produceSensitive: false,
    typicalFoods: ['닭가슴살', '생선', '땅콩'],
    upperLimitBasis: '니코틴산',
    caution: '니코틴산 형태는 하루 35mg을 넘기면 얼굴이 붉어지는 등 부작용이 생길 수 있어요.',
  },
  {
    key: 'vitaminC',
    label: '비타민 C',
    unit: 'mg',
    from: { per100: 'vitaminCMg' },
    supplement: true,
    supplementForms: '비타민 C(아스코르브산), 하루 한두 번 나눠서',
    foodUpperLimit: true,
    produceSensitive: true,
    typicalFoods: ['귤·키위·딸기 같은 과일', '파프리카', '브로콜리', '풋고추'],
    caution: '하루 2,000mg을 넘기면 설사 등이 생길 수 있고, 신장결석이 있었다면 고용량은 피하세요.',
  },
  // 마그네슘·아연·엽산(2026-11-07) — K-FIND 식품영양성분 DB 전체판 음식 DB·국가표준식품성분표에서 온다. 문구는 사용자 검토본.
  {
    key: 'magnesium',
    label: '마그네슘',
    unit: 'mg',
    from: { per100: 'magnesiumMg' },
    supplement: true,
    supplementForms: '구연산마그네슘·글리시네이트 같은 형태(산화마그네슘은 흡수가 낮은 편), 한 번에 많이 먹지 말고 나눠서',
    // 상한은 식품 외 급원(보충제)에만 해당 — 음식으로는 '많음'을 말하지 않는다.
    foodUpperLimit: false,
    upperLimitBasis: '영양제(식품 외) 마그네슘',
    produceSensitive: true,
    typicalFoods: ['현미·잡곡밥', '두부·콩', '시금치 같은 녹색 채소', '견과류', '바나나'],
    caution: '보충제로 많이 먹으면 설사할 수 있어요. 신장 질환이 있거나 약을 먹고 있다면 의사·약사와 먼저 상의하세요.',
  },
  {
    key: 'zinc',
    label: '아연',
    unit: 'mg',
    from: { per100: 'zincMg' },
    supplement: true,
    supplementForms: '글루콘산아연·구연산아연 등, 속이 불편하면 식사와 함께',
    foodUpperLimit: true,
    produceSensitive: false,
    typicalFoods: ['굴', '소고기', '돼지고기', '달걀', '콩·견과류'],
    caution: '아연을 오래 많이 먹으면 구리가 부족해질 수 있어요. 하루 상한을 넘지 않게 하세요.',
  },
  {
    key: 'folate',
    label: '엽산',
    unit: 'μg DFE',
    from: { per100: 'folateUg' },
    supplement: true,
    supplementForms: '엽산(폴산) — 종합비타민에 든 양으로 채우는 경우가 많아요',
    // 상한은 보충제·강화식품의 엽산(folic acid)에만 해당 — 음식으로는 '많음'을 말하지 않는다.
    foodUpperLimit: false,
    upperLimitBasis: '영양제·강화식품의 엽산',
    upperLimitUnit: 'μg',
    produceSensitive: true,
    typicalFoods: ['시금치·쑥갓 같은 녹색 잎채소', '브로콜리', '콩·두부', '달걀', '딸기·키위'],
    caution: '임신을 계획 중이라면 권장량이 달라 의사·약사와 상의하세요. 고용량 엽산은 비타민 B12 부족을 가릴 수 있어요.',
  },
  {
    key: 'sodium',
    label: '나트륨',
    unit: 'mg',
    from: { snapshot: 'sodiumMg' },
    supplement: false,
    supplementForms: null,
    foodUpperLimit: false,
    produceSensitive: false,
    typicalFoods: [],
    caution: '국물·젓갈·가공식품을 줄이면 가장 많이 줄어요.',
  },
];

// 식단 데이터에 값이 (거의) 없어 판단할 수 없는 영양소 — 영양제로 흔히 찾지만 부족하다고 말하지 않는다. K-FIND 음식
// DB 에서도 음식 행 채움이 낮다(2026-11-07 실측, 영양소 있는 음식 행 중: B12·셀레늄 ~19%, B6·비타민 K 2%, 요오드 0,
// 비타민 E·오메가3 60% — 보류가 잦을 것으로 보고 이번엔 넣지 않았다).
export const NOT_MEASURED_NUTRIENTS: readonly string[] = [
  '비타민 B6',
  '비타민 B12',
  '비타민 E',
  '비타민 K',
  '오메가-3(EPA·DHA)',
  '요오드',
  '셀레늄',
];

// 가공육(햄·소시지·베이컨·훈제)의 비타민 C 는 발색·산화 방지 첨가물(아스코브산나트륨 등)에서 온 값일 수 있다 — 먹은
// 양에는 그대로 세되, "비타민 C 보충"처럼 음식을 권하는 근거(추천 가점·태그·이유 문장·영양 탭 제안)로는 쓰지 않는다.
// 2026-11-07 흔한 한 끼 174개 중 한 끼로 비타민 C 기준의 25%를 채우는 음식이 훈제오리(식약처 100g 20.4mg) 하나뿐이었다.
// '햄버거·햄버그'는 가공육 이름이 아니다.
const PROCESSED_MEAT_RE = /(훈제|햄(?!버)|소시지|소세지|베이컨|스팸|런천미트|살라미|페퍼로니|육포|비엔나|프랑크)/;

/** 이 음식의 이 영양소가 음식을 권하는 근거가 될 수 없는지(가공육의 비타민 C). */
export const isAdditiveNutrientSource = (nutrient: string, foodName: string): boolean =>
  nutrient === 'vitaminC' && PROCESSED_MEAT_RE.test(foodName);

export const NUTRITION_DISCLAIMER =
  '식단 기록으로 본 추정이며 진단이 아니에요. 약을 먹고 있거나 임신·수유 중이거나 질환이 있다면 영양제를 먹기 전에 의사·약사와 상의하세요.';
