// 음식 카탈로그 LLM 2축 분류 프롬프트 — 음식 이름(+원본 분류 힌트)을 dishType / mainIngredient /
// cuisine 으로 분류한다. 매핑 테이블·이름 규칙(@repo/utils foodTaxonomy)으로 못 채운 행만 대상.
//
// FOOD_CLASSIFY_VERSION 변경 시 이전 분류가 stale(classifyVersion < current 행을 재분류 대상으로).
// v1: 최초 — 3축 enum 키 출력, 청크 40.
export const FOOD_CLASSIFY_VERSION = 1;
export const FOOD_CLASSIFY_CHUNK_SIZE = 40;

export const FOOD_CLASSIFY_SYSTEM_PROMPT = `너는 한국 음식 분류기다. 음식 이름(과 힌트)을 보고 세 축으로 분류한다.

[dishType — 조리형태, 아래 영문 키 중 하나]
rice(밥·죽·덮밥·김밥·비빔밥·볶음밥·리조또·카레라이스) / noodle(면·국수·라면·파스타·우동·만두) / soup(국·탕·해장국) / stew(찌개·전골·샤브샤브·마라탕·순두부찌개) /
grill(구이·스테이크·삼겹살·갈비·불고기·꼬치) / stir_fry(볶음·잡채·떡볶이·철판) / braise(조림·장조림) / steam(찜·수육·보쌈·족발) /
pancake(전·부침·빈대떡) / fried(튀김·돈까스·치킨·탕수육) / namul(나물·숙채) / salad(생채·무침·겉절이·샐러드) /
kimchi(김치·장아찌·절임·피클·젓갈) / raw_fish(회·초밥·사시미·육회·물회) / bakery(빵·샌드위치·버거·피자·케이크·쿠키·떡·한과·디저트) /
dairy(아이스크림·요거트·치즈·우유) / beverage(커피·차·주스·에이드·음료) / alcohol(소주·맥주·막걸리·와인·칵테일) / other(그 외·소스·양념·상차림)

[mainIngredient — 주재료, 아래 영문 키 중 하나]
beef / pork / chicken / other_meat(오리·양·염소 등) / fish(생선·참치·연어·장어·어묵) / seafood(새우·오징어·낙지·조개·게·해물) /
vegetable(채소·버섯·해조·김치) / tofu_bean(두부·콩·된장·청국장) / egg / dairy / grain(곡물·감자·고구마·떡·빵·면 자체가 주인 경우) / fruit / other

[cuisine — 요리 계통, 아래 영문 키 중 하나]
korean / chinese / japanese / western / asian(동남아·인도) / fast_food(분식·패스트푸드·프랜차이즈 메뉴) / other

[규칙]
- 힌트(식품대분류·대표식품명·카테고리)가 있으면 dishType 판단에 우선 반영한다.
- 김치찌개의 주재료는 pork(돼지고기 김치찌개가 일반적), 된장찌개는 tofu_bean, 미역국은 vegetable(소고기 미역국이면 beef), 삼계탕은 chicken, 갈비탕·설렁탕·곰탕은 beef, 감자탕은 pork.
- 음식이 아닌 것(소스·양념·식재료 단품·상차림)은 dishType=other 로 둔다.
- 판단이 어려우면 "other" 를 쓴다. 값은 반드시 위 목록의 영문 키여야 한다.

[출력 — 절대 위반하지 말 것]
- 응답 전체는 단 하나의 JSON 객체: { "items": [ { "name": "...", "dishType": "...", "mainIngredient": "...", "cuisine": "..." } ] }
- items 는 입력 모든 항목에 대해 한 항목씩, name 은 입력 그대로(순서·표기 유지). 빠짐 없이.
- 설명·인사말·코드펜스·사고 과정 출력 금지. 첫 글자 '{', 마지막 글자 '}'.`;

// Ollama structured output(format) — Cloud 는 현재 스키마를 강제하지 않으므로 프롬프트에 같은 내용을
// 내장했고, 결과는 zod 로 다시 검증한다.
export const FOOD_CLASSIFY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          dishType: { type: 'string' },
          mainIngredient: { type: 'string' },
          cuisine: { type: 'string' },
        },
        required: ['name', 'dishType', 'mainIngredient', 'cuisine'],
      },
    },
  },
  required: ['items'],
} as const;

export interface FoodClassifyInputItem {
  name: string;
  // 예: "식품대분류: 찌개 및 전골류 / 대표식품: 김치찌개" — 없으면 생략.
  hint?: string | null;
}

export const buildFoodClassifyUserPrompt = (items: FoodClassifyInputItem[]): string => {
  const lines = items.map((it, i) => {
    const hint = it.hint ? ` | 힌트: ${it.hint}` : '';
    return `${i + 1}. ${it.name}${hint}`;
  });
  return `다음 음식 ${items.length}개를 분류하라. 각 줄은 "번호. 이름 | 힌트" 형식이다.\n\n${lines.join('\n')}\n\n위 스키마의 JSON 객체로만 답하라.`;
};
