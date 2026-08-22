// 음식 카탈로그(food) 분류 축 — 순수 유틸. 서버(적재·분류·추천)와 웹/앱(배지·필터·통계)이
// 같은 키·라벨을 쓰도록 한 곳에 둔다. 키 목록은 @repo/api-contract 의 FoodDishType /
// FoodMainIngredient / FoodCuisine / FoodSource zod enum 과 **같은 순서**여야 한다(utils 는
// api-contract 를 import 하지 않으므로 friendly 의 food 테스트가 두 목록의 동일성을 검증).
//
// dishType 은 식약처 식품영양성분 표준데이터(15100070)의 "식품대분류" 25종을 식단 추천에
// 쓸 만한 19종으로 축약한 조리형태 축, mainIngredient 는 주재료 축, cuisine 은 요리 계통이다.
// "골고루(balance)" 는 이 축들의 분포로 정의한다(docs/PLAN-meal.md).

export const FOOD_DISH_TYPES = [
  'rice',
  'noodle',
  'soup',
  'stew',
  'grill',
  'stir_fry',
  'braise',
  'steam',
  'pancake',
  'fried',
  'namul',
  'salad',
  'kimchi',
  'raw_fish',
  'bakery',
  'dairy',
  'beverage',
  'alcohol',
  'other',
] as const;
export type FoodDishType = (typeof FOOD_DISH_TYPES)[number];

export const FOOD_DISH_TYPE_LABEL: Record<FoodDishType, string> = {
  rice: '밥·죽',
  noodle: '면·만두',
  soup: '국·탕',
  stew: '찌개·전골',
  grill: '구이',
  stir_fry: '볶음',
  braise: '조림',
  steam: '찜',
  pancake: '전·부침',
  fried: '튀김',
  namul: '나물·숙채',
  salad: '생채·무침·샐러드',
  kimchi: '김치·절임·젓갈',
  raw_fish: '회·초밥',
  bakery: '빵·과자·떡',
  dairy: '유제품·빙과',
  beverage: '음료·차',
  alcohol: '주류',
  other: '기타',
};

export const FOOD_MAIN_INGREDIENTS = [
  'beef',
  'pork',
  'chicken',
  'other_meat',
  'fish',
  'seafood',
  'vegetable',
  'tofu_bean',
  'egg',
  'dairy',
  'grain',
  'fruit',
  'other',
] as const;
export type FoodMainIngredient = (typeof FOOD_MAIN_INGREDIENTS)[number];

export const FOOD_MAIN_INGREDIENT_LABEL: Record<FoodMainIngredient, string> = {
  beef: '소고기',
  pork: '돼지고기',
  chicken: '닭',
  other_meat: '기타 육류',
  fish: '생선',
  seafood: '해산물',
  vegetable: '채소',
  tofu_bean: '두부·콩',
  egg: '계란',
  dairy: '유제품',
  grain: '곡물·감자',
  fruit: '과일',
  other: '기타',
};

export const FOOD_CUISINES = [
  'korean',
  'chinese',
  'japanese',
  'western',
  'asian',
  'fast_food',
  'other',
] as const;
export type FoodCuisine = (typeof FOOD_CUISINES)[number];

export const FOOD_CUISINE_LABEL: Record<FoodCuisine, string> = {
  korean: '한식',
  chinese: '중식',
  japanese: '일식',
  western: '양식',
  asian: '아시안',
  fast_food: '분식·패스트푸드',
  other: '기타',
};

export const FOOD_SOURCES = [
  'mfds-nutrition',
  'mfds-recipe',
  'mafra-recipe',
  'hansik-800',
  'menu-canonical',
  'manual',
] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

export const FOOD_SOURCE_LABEL: Record<FoodSource, string> = {
  'mfds-nutrition': '식약처 영양성분',
  'mfds-recipe': '식약처 레시피',
  'mafra-recipe': '농식품 레시피',
  'hansik-800': '한식 800선',
  'menu-canonical': '외식 메뉴',
  manual: '수기',
};

export const isFoodDishType = (v: unknown): v is FoodDishType =>
  typeof v === 'string' && (FOOD_DISH_TYPES as readonly string[]).includes(v);
export const isFoodMainIngredient = (v: unknown): v is FoodMainIngredient =>
  typeof v === 'string' && (FOOD_MAIN_INGREDIENTS as readonly string[]).includes(v);
export const isFoodCuisine = (v: unknown): v is FoodCuisine =>
  typeof v === 'string' && (FOOD_CUISINES as readonly string[]).includes(v);

// ── 원본 분류명 → dishType 매핑 ───────────────────────────────────────────────
// 비교 키: 공백·가운뎃점·쉼표·괄호를 제거한 문자열(표기 흔들림 흡수 — "전·적 및 부침류",
// "전ㆍ적및부침류", "장류, 양념류" 등).
const categoryKey = (raw: string): string =>
  raw.replace(/[\s·ㆍ•,，()]/g, '').trim();

// 식약처 식품대분류(25종, 2026-04 실측) → dishType. 값이 없거나 모르면 null.
const MFDS_CATEGORY_TO_DISH_TYPE: Record<string, FoodDishType> = {
  밥류: 'rice',
  죽및스프류: 'rice',
  면및만두류: 'noodle',
  국및탕류: 'soup',
  찌개및전골류: 'stew',
  구이류: 'grill',
  볶음류: 'stir_fry',
  조림류: 'braise',
  찜류: 'steam',
  전적및부침류: 'pancake',
  튀김류: 'fried',
  나물숙채류: 'namul',
  생채무침류: 'salad',
  김치류: 'kimchi',
  장아찌절임류: 'kimchi',
  젓갈류: 'kimchi',
  장류양념류: 'other',
  빵및과자류: 'bakery',
  음료및차류: 'beverage',
  유제품류및빙과류: 'dairy',
  수조어육류: 'raw_fish',
  곡류서류제품: 'other',
  채소해조류: 'namul',
  과일류: 'other',
  두류견과및종실류: 'other',
};
export const mfdsCategoryToDishType = (raw: string | null | undefined): FoodDishType | null => {
  if (!raw) return null;
  return MFDS_CATEGORY_TO_DISH_TYPE[categoryKey(raw)] ?? null;
};

// 한식진흥원 800선 카테고리(25종) → dishType.
const HANSIK_CATEGORY_TO_DISH_TYPE: Record<string, FoodDishType> = {
  구이: 'grill',
  밥: 'rice',
  탕: 'soup',
  찜: 'steam',
  면: 'noodle',
  전: 'pancake',
  볶음: 'stir_fry',
  국: 'soup',
  생채: 'salad',
  숙채: 'namul',
  조림: 'braise',
  찌개: 'stew',
  회: 'raw_fish',
  장아찌: 'kimchi',
  죽: 'rice',
  김치: 'kimchi',
  떡: 'bakery',
  음청류: 'beverage',
  한과: 'bakery',
  전골: 'stew',
  젓갈: 'kimchi',
  장: 'other',
  만두: 'noodle',
  상차림: 'other',
  적산적: 'pancake',
};
export const hansikCategoryToDishType = (raw: string | null | undefined): FoodDishType | null => {
  if (!raw) return null;
  return HANSIK_CATEGORY_TO_DISH_TYPE[categoryKey(raw)] ?? null;
};

// 식품안전나라 레시피 DB(COOKRCP01) RCP_WAY2(조리방법) → dishType. 끓이기는 국/찌개/탕이
// 섞여 있어 soup 로 두고 이름 규칙(찌개·전골)이 덮어쓴다.
const RCP_WAY_TO_DISH_TYPE: Record<string, FoodDishType> = {
  끓이기: 'soup',
  굽기: 'grill',
  볶기: 'stir_fry',
  튀기기: 'fried',
  찌기: 'steam',
  조리기: 'braise',
  무치기: 'salad',
  부치기: 'pancake',
  절이기: 'kimchi',
  비비기: 'rice',
  삶기: 'other',
  기타: 'other',
};
export const rcpWayToDishType = (raw: string | null | undefined): FoodDishType | null => {
  if (!raw) return null;
  return RCP_WAY_TO_DISH_TYPE[categoryKey(raw)] ?? null;
};

// 택소노미 v3(global_menu_canonicals.categoryPath) 최상위 → 분류 힌트. 루트 15종
// ('고기/해산물/밥/면/국·탕/찌개·전골/김치/반찬/튀김/회·초밥/분식/디저트/음료/주류/기타').
export interface FoodTaxonomyHint {
  dishType?: FoodDishType;
  mainIngredient?: FoodMainIngredient;
  cuisine?: FoodCuisine;
}
const MENU_CANONICAL_ROOT_HINT: Record<string, FoodTaxonomyHint> = {
  고기: {},
  해산물: { mainIngredient: 'seafood' },
  밥: { dishType: 'rice', mainIngredient: 'grain' },
  면: { dishType: 'noodle' },
  국탕: { dishType: 'soup' },
  찌개전골: { dishType: 'stew' },
  김치: { dishType: 'kimchi', mainIngredient: 'vegetable' },
  반찬: {},
  튀김: { dishType: 'fried' },
  회초밥: { dishType: 'raw_fish', mainIngredient: 'fish' },
  분식: { cuisine: 'fast_food' },
  디저트: { dishType: 'bakery' },
  음료: { dishType: 'beverage' },
  주류: { dishType: 'alcohol' },
  기타: {},
};
export const menuCanonicalRootHint = (categoryPath: string | null | undefined): FoodTaxonomyHint => {
  if (!categoryPath) return {};
  const root = categoryPath.split('>')[0] ?? '';
  return MENU_CANONICAL_ROOT_HINT[categoryKey(root)] ?? {};
};

// ── 이름 규칙(키워드) — 결정적 1차 추정. LLM 배치 분류 전에 채우고, 맞지 않으면 LLM 이 덮는다. ──
// 순서가 우선순위다(앞의 규칙이 먼저 매칭). 한 단어가 여러 재료를 암시하면 더 구체적인 것을 앞에.
const NAME_DISH_TYPE_RULES: ReadonlyArray<readonly [RegExp, FoodDishType]> = [
  [/(초밥|스시|사시미|회덮밥|물회|육회|\b회$|회$)/u, 'raw_fish'],
  [/(찌개|전골|부대|샤브|훠궈|마라탕|순두부)/u, 'stew'],
  [/(탕$|탕\s|국$|국\s|국밥|설렁탕|곰탕|갈비탕|삼계탕|매운탕|지리|해장국|육개장|떡국|만둣국|미역국|북엇국|콩나물국|계란국|어묵탕|해물탕|감자탕|추어탕|보신탕|추탕|짬뽕탕)/u, 'soup'],
  [/(라면|라멘|우동|짬뽕|칼국수|수제비|쌀국수|냉면|국수|파스타|스파게티|소바|막국수|쫄면|잔치국수|비빔면|만두|면$|면\s)/u, 'noodle'],
  [/(볶음밥|김밥|비빔밥|덮밥|주먹밥|돈부리|규동|리조또|카레|카레라이스|죽$|죽\s|스프|수프|백반|정식|밥$)/u, 'rice'],
  [/(구이|스테이크|바비큐|bbq|삼겹|목살|갈비$|갈비살|양념갈비|불고기|제육|닭갈비|꼬치|장어)/iu, 'grill'],
  [/(볶음|잡채|떡볶이|철판|야끼|볶이)/u, 'stir_fry'],
  [/(갈비찜|찜닭|아귀찜|해물찜|찜$|보쌈|(?<!탕)수육|족발|편육)/u, 'steam'],
  [/(조림)/u, 'braise'],
  [/(전$|전\s|부침|파전|빈대떡|동그랑땡|산적|오코노미야끼)/u, 'pancake'],
  [/(튀김|돈까스|돈카츠|까스|카츠|치킨|텐동|탕수육|깐풍|유린기|프라이드|너겟|감자튀김|고로케|크로켓)/u, 'fried'],
  [/(나물|숙채|시금치|콩나물|무침$)/u, 'namul'],
  [/(샐러드|생채|겉절이|무침|냉채)/u, 'salad'],
  [/(김치|깍두기|장아찌|절임|피클|젓갈|젓$)/u, 'kimchi'],
  [/(빵|토스트|샌드위치|버거|햄버거|피자|케이크|케익|쿠키|도넛|도너츠|와플|크로플|마카롱|타르트|파이|떡$|떡\s|인절미|송편|약과|한과|과자|스낵|크래커|베이글|크루아상|스콘|머핀|브라우니)/u, 'bakery'],
  [/(아이스크림|요거트|요구르트|치즈|우유|라떼$|빙수|젤라또|푸딩)/u, 'dairy'],
  [/(커피|아메리카노|라떼|카페|차$|녹차|홍차|주스|에이드|스무디|쉐이크|음료|콜라|사이다|식혜|수정과|밀크티|차이|마끼아또|카푸치노|에스프레소)/u, 'beverage'],
  [/(소주|맥주|막걸리|와인|위스키|하이볼|칵테일|사케|청주|양주|소맥|주류|술$)/u, 'alcohol'],
  [/(탕|국|찌개)$/u, 'soup'],
];
export const guessDishTypeFromName = (name: string): FoodDishType | null => {
  const s = name.trim();
  if (!s) return null;
  for (const [re, t] of NAME_DISH_TYPE_RULES) if (re.test(s)) return t;
  return null;
};

const NAME_MAIN_INGREDIENT_RULES: ReadonlyArray<readonly [RegExp, FoodMainIngredient]> = [
  [/(한우|소고기|쇠고기|소갈비|차돌|등심|안심|채끝|갈빗살|육회|불고기|설렁탕|곰탕|갈비탕|육개장|스테이크|우삼겹|양지|사골|소머리|도가니|꼬리|우족|우거지갈비)/u, 'beef'],
  [/(돼지|삼겹|목살|제육|돈까스|돈카츠|족발|보쌈|수육|항정|갈매기살|등갈비|돼지갈비|탕수육|김치찌개|부대찌개|햄|소시지|베이컨|순대|감자탕|뼈해장국|돈부리|돈코츠)/u, 'pork'],
  [/(닭|치킨|삼계|찜닭|닭갈비|닭볶음|계육|닭발|닭강정|윙|너겟|통닭|백숙)/u, 'chicken'],
  [/(오리|양고기|양갈비|염소|말고기|사슴|칠면조)/u, 'other_meat'],
  [/(고등어|갈치|삼치|꽁치|연어|참치|방어|광어|우럭|도미|농어|장어|조기|굴비|명태|동태|북어|황태|코다리|대구|아귀|복어|가자미|민어|병어|생선|어묵|오뎅|회$|회덮밥|초밥|스시|사시미|멸치|물회|매운탕|지리)/u, 'fish'],
  [/(새우|오징어|낙지|문어|쭈꾸미|주꾸미|조개|바지락|홍합|전복|굴$|굴\s|게$|꽃게|대게|킹크랩|랍스터|가리비|해물|해산물|멍게|해삼|소라|골뱅이|미더덕|짬뽕|낙곱새|해물탕|해물파전)/u, 'seafood'],
  [/(두부|순두부|콩국|콩나물|청국장|된장|비지|유부|콩$|콩\s|낫토|템페|콩비지)/u, 'tofu_bean'],
  [/(계란|달걀|에그|오믈렛|스크램블|지단|메추리알|계란말이|계란찜|에그)/u, 'egg'],
  [/(우유|치즈|요거트|요구르트|버터|크림|아이스크림|라떼|밀크|젤라또|푸딩)/u, 'dairy'],
  [/(사과|배$|딸기|바나나|수박|참외|포도|귤|오렌지|복숭아|자두|망고|키위|블루베리|체리|레몬|자몽|석류|감$|과일|토마토주스|에이드|주스|스무디)/u, 'fruit'],
  [/(나물|버섯|시금치|배추|무$|무\s|깍두기|김치|호박|가지|오이|감자|고구마|옥수수|양배추|브로콜리|샐러드|채소|야채|쌈|미역|다시마|김$|김\s|파래|콩나물|숙주|부추|파전|깻잎|마늘|양파|고추|피망|파프리카|아보카도|연근|우엉|도라지|더덕|취나물|고사리|곤드레|비빔밥)/u, 'vegetable'],
  [/(밥|죽|떡|면|국수|빵|파스타|피자|라면|우동|냉면|칼국수|수제비|만두|토스트|샌드위치|김밥|떡볶이|누룽지|시리얼|오트밀|감자|고구마|옥수수|와플|팬케이크|크로플|베이글|도넛|쿠키|케이크|과자)/u, 'grain'],
];
export const guessMainIngredientFromName = (name: string): FoodMainIngredient | null => {
  const s = name.trim();
  if (!s) return null;
  for (const [re, t] of NAME_MAIN_INGREDIENT_RULES) if (re.test(s)) return t;
  return null;
};

const NAME_CUISINE_RULES: ReadonlyArray<readonly [RegExp, FoodCuisine]> = [
  [/(짜장|자장|짬뽕|탕수육|깐풍|깐쇼|유린기|마파|마라|양장피|팔보채|고추잡채|꿔바로우|훠궈|딤섬|샤오롱바오|군만두|중화|우육면|볶음밥$|멘보샤|라조육|동파육|양꼬치|마라탕|마라샹궈)/u, 'chinese'],
  [/(초밥|스시|사시미|라멘|라면$|우동|소바|돈부리|규동|가츠동|돈카츠|오코노미야끼|타코야끼|야키토리|야끼니꾸|야키니쿠|스키야키|샤브샤브|나베|오니기리|오마카세|가이세키|텐동|텐푸라|카라아게|에비|우나기|사케|오뎅|타코|와규)/u, 'japanese'],
  [/(파스타|스파게티|피자|스테이크|리조또|리조토|햄버거|버거|샌드위치|샐러드|브런치|오믈렛|그라탱|그라탕|라자냐|뇨끼|바게트|크루아상|치킨$|감바스|빠에야|파에야|타코|부리또|케사디야|수프|스프|필라프|커틀릿|바비큐|bbq|핫도그|토스트|와플|팬케이크|에그베네딕트)/iu, 'western'],
  [/(쌀국수|포$|포\s|분짜|반미|팟타이|똠얌|톰얌|나시고랭|미고랭|사테|커리|카레$|난$|탄두리|비리야니|푸팟퐁|그린커리|레드커리|월남쌈|분보후에|카오팟|똠양|마사만|락사|딤섬)/u, 'asian'],
  [/(떡볶이|김밥|순대|어묵|오뎅|라볶이|쫄면|핫도그|튀김$|컵밥|토스트|햄버거|치킨$|피자$|감자튀김|너겟|콜라|사이다|도시락|삼각김밥|컵라면|라면$)/u, 'fast_food'],
  [/(밥|죽|국|탕|찌개|전골|구이|볶음|조림|찜|전$|나물|무침|김치|젓갈|장아찌|비빔|불고기|제육|삼겹|갈비|족발|보쌈|순두부|된장|청국장|김치찌개|비빔밥|냉면|칼국수|수제비|잡채|떡국|만둣국|삼계탕|갈비탕|설렁탕|곰탕|육개장|해장국|국밥|백반|정식|쌈밥|한정식|한식|막걸리|소주|식혜|수정과|떡|한과|약과|인절미|송편|빈대떡|파전|해물파전|닭갈비|찜닭|닭볶음탕|감자탕|부대찌개|곱창|막창|대창|양념|간장|고추장)/u, 'korean'],
];
export const guessCuisineFromName = (name: string): FoodCuisine | null => {
  const s = name.trim();
  if (!s) return null;
  for (const [re, t] of NAME_CUISINE_RULES) if (re.test(s)) return t;
  return null;
};
