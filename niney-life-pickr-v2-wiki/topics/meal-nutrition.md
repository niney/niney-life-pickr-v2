---
topic: meal-nutrition
last_compiled: 2026-10-04
sources_count: 53
status: active
aliases: [영양, 영양 탭, 영양소 점검, 영양소점검, 영양제, 영양제 조언, 영양제조언, 비타민제, 비타민제 추천, meal-nutrition, meal-nutrition-advice, meal-supplement, MealNutritionService, MealNutritionAdviceService, MealNutritionAdviceError, analyzeMealNutrition, assessNutrient, profileFrom, foodSuggestions, adviceCandidates, sanitizeAdvice, textProblem, allowedNumbersFor, fallbackAdviceItem, fallbackSummary, adviceHash, toAdvice, parseAdviceOutput, supplementAllowed, shortfallOf, buildMealNutritionAdviceUserPrompt, buildMealNutritionAdviceJsonSchema, MEAL_NUTRITION_ADVICE_SYSTEM_PROMPT, MEAL_NUTRITION_ADVICE_VERSION, NUTRIENT_DEFS, NOT_MEASURED_NUTRIENTS, NUTRITION_DISCLAIMER, KDRI, kdri.ts, 한국인 영양소 섭취기준, 2020 KDRI, 평균필요량, 권장섭취량, 충분섭취량, 상한섭취량, 만성질환위험감소섭취량, EAR, RNI, AI, UL, CDRR, 필요추정량, EER, nutrientReference, energyRequirement, ageGroupFor, KDRI_AGE_GROUPS, DEFAULT_AGE_GROUP, MIN_ANALYZED_DAYS, MIN_COVERAGE, supplementCandidate, produceGap, 과일·채소 공백, nutrientsPer100gJson, NUTRIENT_KEYS, pickNutrientsPer100g, parseNutrientsPer100g, serializeNutrientsPer100g, MFDS_NUTRIENT_API_FIELD, MFDS_NUTRIENT_CSV_HEADER, backfillBorrowedNutrients, CURATED_NUTRIENTS_LIKE, kcalPer100gOf, MealNutritionAdvice, meal_nutrition_advices, 20261004060205_add_meal_nutrition, MealPreference.sex, MealPreference.birthYear, 성별, 출생연도, MealSex, MealNutrientKey, MealNutrientStatus, MealNutrientResult, MealNutritionAnalysis, MealNutritionQuery, MealSupplementAdviceItem, CreateMealNutritionAdviceInput, LatestMealNutritionAdviceResult, Routes.Meal.nutrition, Routes.Meal.nutritionAdvice, /meals/nutrition, /meals/nutrition/advice, OLLAMA_MEAL_SUPPLEMENT_MODEL, MEAL_SUPPLEMENT_DAILY_LIMIT, RATE.mealNutrition, RATE.mealSupplement, kimi-k3, probe:meal-nutrition, load:food-catalog --backfill-nutrition, mealNutrients.ts, MEAL_NUTRIENT_STATUS_LABEL, MEAL_NUTRIENT_REFERENCE_LABEL, formatNutrientAmount, nutrientBarWidth, MEAL_SEX_OPTIONS, parseMealBirthYear, mealNutrientProfileLabel, useMealNutrition, useLatestMealNutritionAdvice, useCreateMealNutritionAdvice, MealNutritionTab, MealNutritionView, tab=nutrition, deleted.nutritionAdvices, 원재료 DB 활용신청]
---

# meal-nutrition — 식단 기록 영양소 점검(2020 KDRI) · kimi-k3 영양제 조언(성분·형태만)

**2026-10-04 신설 — 영양소 점검 + 영양제 조언(`3d067a0`) · 모델 비교 프로브와 기록(`c502759`)**: 사용자가 "KIMI-3 기본으로, 식단 기록을 보고 부족한 영양소를 참고해 나에게 맞는 비타민제 추천"을 요청했고, 의견(① 영양소 데이터·점검 ② kimi 조언 + 성별·나이 ③ 선택: 끼니 추천 점수 반영 / 제품명 없이 성분·형태만) 가운데 권장안 ①·②가 진행됐다. 핵심 설계는 **판단(무엇이 얼마나 모자란지)은 서버가 결정적으로 하고, 문장만 텍스트 LLM 이 쓴다**는 것이다 — 진단·제품 추천으로 읽히지 않게. (1) **데이터** — 식약처 음식 표준데이터의 100g당 비타민·무기질 13종을 `FoodItem.nutrientsPer100gJson` 에 싣고([food-nutrients.ts](../../apps/friendly/src/modules/food/food-nutrients.ts)), 같은 대표식품 묶음에서는 이름이 같은 층부터 영양소별로 고른다(참치김치찌개의 비타민 D 가 김치찌개로 새던 것). 영양을 빌려온 행·`공기밥`은 같은 출처에서 복사한다(`backfillBorrowedNutrients`, `load:food-catalog --backfill-nutrition`). (2) **기준** — [kdri.ts](../../apps/friendly/src/modules/meal-nutrition/kdri.ts)에 2020 한국인 영양소 섭취기준 요약표(12세 이상 7구간 × 남녀). 식단 설정에 성별·출생연도(선택, `MealPreference.sex·birthYear`)를 두고, 없으면 30-49세 남녀 중 낮은 값을 쓴다. (3) **점검** `GET /api/v1/meals/nutrition?days=7~28`(기본 14, LLM·일일 한도 없음, 분당 30) — 두 끼 이상 기록한 날만 평균(4일 미만 보류), 먹은 g = 저장 열량 ÷ 100g당 열량, 정보 있는 열량 60% 미만이면 보류, 음료·주류는 0, 기록 열량을 필요량만큼(최대 2배) 채워 봐도 모자란 것만 조언 대상. (4) **조언** `GET·POST /api/v1/meals/nutrition/advice` — 새 LLM purpose `meal-supplement`(기본 `kimi-k3`), 서버가 고른 대상(최대 6)만 풀어 쓰고, 한자·치료/예방·점검 밖 영양소·프롬프트에 없는 용량 숫자가 있는 칸은 서버 문장으로 바꾼다. 같은 날·같은 점검이면 저장본(`meal_nutrition_advices`, 한도 미차감), 일일 `MEAL_SUPPLEMENT_DAILY_LIMIT`(기본 10)·분당 5. (5) **화면** — 웹 `/me/meals?tab=nutrition`·앱 '영양' 탭(기간 7/14/28일, 영양소별 막대·상태·한 끼 후보, 조언 카드). (6) 마이그레이션 `20261004060205_add_meal_nutrition`, `docs/api` 재생성(199 엔드포인트), 테스트 28건 신규. `c502759` 의 `probe:meal-nutrition` 이 kimi-k3(5/5·p50 12.9s·서버 문장으로 바꾼 칸 0)와 gpt-oss:120b(5/5·4.3s, '~합니다'체·나열식)를 견줘 kimi 를 유지했고, 프로브로 국물 한 끼 후보·조금 부족에 영양제 권유·원자료 오류(초밥 니아신 150mg) 3건을 고쳤다. **사용자 결정으로 영양 점검·영양제 조언은 [meal](meal.md) 에서 떼어 이 토픽에 둔다** — 기록·입력·추천·통계는 meal 토픽에 남는다. 같은 날 `b09e0a4` 가 웹 영양 탭을 데스크톱(`lg`)에서 점검 | 조언 두 단으로 펼쳤다.

## Purpose [coverage: high — 12 sources]

- 로그인 사용자 **본인 식단 기록**만 보고, 최근 7/14/28일의 하루 평균 섭취를 2020 한국인 영양소 섭취기준(보건복지부·한국영양학회)과 견준다. 공개·공유 표면은 없다.
- 판단은 [meal-nutrition.service.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.service.ts)의 순수 함수(`analyzeMealNutrition`·`assessNutrient`)가 결정적으로 한다 — 영양소 12종(단백질·식이섬유·칼슘·철·칼륨·비타민 A·비타민 D·티아민·리보플라빈·니아신·비타민 C·나트륨)마다 `low`(부족)·`borderline`(조금 부족)·`ok`(충분)·`high`(많음)·`unknown`(판단 보류).
- 모자란 영양소마다 **음식으로 먼저** 채우는 법(내 기록에서 많이 준 음식 `topSources`, 흔한 한 끼 중 열량 대비 많이 든 음식 `foodSuggestions`, 고정 상식 `typicalFoods`)을 보여 준다.
- 사용자가 누를 때만 텍스트 LLM(`meal-supplement`, 기본 kimi-k3)이 조언 문장을 쓴다. 영양제는 **성분·형태·먹는 때만**(제품명·브랜드·가격·구매처 없음), 부족분·상한·주의 문구·면책은 서버 값이다.
- 진단이 아니라 "식단 기록으로 본 추정" 임을 화면·응답(`NUTRITION_DISCLAIMER`)·라우트 description 이 모두 밝힌다. 식약처 음식 데이터에 값이 없는 영양소(마그네슘·아연·엽산·B6·B12·E·K·오메가-3·요오드·셀레늄)는 `notMeasured` 로 목록만 보이고 부족하다고 말하지 않는다.
- 만 12세 미만(출생연도 기준)은 판단하지 않고 소아청소년과 상담을 안내한다.

## Architecture [coverage: high — 30 sources]

```
웹 /me/meals?tab=nutrition (MealNutritionTab, lg 두 단)   앱 /meal '영양' 탭 (MealNutritionView)
   기간 7|14|28 · 영양소 막대(기준선 100%, 150% 에서 자름) · 조언 카드(요약·영양제 칩·이유/음식/영양제/주의·면책)
   설정 탭: 성별(MEAL_SEX_OPTIONS) · 출생연도(parseMealBirthYear) — @repo/utils mealNutrients.ts 공유
     │  @repo/shared: mealApi.nutrition / latestNutritionAdvice / createNutritionAdvice
     │                useMealNutrition(days) · useLatestMealNutritionAdvice · useCreateMealNutritionAdvice
     │  ↕ @repo/api-contract: schemas/meal.ts(영양 스키마) · routes.ts(Routes.Meal.nutrition·nutritionAdvice)
     ▼
friendly modules/meal-nutrition/meal-nutrition.route.ts (authenticate, GET 점검 · GET 최근 조언 · POST 조언)
   ├ MealNutritionService (결정적)
   │    MealPreferenceService.get(sex·birthYear·알레르기·제외·덜 선호) + mealEntry(items: kcal·proteinG·sodiumMg·foodId)
   │    + foodItem(nutrientsPer100gJson·kcalPer100g…) → analyzeMealNutrition(kdri.ts · meal-nutrition.defs.ts)
   │    + foodSuggestions(common-meals × 카탈로그 × food-serving 1인분, 어휘 10분 캐시)
   └ MealNutritionAdviceService
        mealMutationBarrier.runExclusive(userId) + inFlight Map → analyze → adviceCandidates → 저장본 조회(inputHash)
        → (대상 있고 캐시 miss) MealDailyQuotaService.consume('supplement') → AiConfigService.getResolved('ollama-cloud','meal-supplement')
        → provider.complete(JSON schema format, think) → parseAdviceOutput → sanitizeAdvice(칸별 서버 문장 대체)
        → meal_nutrition_advices 저장(사용자별 최근 20) · operation log feature meal-nutrition-advice
```

### 기준표 — `kdri.ts`

[kdri.ts](../../apps/friendly/src/modules/meal-nutrition/kdri.ts)(183줄)는 2020 KDRI 요약표(02 비타민 책자 ix~xviii 쪽, 2020-12)에서 점검에 쓰는 항목만 옮긴 상수다. 연령 구간 `KDRI_AGE_GROUPS` = `12-14·15-18·19-29·30-49·50-64·65-74·75+`, 성별 `male|female`, 영양소마다 `ear`(평균필요량)·`rni`(권장섭취량)·`ai`(충분섭취량 — 식이섬유·칼륨·비타민 D)·`ul`(상한, 니아신은 니코틴산 기준)·`cdrr`(나트륨 만성질환위험감소섭취량) 열. `nutrientReference(nutrient, sex, ageGroup)` 는 성별을 모르면 남녀 각 열의 **낮은 값**을 고른다(필요량은 낮게 → 부족을 덜 단정, 상한도 낮게 → 과다는 더 조심). `energyRequirement` 는 필요추정량(남 2,500·2,700·2,600·2,500·2,200·2,000·1,900 / 여 2,000·2,000·2,000·1,900·1,700·1,600·1,500kcal)으로, 기록이 일부만 남았는지(기록 열량 ÷ 필요량) 가늠하는 데만 쓴다. `ageGroupFor(age)` 는 12세 미만 null, `DEFAULT_AGE_GROUP = '30-49'`.

### 영양소 정의 — `meal-nutrition.defs.ts`

[meal-nutrition.defs.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.defs.ts)의 `NUTRIENT_DEFS` 12행이 영양소별 정책을 한곳에 둔다.

| 필드 | 의미 |
|---|---|
| `from` | `{snapshot:'proteinG'\|'sodiumMg'}` — 단백질·나트륨은 식단 항목 저장 스냅샷 / `{per100: NutrientKey}` — 나머지는 카탈로그 100g당 값 × 먹은 g |
| `supplement` | 영양제로 권할 수 있는지 — 단백질·식이섬유·칼륨·나트륨은 `false`(음식으로만) |
| `supplementForms` | 영양제를 고른다면의 성분·형태·먹는 법(제품명 없음) — 칼슘 "탄산칼슘(식사와 함께) 또는 구연산칼슘…한 번에 500mg 이하로 나눠서", 철 "황산제일철 등 또는 킬레이트철(비스글리시네이트철)…", 비타민 A "베타카로틴 위주의 종합비타민…레티놀 단일 고용량은 피해서", 비타민 D "D3(콜레칼시페롤), 기름기 있는 식사와 함께", B1·B2 "B 콤플렉스나 종합비타민", 니아신 "니코틴아미드 형태…(니코틴산 고용량은 피해서)", 비타민 C "아스코르브산, 하루 한두 번 나눠서". 조언 LLM 은 이 안에서만 말하고 폴백 문장도 이것을 쓴다 |
| `foodUpperLimit` | 음식만으로 상한 초과를 말할 수 있는지 — 니아신(상한이 니코틴산 보충제 기준)·비타민 A(레티놀 기준, 음식은 카로티노이드 포함 RAE)는 `false`. 상한 값 자체는 영양제 조언에 쓴다 |
| `produceSensitive` | 과일·채소가 영양 정보 없이 기록되면 적게 잡히는 영양소 — 식이섬유·칼륨·비타민 A·비타민 C |
| `typicalFoods` | 그 영양소가 많은 흔한 음식(일반 상식, 카탈로그 밖 과일·유제품까지) |
| `caution` | 서버가 그대로 붙이는 고정 주의 문구 — 복약·임신·결석·신장 질환 등에 관한 말을 모델이 지어내지 않게 |

`NOT_MEASURED_NUTRIENTS`(10종)와 `NUTRITION_DISCLAIMER` 도 여기 있다.

### 점검 — `meal-nutrition.service.ts`

`MealNutritionService.analyze(userId, today, days)`: `from = shiftDate(today, -(days-1))`(KST 날짜 키, [meal-pattern.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts)에서 export 로 바뀜) ~ `today` 의 `mealEntry` 와 선호를 병렬로 읽고, 항목의 `foodId` 로 카탈로그 행(`CATALOG_SELECT` — `nutrientsPer100gJson`·`kcalPer100g`·`servingG`·`source`·`sourceCategory`·`dishType`…)을 모아 순수 함수 `analyzeMealNutrition` 에 넘긴다.

- **분석일**: 날짜별 서로 다른 entry 가 2개 이상인 날만 평균에 넣는다(한 끼만 적은 날이 섞이면 모든 영양소가 부족해 보인다). `MIN_ANALYZED_DAYS = 4` 미만이거나 프로필이 12세 미만이면 `status:'insufficient'` + `insufficientReason`.
- **먹은 g**: `grams = item.kcal ÷ kcalPer100gOf(row) × 100`([food-serving.ts](../../apps/friendly/src/modules/food/food-serving.ts) — `kcalPer100g` 가 없으면 1인분 열량·중량으로 역산). 항목 kcal 은 저장 시점에 이미 1인분(통상 1인분 환산 포함, [food](food.md)) × 양 배수가 곱해진 값이라 그대로 섭취량 환산의 기준이 된다. `kcal === null` 항목은 건너뛴다.
- **영양소 값**: snapshot 이면 항목 값, 음료·주류(`dishType beverage|alcohol` 또는 큐레이션 `주류|음료`)면 **0 으로 아는 셈**(정보 비율을 깎지 않는다), 그 밖엔 `per100[key] × grams / 100`. 값이 null 이면 그 영양소의 `coveredKcal` 에 넣지 않는다.
- **coverage**: 영양소별 `coveredKcal ÷ energyKcal` — `MIN_COVERAGE = 0.6` 미만이면 `unknown` + "이 영양소 정보가 있는 기록이 N%뿐이라 판단을 미뤄요."
- **판정 `assessNutrient`**: 나트륨은 `cdrr` 초과만 `high`. 그 외 `foodUpperLimit` 이고 `ul` 초과면 `high`. `rni` 가 있으면 `ear` 미만 `low`, `rni` 미만 `borderline`; `ai` 만 있으면 `ai × 0.7`(`AI_LOW_RATIO`) 미만 `low`, `ai` 미만 `borderline`. 모자라면 `adjust = min(2, max(1, 1/energyRatio))` 배로 채워 봐도 `amount` 에 못 미칠 때만 `supplementCandidate:true`(아니면 note "기록이 빠진 끼니를 채우면 기준에 닿을 수 있는 수준이에요."). 영양 정보 없는 과일·채소 기록(`mfds-raw` 의 `과일류·채소류·버섯류·해조류`)이 하나라도 있으면 `produceSensitive` 영양소는 조언 대상에서 뺀다.
- **notes**: 성별·출생연도 미설정 안내, 기록 열량이 필요량 70% 미만이면 "빠진 끼니·간식" 안내, 과일·채소 공백 개수 안내.
- **한 끼 후보 `foodSuggestions`**(low·borderline 이 있을 때만): 활성 + `nutrientsPer100gJson` 있는 카탈로그 중 흔한 한 끼 목록([common-meals.ts](../../apps/friendly/src/modules/meal-recommendation/common-meals.ts) `commonMealNorms`, 이름 또는 별칭) ∩ `isExplorableCatalogRow` ∩ 사용자 알레르기(`hitsUserAllergen`) 아님 ∩ 제외·덜 선호(`isExcluded`) 아님. 1인분은 식단 저장과 같은 `mealServingNutrition(row, {isMain:true}, lex)`. 1인분 나트륨 1,500mg 이상(나트륨이 이미 `high` 면 800mg 이상 + 국물 요리 — `soup|stew` 또는 이름이 `국밥|탕|찌개|전골|국` 으로 끝남), 100g당 200kcal 이상은 뺀다. 1인분이 기준량의 10% 이상이고 상한 이하(넘으면 원자료 오류 — 초밥 니아신 150mg)인 것을 **100kcal 당 양** 순으로 3개. 어휘는 `loadLexicon` 10분 캐시.

### 조언 — `meal-nutrition-advice.service.ts`

[meal-nutrition-advice.service.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition-advice.service.ts)(604줄):

1. `create(userId, {days, force}, today)` — 키 `[userId, today, days, force]` 의 in-flight Promise 에 연타가 합류(LLM·한도 1회). 본체는 `mealMutationBarrier.runExclusive(userId)` 안에서 돈다 — 장벽 밖에서 LLM 을 기다리면 전체 삭제 응답 뒤에 지운 기록의 분석이 다시 저장될 수 있어서.
2. `analyze` → `adviceCandidates`(점검 `ok` 일 때 `supplementCandidate` 이면서 low/borderline, low 먼저·비율 낮은 순, `MAX_ADVICE_ITEMS = 6`) → `adviceHash = sha1([promptVersion, days, analysis])` 앞 16자.
3. `force` 가 아니면 같은 `userId·targetDate·inputHash·promptVersion` 의 `done|insufficient` 저장본을 그대로 준다(**fallback 은 재사용하지 않는다** — 다시 누르면 모델을 다시 불러 본다).
4. 점검이 `insufficient` 이거나 대상이 0이면 모델·한도 없이 서버 요약(`fallbackSummary`)으로 저장(`insufficient`·`done`+model null).
5. `consumeQuota(userId)` — 라우트가 `MealDailyQuotaService.consume(userId, kstToday, 'supplement', MEAL_SUPPLEMENT_DAILY_LIMIT)` 를 주입. false 면 `MealNutritionAdviceError('quota')` → 429.
6. `resolveProvider` — `getResolved('ollama-cloud','meal-supplement')` 의 모델에 어드민 추론 설정을 `thinkOptionFor`(kimi 계열에만 반영)로, `thinkTokenMult` 배로 `maxTokens 2000`·타임아웃 90s(상한 180s)를 키운다. `temperature 0.3`·`numCtx 8192`·`format` = 후보 key enum 을 박은 JSON schema.
7. `parseAdviceOutput`(첫 JSON 객체 → zod `LlmOutput`) → `sanitizeAdvice` — 후보 순서대로, 모델이 빠뜨린 영양소는 `missing` 으로 서버 문장, 칸마다 `textProblem`: `empty`·`long`(400자 초과)·`hanja`(`\p{Script=Han}`)·`claim`(치료|완치|예방)·`offlist`(마그네슘·아연·엽산·오메가·요오드·셀레늄·유산균·프로바이오틱스·루테인·밀크씨슬·콜라겐·코엔자임·비오틴·비타민 B6/B12/E/K)·`number`(mg·μg·IU·g·%·kcal 단위가 붙은 숫자가 프롬프트 숫자 집합 + `100 - percent` 에 없음). 걸린 칸만 `fallbackAdviceItem` 의 서버 문장. 영양제를 권하지 않는 영양소는 모델이 무엇을 써도 `supplementTip = null`. 모델이 쓴 항목이 0이면 실패로 보고 전부 서버 문장(`fallback`).
8. 저장 — 사용자별 최근 `HISTORY_LIMIT = 20` 만 남기고 새 행 생성. 운영 로그 `startRun({feature:'meal-nutrition-advice', trigger:'user', meta:{candidates}})` → `llm` 단계(바꾼 칸 수면 warn) → `finishRun`.

### 프롬프트 — `meal-nutrition.prompts.ts`

[meal-nutrition.prompts.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.prompts.ts) `MEAL_NUTRITION_ADVICE_VERSION = 1`(v1, 2026-10-04). 시스템 프롬프트는 "영양 코치, 의사·약사 아님, 판단은 이미 끝났다" + 쓰는 규칙(후보 key 만, 프롬프트 숫자만, 제품·브랜드·가격·구매처 금지, 치료·예방·완치 금지, 존댓말 ~요, 한자 금지, D3 같은 영양소 표기만 영어) + JSON 한 객체 출력 규칙. 사용자 프롬프트(`buildMealNutritionAdviceUserPrompt`)는 `[대상]`(연령대·성별 또는 "남녀 중 낮은 기준") · `[기록]`(분석일·끼니 수·하루 평균 kcal/필요량 %) · `[주의]`(notes) · `[조언할 영양소]`(key·라벨·하루 평균·기준 대비 %·상태·하루 부족분·상한, 주로 얻은 음식·한 끼 후보·많이 든 음식, "영양제: 권해도 됨. 형태: …" / "조금 모자란 정도라 음식으로만" / "음식으로만") · `[여러 개]`(영양제 대상 3개 이상이면 종합비타민 하나로 시작해도 됨) · `[참고]`(나트륨 high 면 국물·젓갈 한마디). 비타민 D 는 서버가 `μg(…IU)` 환산값을 넘긴다(1μg = 40IU, 모델이 IU 를 지어내지 않게). `supplementAllowed(n)` = `supplement && supplementForms && status === 'low'`, `shortfallOf(n)` = `max(0, reference.amount - intakePerDay)`.

### 라우트 — `meal-nutrition.route.ts`

[meal-nutrition.route.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.route.ts)(99줄): autoload 플러그인 하나가 `AiConfigService(buildLlmProviderEnv())`·`MealDailyQuotaService`·`MealNutritionService`·`MealNutritionAdviceService` 를 조립한다. `kstToday()` = `toLocaleDateString('en-CA', {timeZone:'Asia/Seoul'})`. 세 라우트 모두 `onRequest: [app.authenticate]`, `tags:['meal']`, 한국어 `summary`(점검·생성은 `description` 도).

### 웹·앱

- 웹 [MealNutritionTab.tsx](../../apps/web/src/routes/meal/MealNutritionTab.tsx): `MealPage` 의 6번째 탭 `nutrition`(아이콘 `Pill`, [MealPage.tsx](../../apps/web/src/routes/meal/MealPage.tsx) — 탭 6개라 좁은 화면에서 아이콘을 숨기고 `overflow-x-auto` 로 가로로 민다). 점검 카드는 기간 버튼 7/14/28, 상태 배지 색(부족 빨강·조금 부족 호박·충분 초록·많음 주황·보류 회색), `nutrientBarWidth` 막대 + 100% 기준선(`NUTRIENT_BAR_MAX_PERCENT 150` 의 66.7% 위치), 모자라면 "한 끼로는 …· 많이 든 음식: …", 아니면 "주로 …에서", `notMeasured` 목록. 기록 부족이면 "기록하러 가기"(`/me/meals/new`). 조언 카드는 `최근 N일로 조언 받기`(점검 `ok` 일 때만 활성) · 저장본이 있으면 `다시 쓰기`(force) · 출처 라벨(AI 조언 / AI 없이 계산으로 쓴 조언 / 계산 결과 / 기록 부족) · 영양제로 채운다면 칩 · 영양소별 이유/음식으로/영양제로/주의 · 면책. `b09e0a4` 부터 `lg` 에서 두 단(`lg:grid-cols-2`) — 조언(이 탭의 결론)이 점검 목록 아래로 밀리지 않게. 차트 라이브러리 없이 div 폭으로 그린다.
- 앱 [MealNutritionView.tsx](../../apps/mobile/src/components/meal/MealNutritionView.tsx)(287줄): 웹과 같은 구성을 RN `View` 폭 계산으로. [app/meal/index.tsx](../../apps/mobile/app/meal/index.tsx) 탭 `nutrition`('영양'). `다시 쓰기` 는 `Chip`.
- 설정: 웹 [MealPreferenceTab.tsx](../../apps/web/src/routes/meal/MealPreferenceTab.tsx)·앱 [MealPreferenceView.tsx](../../apps/mobile/src/components/meal/MealPreferenceView.tsx) 에 성별 칩(여성·남성·선택 안 함)과 출생연도 입력 — `parseMealBirthYear` 가 빈칸 null, 1900~올해 네 자리 아니면 undefined("출생연도는 1900년부터 올해까지 네 자리로 적어 주세요.").

## Talks To [coverage: high — 22 sources]

- **[food](food.md)** — 카탈로그 `FoodItem.nutrientsPer100gJson`(적재 `food-import.service`·`food-nutrients.ts`, 빌린 행 복사 `backfillBorrowedNutrients`, `CURATED_NUTRIENTS_LIKE` 공기밥=쌀밥), `kcalPer100gOf`·`mealServingNutrition`(1인분 규칙, [food-serving.ts](../../apps/friendly/src/modules/food/food-serving.ts)), `loadLexicon`(어휘 portion·synonym), `parseJsonStringArray`. 원재료(`mfds-raw`) 행에는 비타민·무기질이 아직 없다([food-raw-import.ts](../../apps/friendly/src/modules/food/food-raw-import.ts)는 열량만 시드).
- **[meal](meal.md)** — `mealEntry`·`mealItem` 의 저장 스냅샷(kcal·proteinG·sodiumMg·foodId·dishType), `MealPreferenceService`(성별·출생연도·알레르기·제외·덜 선호 — `null` 은 지움, `undefined` 는 그대로), `MealDailyQuotaService`(purpose `'supplement'`), `mealMutationBarrier`. 식단 전체 삭제([meal-data.service.ts](../../apps/friendly/src/modules/meal/meal-data.service.ts))가 `mealNutritionAdvice.deleteMany` 로 조언 이력도 지우고 응답 `deleted.nutritionAdvices` 를 싣는다. 백업 복원은 성별·출생연도를 되살린다(없던 백업은 null). 조언 이력은 백업 대상이 아니다.
- **meal 추천 모듈**(meal 토픽 범위) — [common-meals.ts](../../apps/friendly/src/modules/meal-recommendation/common-meals.ts) 흔한 한 끼 목록, [meal-pattern.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts)의 `allergenData`·`hitsUserAllergen`·`isExcluded`(타입이 `Pick<CandidateInput,'nameNorm'|'ingredients'>` 로 좁혀짐)·`isExplorableCatalogRow`·`shiftDate`(export). 점검 결과를 끼니 추천 점수에 반영하는 ③은 아직 없다.
- **[ai](ai.md)** — 새 purpose `meal-supplement`([schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts) `LlmProviderPurpose` 9번째), env 기본 모델 `OLLAMA_MEAL_SUPPLEMENT_MODEL=kimi-k3`([llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts)), DB row 가 없어도 계정(chat row → env) 키를 빌리고 모델은 env 기본으로 보충([ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts) `getResolved`). 어드민 AI 키 페이지 `PURPOSE_META['meal-supplement']`(아이콘 `Pill`, "영양제 조언", `thinking: true`)로 모델·추론 선택. `recommendModelForPurpose` 가 사주와 같이 kimi-k3 를 추천([aiModel.ts](../../packages/utils/src/aiModel.ts)). [adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts) `MAX_ENTRIES` 8 → 16(용도 9개가 서로 밀어내지 않게). [model-family-call-options](../concepts/model-family-call-options.md).
- **[logs](logs.md)** — 운영 로그 feature `meal-nutrition-advice`([schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts), 어드민 로그 라벨 "영양제 조언"). [operation-log-instrumentation](../concepts/operation-log-instrumentation.md).
- **[utils](utils.md)** — [mealNutrients.ts](../../packages/utils/src/mealNutrients.ts)(상태 라벨·정렬·기준 라벨·`formatNutrientAmount`·막대 폭·성별 선택지·출생연도 파서·프로필 라벨)를 서버 프롬프트·웹·앱이 같이 쓴다. utils 는 api-contract 에 의존할 수 없어 값 유니온을 다시 적었다.
- **[shared](shared.md)** — `mealApi.nutrition(days?)`·`latestNutritionAdvice()`·`createNutritionAdvice(input)`, 훅 3개([useMeal.ts](../../packages/shared/src/hooks/useMeal.ts)). 식단 기록 변경(`invalidateEntries`)과 선호 변경이 `['meal','nutrition']` 를 무효화한다.
- **[api-contract](api-contract.md)** — [schemas/meal.ts](../../packages/api-contract/src/schemas/meal.ts) 영양 절과 `MealSex`·선호의 `sex`·`birthYear`. [zod-ssot-buildless](../concepts/zod-ssot-buildless.md).
- **[api-docs](api-docs.md)** — 세 라우트가 [endpoints.md](../../docs/api/endpoints.md)의 meal 절(로그인, 30/분 · 무표기 · 5/분)에 자동 생성된다.
- **[web](web.md)·[mobile](mobile.md)** — 영양 탭·설정. [platform-ui-split](../concepts/platform-ui-split.md).

## API Surface [coverage: high — 9 sources]

| 메서드 | 경로 | 인증·한도 | 설명 |
|---|---|---|---|
| `GET` | `/api/v1/meals/nutrition?days=` | 로그인, `RATE.mealNutrition` 30/분 | `MealNutritionQuery` `days` coerce int 7~28, 기본 14 → `MealNutritionAnalysis`. LLM·일일 한도 무관 |
| `GET` | `/api/v1/meals/nutrition/advice` | 로그인, 전역 기본 레이트 | `{ advice: MealNutritionAdvice \| null }` — 사용자 최근 1건. 저장된 분석 스냅샷이 지금 계약과 맞지 않으면(옛 버전) null |
| `POST` | `/api/v1/meals/nutrition/advice` | 로그인, `RATE.mealSupplement` 5/분 + 일일 `MEAL_SUPPLEMENT_DAILY_LIMIT`(기본 10) | 본문 `CreateMealNutritionAdviceInput{days 7~28 기본 14, force 기본 false}` → `MealNutritionAdvice`. 한도 초과 429 "오늘 영양제 조언 한도(N회)를 모두 썼습니다…" |

**`MealNutritionAnalysis`**: `from`·`to`·`days`·`analyzedDays`·`mealCount`·`profile{sex, ageGroup, basis user|default}`·`energy{intakePerDay, requirement, percent}`·`coverage`(0~1)·`status ok|insufficient`·`insufficientReason`·`nutrients[]`·`notMeasured[]`·`notes[]`.

**`MealNutrientResult`**: `key`(`MealNutrientKey` 12종)·`label`·`unit`(g·mg·μg RAE·μg)·`intakePerDay`(10 미만은 소수 둘째, 이상은 정수)·`reference{kind rni|ai|cdrr, amount, ear}`·`upperLimit`·`percent`·`coverage`·`status`(`MealNutrientStatus`)·`supplementCandidate`·`topSources`(최대 3)·`foodSuggestions`(low/borderline 일 때만)·`typicalFoods`·`note`.

**`MealNutritionAdvice`**: `id`·`targetDate`·`status done|fallback|insufficient`·`model`(done 일 때만)·`summary`·`items[]`(`MealSupplementAdviceItem{nutrient, label, reason, foodTip, supplementTip|null, unit, shortfallPerDay, upperLimit, caution}`)·`disclaimer`·`analysis`(근거 스냅샷)·`createdAt`.

**shared**: `useMealNutrition(days = 14, enabled)` 키 `['meal','nutrition','analysis',days]`·staleTime 60초, `useLatestMealNutritionAdvice` 키 `['meal','nutrition','advice']`, `useCreateMealNutritionAdvice` 성공 시 같은 키에 `{advice}` 를 `setQueryData`.

**스크립트**([package.json](../../apps/friendly/package.json)):

| 명령 | 역할 |
|---|---|
| `probe:meal-nutrition [--models=kimi-k3,gpt-oss:120b] [--days 14] [--email <addr>] [--repeat 1]` | 가상 사용자 A·B·C(probe:meal-recommend)·E(probe:meal-settings) + 지정 이메일(기본 `niney@life.com`) 점검 결과로 서비스와 같은 후보·프롬프트·`sanitizeAdvice` 를 돌리고 모델만 바꿔 직접 부른다(저장·한도·분당 제한 없음, prod.db 거부). 지표: 성공률·지연 p50/최대·잘림·바꾼 칸(사유별)·제품/구매 의심 표현(`PRODUCT_RE`). 리포트 `data/meal-probe/nutrition-report-날짜.md`(git 제외)에 모델 원문 |
| `load:food-catalog --source=nutrition --backfill-nutrition` | 100g당 비타민·무기질 채우기(빈 행만, `--refresh-nutrition` 이면 덮음) + 빌린 행 복사(`backfillBorrowedNutrients` — "비타민·무기질(빌려 온 행) 대상 N행 → 채움 F, 건너뜀 S") |
| `backfill:meal-nutrition [--dry-run] [--refresh]` | 식단 항목 kcal·단백질·나트륨 스냅샷 채우기 — 점검의 먹은 g 환산 기준 |

## Data [coverage: high — 10 sources]

마이그레이션 [20261004060205_add_meal_nutrition](../../apps/friendly/prisma/migrations/20261004060205_add_meal_nutrition/migration.sql) 하나가 세 가지를 바꾼다([schema.prisma](../../apps/friendly/prisma/schema.prisma)).

| 모델·열 | 내용 |
|---|---|
| `food_items.nutrientsPer100gJson TEXT?` | 100g(100ml)당 `{fiberG, calciumMg, ironMg, phosphorusMg, potassiumMg, vitaminAUg, vitaminDUg, thiaminMg, riboflavinMg, niacinMg, vitaminCMg, cholesterolMg, saturatedFatG}` 중 값이 있는 키만. 값이 하나도 없으면 null("아직 모름" — 다시 채울 수 있게). 인·콜레스테롤·포화지방은 적재만 하고 점검에는 안 쓴다 |
| `meal_preferences.sex TEXT?`·`birthYear INT?` | 선택 입력. 계약 `MealSex` 밖 값은 읽을 때 null |
| `meal_nutrition_advices` (`MealNutritionAdvice`) | `id cuid`·`userId`(FK users, CASCADE)·`targetDate`(KST 분석 끝 날짜)·`analysisJson`(근거 분석 스냅샷)·`itemsJson`(기본 `[]`)·`summary`·`status done\|fallback\|insufficient`·`model?`·`promptVersion`(기본 1)·`inputHash`·`createdAt`. 인덱스 `(userId, createdAt)`·`(userId, targetDate)`. 사용자별 최근 20건 |

**열 매핑**([food-nutrients.ts](../../apps/friendly/src/modules/food/food-nutrients.ts)): 표준데이터 API camelCase 열 `fibtg·ca·fe·p·k·vitaRae(μg RAE)·vitd·thia·ribf·nia·vitc·chole·fasat`(2026-10-04 김치찌개 실측 — 빈 문자열은 값 없음, `"0.00"` 은 0) ↔ 배포 CSV 한글 머리글(`식이섬유(g)`·`비타민 A(μg RAE)`…). [food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts)의 `looseHeader` 가 BOM·공백·`㎍`→`μg`·`µ`→`μ` 차이를 흡수한다.

**대표값 고르기 `pickNutrientsPer100g`**: 같은 대표식품 묶음의 변형(외식 분석·급식 산출…)마다 값을 모아, 영양소별로 우선순위 순 **0 보다 큰 첫 값**(모두 0 이면 0, 아무도 안 적었으면 뺌). 식약처 분석 행은 측정 안 한 영양소를 0 으로 둔 경우가 있어서다(김치찌개 외식 행 철·비타민 C 0, 급식 행 0.3·1.27). 단 이름이 대표식품과 같은 층(`priority` 백의 자리 = tier 0)이 그 영양소를 적었으면 그 층에서만 고른다 — 다른 음식(김치찌개_참치)의 비타민 D 가 넘어오지 않게. 재적재는 빈 행만 채우고(`refreshNutrition` 이면 덮음), 같은 batch 접기에서도 먼저 들어온 값을 지킨다.

**빌린 영양**: `backfillNutrition` 이 donor 에서 1인분 영양을 빌릴 때 `nutrientsPer100gJson` 도 같은 donor 에서 함께 복사한다(점검이 같은 행 기준으로 환산하게). `backfillBorrowedNutrients` 는 도입 전에 빌려 온 행(`nutritionFrom` 있음) + 큐레이션 `공기밥`을 대상으로, `nutritionFrom` 이름(`' 외 N종 중앙값'` 꼬리 제거)의 donor → 없으면 `pickNutritionDonor` 규칙으로 다시 골라 채운다. dev 1,236/1,236.

**분석 스냅샷**: 조언 행은 근거 분석 전체를 JSON 으로 남겨, 나중에 기록이 바뀌어도 "그때 무엇을 보고 이렇게 말했는지" 를 보여 준다. `toAdvice` 가 읽을 때 `MealNutritionAnalysis` 로 재검증하고, 실패(계약 변경 전 행)면 null, 항목 JSON 이 깨졌으면 빈 항목으로 보인다.

## Key Decisions [coverage: high — 14 sources]

- **2026-10-04 (`3d067a0`) — 판단은 서버, 문장만 LLM** — 부족·기준·부족분·상한·주의 문구·면책은 서버 값이고, 모델은 서버가 고른 후보(최대 6)의 이유·음식·영양제 칸만 쓴다. 모델 문장은 칸 단위로 검사해 걸린 칸만 서버 문장으로 바꾸고, LLM 이 없거나 실패하면 서버 문장만으로 답한다(`fallback`) — 기능이 LLM 가용성에 묶이지 않는다. [static-first-llm-enrichment](../concepts/static-first-llm-enrichment.md).
- **2026-10-04 — 숫자는 프롬프트에 있는 것만** — 용량 단위가 붙은 숫자를 프롬프트 숫자 집합(+ `100 - percent`)과 대조한다('하루 1~2번'·'15~20분' 같은 단위 없는 숫자는 보지 않는다). 비타민 D IU 는 서버가 환산해 넘긴다. 제품명·효능 주장과 함께 "새 용량을 지어내는" 것이 진단·처방으로 읽히는 가장 큰 위험이라서.
- **2026-10-04 — 영양제는 '부족'일 때만** — 조금 부족(권장섭취량 근처)은 음식으로 채울 수 있는 정도라 영양제를 권하지 않는다(프로브: 부족분 0.05mg 에 B 복합제 권유). 칼륨(신장 질환·혈압약 위험)·식이섬유·단백질은 늘 음식으로만, 나트륨은 줄이자는 말만.
- **2026-10-04 — 조언 대상은 "열량을 채워 봐도 모자란 것"** — 식단 기록은 끼니·간식이 빠지기 쉬워 그대로 보면 거의 모든 영양소가 부족해 보인다. 두 끼 이상 기록한 날만 평균하고, 기록 열량을 필요추정량만큼(최대 2배) 채운 셈으로도 모자랄 때만 조언한다. 정보 있는 열량이 60% 미만인 영양소는 판단을 미룬다. [unknown-vs-zero](../concepts/unknown-vs-zero.md) — 음료·주류는 "0 으로 안다", 정보 없는 과일·채소는 "모른다".
- **2026-10-04 — 성별·나이를 모르면 남녀 중 낮은 기준** — 필요량은 낮은 쪽이라 부족을 과하게 말하지 않고, 상한도 낮은 쪽이라 과다는 더 조심한다. 화면이 "성별·출생연도를 설정하면 더 정확해요(지금은 30-49세 성인 기준)"라고 밝힌다. 12세 미만은 판단하지 않는다.
- **2026-10-04 — 기본 모델 kimi-k3, 지연보다 구체성** — 가끔 보는 리포트라 끼니 추천(gpt-oss:120b 유지)과 달리 사주(C)처럼 kimi 를 기본으로 했다. `probe:meal-nutrition` 결과 kimi-k3 5/5·p50 12.9s·바꾼 칸 0, gpt-oss:120b 5/5·4.3s 지만 '~합니다'체·나열식 → kimi 유지. 어드민 '추론'은 kimi 계열에만 반영되고 사주(C)와 같은 배수로 출력 예산·타임아웃을 키운다.
- **2026-10-04 — 같은 날·같은 점검이면 저장본, 한도는 새로 받을 때만** — `inputHash` 가 프롬프트 버전·기간·분석 전체를 담아 기록·선호·카탈로그가 바뀌면 자연히 새로 만든다. fallback 은 재사용하지 않아 LLM 이 돌아오면 다시 시도된다. 일일 한도(기본 10)가 비용 방어선, 분당 5 는 연타 억제. [versioned-llm-prompts](../concepts/versioned-llm-prompts.md).
- **2026-10-04 — 한 끼 후보는 흔한 한 끼에서, 짜고 무거운 것·원자료 오류는 빼고** — 1인분 양으로만 세면 짬뽕·불고기전골·족발처럼 양 많고 짠 음식이 위로 와서 100kcal 당 양으로 줄 세운다. 나트륨이 이미 많은 사람에겐 국물 요리를 빼고 800mg 로 낮춰 "국물을 줄이세요"와 모순되지 않게 했다. 1인분이 하루 상한을 넘는 값(초밥 니아신 150mg)은 원자료 오류로 본다.
- **2026-10-04 — 같은 대표식품 묶음은 "이름이 같은 층"부터 영양소별로** — 묶음 첫 행 값만 쓰면 측정 안 한 0 을 부족으로 오판하고, 묶음 전체에서 고르면 다른 음식의 값이 샌다. 영양소마다 tier 0 → 나머지 순으로 0 보다 큰 첫 값.
- **2026-10-04 — 점검하지 않은 영양소는 말하지 않는다** — 데이터에 없는 마그네슘·아연·오메가-3 등과 흔한 건강기능식품(유산균·루테인·밀크씨슬·콜라겐…)은 기록 근거 없이 권하게 되므로 화면에는 목록만, 모델 문장에서는 `offlist` 로 막는다.
- **2026-10-04 — LLM 호출도 식단 쓰기 장벽 안에서** — 끼니 추천과 같은 방식. 전체 삭제와 엇갈려 지운 기록의 분석이 다시 저장되는 경합을 막는 대가로, 조언을 쓰는 동안 그 사용자의 다른 식단 쓰기는 기다린다.
- **영양 점검·영양제 조언을 [meal](meal.md) 에서 떼어 별도 토픽으로**(위키 28차 사용자 결정) — 기준표·판정·LLM 검사·카탈로그 영양소 데이터가 한 묶음이라 meal(기록·인식·추천·통계)과 수명주기가 다르다.

## Gotchas [coverage: high — 15 sources]

- **운영 배포는 마이그레이션 + 카탈로그 백필 두 단계.** `20261004060205_add_meal_nutrition` 뒤 `load:food-catalog --source=nutrition --backfill-nutrition` 을 돌려야 `nutrientsPer100gJson` 이 찬다. 안 돌리면 오류 없이 모든 영양소가 coverage 0 → `unknown`(판단 보류)만 보인다. `.env` 는 새 값 없이도 기본(kimi-k3·한도 10)으로 동작한다([.env.example](../../apps/friendly/.env.example)). 재적재는 **빈 행만** 채우므로 열 매핑을 고친 뒤엔 `--refresh-nutrition`.
- **원재료 DB(15100065) 행에는 비타민·무기질이 없다.** [food-raw-import.ts](../../apps/friendly/src/modules/food/food-raw-import.ts)는 열량만 시드하고, PLAN 기록상 원재료 API 는 활용신청 미등록(403)이다. 과일·채소(`mfds-raw` 의 과일류·채소류·버섯류·해조류) 기록이 하나라도 있으면 식이섬유·칼륨·비타민 A·비타민 C 는 조언에서 빠지고 notes 로 밝힌다 — 활용신청·적재 확장이 남은 일.
- **먹은 g 는 저장 스냅샷 kcal ÷ 현재 카탈로그 100g당 열량이다.** 카탈로그 `kcalPer100g`·1인분 규칙을 바꾸고 `backfill:meal-nutrition --refresh` 를 안 돌리면 과거 항목의 g 환산이 어긋난다. `kcal === null` 항목은 영양소·열량 합 모두에서 빠진다.
- **분석일 판정은 entry 수다.** 같은 날 두 번 이상 기록(간식 포함)해야 그날이 평균에 들어간다. 한 끼에 음식 여러 개를 적어도 entry 하나면 그날은 빠진다.
- **나이는 연도 차로 계산한다.** `profileFrom` 은 `today 의 연도 - birthYear` 라 생일 전에는 만 나이보다 1 크다(kdri.ts 주석은 "연령은 만 나이"). 구간 경계(14→15, 49→50 등)에서 한 구간 위 기준이 적용될 수 있다.
- **LLM 이 없어도 한도는 차감된다.** `consumeQuota` 가 `resolveProvider` 보다 먼저라, provider 가 없거나 실패해 fallback 이 나와도 1회가 빠지고, fallback 은 재사용되지 않아 다시 누를 때마다 또 차감된다.
- **조언 생성 중엔 그 사용자의 식단 쓰기가 기다린다.** `mealMutationBarrier` 안에서 LLM 을 최대 90초(추론 켜면 최대 180초) 기다린다. 끼니 추천과 같은 구조라 기록 저장·사진·선호 변경이 그 뒤에 줄을 선다.
- **`GET /meals/nutrition` 은 매번 카탈로그를 훑는다.** 모자란 영양소가 있으면 `foodSuggestions` 가 활성 + 영양소 있는 카탈로그 전체를 읽고 1인분을 계산한다(어휘만 10분 캐시, 결과 캐시 없음). 분당 30 레이트와 shared staleTime 60초가 백스톱.
- **영양제 칸이 비어 있는 건 정상이다.** `supplementTip` 은 영양제 영양소이면서 `low` 일 때만 있다. borderline 이나 단백질·식이섬유·칼륨이면 모델이 무엇을 써도 null — 화면에 "영양제로" 줄이 없다.
- **`done` 인데 `model` 이 null 이면 계산만으로 끝난 것이다.** 조언할 영양소가 없을 때(모델 미호출). 웹 출처 라벨이 "계산 결과" 로 구분한다. `insufficient` 도 모델·한도 없이 저장된다.
- **옛 조언은 조용히 사라질 수 있다.** 계약(`MealNutritionAnalysis`)이 바뀌면 `toAdvice` 가 저장 스냅샷 재검증에 실패해 null — `GET advice` 가 `advice:null` 을 준다. `promptVersion` 을 올리면 같은 날 저장본도 캐시 miss 가 된다.
- **니아신·비타민 A 는 음식으로 "많음" 이 안 뜬다.** `foodUpperLimit:false` — 상한이 보충제·레티놀 기준이라서. 상한 값은 영양제 조언 문장에만 쓰인다.
- **`days` 를 바꾸면 최근 조언과 점검 기간이 다를 수 있다.** 조언 카드는 마지막 저장본(`advice.analysis.days` 기준)을 그대로 보이고, 새 기간으로 받으려면 버튼을 다시 눌러야 한다.
- **화면 육안 확인이 남았다.** 커밋 검증은 RTL 테스트(웹 [MealPage.test.tsx](../../apps/web/src/routes/meal/MealPage.test.tsx))와 dev 계정 실제 경로(kimi-k3 10.3s 로 생성·저장, 같은 날 재요청은 저장본)뿐 — 이 환경 브라우저가 dev 서버에 닿지 않아 웹·앱 화면은 미확인이다.
- **남은 것**(PLAN 기록): 원재료 DB 활용신청(과일·채소 비타민) · 점검 결과를 끼니 추천 점수에 반영(③) · 앱 실기기·웹 육안 확인.

## Sources [coverage: high — 53 sources]

- [apps/friendly/src/modules/meal-nutrition/kdri.ts](../../apps/friendly/src/modules/meal-nutrition/kdri.ts) — 2020 KDRI 요약표·필요추정량·연령 구간(183줄)
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition.defs.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.defs.ts) — `NUTRIENT_DEFS` 12·`NOT_MEASURED_NUTRIENTS`·면책(194줄)
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition.service.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.service.ts) — `analyzeMealNutrition`·`assessNutrient`·`foodSuggestions`(557줄)
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition-advice.service.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition-advice.service.ts) — 저장본·한도·LLM·`sanitizeAdvice`(604줄)
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition.prompts.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.prompts.ts) — v1 시스템·사용자 프롬프트·JSON schema(141줄)
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition.route.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.route.ts) — GET 2·POST 1(99줄)
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition.test.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.test.ts) — 28건(순수 함수 + 격리 DB 서비스·라우트)
- [apps/friendly/prisma/migrations/20261004060205_add_meal_nutrition/migration.sql](../../apps/friendly/prisma/migrations/20261004060205_add_meal_nutrition/migration.sql)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `MealNutritionAdvice`·`FoodItem.nutrientsPer100gJson`·`MealPreference.sex·birthYear`·`LlmProviderConfig.thinking` 주석
- [packages/api-contract/src/schemas/meal.ts](../../packages/api-contract/src/schemas/meal.ts) — 영양 절·`MealSex`
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Meal.nutrition`·`nutritionAdvice`
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts) — purpose `meal-supplement`
- [packages/api-contract/src/schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts) — feature `meal-nutrition-advice`
- [packages/utils/src/mealNutrients.ts](../../packages/utils/src/mealNutrients.ts) (+[test](../../packages/utils/src/mealNutrients.test.ts)) — 라벨·포맷·막대·성별·출생연도
- [packages/utils/src/aiModel.ts](../../packages/utils/src/aiModel.ts) — `ModelPurpose`·`recommendModelForPurpose`·`thinkOptionFor`·`thinkTokenMult`
- [packages/shared/src/api/meal.api.ts](../../packages/shared/src/api/meal.api.ts) (+[test](../../packages/shared/src/api/meal.api.test.ts))
- [packages/shared/src/hooks/useMeal.ts](../../packages/shared/src/hooks/useMeal.ts) — 훅 3개·`['meal','nutrition']` 무효화
- [apps/friendly/src/modules/food/food-nutrients.ts](../../apps/friendly/src/modules/food/food-nutrients.ts) — 13키·열 매핑·`pickNutrientsPer100g`
- [apps/friendly/src/modules/food/food-nutrition.service.ts](../../apps/friendly/src/modules/food/food-nutrition.service.ts) — donor 복사·`backfillBorrowedNutrients`
- [apps/friendly/src/modules/food/food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts) — `nutrientVariants`·`looseHeader`·빈 행만 채움
- [apps/friendly/src/modules/food/food-curated-seeds.ts](../../apps/friendly/src/modules/food/food-curated-seeds.ts) — `CURATED_NUTRIENTS_LIKE`
- [apps/friendly/src/modules/food/food-serving.ts](../../apps/friendly/src/modules/food/food-serving.ts) — `kcalPer100gOf`·`mealServingNutrition`
- [apps/friendly/src/modules/food/food-raw-import.ts](../../apps/friendly/src/modules/food/food-raw-import.ts) — 원재료 행은 열량만
- [apps/friendly/src/modules/food/engine/index.ts](../../apps/friendly/src/modules/food/engine/index.ts) — `loadLexicon`
- [apps/friendly/src/modules/meal-recommendation/common-meals.ts](../../apps/friendly/src/modules/meal-recommendation/common-meals.ts) — `commonMealNorms`
- [apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts) — 알레르기·제외·탐색 적격·`shiftDate`
- [apps/friendly/src/modules/meal/meal-preference.service.ts](../../apps/friendly/src/modules/meal/meal-preference.service.ts) — `sex`·`birthYear` 읽기·쓰기
- [apps/friendly/src/modules/meal/meal-data.service.ts](../../apps/friendly/src/modules/meal/meal-data.service.ts) — 전체 삭제 `nutritionAdvices`·복원 `sex/birthYear`
- [apps/friendly/src/modules/meal/meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts) — purpose `'supplement'`
- [apps/friendly/src/modules/meal/meal-mutation-barrier.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.ts)
- [apps/friendly/src/modules/ai/ai.config.service.ts](../../apps/friendly/src/modules/ai/ai.config.service.ts) — `getResolved`(계정 키 상속·env 기본 모델)
- [apps/friendly/src/modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts)
- [apps/friendly/src/modules/ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts) — `MAX_ENTRIES` 16
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `OLLAMA_MEAL_SUPPLEMENT_MODEL`·`MEAL_SUPPLEMENT_DAILY_LIMIT`
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE.mealNutrition` 30·`mealSupplement` 5
- [apps/friendly/scripts/probe-meal-nutrition.ts](../../apps/friendly/scripts/probe-meal-nutrition.ts) — 모델 비교 프로브(226줄)
- [apps/friendly/scripts/load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts) — `--backfill-nutrition` 이 빌린 행 영양소도
- [apps/friendly/scripts/backfill-meal-nutrition.ts](../../apps/friendly/scripts/backfill-meal-nutrition.ts) — 항목 스냅샷(점검의 g 환산 기준)
- [apps/friendly/package.json](../../apps/friendly/package.json) — `probe:meal-nutrition`
- [apps/web/src/routes/meal/MealNutritionTab.tsx](../../apps/web/src/routes/meal/MealNutritionTab.tsx) — 점검·조언 카드, `lg` 두 단
- [apps/web/src/routes/meal/MealPage.tsx](../../apps/web/src/routes/meal/MealPage.tsx) — 탭 `nutrition`·좁은 화면 탭바
- [apps/web/src/routes/meal/MealPage.test.tsx](../../apps/web/src/routes/meal/MealPage.test.tsx) — 영양 탭 RTL
- [apps/web/src/routes/meal/MealPreferenceTab.tsx](../../apps/web/src/routes/meal/MealPreferenceTab.tsx) — 성별·출생연도
- [apps/web/src/routes/admin/AdminAiKeysPage.tsx](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) — `PURPOSE_META['meal-supplement']`
- [apps/web/src/routes/admin/AdminLogsPage.tsx](../../apps/web/src/routes/admin/AdminLogsPage.tsx) — feature 라벨
- [apps/mobile/src/components/meal/MealNutritionView.tsx](../../apps/mobile/src/components/meal/MealNutritionView.tsx) — 앱 영양 탭(287줄)
- [apps/mobile/app/meal/index.tsx](../../apps/mobile/app/meal/index.tsx) — 탭 `nutrition`
- [apps/mobile/src/components/meal/MealPreferenceView.tsx](../../apps/mobile/src/components/meal/MealPreferenceView.tsx) — 성별·출생연도
- [apps/mobile/src/components/meal/MealDataManagementCard.tsx](../../apps/mobile/src/components/meal/MealDataManagementCard.tsx) — 전체 삭제 문구에 영양제 조언
- [docs/PLAN-meal.md](../../docs/PLAN-meal.md) — purpose `meal-supplement` 절·2026-10-04 진행 기록(운영 배포·남은 것)
- [docs/api/endpoints.md](../../docs/api/endpoints.md) — meal 절 3행(자동 생성)
- [docs/data-sources.md](../../docs/data-sources.md) — 15100070·15100065 배포본
