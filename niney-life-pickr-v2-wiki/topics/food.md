---
topic: food
last_compiled: 2026-09-07
sources_count: 89
status: active
aliases: [음식, 음식카탈로그, food-catalog, FoodItem, food-import, 음식적재, food-classify, nutrition, 영양정보, allergen, 알레르기, source-observation, merge-conflict, reverse-restaurant, 파는곳, recognition-quality, foodRestaurantEvidenceScore, status:food-catalog, food_catalog_data, load-food-catalog, data/open/food, mfds-nutrition.csv, hansik-800.xlsx, DATA_GO_KR_API_KEY, 메뉴칼로리, 메뉴-칼로리-판정-엔진, menu-nutrition, MenuNutritionEngine, MenuNutritionService, kcalPer100g, per_serving, per_100g, components, portion, menu-lexicon, MenuLexicon, 어휘-DB, menu-llm-match, MenuLlmMatch, menu-llm-decompose, partsEstimated, llmPending, food-web-estimate, FoodWebEstimate, fatsecret, 웹-실측, mfds-raw, 원재료성식품, curated, 큐레이션-주류표, 골든셋, measure:menu-golden, probe:menu-coverage, fetch:mfds-nutrition, OLLAMA_MENU_MATCH_MODEL, MenuKcalChip, useRestaurantPublicMenuNutrition, getPublicMenuNames, 칼로리-칩]
---

# food — 음식 카탈로그·출처 감사·식당 역검색·메뉴 칼로리 판정 엔진

**2026-09-02 변경 흡수 — 메뉴 칼로리 판정 엔진(`0d2584a`…`4d159a5`, 12커밋)·data.go.kr 키 통일(`3d9dfed`)·메뉴 썸네일 프록시(`0997a69`)**: 맛집 상세 > 메뉴 탭에 칼로리 칩을 붙이기 위해 카탈로그가 "메뉴명 → 칼로리 판정" 의 마스터가 됐다. (1) `food_items.kcalPer100g` 컬럼(원본이 100g 기준이라 1인분 중량이 없는 행도 값을 갖는다) + 식약처 **원재료성식품**(15100065, `mfds-raw` 855종 — 생고기 부위·수산물·건어물, 100g당만) + 코드 내장 **큐레이션 표**(`curated`, 주류·음료·공기밥)로 카탈로그를 넓혔다. (2) [engine/](../../apps/friendly/src/modules/food/engine/)의 순수·동기 판정기가 메뉴명(`[대표] 통갈비살 900g-기본/양념`)을 전처리해 캐스케이드 exact/alias → synonym → modifier → variant → suffix → hint 로 카탈로그 메모리 인덱스에 대고 **1인분 / 100g당 / 미표시** 3등급을 보수적으로 정한다. 규칙(코드)과 어휘(데이터, `menu_lexicon` 어드민 편집)를 분리했다. (3) 규칙 밖 이름은 LLM(`OLLAMA_MENU_MATCH_MODEL`, 기본 gemma4:31b)이 후보 15개 중 제약 선택 + 자유형 표준명으로 카탈로그에 연결하고, LLM 도 못 찾은 음식은 fatsecret.kr 검색 페이지의 복수 항목 중앙값으로 100g당을 추정한다 — 셋 다 **어휘 단위 영구 캐시**(부정 결과 포함)라 비용이 식당 수가 아니라 어휘 수에 비례한다. (4) 결합 기호 세트(A+B)는 엔진이 구성요소로 나누고, 구성이 이름에 없는 세트("모듬회")는 LLM 이 구성을 추정(`partsEstimated`)하되 숫자는 만들지 않는다. (5) 골든셋 444건 정밀도 99.5%(기준선 97.6%)·분해 골든셋 37건 93.8%가 회귀 게이트다. (6) 웹·앱 MenuGrid 가 같은 훅으로 칩을 그린다(카탈로그=호박색·웹 실측=하늘색·세트=보라색, 통상 1인분 환산은 테두리 칩). 규칙 문서는 [docs/menu-calorie-engine.md](../../docs/menu-calorie-engine.md). 영양성분 API 키는 `FOOD_API_KEY || BUS_API_KEY` 폴백을 없애고 `DATA_GO_KR_API_KEY` 하나로 바뀌었다(호환 별칭 없음 — 운영 `.env` 이름 변경 필수).

**2026-08-22~24 변경 흡수 — 역검색 정렬 근거 우선(`0906df3`)·배포 자동 적재 케이스 7(`dae1cc9`)·영양성분 API 선택화(`edb7f44`)·로더 기본 경로(`809b7e0`)**: (1) `GET /api/v1/food/:id/restaurants` 의 정렬이 바뀌었다 — [food.service.ts](../../apps/friendly/src/modules/food/food.service.ts)의 `foodRestaurantEvidenceScore`(`menu_catalog` 2 + `review_mentions` 1)가 좌표 유무와 무관하게 1차 키다. 좌표가 있으면 근거 등급 → 거리 → 언급 수 → 평점, 없으면 근거 등급 → 언급 수 → 평점 → 리뷰 수(이전엔 좌표 있을 때 거리 우선, 없을 때 `evidence.length`). 현재 판매를 보장할 수 없는 역검색에서 가까운 리뷰 한 건보다 메뉴판+리뷰가 함께 확인된 식당을 먼저 보이기 위해서다. [food.route.test.ts](../../apps/friendly/src/modules/food/food.route.test.ts)에 사용자 좌표 0m 의 리뷰 전용 fixture(`restaurant-review-only`)를 더해 회귀를 잡는다. 계약은 주석만, 응답 형식·DB 무변경. 소비처(앱 판매처 바텀시트)는 [meal](meal.md). (2) 배포 — [food-catalog-status.ts](../../apps/friendly/scripts/food-catalog-status.ts)(`status:food-catalog`)가 `ok items=N classified=C nutrition=U meals=M` 한 줄(테이블 없음 P2021 이면 `missing`)을 내고, [deploy.sh](../../deploy.sh)의 `food_catalog_data [force]` 가 API 배포 케이스 1·2·4 마다 점검한다: 테이블 없음 → skip(마이그레이션 뒤), 상태 해석 실패 → skip("0 종"으로 넘겨짚어 LLM 분류 전량 재실행을 돌지 않게), `items=0` 이고 배포본(`data/open/food/mfds-nutrition.csv` 또는 `hansik-800.xlsx`)이 있으면 `load:food-catalog --classify --backfill-nutrition` + `backfill:meal-nutrition`(기존 식단 항목의 빈 영양 스냅샷 채움, 기존 값 보존). 케이스 7 이 강제 재적재. `stat_val` 은 bash 정규식 — sed `\b` 가 GNU 확장이라 BSD sed 에서 빈 값이 되던 것(일상지도 적재와 같은 골격, [life-map](life-map.md)). 카탈로그가 비면 오류 없이 자동완성·영양·추천 후보가 조용히 반쪽이 되므로 배포 후 종수를 확인한다([deploy-friendly.md](../../docs/deploy-friendly.md)). (3) 문서·env — 영양성분 표준데이터(data.go.kr 15100070) 키는 **선택**이고 배포본 CSV 가 기본(같은 데이터, 쿼터 0). data.go.kr 는 데이터셋마다 활용신청이 따로라 미신청 키는 `30 등록되지 않은 서비스키`(키가 틀린 게 아님)([.env.example](../../apps/friendly/.env.example)·[data-sources.md](../../docs/data-sources.md)). (4) [load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts) — `--file` 없이도 `DEFAULT_FILES`(`data/open/food/mfds-nutrition.csv`·`hansik-800.xlsx`, 2026-09-02 부터 `mfds-nutrition-15100065.csv` 추가)를 cwd → 리포 루트 순으로 찾아(`findDataFile`), 인자 없는 `load:food-catalog` 가 파일 + 레시피 API + 외식 어휘 **전체 재적재**가 됐다. `--source=all` 에 800선도 자동 포함, nutrition 은 파일 우선 → 없으면 API. 원본은 리포에 안 넣는다(`data/open/` .gitignore).

**2026-08-22~24 신설·확장**: [meal](meal.md)의 검색·인식 교정·영양·알레르기 근거·추천 후보를 받치는 마스터 데이터 도메인이다. 여러 공공/내부 source를 하나의 정규화 카탈로그로 합치되, 필드별 관측값과 충돌을 보존해 대표값의 출처와 운영 결정을 추적한다.

## Purpose [coverage: high — 16 sources]

- 음식 이름·별칭을 검색하고 사진 인식 결과를 `FoodItem`에 exact/alias/fuzzy 단계로 연결한다.
- 조리 형태 19종, 주재료 13종, 요리 계통 7종, 재료·1인분 영양·**100g당 열량**·알레르기 슬롯·출처를 한 카탈로그에 모은다.
- 식약처 영양 표준데이터(음식 15100070·**원재료성식품 15100065**), 식품안전나라·농림 레시피, global menu canonical, 한식 800선, **코드 내장 큐레이션 표(주류·음료·공기밥)**, 수동 자료를 적재한다.
- 같은 음식에 서로 다른 source 값이 들어오면 값을 조용히 잃지 않고 field-level observation과 검토 가능한 conflict를 남긴다.
- 음식에서 역으로 메뉴·리뷰 근거가 있는 식당을 찾는다. 이는 현재 판매 보장이 아니라 수집된 evidence 검색이다.
- **맛집 상세 메뉴 탭의 칼로리 칩**을 만든다 — 크롤 메뉴명을 카탈로그에 대어 1인분/100g당/구성(세트)으로 판정하고, 규칙 밖 이름은 LLM 매칭 → 웹 실측 추정 → LLM 세트 분해로 채운다. 애매하면 항목을 뺀다(틀린 칼로리는 없는 것보다 나쁘다). 소비처는 [web](web.md)·[mobile](mobile.md)의 MenuGrid 와 [friendly](friendly.md) restaurant 모듈의 공개 엔드포인트.
- 어드민은 카탈로그·영양 coverage·source observation/conflict·적재·사진 인식 품질·**메뉴 판정 어휘**를 함께 운영한다.

## Architecture [coverage: high — 31 sources]

### 카탈로그(기존)

| 구성 | 책임 |
|---|---|
| `food.ts` 계약 + `Routes.Food` | taxonomy, 검색, allergen/evidence, observation/conflict, import·SSE DTO의 Zod SSOT. `FoodItem.kcalPer100g`·`FoodSource` 에 `mfds-raw`·`curated`(2026-09-02) |
| `FoodService` | 활성 음식 검색, exact/alias/fuzzy match(`FoodMatch` 에 `servingG`·`kcalPer100g` 추가), 음식→식당 역검색, 어드민 CRUD·통계 |
| `FoodImportService` | source fetch → normalize → batch fold → `nameNorm` merge/upsert → observation/conflict 기록 → 선택적 classify. 시드의 `kcalPer100g` 는 1인분 영양과 독립적으로 채운다(기존 값 있으면 `refreshNutrition` 때만 덮음) |
| `food-raw-import.ts` | 원재료성식품 표준데이터(15100065) CSV → `mfds-raw` 시드. `_` 구분 식품명("소고기_한우(1+등급)_갈비(안창살)_생것")을 동물+부위로 짓고 등급은 중앙값, 식당 관행 별칭(`CUT_ALIASES`·`SEA_ALIASES`·`DRIED`) 부여. `servingG` null → 항상 100g당 등급 |
| `food-curated-seeds.ts` | 공공 데이터가 비워 두는 메뉴판 단골(소주·맥주·콜라·공기밥) 32행을 제조사 표기(100ml당) 근사값 + 브랜드 별칭으로. 병·잔 용량이 있는 것만 `servingG` 를 채워 1인분 등급이 된다 |
| `food-source-audit.ts` | 문자열/배열/숫자 canonical JSON, field-level source observation 수집·동일 증거 dedupe |
| `FoodMergeConflictService` | open queue, optimistic baseline 확인, keep/accept/dismiss, accept 뒤 다른 대안 rebase |
| `food-api.adapter.ts` | 외부 API pagination과 응답 형태 정규화; 15100070 실제 봉투가 문서와 달리 `response` 래퍼 없이 최상위 `header/body` 라 둘 다 받는다(2026-09-02 실측) |
| `foodImportRegistry` + `scheduleRegistry` | 단일 in-flight, phase/stat, cron timer, SSE subscriber의 process singleton |
| `FoodClassifyService` | 미분류/구버전 행을 chat LLM으로 세 축 분류하고 enum 재검증 |
| `FoodNutritionService` | 영양이 빈 일반 음식에 좁은 donor를 골라 추정값과 `nutritionFrom` 기록(`kcalPer100g` 도 donor 에서 복사). `CATEGORY_WORDS` 를 export 해 엔진 어휘의 `suffixBlock` 기본값으로 쓴다 |
| `food-allergen.ts` | 공개 재료 문자열만으로 19종을 결정적으로 추론하고 `unknown|inferred|verified` 상태·근거를 직렬화; 운영자 검수 보존 백필 |
| `FoodRecognitionQualityService` | recognition lineage와 최종 meal item을 비교한 confidence/version별 aggregate |
| `AdminFoodPage` | 검색·필터·수정, nutrition/allergen coverage와 검수, observation/conflict 해결, import와 인식 품질 UI, **메뉴 칼로리 판정 어휘 섹션**(종류 select + term/target/note, 목록·삭제) |
| `food-catalog-status.ts` + `deploy.sh` `food_catalog_data` | 배포 시 카탈로그 종수 점검 → 비어 있으면 배포본 첫 적재(+LLM 분류·영양 보강·식단 스냅샷 채움), 케이스 7 강제 재적재(2026-08-23) |

적재 기본값은 매월 1일 04:00 `Asia/Seoul`이며 `mfds-nutrition`, `mfds-recipe`, `mafra-recipe`, `menu-canonical`을 쓴다. 부팅 시 과거 `running`을 `interrupted`로 닫고 cron을 다시 등록한다. 겹친 실행은 `skipped` 이력만 남긴다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)). `mfds-raw`·`curated`·`hansik-800` 은 cron source 가 아니라 CLI 전용이다.

import는 같은 batch의 동일 `nameNorm` seed를 먼저 접되 원본 seed를 audit용으로 유지한다. 대표 행의 빈 필드를 채운 뒤에도 각 source의 비어 있지 않은 단일값이 대표값과 다르면 conflict를 만든다. alias·popularity처럼 자동 합산하는 값도 observation에는 남지만 conflict 대상은 아니다.

### 메뉴 칼로리 판정 엔진(2026-09-02)

[engine/](../../apps/friendly/src/modules/food/engine/) — DB·LLM·웹 의존이 없는 순수·동기 판정기. 골든셋 수백 건을 밀리초에 돌린다.

| 파일 | 역할 |
|---|---|
| `lexicon.ts` | 어휘 구조 `LexiconSource`(앞 수식어·동의어 쌍·세트어·옵션어·접미 제외 범주어·부위 접미 `구이`·조리 접미(떼서 원재료)·수량어 한판/반판·추가 별칭·양 수식어 미니/점보·종류별 통상 1인분 중량표 `portionGrams`)와 코드 기본값 `DEFAULT_LEXICON_SOURCE`. `compileLexicon` 이 정규화·긴 것부터 정렬 |
| `lexicon-db.ts` | `menu_lexicon` 활성 행(kind 10종: modifier·size·synonym·set·option·suffix_block·raw_suffix·quantifier·alias·portion)을 기본 어휘 위에 얹는 `mergeLexiconRows`(순수) + `loadLexicon(prisma)` |
| `parse.ts` | `parseMenuName` — 태그(`[대표]`·BEST·HOT/ICE)·장식(한자·★·"72시간 숙성")·중량(kg→g, l→ml)·인분(`2인분`·`2인이상`·`2인 기준`)·수량(`2개`·`3pcs`)·크기(`(대)`·라지)·등급(`1++`·`100%`)·맛 선택 슬래시(`기본/양념`)·맛 코드 나열(`Y,G,R`)·수량어(한판)·괄호 나열/힌트를 분리. 결과 `cleaned`·`weight`·`isSet`·`setSignal`·`portionAmbiguous`·`hints`·`parts`·`quantifier`. `stripLeadingModifiers`(최대 2개)·`synonymVariants`(양방향) |
| `catalog-index.ts` | 활성 `FoodItem` 의 메모리 인덱스 — 정규화 이름/별칭 exact 맵(이름이 별칭을 이긴다), 접미 조회(`norm` 이 카탈로그 키로 끝나는 가장 긴 행, 2자까지, `suffixBlock` 제외), 어휘 `extraAliases` 합류. `portionKeyFor`(dishType 또는 raw_meat/raw_seafood) |
| `resolve.ts` | `matchNorm` 캐스케이드 exact/alias → synonym → modifier(+동의어) → variant(부위+구이 / 조리접미 제거 → 원재료) → suffix(생재료는 육류 부위만) → hint(괄호 안 음식명, 생재료 제외). `decideMenuKcal` 등급 규칙·`computePortion`(그 양/통상 환산). `resolveMenuName` 이 세트·수량어·주메뉴 세트를 처리하고 `trace` 를 남긴다 |
| `engine.ts` | `MenuNutritionEngine(index, lexicon)` — `resolve`·`resolveMany`(같은 이름 1회)·`replaceIndex`·`replaceLexicon` |

**등급 규칙**(`decideMenuKcal`): 세트 → 미표시. exact/alias/synonym/modifier 매칭이고 중량·인분·크기·수량·양 수식어 표식이 없으며 카탈로그 1인분 kcal 이 있고 `servingG > 100` 이면 `per_serving`. 그 외 `kcalPer100g` 가 있으면 `per_100g`(메뉴명 중량이 ml 이면 `per_100ml`) — variant/hint/suffix/llm/web 은 항상 이 등급. 둘 다 없으면 `no_kcal`. 표준데이터에서 `servingG` 가 100 인 행은 기준량을 그대로 둔 것(돈가스 280kcal)이라 1인분이 아니다.

**portion**(100g당 항목의 부가 환산, `computePortion`): 메뉴명 중량 ≥30 이면 그 양의 kcal(`stated`, 가정 없음) → 카탈로그 1인분(`servingG > 100` + kcal)이면 그것(`typical`) → 아니면 `portionGrams[portionKey]`(raw_meat 150·noodle 500·soup 500·stew 400·rice 350·beverage 250(ml)·alcohol 360(ml)…, `typical`, ±30% 근사) → 없으면 null.

**세트 규칙**(`parse`·`resolve`): 결합 기호(`+ & , /`, 양쪽에 글자)가 세트어보다 먼저 → `parts` 로 구성요소 분해(구성에서 세트어·수량 제거); `N가지` → 세트; 괄호 안 나열(`정식(새우장+양념게장+…)`) 도 구성; 괄호 안 세트어(`(찍먹 세트)`)는 옵션 설명; 세트어는 토큰의 앞·뒤에 붙을 때만("쿄코코스테이크"의 코스는 아님); 주메뉴 하나짜리 세트(`GENERIC_SET_WORDS` 세트·set·정식·런치·런치정식·디너 — "와규꽃살 2인 세트"·"보쌈 정식")는 세트어를 뗀 나머지를 찾아 그 음식의 100g당(`portionAmbiguous` 강제); 수량어(한판·반판)는 뒤 부위를 찾으면 100g당, 못 찾으면 세트.

### 판정 서비스 계층(엔진 **뒤**)

| 파일 | 역할 |
|---|---|
| `menu-nutrition.ts` | 호환 파사드(`export * from './engine'`) + `MenuNutritionResolver(prisma)` — 어휘·인덱스를 `INDEX_TTL_MS`(10분)마다 다시 읽는 비동기 어댑터(동시 호출은 한 번만 읽음) |
| `menu-nutrition.service.ts` | `MenuNutritionService.forPlace(placeId)` — placeId 단위 LRU(500·10분). 단계: (1) 엔진 `resolveMany`(메뉴명 ≤200) → (4) 구성이 이름에 없는 세트를 분해 캐시로 → (2) 규칙 밖 이름(세트 구성요소·주메뉴 포함)을 LLM 캐시로, LLM 표준명은 엔진에 **재투입**(수식어·접미 규칙 적용) → (3) 그래도 못 찾은 이름은 `webQueryFor`(표준명 우선, 범주어면 null)로 웹 캐시 → 항목·세트 조립(원래 메뉴 순서). 캐시에 없는 것이 있으면 `llmPending: true` 로 응답하고 LRU 에 넣지 않은 채 `kickBackground`(분해 → LLM → 웹 순 체인, placeId in-flight 중복 방지) |
| `menu-nutrition-candidates.ts` | `pickMenuCandidates` — bigram Jaccard(`foodNameSimilarity`) + 부분어·낱말 포함 + 동의어(계란↔달걀·파스타↔스파게티·치킨↔닭·새우↔쉬림프) + 괄호 힌트로 카탈로그 전수 스코어링 → 상위 15. LLM 은 이 안에서만 고른다(프로브 실측 후보 밖 이름 0건) |
| `menu-llm-match.service.ts` + `.prompts.ts` | `MenuLlmMatchService` — `lookupCached`(캐시만) / `matchMany`(캐시에 없는 이름만, 한 번에 ≤60, 동시 4, 타임아웃 30s, `temperature 0`·JSON schema `format`·`numCtx 4096`). 채택 `decideLlmMatch`: 후보 선택 + `high` → 그 행; 아니면 자유형 `canonical` 이 카탈로그 이름/별칭/동의어와 정확히 같으면 그 행(단 후보를 골랐는데 `low` 면 버림); 그 외 매칭 없음(저장은 한다). 결과는 `menu_llm_matches` 에 `version`(현재 1)과 함께 upsert. 모델은 `aiConfig.getResolved('ollama-cloud','chat')` 키 + `OLLAMA_MENU_MATCH_MODEL` |
| `menu-llm-decompose.service.ts` | `MenuLlmDecomposeService` — 구성이 이름에 없는 세트("돼지모듬"·"모듬회 대")의 구성 음식명을 같은 모델이 추정(한 번에 ≤30, 동시 3, `numCtx 2048`). `decideDecomposition`: `high` 만, 구성 1~8개, 각 2~15자 문자만, 범주어(`suffixBlock`) 제거. 프롬프트 v3(관용 구성도 high, 메뉴명에 없는 찬·사이드 금지, 이름 자르기 금지). `menu_llm_decompositions` 캐시 |
| `food-web-estimate.ts` + `.service.ts` | 순수 파서·집계(`parseFatsecretSearch`·`aggregateWebSamples`, 버전 3) + `FoodWebEstimateService`(`lookupCached`/`estimateMany`, 한 번에 ≤15, 1초 간격, 타임아웃 20s, UA `life-pickr/1.0`). fatsecret.kr 검색 결과 한 페이지의 항목("까르보나라 1인분 (260g) 당 - 칼로리: 384kcal … 100 g - 191kcal")을 100g당으로 환산해 **중앙값 ±25% 안에 2건 이상** 일치할 때만(`multi`), 아니면 이름이 질의와 같거나 브랜드 괄호를 뺀 잔여가 3자 이하인 **단독 일반 항목**(`single`)만 채택. 결과 없으면 조리 접미(구이·볶음·찜·회·사시미·숙회)를 뗀 어간으로 재질의. `food_web_estimates` 캐시(미채택도 저장) |
| `menu-lexicon.service.ts` | 어드민 어휘 CRUD — 종류별 target 필요 여부(synonym·alias·portion)·중복·`alias` 의 target 이 활성 카탈로그에 있는지·`portion` 은 양수 검증. 효과는 검증하지 않는다(`measure:menu-golden` 으로 본다) |

조립은 [restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)에서 한다 — `MenuNutritionService({ prisma, loadMenuNames: service.getPublicMenuNames, llm, web, decompose })`. `getPublicMenuNames` 는 상세와 같은 소스 융합 규칙(`mergeMenus`/`mergeMenuGroups`, 네이버+다이닝코드+테이블링)으로 메뉴명만 뽑고 리뷰·요약은 싣지 않는다. 웹 실측 계층을 끄려면 `web:` 의존성 한 줄을 빼면 된다.

## Talks To [coverage: high — 20 sources]

- **식약처 전국통합식품영양성분정보(음식, 15100070)** — 기본은 배포본 `data/open/food/mfds-nutrition.csv`(쿼터 0, `fetch:mfds-nutrition` 이 포털 다운로드 버튼의 JSON API 두 개를 재현해 받는다 — 서비스키·활용신청 불필요, 19,495행 → 1,236종), API 는 파일이 없을 때만 `DATA_GO_KR_API_KEY`(2026-09-02 부터, 이전 `FOOD_API_KEY || BUS_API_KEY`); 100g 값을 `servingG` 기준 1인분으로 환산하고 `kcalPer100g` 도 남긴다.
- **식약처 원재료성식품(15100065)** — `fetch:mfds-nutrition --pk=15100065` → `mfds-nutrition-15100065.csv`(3,704행 → 855종). 고기집·횟집의 생것 부위·수산물·건어물(먹태·황태는 북어 말린것 행). 가공식품(15100066)은 포털 배포본이 5만 행에서 잘려 주류 1행뿐이라 쓰지 않는다 → 큐레이션 표.
- **식품안전나라 `COOKRCP01`** — `FOOD_RECIPE_API_KEY`; 대표명·분류·재료를 보강한다(1인분 값이라 중량이 있을 때만 `kcalPer100g` 역산).
- **농림수산식품교육문화정보원 레시피** — `MAFRA_API_KEY`; 기본/재료 API를 합쳐 주재료·요리 계통을 보강한다.
- **global menu canonical** — 서로 다른 식당 2곳 이상에서 관측된 비노이즈 메뉴를 적재하고, `GlobalMenuCanonicalLink → MenuCanonical → Restaurant/CanonicalRestaurant`를 역검색 주 연결축으로 쓴다.
- **리뷰 `MenuMention`** — 같은 exact canonical/name evidence의 언급 수·sentiment를 식당 결과에 합친다.
- **[friendly](friendly.md) restaurant 모듈** — 공개 메뉴 칼로리 엔드포인트가 restaurant 라우트에 살고, `RestaurantService.getPublicMenuNames` 가 메뉴명을 준다. 칼로리는 상세(`getPublicDetail`, 과다로드로 한 번 최적화한 이력)에 끼워 넣지 않는다.
- **[ai](ai.md) ollama-cloud chat** — 메뉴 LLM 매칭·세트 분해는 chat 용도 키를 상속하고 모델만 `OLLAMA_MENU_MATCH_MODEL`(기본 gemma4:31b). provider/모델이 없으면 묻지 않고 규칙·캐시만으로 응답한다. 카탈로그 분류(`FoodClassifyService`)도 chat provider 를 쓴다([versioned-llm-prompts](../concepts/versioned-llm-prompts.md)).
- **fatsecret.kr(제3자 웹, 크롤링)** — 카탈로그에 없는 음식(까르보나라·불족발·부타동·하이볼)만 검색 페이지 1장을 받아 집계. API 가 아니며 robots.txt 는 검색 경로를 막지 않지만 약관 변경 시 이 계층만 끈다.
- **[meal](meal.md)** — 인식명이 카탈로그에 연결되고 분류·영양 provenance·allergen evidence를 기록 시점 snapshot으로 가져간다. 추천도 같은 근거를 best-effort로 소비한다.
- **[web](web.md)·[mobile](mobile.md) MenuGrid** — `useRestaurantPublicMenuNutrition` 훅으로 메뉴 탭이 열릴 때만 조회해 `kcalByName` 으로 칩을 그린다. 메뉴 썸네일은 같은 커밋 범위에서 프록시 리사이즈본(112px)으로 바뀌었다(`0997a69`, [friendly](friendly.md) media 참조).
- **[utils](utils.md)** — `FOOD_SOURCES`/`FOOD_SOURCE_LABEL`(`mfds-raw` "식약처 원재료"·`curated` "내장 표"), `guessDishTypeFromName`(웹 실측 항목의 통상 1인분 키 추정), `thinkOptionForModel`.
- **operation-log / SSE** — import 단계는 범용 로그에 남고 어드민 EventSource는 `?token=` ADMIN JWT로 snapshot/progress/done을 받는다([sse-token-auth](../concepts/sse-token-auth.md)).

## API Surface [coverage: high — 16 sources]

사용자 두 API는 로그인 필요, 메뉴 칼로리는 무인증 공개, 나머지는 `ADMIN` 전용이다.

| 메서드 | 경로 | 권한·역할 |
|---|---|---|
| `GET` | `/api/v1/food/search?q=&limit=` | USER+, 활성 카탈로그 자동완성(최대 20) |
| `GET` | `/api/v1/food/:id/restaurants` | USER+, menu/review exact evidence 역검색; 좌표는 쌍으로 입력 |
| `GET` | `/api/v1/restaurants/public/:placeId/menu-nutrition` | **공개**. `{ placeId, items[], notice, llmPending }` — 판정된 항목만(빈 배열 정상), 식당 없으면 404. `items[]`: `name`(상세 메뉴명과 문자 그대로 같음)·`basis`(per_serving/per_100g/per_100ml/components)·`kcal`(components 는 구성 전부 1인분일 때만 합계, 아니면 null)·`foodName`·`matchedBy`(exact/alias/synonym/modifier/variant/hint/suffix/llm/web/set)·`nutritionFrom`·`parts[]`/`partsTotal`/`partsEstimated`(세트)·`portion{grams,kcal,basis stated|typical,unit}`(100g당 항목) |
| `GET` / `POST` | `/api/v1/admin/food/menu-lexicon[?kind=]` | ADMIN 어휘 목록(+코드 기본 어휘 종류별 개수 `defaults`) / 추가(201, 검증 실패 400) |
| `DELETE` | `/api/v1/admin/food/menu-lexicon/:id` | ADMIN 삭제(204, 없으면 404) |
| `GET` / `POST` | `/api/v1/admin/food/items` | ADMIN 검색·source·taxonomy·nutrition·allergen status 필터 목록 / 수기 등록 |
| `PATCH` | `/api/v1/admin/food/items/:id` | ADMIN 대표값·별칭·taxonomy·재료·알레르기 검수·영양·활성 상태 수정 |
| `GET` | `/api/v1/admin/food/stats` | ADMIN total/active/classified, source/taxonomy, direct/estimated/missing 영양, unknown/inferred/verified 알레르기, observation/open conflict 수 |
| `GET` | `/api/v1/admin/food/merge-conflicts` | ADMIN open/resolved conflict와 최근 field observation 조회 |
| `PATCH` | `/api/v1/admin/food/merge-conflicts/:id` | ADMIN `keep_existing|accept_incoming|dismiss` 해결 |
| `GET` | `/api/v1/admin/food/recognition-quality?days=&model=&version=&confidenceBucket=` | ADMIN lineage 기반 교정·confidence 품질 aggregate; `confidenceBucket=low\|medium\|high` 필터 |
| `GET` / `PUT` | `/api/v1/admin/food/import` | ADMIN 적재 설정·다음 실행 조회 / cron·source·classify 저장 |
| `POST` / `GET` | `/api/v1/admin/food/import/run`, `/runs`, `/preview` | 수동 실행·이력·cron preview |
| `GET` | `/api/v1/admin/food/import/run-events?token=` | ADMIN snapshot/progress/done SSE + heartbeat |

역검색은 좌표가 있으면 `radiusM` 안의 canonical 식당을 **근거 등급(메뉴판+리뷰 > 메뉴판 > 리뷰) → 거리 → 언급 → 평점** 순으로, 없으면 근거 등급 → 언급 → 평점 → 리뷰 수 순으로 최대 30개 반환한다(2026-08-24 부터 좌표가 있어도 근거가 거리보다 먼저). 모든 응답에 "현재 판매 여부를 보장하지 않는다"는 고정 notice가 포함된다. 메뉴 칼로리 응답의 `notice` 는 `MENU_NUTRITION_NOTICE`("식약처 식품영양성분 DB 기준 추정치입니다…").

**shared** — `restaurantApi.publicMenuNutrition`, `useRestaurantPublicMenuNutrition(placeId, enabled)`(staleTime 10분, retry 1, `llmPending` 이면 3초 간격 재조회·최대 10회 ≈ 30초 뒤 자동 중단), `foodApi.menuLexiconList/Create/Delete`, `useMenuLexicon`·`useMenuLexiconCreate`·`useMenuLexiconDelete`(키 `['food','admin','menu-lexicon']` invalidate). [shared](shared.md).

**웹·앱 칩**(`MenuKcalChip`, [shared.tsx](../../apps/web/src/components/restaurant/detail/shared.tsx)·[MenuGrid.tsx](../../apps/mobile/src/components/restaurantDetail/shared/MenuGrid.tsx)) — 숫자 하나만 보인다: `stated` 면 "150g 약 461kcal", `typical` 이면 "1인분 약 1,095kcal (500g)" **테두리 칩**(추정임을 구분), 둘 다 없으면 "1인분 약 583kcal"/"100g당 약 233kcal". 100g당 값·기준 중량·근거 음식명은 웹 툴팁/앱 `accessibilityLabel`. 웹 실측은 "웹 추정 " 접두 + 하늘색, LLM 연결은 툴팁에 "AI 가 연결한 음식", 세트는 보라색 "구성 N/M개 칼로리" 또는 "세트 약 Nkcal", 추정 구성은 "AI 추정 " 접두. 탭 상단 안내 문구는 서버 `notice` + "1인분 값이 없는 메뉴는 100g당으로, 나열형 세트는 구성별로 표시하며 애매한 메뉴는 표시하지 않습니다".

**스크립트**(`apps/friendly/package.json`):

| 명령 | 역할 |
|---|---|
| `fetch:mfds-nutrition [--pk=15100065\|15100066] [--out=]` | 포털 배포본 CSV 받기(env 불필요) |
| `load:food-catalog --source=nutrition\|raw\|curated\|recipe\|mafra\|menu-canonical\|hansik800\|all` | 적재(raw·curated 는 `all` 에 포함) |
| `measure:menu-nutrition [--limit] [--samples] [--json]` | 규칙 계층만 — 로컬 식당 메뉴명 전체의 등급별 비율·샘플 |
| `measure:menu-golden [--golden] [--show]` | 골든셋 계층별 **정밀도**·재현율(LLM·웹은 캐시만 읽음) |
| `measure:menu-decompose [--ask]` | 분해 골든셋 정밀도(`--ask` 면 캐시에 없는 것을 LLM 에 묻는다) |
| `probe:menu-coverage [--limit] [--ask=N] [--web=N] [--json]` | 전체 파이프라인 표시율 + 캐시 채우기(서비스와 같은 테이블) |
| `probe:menu-resolve "이름" …` | 스팟체크 — 트레이스로 어느 단계에서 붙었는지 |
| `probe:menu-decompose --golden= --models=a,b` | **LLM 매칭** 모델 비교 프로브(이름과 달리 세트 분해가 아니다) |
| `probe:food-web-estimate --names=a,b [--raw]` | fatsecret 파서·집계 검증(env 불필요) |

## Data [coverage: high — 17 sources]

| 모델 | 핵심 필드 |
|---|---|
| `FoodItem` | unique `nameNorm`, 이름/별칭, 3축 taxonomy, ingredients, allergen/evidence JSON + `allergenStatus`, serving/영양, **`kcalPer100g Float?`**(2026-09-02, 마이그레이션이 `kcal*100/servingG` 로 기존 행 역산), `nutritionFrom`, 대표 source/id/category, sourceRefs, popularity, active, classify model/version |
| `FoodSourceObservation` | food, field, canonical `valueJson`, source/sourceId, observedAt. 대표값 선택과 무관하게 원천 근거 보존 |
| `FoodMergeConflict` | existing/incoming JSON, source/sourceId, `open|kept_existing|accepted_incoming|dismissed`, resolution actor/time |
| `FoodImportConfig` | `jobType='food-import'` 1행, enabled/cron/timezone, sources/classify, last run/status |
| `FoodImportRun` | trigger, running/done/failed/skipped/interrupted, source별 counts/errors, classifiedCount, 시간 |
| `MenuLexicon`(`menu_lexicon`) | `kind`·`term`·`target?`·`note?`·`active`; unique `(kind, term, target)`, index `active`. 값(칼로리)은 없다 |
| `MenuLlmMatch`(`menu_llm_matches`) | unique `nameNorm`, `menuName`, `foodId?`(FK 없음)·`foodName?`, 모델 원문 `canonical`·`choice`·`confidence`·`reason`, `model`, `version`; index foodId·version. `foodId` null = "물어봤고 매칭 없음" |
| `MenuLlmDecomposition`(`menu_llm_decompositions`) | unique `nameNorm`, `componentsJson`(`[]` = 분해 안 됨), `confidence`·`reason`·`model`·`version` |
| `FoodWebEstimate`(`food_web_estimates`) | unique `nameNorm`, `name`, `kcalPer100g?`(null = 미채택), `agreeing`, `basis multi|single`, `samplesJson`(항목 원문, 감사용), `source`·`sourceUrl`(어간 재질의면 그 URL), `version`, `fetchedAt` |

`FoodSource`는 `mfds-nutrition|mfds-recipe|mafra-recipe|hansik-800|mfds-raw|curated|menu-canonical|manual`이다. 대표 source는 최초 출처를 유지하고 이후 출처는 `sourceRefsJson` 합집합으로 누적한다. 카탈로그 규모(2026-09-02 로컬): 음식 1,236종 + 원재료 855종 + 큐레이션 32행 + 800선 452종 + 레시피 1,101종(중복 병합 전).

관측값은 whitespace를 정리하고 배열을 trim·dedupe·sort하며 유한 숫자를 6자리로 반올림한 canonical JSON이다. 동일 food/source/sourceId/field/value observation을 중복 생성하지 않는다. conflict도 representative/incoming 쌍을 dedupe해 같은 월간 입력이 open 항목을 반복 생성하지 않는다.

영양 coverage는 값 유무와 `nutritionFrom`을 기준으로 direct/estimated/missing을 구분한다. 알레르기는 `unknown`(판정 근거 없음), `inferred`(공개 재료 문자열 규칙), `verified`(운영자 검수)를 구분한다. 자동 import/backfill은 verified를 덮지 않으며 빈 allergen 배열만으로 안전을 뜻하지 않는다.

**메모리·캐시**: `MenuNutritionResolver` 어휘+인덱스 10분 TTL, `MenuNutritionService` placeId LRU 500·10분(`llmPending` 결과는 미저장), `MenuLlmMatchService` 카탈로그 전수 5분 캐시, 백그라운드 in-flight `Map<placeId>`. 세 캐시 테이블은 `version >= 현재 상수`(`MENU_LLM_MATCH_VERSION` 1·`MENU_LLM_DECOMPOSE_VERSION` 3·`FOOD_WEB_ESTIMATE_VERSION` 3)인 행만 읽는다 — 상수를 올리면 전부 다시 묻는다.

**골든셋**([golden/](../../apps/friendly/golden/)): `menu-nutrition.golden.json` 444건(로컬 470 메뉴명 중 판단 불가 26 제외; `expect` 정답 음식명 복수 허용 | null = 미표시가 정답, `basis`, `reviewed` approved 393·corrected 51) — 정밀도 99.5%(383 중 381)·재현율 99.0%, 엔진 전환 전 97.6%/93.5%. `menu-decompose.golden.json` 37건(불투명 세트 32 + 관용 세트 5; `allow` 허용 구성 | null = 분해하지 않는 게 정답, `min`) — 분해 정밀도 15/16(93.8%), 남은 1건은 "닭꼬치 모듬"을 맛이 아닌 부위로 나눈 것.

## Key Decisions [coverage: high — 30 sources]

- **2026-09-02 (`4d159a5`·`bee37c0`·`9e09950`) — 100g당 항목에도 "그 양"·"통상 1인분" 환산을 붙이되 등급은 올리지 않는다** — 메뉴명 중량이 있으면 그 양의 kcal(가정 없음), 없으면 카탈로그 1인분 → 종류별 통상 중량표(±30% 근사). 통상 환산은 테두리 칩·툴팁으로 구분하고 1인분 등급으로 승격하지 않아 1인분 칩의 정밀도를 지킨다. 중량표는 어휘 DB `portion` 으로 편집.
- **2026-09-02 (`51de12a`) — 세트 규칙 4종 + LLM 분해는 high 만** — 결합 기호가 세트어보다 먼저, 괄호 안 나열도 구성, 괄호 안 세트어는 옵션, 주메뉴 하나짜리 세트는 그 음식의 100g당. 분해는 medium 을 받으면 지어낸 찬("통뱅이탕세트 → 뱅이탕, 도토리묵")이 섞여 high 만 채택(불투명 세트 45→34건, 분해 정밀도 93.8%). 골든셋의 주메뉴 세트 9건을 정정해 99.5% 유지.
- **2026-09-02 (`4479b18`) — 구성이 이름에 없는 세트는 LLM 이 구성만 추정하고 숫자는 만들지 않는다** — 구성요소 칼로리는 다시 엔진·LLM 매칭으로 잡고 `partsEstimated` 로 추정임을 표시. 식당마다 다른 이름(커플세트·A세트)은 LLM 이 low/null 을 주어 자연히 빠진다.
- **2026-09-02 (`fb12027`) — 판정 로직을 DB·LLM 없는 순수 엔진으로 모듈화하고 규칙과 어휘를 분리** — 골든셋을 밀리초에 돌려 규칙 변경마다 정밀도를 본다. 어휘는 코드 기본값 위에 `menu_lexicon`(어드민)을 얹어 배포 없이 고친다. LLM 표준명은 엔진에 재투입해 등급 규칙이 한 곳에만 있게 한다. 척도는 **정밀도**(표시한 것 중 정답) — 표시율을 올리는 규칙이 정밀도를 깎으면 거부.
- **2026-09-02 (`bcfc72b`) — 원재료 DB + 큐레이션 표로 카탈로그 공백을 메운다(표시율 49.8%→77.9%)** — 음식 DB 는 조리음식만 있어 고기집·횟집·주류가 비었다. 원재료성식품(15100065)은 생것 부위·수산물을 100g당으로, 가공식품(15100066)은 배포본이 5만 행에서 잘려 쓸 수 없어 주류·음료·공기밥은 코드 내장 근사표. 웹 파서 v3(브랜드만 붙은 단독 항목 채택·조리 접미 어간 재질의).
- **2026-09-02 (`9d3253a`) — 카탈로그 밖 음식은 검색엔진·LLM 이 아니라 fatsecret.kr 페이지 집계로** — Ollama web_search 는 한국어 음식명을 매칭하지 못했고(까르보나라 검색에 렌틸콩귀리밥) LLM 은 숫자를 지어낼 여지가 있다. 페이지 한 장의 일반 항목 + 브랜드 실측이 복수 출처라 중앙값 ±25% 2건 이상 일치일 때만 채택(CJ 26kcal 오타 자동 배제). 크롤링임을 문서에 명시하고 끄는 법을 한 줄로 둔다.
- **2026-09-02 (`d12b47d`) — 규칙 밖 이름은 LLM 제약 선택 + 자유형 표준명, 어휘 단위 영구 캐시, 백그라운드 판정** — 후보 15개 안에서만 고르게 해 환각을 막고(후보 밖 0건), 후보 검색이 못 닿는 지식형(부타동→돼지고기덮밥)은 표준명의 카탈로그 정확 일치로 회수. 골든셋 84건 프로브로 gemma4:31b(88%, high 만 29/30, p50 1.2s)를 기본으로. 부정 결과도 저장해 같은 이름을 다시 묻지 않는다. 엔드포인트는 규칙 결과를 `llmPending` 으로 먼저 주고 훅이 폴링한다.
- **2026-09-02 (`ac0e191`) — 칼로리는 상세에 끼우지 않고 별도 지연 엔드포인트** — 상세는 과다로드로 한 번 최적화한 이력이 있고 칼로리는 메뉴 탭에서만 필요하다. 메뉴명은 상세와 같은 소스 융합 규칙으로 뽑는다. 실패해도 메뉴는 그대로 그린다.
- **2026-09-02 (`0d2584a`) — `kcalPer100g` 를 별도 컬럼으로, 퍼지 매칭은 표시에 쓰지 않는다** — 표준데이터는 원본이 100g 기준이라 1인분 환산이 안 된 행도 100g당 값은 갖게 한다. 퍼지(0.5)는 오매칭(새우 볶음밥→새우볶음)이라 표시에서 제외하고 후보만 리포트에 남긴다. 표준데이터에서 1인분 중량이 100g 인 행은 1인분이 아니다.
- **2026-09-02 (`3d9dfed`) — data.go.kr 키는 `DATA_GO_KR_API_KEY` 하나** — 계정당 1키인데 이름 8개와 `|| BUS_API_KEY` 폴백이 29파일에 흩어져 "버스 키가 날씨·음식에 쓰이는" 오해를 낳았다. 호환 별칭 없이 완전 교체. 데이터셋별로 다른 계정 키를 꽂는 능력은 포기(쓴 적 없음).
- **2026-08-24 — 역검색은 근거 신뢰도가 거리보다 먼저** — 판매를 보장 못 하는 결과에서 "가깝다"는 신호가 "확인됐다"를 이기면 안 된다. `foodRestaurantEvidenceScore`(메뉴판 2 + 리뷰 1)를 1차 키로, 같은 등급 안에서만 거리·언급·평점. 계약·DB 는 그대로고 정렬 의미만 바뀌었다.
- **2026-08-23 — 배포가 카탈로그 공백을 자동 복구하되, 상태를 못 읽으면 건드리지 않는다** — 빈 카탈로그는 에러가 없어 알아채기 어렵다. `status:food-catalog` 한 줄 ↔ `deploy.sh` `stat_val` 파서의 계약으로 일상지도 적재와 동형. 오판 비용(LLM 분류 전량 재실행)이 크므로 해석 실패·테이블 없음은 skip 하고 `items=0` 일 때만 첫 적재, 강제는 케이스 7 로 분리.
- **2026-08-22/23 — 소스는 파일 우선, API 는 대안** — 배포본 CSV/XLSX 가 API 와 같은 데이터인데 쿼터를 쓰고 데이터셋별 활용신청 함정(`30`)까지 있다. 로더가 표준 경로(`data/open/food/`)를 알아 인자 없는 전체 재적재가 가능하고, 영양성분 API 키는 선택으로 내렸다.
- **`nameNorm`가 병합 식별자** — 정규화명이 같으면 같은 대표 행으로 접고 빈 필드만 자동 보강한다. aliases/sourceRefs는 합집합, popularity는 max다.
- **관측과 대표값 분리** — source가 제공한 canonical field evidence는 대표값과 같아도 observation으로 남긴다. 현재 대표값을 지키거나 incoming을 받는 결정이 원천 관측을 지우지 않는다.
- **충돌은 조용한 덮어쓰기가 아니다** — 비어 있지 않은 단일값이 다르면 open conflict를 만든다. 이미 채워진 수동/고품질 대표값은 검토 없이 import가 덮지 않는다.
- **optimistic conflict resolution** — keep/accept는 현재 대표 직렬값이 conflict의 `existingValueJson`과 같을 때만 성공한다. 어드민 수정으로 stale해졌으면 409로 재조회시킨다. dismiss는 대표값을 바꾸지 않아 stale 여부와 무관하다.
- **accept 뒤 대안 rebase** — incoming을 채택하면 같은 incoming의 중복 open은 superseded로 닫고, 서로 다른 대안은 open으로 남기되 baseline을 새 대표값으로 바꾼다.
- **검색과 인식 match 단계 분리** — 자동완성은 exact/prefix/contains/alias, 인식 연결은 exact name → exact alias → 제한된 fuzzy와 score/matchedBy를 쓴다.
- **식당 역검색 fuzzy 금지** — source id와 exact name/alias만 허용한다. 적은 결과가 잘못된 식당보다 낫다.
- **관측과 판매를 구분** — menu catalog/review mention은 수집 evidence이며 재고·현재 메뉴가 아니다. literal notice를 contract에 넣는다.
- **source 실패 격리** — 일부 외부 키 누락/실패에도 다른 source를 계속 처리하고, 전부 실패한 경우만 run 전체를 failed로 닫는다.
- **영양 backfill은 좁고 설명 가능** — 영양이 빈 일반 음식만 제한된 이름 계열 donor에서 중앙값 대표를 고르고 `nutritionFrom`을 남긴다.
- **알레르기 추론은 재료 전용** — 음식명은 실제 배합을 보장하지 않아 검사하지 않는다. 같은 결정 규칙을 import, 명시 백필, 추천 런타임에서 공유하고 운영자가 검수한 값은 자동화가 덮지 않는다.
- **인식 품질은 lineage 우선** — `recognitionDishId`로 원본과 최종을 연결하고 구형 데이터만 food/name/order fallback을 쓴다. candidate confidence bucket별 교정률을 분리한다.
- **품질 privacy k=2** — top 교정/미매칭은 서로 다른 사용자 2명 이상인 항목만 노출하고 user/memo/photo/entry id는 응답하지 않는다.

## Gotchas [coverage: high — 24 sources]

- **`invalidate()` 를 부르는 곳이 없다.** `MenuNutritionResolver.invalidate`·`MenuNutritionService.invalidate` 는 정의만 있고 카탈로그 적재·재크롤 뒤 호출되지 않는다. 카탈로그 적재·어휘 편집·메뉴 재크롤은 인덱스 TTL 10분 + placeId LRU 10분이 지나야 반영된다(문서의 "10분 안에 반영"은 이 TTL 이다).
- **어휘 DB 가 안 닿는 두 곳.** `webQueryFor` 의 범주어 판정과 LLM 분해의 범주어 제거, 그리고 LLM·웹 항목의 `computePortion` 은 `DEFAULT_LEXICON`(코드 기본값)을 쓴다. 어드민이 `suffix_block`·`portion` 을 추가해도 규칙 계층에만 적용되고 LLM·웹 항목의 통상 1인분 환산·범주어 필터에는 반영되지 않는다.
- **`GENERIC_SET_WORDS` 의 런치·디너는 기본 어휘에 세트어가 아니다.** `setWords` 에 없어 `setSignal` 이 될 수 없으므로 "런치정식" 은 `정식` 으로만 잡힌다. 어드민이 `set` 종류로 런치를 추가하면 그때 주메뉴 세트 규칙이 붙는다.
- **문서·스키마 주석이 `portion` 종류를 빠뜨렸다.** [schema.prisma](../../apps/friendly/prisma/schema.prisma) `MenuLexicon` 주석과 [menu-calorie-engine.md](../../docs/menu-calorie-engine.md) 구조 표의 kind 목록은 9종인데 코드(`MENU_LEXICON_KINDS`·계약)는 `portion` 포함 10종이다. 큐레이션 표도 문서·커밋은 "30종"인데 코드는 32행이다. 코드가 맞다.
- **`probe:menu-decompose` 는 세트 분해가 아니라 LLM 매칭 모델 프로브다.** 파일명이 먼저 생겼고 분해 서비스가 나중에 붙었다. 분해 골든셋 측정은 `measure:menu-decompose`.
- **`llmPending` 응답은 캐시되지 않는다.** 백그라운드가 끝날 때까지 같은 placeId 의 매 요청이 엔진·캐시 조회를 다시 한다(수십 ms). 훅 폴링 상한 10회 뒤에도 안 끝났으면(LLM 느림·웹 15건 초과) 다음 탭 진입 때 채워진다. 백그라운드 실패는 warn 로그뿐이고 캐시에 남지 않아 다음 요청이 다시 묻는다.
- **한 번에 묻는 상한.** LLM 매칭 60·분해 30·웹 15(1초 간격 → 최대 ~30초). 메뉴판이 크면 첫 방문에 다 채워지지 않고 방문을 거듭하며 채워진다. 메뉴명은 200개까지만 본다.
- **캐시 `version` 상수는 재판정 스위치다.** 프롬프트·파서를 바꾸면 상수를 올려야 옛 행이 stale 로 무시되고, 올리면 그 어휘 전부를 다시 묻는다(비용은 어휘 수). `menu_llm_matches.foodId` 는 FK 가 없어 비활성/삭제된 음식이면 `hit` 이 null 이 되고 표준명으로 웹 질의로 넘어간다.
- **웹 실측은 제3자 크롤링이다.** fatsecret.kr 마크업이 바뀌면 파서(`ENTRY_RE`, 문장 패턴 기반)가 조용히 0건을 내고 미채택으로 **저장**된다 — 그 뒤 버전을 올려야 재조회한다. `probe:food-web-estimate` 로 먼저 확인. 끄려면 라우트의 `web:` 한 줄.
- **`servingG == 100` 행은 1인분이 아니다.** 표준데이터에서 기준량을 그대로 둔 행(돈가스 280kcal). `mfds-raw` 는 `servingG` 가 전부 null 이라 항상 100g당이고, 큐레이션은 병·잔 용량이 있는 것만 1인분(소주 360ml 408kcal).
- **큐레이션 값은 공식 데이터가 아니다.** 제조사 표기 기준 근사값을 코드에 박았다(`source: curated`, `sourceId: curated:<이름>`). 브랜드 별칭(참이슬·카스·햇반)이 exact/alias 로 걸리므로 별칭 충돌은 인덱스에서 "이름이 별칭을 이긴다" 규칙으로 풀린다.
- **골든셋 측정은 LLM·웹 캐시만 읽는다.** `measure:menu-golden` 전에 `probe:menu-coverage --ask=N --web=N` 으로 캐시를 채워야 llm/web 계층 정밀도가 나온다. 골든셋의 `reviewed: corrected` 51건은 사람이 정정한 정답이라 규칙 변경 뒤 재검토 대상이다.
- **커밋 날짜와 문서 날짜가 다르다.** 엔진 커밋 12개는 git 상 전부 2026-09-02 이고, [menu-calorie-engine.md](../../docs/menu-calorie-engine.md)·메모리는 정밀도 측정을 2026-09-03 으로 적는다. 이 문서는 커밋 해시 기준으로 2026-09-02 를 쓴다.
- **`DATA_GO_KR_API_KEY` 이름 변경은 호환 별칭이 없다.** 운영 `.env` 의 `FOOD_API_KEY`/`BUS_API_KEY` 등을 배포 전에 바꿔야 한다. 영양성분은 배포본 CSV 가 있으면 키가 필요 없고, 15100070 활용신청이 없으면 `30 등록되지 않은 서비스키`(키 오류 아님).
- **15100070 API 봉투가 문서와 다르다.** 활용신청 승인 뒤 실측(2026-09-02)은 `response` 래퍼 없이 최상위 `header/body`, `items` 는 `{ item: [...] }`. 어댑터가 둘 다 받지만 프로브가 문서 형태만 가정하면 0건으로 보인다.
- **역검색 정렬이 바뀌어 "가장 가까운 식당" 이 1등이 아닐 수 있다.** 리뷰만 있는 0m 식당보다 메뉴판+리뷰 근거의 먼 식당이 위(2026-08-24). 앱 시트 문구("근거 신뢰도와 거리 순")가 이 순서를 설명한다.
- **`status:food-catalog` 출력 형식은 `deploy.sh` 와의 계약이다.** `ok items=N classified=C nutrition=U meals=M` 첫 토큰·키 이름을 바꾸면 배포가 `missing`/skip 으로 빠진다. `classified` 는 3축 모두 채워진 활성 행만 센다. 배포 자동 적재는 `mfds-raw`·`curated` 를 돌리지 않는다(케이스 7 도 `load:food-catalog --classify --backfill-nutrition` 이라 `--source=all` 이면 포함되지만 `data/open/food/mfds-nutrition-15100065.csv` 가 서버에 있어야 raw 가 들어간다).
- **케이스 7 강제 재적재는 `--classify` 로 LLM 분류를 다시 돈다.** chat 모델이 없으면 조용히 건너뛰므로 분류 수가 그대로면 어드민 AI 설정을 먼저 확인. 배포본이 `data/open/food/` 에 없으면 첫 적재도 케이스 7 도 안내만 하고 끝난다(서버마다 손으로 올린다 — 리포 밖). 외식 어휘는 그 서버의 식당·리뷰에서 나와 종수가 서버마다 다르다(정상).
- **외부 키 이름이 source별로 다르다.** 영양·원재료는 파일이 기본이고 API 는 `DATA_GO_KR_API_KEY`, 레시피는 `FOOD_RECIPE_API_KEY`, `MAFRA_API_KEY`다. 누락은 해당 source error이지 부팅 실패가 아니다.
- **`hansik-800`·`mfds-raw`·`curated` 는 자동 API source가 아니다.** 월간 cron 의 기본 source 목록에는 없고 CLI 적재 전용이다 — `load-food-catalog.ts` 가 표준 경로를 알아 `--file` 없이도 `--source=all` 에 포함된다.
- **JSON `contains`는 후보 축소일 뿐이다.** alias/sourceRefs는 SQLite JSON 문자열이므로 LIKE 후보 뒤 서버가 파싱·정확 비교한다.
- **observation이 많다고 conflict는 아니다.** alias/popularity 합산이나 canonical 값이 같은 여러 출처도 observation은 남지만 open conflict가 되지 않는다.
- **conflict resolution은 current representative에 조건부다.** 목록을 연 뒤 누군가 대표값을 바꾸면 keep/accept가 409다. 최신 conflict/observation을 다시 읽어야 한다.
- **accept가 다른 대안을 자동 승인하지 않는다.** 동일 incoming 중복만 닫고 다른 incoming은 새 baseline과 비교할 open 검토로 남는다.
- **allergen `unknown`은 무알레르겐이 아니다.** `inferred`의 빈 목록도 공개 재료에서 알려진 항목을 못 찾았다는 뜻뿐이며 숨은 재료·미표기·교차접촉을 보장하지 않는다. 음식명 keyword는 추론 근거로 쓰지 않는다.
- **강제 영양 새로고침은 명시 옵션이다.** 일반 import는 채워진 영양·`kcalPer100g`을 보존하고 `refreshNutrition`만 direct source로 다시 쓰며 추정 표시를 지운다.
- **import registry는 process memory다.** 다중 Fastify 인스턴스에서 보장되지 않는 것은 **cron 단일성**(인스턴스마다 타이머가 돈다)이다. in-flight 단일성은 `foodImportRegistry.isActive() || (await this.hasActiveRun())`(DB 의 `running` run 조회)이 함께 막아 대체로 보장되고, 두 인스턴스가 같은 순간 시작하는 짧은 경합 창만 남는다. 메뉴 칼로리의 LRU·in-flight 맵·인덱스도 인스턴스별이다(캐시 테이블은 DB 라 공유).
- **SSE 완료 뒤 DB query를 다시 읽어야 한다.** live event는 진행 snapshot이며 최종 목록·통계는 invalidate 후 재조회한다.
- **역검색 0건은 음식 404와 다르다.** food가 있지만 exact evidence가 없으면 notice+빈 배열이 정상이고 좌표 한쪽만 보내면 400이다. 메뉴 칼로리도 판정 0건이면 빈 배열(404 는 식당 없음).
- **인식 품질 version 필터가 있다.** model/version으로 비교할 수 있고, 손상된 schema/JSON만 제외한다. 정상 과거 prompt version을 임의로 버리지 않는다.
- **confidence 교정은 lineage 경계를 지킨다.** 다른 bucket의 manual/lineage 항목을 단순 순서 pairing해 추가·삭제로 오판하지 않는다.
- **meal의 `foodId`는 FK가 아니다.** 카탈로그 수정·비활성화가 과거 영양 snapshot을 자동 재계산하지 않는다.

## Sources [coverage: high — 89 sources]

- [packages/api-contract/src/schemas/food.ts](../../packages/api-contract/src/schemas/food.ts) — `kcalPer100g`·`mfds-raw`·`curated`(0d2584a·bcfc72b)
- [packages/api-contract/src/schemas/menu-nutrition.ts](../../packages/api-contract/src/schemas/menu-nutrition.ts) — 공개 메뉴 칼로리 DTO·`MENU_NUTRITION_NOTICE`
- [packages/api-contract/src/schemas/menu-lexicon.ts](../../packages/api-contract/src/schemas/menu-lexicon.ts) — 어휘 kind 10종·`MENU_LEXICON_KINDS_WITH_TARGET`
- [packages/api-contract/src/schemas/allergen.ts](../../packages/api-contract/src/schemas/allergen.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Food`(+`adminMenuLexicon`)·`Routes.Restaurant.publicMenuNutrition`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — Food·source audit 모델, `kcalPer100g`, MenuLexicon·MenuLlmMatch·MenuLlmDecomposition·FoodWebEstimate
- [apps/friendly/prisma/migrations/20260822105913_add_food_catalog/migration.sql](../../apps/friendly/prisma/migrations/20260822105913_add_food_catalog/migration.sql)
- [apps/friendly/prisma/migrations/20260822150205_add_food_nutrition_from/migration.sql](../../apps/friendly/prisma/migrations/20260822150205_add_food_nutrition_from/migration.sql)
- [apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql](../../apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql)
- [apps/friendly/prisma/migrations/20260824040000_food_allergen_evidence_status/migration.sql](../../apps/friendly/prisma/migrations/20260824040000_food_allergen_evidence_status/migration.sql)
- [apps/friendly/prisma/migrations/20260902120000_add_food_kcal_per_100g/migration.sql](../../apps/friendly/prisma/migrations/20260902120000_add_food_kcal_per_100g/migration.sql) — 기존 행 `kcal*100/servingG` 역산
- [apps/friendly/prisma/migrations/20260902150000_add_menu_llm_match/migration.sql](../../apps/friendly/prisma/migrations/20260902150000_add_menu_llm_match/migration.sql)
- [apps/friendly/prisma/migrations/20260902170000_add_food_web_estimate/migration.sql](../../apps/friendly/prisma/migrations/20260902170000_add_food_web_estimate/migration.sql)
- [apps/friendly/prisma/migrations/20260903090000_add_menu_lexicon/migration.sql](../../apps/friendly/prisma/migrations/20260903090000_add_menu_lexicon/migration.sql)
- [apps/friendly/prisma/migrations/20260903100000_add_menu_llm_decomposition/migration.sql](../../apps/friendly/prisma/migrations/20260903100000_add_menu_llm_decomposition/migration.sql)
- [apps/friendly/src/modules/food/engine/index.ts](../../apps/friendly/src/modules/food/engine/index.ts)
- [apps/friendly/src/modules/food/engine/engine.ts](../../apps/friendly/src/modules/food/engine/engine.ts) — `MenuNutritionEngine`
- [apps/friendly/src/modules/food/engine/lexicon.ts](../../apps/friendly/src/modules/food/engine/lexicon.ts) — `DEFAULT_LEXICON_SOURCE`·`portionGrams`
- [apps/friendly/src/modules/food/engine/lexicon-db.ts](../../apps/friendly/src/modules/food/engine/lexicon-db.ts) — `mergeLexiconRows`·`loadLexicon`
- [apps/friendly/src/modules/food/engine/parse.ts](../../apps/friendly/src/modules/food/engine/parse.ts) — `parseMenuName`
- [apps/friendly/src/modules/food/engine/catalog-index.ts](../../apps/friendly/src/modules/food/engine/catalog-index.ts) — 메모리 인덱스·`portionKeyFor`
- [apps/friendly/src/modules/food/engine/resolve.ts](../../apps/friendly/src/modules/food/engine/resolve.ts) — 캐스케이드·등급·`computePortion`
- [apps/friendly/src/modules/food/menu-nutrition.ts](../../apps/friendly/src/modules/food/menu-nutrition.ts) (+[test](../../apps/friendly/src/modules/food/menu-nutrition.test.ts) 35건) — 파사드·`MenuNutritionResolver`
- [apps/friendly/src/modules/food/menu-nutrition.service.ts](../../apps/friendly/src/modules/food/menu-nutrition.service.ts) (+[test](../../apps/friendly/src/modules/food/menu-nutrition.service.test.ts) 7건) — `forPlace`·백그라운드 체인
- [apps/friendly/src/modules/food/menu-nutrition-candidates.ts](../../apps/friendly/src/modules/food/menu-nutrition-candidates.ts) — `pickMenuCandidates`
- [apps/friendly/src/modules/food/menu-llm-match.service.ts](../../apps/friendly/src/modules/food/menu-llm-match.service.ts) (+[test](../../apps/friendly/src/modules/food/menu-llm-match.service.test.ts) 5건)
- [apps/friendly/src/modules/food/menu-llm-match.prompts.ts](../../apps/friendly/src/modules/food/menu-llm-match.prompts.ts) — v1, 모델 프로브 결과 주석
- [apps/friendly/src/modules/food/menu-llm-decompose.service.ts](../../apps/friendly/src/modules/food/menu-llm-decompose.service.ts) (+[test](../../apps/friendly/src/modules/food/menu-llm-decompose.test.ts)) — v3
- [apps/friendly/src/modules/food/menu-lexicon.service.ts](../../apps/friendly/src/modules/food/menu-lexicon.service.ts)
- [apps/friendly/src/modules/food/food-web-estimate.ts](../../apps/friendly/src/modules/food/food-web-estimate.ts) (+[test](../../apps/friendly/src/modules/food/food-web-estimate.test.ts) 8건) — 파서·집계 v3
- [apps/friendly/src/modules/food/food-web-estimate.service.ts](../../apps/friendly/src/modules/food/food-web-estimate.service.ts) (+[test](../../apps/friendly/src/modules/food/food-web-estimate.service.test.ts))
- [apps/friendly/src/modules/food/food-raw-import.ts](../../apps/friendly/src/modules/food/food-raw-import.ts) (+[test](../../apps/friendly/src/modules/food/food-raw-import.test.ts) 8건 — 어휘 DB 병합·큐레이션 검증 포함)
- [apps/friendly/src/modules/food/food-curated-seeds.ts](../../apps/friendly/src/modules/food/food-curated-seeds.ts) — 32행
- [apps/friendly/src/modules/food/food.service.ts](../../apps/friendly/src/modules/food/food.service.ts) — `FoodMatch.servingG/kcalPer100g`
- [apps/friendly/src/modules/food/food.route.ts](../../apps/friendly/src/modules/food/food.route.ts) — 어휘 GET/POST/DELETE
- [apps/friendly/src/modules/food/food.route.test.ts](../../apps/friendly/src/modules/food/food.route.test.ts) — 11건(어휘 검증 1건 추가)
- [apps/friendly/src/modules/food/food-api.adapter.ts](../../apps/friendly/src/modules/food/food-api.adapter.ts) — 15100070 봉투 실측 대응
- [apps/friendly/src/modules/food/food-api.adapter.test.ts](../../apps/friendly/src/modules/food/food-api.adapter.test.ts)
- [apps/friendly/src/modules/food/food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts) — 시드 `kcalPer100g`·`DATA_GO_KR_API_KEY`
- [apps/friendly/src/modules/food/food-import.service.test.ts](../../apps/friendly/src/modules/food/food-import.service.test.ts)
- [apps/friendly/src/modules/food/food-allergen.ts](../../apps/friendly/src/modules/food/food-allergen.ts) (+[test](../../apps/friendly/src/modules/food/food-allergen.test.ts))
- [apps/friendly/src/modules/food/food-source-audit.ts](../../apps/friendly/src/modules/food/food-source-audit.ts)
- [apps/friendly/src/modules/food/food-merge-conflict.service.ts](../../apps/friendly/src/modules/food/food-merge-conflict.service.ts) (+[test](../../apps/friendly/src/modules/food/food-merge-conflict.test.ts))
- [apps/friendly/src/modules/food/food-import-registry.ts](../../apps/friendly/src/modules/food/food-import-registry.ts)
- [apps/friendly/src/modules/food/food-classify.service.ts](../../apps/friendly/src/modules/food/food-classify.service.ts)
- [apps/friendly/src/modules/food/food.prompts.ts](../../apps/friendly/src/modules/food/food.prompts.ts)
- [apps/friendly/src/modules/food/food-nutrition.service.ts](../../apps/friendly/src/modules/food/food-nutrition.service.ts) — `CATEGORY_WORDS` export·donor `kcalPer100g`
- [apps/friendly/src/modules/food/food-nutrition.test.ts](../../apps/friendly/src/modules/food/food-nutrition.test.ts)
- [apps/friendly/src/modules/food/food-recognition-quality.service.ts](../../apps/friendly/src/modules/food/food-recognition-quality.service.ts)
- [apps/friendly/src/modules/food/food-recognition-quality.route.test.ts](../../apps/friendly/src/modules/food/food-recognition-quality.route.test.ts)
- [apps/friendly/src/plugins/food-import.ts](../../apps/friendly/src/plugins/food-import.ts) — `DATA_GO_KR_API_KEY`
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) — `MenuNutritionService` 조립·공개 엔드포인트
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) — `getPublicMenuNames`
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `OLLAMA_MENU_MATCH_MODEL`·`DATA_GO_KR_API_KEY`
- [apps/friendly/golden/menu-nutrition.golden.json](../../apps/friendly/golden/menu-nutrition.golden.json) — 444건
- [apps/friendly/golden/menu-decompose.golden.json](../../apps/friendly/golden/menu-decompose.golden.json) — 37건
- [apps/friendly/scripts/load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts) — `--source=raw|curated`
- [apps/friendly/scripts/fetch-mfds-nutrition.ts](../../apps/friendly/scripts/fetch-mfds-nutrition.ts) — 포털 배포본 CSV(`--pk`)
- [apps/friendly/scripts/measure-menu-nutrition.ts](../../apps/friendly/scripts/measure-menu-nutrition.ts)
- [apps/friendly/scripts/measure-menu-golden.ts](../../apps/friendly/scripts/measure-menu-golden.ts)
- [apps/friendly/scripts/measure-menu-decompose.ts](../../apps/friendly/scripts/measure-menu-decompose.ts)
- [apps/friendly/scripts/probe-menu-coverage.ts](../../apps/friendly/scripts/probe-menu-coverage.ts)
- [apps/friendly/scripts/probe-menu-resolve.ts](../../apps/friendly/scripts/probe-menu-resolve.ts)
- [apps/friendly/scripts/probe-menu-decompose.ts](../../apps/friendly/scripts/probe-menu-decompose.ts) — LLM 매칭 모델 프로브(이름 주의)
- [apps/friendly/scripts/probe-food-web-estimate.ts](../../apps/friendly/scripts/probe-food-web-estimate.ts)
- [apps/friendly/scripts/backfill-food-allergens.ts](../../apps/friendly/scripts/backfill-food-allergens.ts)
- [apps/friendly/scripts/food-catalog-status.ts](../../apps/friendly/scripts/food-catalog-status.ts)
- [apps/friendly/scripts/probe-food-api.ts](../../apps/friendly/scripts/probe-food-api.ts)
- [apps/friendly/scripts/backfill-meal-nutrition.ts](../../apps/friendly/scripts/backfill-meal-nutrition.ts) — *배포 적재 뒤 기존 식단 항목 영양 스냅샷 채움*
- [apps/friendly/package.json](../../apps/friendly/package.json) — *load/status/backfill/fetch/measure/probe 스크립트*
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — *DATA_GO_KR_API_KEY 통합 주석·OLLAMA_MENU_MATCH_MODEL 프로브 결과*
- [deploy.sh](../../deploy.sh) — *food_catalog_data(케이스 1·2·4 자동 점검) + 케이스 7*
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — *음식 카탈로그 적재 절차*
- [docs/data-sources.md](../../docs/data-sources.md) — *원본 출처·15100065·큐레이션·fetch 스크립트·fatsecret 보조 절*
- [docs/menu-calorie-engine.md](../../docs/menu-calorie-engine.md) — *엔진 구조·등급·검증·어휘 편집·분해 규칙 문서*
- [packages/utils/src/foodTaxonomy.ts](../../packages/utils/src/foodTaxonomy.ts) — `FOOD_SOURCES`/라벨·`guessDishTypeFromName`
- [packages/shared/src/api/food.api.ts](../../packages/shared/src/api/food.api.ts) (+[test](../../packages/shared/src/api/food.api.test.ts)) — 어휘 API
- [packages/shared/src/hooks/useFood.ts](../../packages/shared/src/hooks/useFood.ts) — `useMenuLexicon*`
- [packages/shared/src/api/restaurant.api.ts](../../packages/shared/src/api/restaurant.api.ts) — `publicMenuNutrition`
- [packages/shared/src/hooks/useRestaurant.ts](../../packages/shared/src/hooks/useRestaurant.ts) — `useRestaurantPublicMenuNutrition`(폴링)
- [apps/web/src/routes/admin/AdminFoodPage.tsx](../../apps/web/src/routes/admin/AdminFoodPage.tsx) (+[test](../../apps/web/src/routes/admin/AdminFoodPage.test.tsx)) — `MenuLexiconSection`
- [apps/web/src/components/restaurant/detail/MenuTab.tsx](../../apps/web/src/components/restaurant/detail/MenuTab.tsx) — 훅 호출·안내 문구
- [apps/web/src/components/restaurant/detail/shared.tsx](../../apps/web/src/components/restaurant/detail/shared.tsx) — `MenuKcalChip`·`MenuGrid kcalByName`·썸네일 112px
- [apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx](../../apps/web/src/components/restaurant/detail/PublicRestaurantDetail.tsx) — `placeId` 전달
- [apps/mobile/src/components/restaurantDetail/MenuTab.tsx](../../apps/mobile/src/components/restaurantDetail/MenuTab.tsx)
- [apps/mobile/src/components/restaurantDetail/shared/MenuGrid.tsx](../../apps/mobile/src/components/restaurantDetail/shared/MenuGrid.tsx) — 앱 `MenuKcalChip`
- [apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts)
