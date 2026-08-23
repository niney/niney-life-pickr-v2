---
topic: food
last_compiled: 2026-08-23
sources_count: 28
status: active
aliases: [음식, 음식카탈로그, food-catalog, FoodItem, food-import, 음식적재, food-classify, 음식분류, nutrition, 영양정보, reverse-restaurant, 파는곳, recognition-quality, 인식품질]
---

# food — 음식 카탈로그·적재·식당 역검색

**2026-08-22~23 신설**: [meal](meal.md)의 자동완성·사진 인식 교정·영양 스냅샷·추천 후보를 받치는 마스터 데이터 도메인이다. 공공 데이터와 기존 메뉴 분석 결과를 하나의 정규화 카탈로그로 합치고, 사용자에게는 음식 검색과 "이 음식을 파는 곳" 근거 검색을, 어드민에게는 편집·적재·분류·인식 품질 운영면을 제공한다.

## Purpose [coverage: high — 9 sources]

- 음식 이름·별칭을 안정적으로 검색하고 사진 인식 결과를 `FoodItem`에 연결한다.
- 조리 형태 19종, 주재료 13종, 요리 계통 7종과 재료·1인분 영양·출처를 한 카탈로그에 모은다. meal 기록은 이 값을 스냅샷으로 가져가므로 카탈로그 갱신이 과거 기록을 바꾸지 않는다.
- 식약처 영양 표준데이터, 식품안전나라 레시피, 농림축산식품 레시피, 기존 global menu canonical을 주기 적재하고, 수동 한식 800선/어드민 입력도 같은 카탈로그로 합친다.
- 음식에서 역으로 수집된 메뉴·리뷰 근거가 있는 식당을 찾는다. 이는 실시간 판매 확인 API가 아니라 보유 데이터의 evidence 검색이다.
- 어드민이 카탈로그 공백/분류 상태/출처를 관리하고, 사진 인식 원본과 사용자의 최종 교정을 집계해 prompt·카탈로그 품질을 개선하게 한다.

## Architecture [coverage: high — 15 sources]

| 구성 | 책임 |
|---|---|
| `food.ts` 계약 + `Routes.Food` | taxonomy enum, 사용자/어드민 DTO, import 상태·SSE, 고정 notice의 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md) 경계 |
| `FoodService` | 활성 음식 자동완성, exact/alias/fuzzy 카탈로그 match, 음식→식당 역검색, 어드민 CRUD·통계 |
| `FoodImportService` | source fetch → normalize → `nameNorm` merge/upsert → 선택적 LLM classify 파이프라인, 설정·이력 |
| `food-api.adapter.ts` | 공공 API 페이지네이션·응답 형태 정규화. 비밀 키는 friendly 안에서만 사용 |
| `foodImportRegistry` + `scheduleRegistry` | 단일 in-flight, live phase/stat, cron timer, SSE subscriber를 프로세스 singleton으로 유지 |
| `FoodClassifyService` | 미분류/구버전 행을 40개 chunk로 chat LLM 분류하고 enum으로 재검증 |
| `FoodNutritionService` | 영양이 빈 일반 음식에 좁은 이름 계열 donor 중앙값을 backfill하고 추정 출처 표시 |
| `FoodRecognitionQualityService` | 저장된 recognition snapshot과 최종 meal item을 비교해 어드민 aggregate 생성 |
| `AdminFoodPage` | 카탈로그 목록·등록/수정·통계·적재 설정/수동 실행/SSE 진행·7/30/90일 인식 품질 |

적재 기본값은 매월 1일 04:00 `Asia/Seoul`, 기본 source는 `mfds-nutrition`, `mfds-recipe`, `mafra-recipe`, `menu-canonical`이다. 서버 부팅 시 이전 `running` run은 `interrupted`로 닫고 설정된 cron을 다시 등록한다. 겹친 실행은 새 작업을 하지 않고 `skipped` 이력만 남긴다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)).

## Talks To [coverage: high — 12 sources]

- **식약처 전국통합식품영양성분정보** — `FOOD_API_KEY || BUS_API_KEY`; 100g 값을 `servingG` 기준 1인분으로 환산한다.
- **식품안전나라 `COOKRCP01`** — `FOOD_RECIPE_API_KEY`; 대표명·레시피 분류·재료 문자열을 보강한다.
- **농림수산식품교육문화정보원 레시피** — `MAFRA_API_KEY`; 기본/재료 API를 합쳐 주재료·요리 계통을 보강한다.
- **global menu canonical** — 최소 2개 서로 다른 식당에서 관측된 비노이즈 메뉴만 `menu-canonical` source로 적재한다. `GlobalMenuCanonicalLink → MenuCanonical → Restaurant/CanonicalRestaurant`는 식당 역검색의 주 연결축이다.
- **리뷰 `MenuMention`** — canonical 메뉴와 같은 `nameNorm` 언급 수·sentiment를 식당 evidence에 합친다. 원본 mention이 정리되어도 집계된 canonical 연결을 통해 근거를 유지할 수 있다.
- **[meal](meal.md)** — `MealRecognitionService`가 인식명에 카탈로그 match를 붙이고, `MealService`가 분류·영양을 확정 시점 스냅샷으로 저장한다. 추천은 카탈로그의 인기/재료/분류와 식당 역검색을 소비한다.
- **AI chat provider** — `FOOD_CLASSIFY_VERSION=1` 미만 행을 분류한다. provider가 없으면 source 적재는 성공하고 분류만 경고와 함께 건너뛴다([versioned-llm-prompts](../concepts/versioned-llm-prompts.md)).
- **operation-log / SSE** — 적재 run 단계는 범용 로그에 기록되고 어드민 EventSource에는 snapshot/progress/done을 보낸다. SSE는 header를 못 보내므로 `?token=` ADMIN JWT를 쓴다([sse-token-auth](../concepts/sse-token-auth.md)).

## API Surface [coverage: high — 8 sources]

사용자 두 API도 로그인 필요하고 나머지는 `ADMIN` 전용이다.

| 메서드 | 경로 | 권한·역할 |
|---|---|---|
| `GET` | `/api/v1/food/search?q=&limit=` | USER+, 활성 카탈로그 자동완성(최대 20) |
| `GET` | `/api/v1/food/:id/restaurants` | USER+, 메뉴/리뷰 근거 식당 역검색. `lat`/`lng`는 둘 다 있거나 둘 다 없음 |
| `GET` / `POST` | `/api/v1/admin/food/items` | ADMIN 목록/필터/페이지 / 수기 등록 |
| `PATCH` | `/api/v1/admin/food/items/:id` | ADMIN 이름·별칭·taxonomy·영양·활성 상태 수정 |
| `GET` | `/api/v1/admin/food/stats` | ADMIN 총/활성/분류 완료/출처·dishType 분포 |
| `GET` | `/api/v1/admin/food/recognition-quality?days=1..365` | ADMIN 사진 인식 교정 aggregate |
| `GET` / `PUT` | `/api/v1/admin/food/import` | ADMIN 적재 설정·다음 실행 조회 / cron·source·classify 저장 |
| `POST` | `/api/v1/admin/food/import/run` | ADMIN 지금 실행; 회차 source/classify override 가능 |
| `GET` | `/api/v1/admin/food/import/runs` | ADMIN 최근 50개 이력 + in-flight run id |
| `POST` | `/api/v1/admin/food/import/preview` | ADMIN cron/timezone 검증과 다음 시각 미리보기 |
| `GET` | `/api/v1/admin/food/import/run-events?token=` | ADMIN snapshot/progress/done SSE + 15초 heartbeat |

역검색은 좌표가 있으면 기본 5km(100m~50km) 안의 canonical 식당을 거리순으로, 없으면 evidence·언급·평점·리뷰 수 중심으로 최대 30개 반환한다. 결과마다 `menu_catalog`/`review_mentions`, 매칭 메뉴명, 언급 수, 긍정 비율을 내리고 "현재 판매 여부를 보장하지 않는다"는 고정 notice를 반드시 포함한다.

## Data [coverage: high — 8 sources]

| 모델 | 핵심 필드 |
|---|---|
| `FoodItem` | unique `nameNorm`, 대표명, 표시/정규화 별칭 JSON, 3축 taxonomy, 재료, serving/영양, `nutritionFrom`, 대표 source/id/category, 병합 sourceRefs, popularity, active, classify model/version |
| `FoodImportConfig` | `jobType='food-import'` 1행, enabled/cron/timezone, source JSON, classify, last run/status |
| `FoodImportRun` | trigger, running/done/failed/skipped/interrupted, source별 fetched/inserted/updated/skipped/error JSON, classifiedCount, 시간 |

`FoodSource`는 `mfds-nutrition|mfds-recipe|mafra-recipe|hansik-800|menu-canonical|manual`이다. 한 행의 대표 source는 최초 생성 출처를 유지하고, 이후 합쳐진 출처는 `sourceRefsJson`에 `{source,sourceId}`로 누적한다.

taxonomy는 `FoodDishType` 19종, `FoodMainIngredient` 13종, `FoodCuisine` 7종이다. SQLite에는 문자열로 저장하지만 허용 집합은 api-contract enum이 진실이며 friendly 테스트가 `@repo/utils` 라벨 키와 순서를 맞춘다.

역검색은 별도 결과 테이블을 만들지 않는다. `FoodItem.source/sourceRefs`의 `menu-canonical` id로 global canonical을 우선 찾고, stale/미존재면 음식 `nameNorm`과 alias를 **정확 일치**시켜 실시간 조인한다. canonical 식당으로 fan-out한 뒤 placeId 단위로 dedupe한다.

## Key Decisions [coverage: high — 14 sources]

- **`nameNorm` 하나가 병합 식별자** — 소문자·공백·기호 제거 정규화명이 같으면 같은 행으로 접는다. 신규 source는 기존의 빈 필드만 채우고 별칭/sourceRefs는 합집합, popularity는 max를 취한다. 대표 source와 이미 채워진 수동/고품질 값은 덮어쓰지 않는다.
- **검색과 기록 매칭의 정확도 단계 분리** — 자동완성은 exact → prefix → contains → alias 후 popularity로 정렬한다. 인식/수동 이름 연결은 exact name → exact alias → 제한된 최대 300개 fuzzy(bigram Jaccard/포함 비율, 임계 0.5)까지 허용하고 `matchedBy/score`를 남긴다.
- **식당 역검색에는 fuzzy 금지** — 비슷한 음식명을 잘못된 식당에 붙이는 비용이 커서 source id와 exact name/alias만 쓴다. 결과가 적은 것을 오탐보다 낫다고 본다.
- **관측과 판매를 구분** — menu catalog와 review mention은 과거 수집 evidence일 뿐 재고/현재 메뉴가 아니다. 응답 타입에 literal notice를 넣어 모든 클라이언트가 경고를 빠뜨리지 못하게 한다.
- **source 실패 격리** — 한 공공 API 키가 없거나 source가 실패해도 다른 source를 계속 처리한다. 모든 source가 실패한 경우만 run 전체를 failed로 닫는다.
- **menu canonical 노이즈 게이트** — 서로 다른 식당 2곳 미만, 음료/옵션/세트 문구 등 노이즈 후보는 적재하지 않는다. 분류 뒤에도 taxonomy를 얻지 못한 canonical 노이즈는 비활성화할 수 있다.
- **버전 분류는 비용을 기억** — LLM이 일부 축을 생략해도 current `classifyVersion/model`을 기록해 다음 월 실행에서 같은 행을 무한 재요청하지 않는다. 기존 구체적인 dishType은 보존하고 비어 있거나 일반적인 축을 보완한다.
- **영양 backfill은 좁고 설명 가능하게** — 영양이 빈 일반 음식만, 동일 suffix 계열·제외 category·최대 40 donor 조건으로 후보를 제한하고 kcal 중앙값에 가까운 donor를 고른다. `nutritionFrom`으로 "○○ 기준 추정"을 표시한다.
- **품질 집계의 k=2 경계** — 저장된 strict recognition snapshot과 최종 항목을 비교해 confirmed/corrected/deleted/manual-added/unmatched를 센다. top 교정/미매칭은 서로 다른 사용자 2명 이상이 기여한 항목만 노출하고, memo·photo·entry id는 조회하지 않으며 `userId`도 집계 직후 폐기한다.

## Gotchas [coverage: high — 12 sources]

- **외부 키 이름이 source별로 다르다.** 영양은 `FOOD_API_KEY`가 없으면 `BUS_API_KEY`를 공유하고, 식품안전나라/농림 API는 각각 `FOOD_RECIPE_API_KEY`, `MAFRA_API_KEY`다. 누락은 해당 source stat의 error이지 서버 부팅 실패가 아니다.
- **`hansik-800`은 자동 외부 API source가 아니다.** 확보한 XLSX/CSV를 `load-food-catalog.ts`로 수동 적재하는 경로다. 기본 월간 source 목록에도 없다.
- **JSON `contains`는 후보 축소일 뿐 최종 진실이 아니다.** alias/sourceRefs는 SQLite JSON 문자열이라 LIKE 후보 뒤 서버가 파싱·정확 비교한다. 쿼리만 보고 exact 보장으로 착각하면 안 된다.
- **분류 phase 로그는 과거 이름이 남아 있다.** 일부 메시지가 "LLM 2축 분류"라고 쓰지만 실제 계약은 dishType + mainIngredient + cuisine 세 축이다. enum과 저장 필드를 기준으로 이해한다.
- **강제 영양 새로고침은 명시 옵션이다.** 일반 적재는 채워진 영양을 보존한다. `refreshNutrition`은 직접 source 값을 다시 쓰며 기존 `nutritionFrom` 추정 표식을 지운다.
- **적재 registry는 프로세스 메모리다.** 다중 Fastify 인스턴스에서는 cron·in-flight 단일성이 보장되지 않는다. 현 배포의 단일 인스턴스/no-Redis 전제에 의존한다.
- **SSE 완료 뒤 캐시를 다시 읽어야 한다.** live event는 진행 스냅샷이며 최종 카탈로그/통계는 React Query invalidate로 재조회한다. EventSource가 끊겨도 DB run 이력은 남는다.
- **역검색 0건은 음식 미존재와 다르다.** food row가 없으면 404지만, row는 있고 exact canonical 연결/evidence가 없으면 notice와 빈 items가 정상이다. 좌표 한쪽만 보내면 400이다.
- **인식 품질은 기간 안의 여러 version을 함께 센다.** snapshot에 model/version은 남지만 현재 aggregate는 이를 필터·분해하지 않고 `MealEntry.createdAt` 기간만 적용한다. prompt 전후 비교가 필요하면 version 차원을 별도 추가해야 한다. 낮은 표본과 k=2 필터 때문에 top 목록 합계도 전체 집계와 같지 않을 수 있다.
- **meal의 `foodId`는 FK가 아니다.** 카탈로그 행 비활성/재적재/이름 변경 뒤에도 과거 기록은 스냅샷으로 남는다. 카탈로그 수정이 과거 영양 통계를 자동 재계산하지 않는다.

## Sources [coverage: high — 28 sources]

- [packages/api-contract/src/schemas/food.ts](../../packages/api-contract/src/schemas/food.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Food`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `FoodItem`, `FoodImportConfig`, `FoodImportRun`와 canonical/menu/review 관계
- [apps/friendly/prisma/migrations/20260822105913_add_food_catalog/migration.sql](../../apps/friendly/prisma/migrations/20260822105913_add_food_catalog/migration.sql)
- [apps/friendly/prisma/migrations/20260822150205_add_food_nutrition_from/migration.sql](../../apps/friendly/prisma/migrations/20260822150205_add_food_nutrition_from/migration.sql)
- [apps/friendly/src/modules/food/food.service.ts](../../apps/friendly/src/modules/food/food.service.ts)
- [apps/friendly/src/modules/food/food.route.ts](../../apps/friendly/src/modules/food/food.route.ts)
- [apps/friendly/src/modules/food/food.route.test.ts](../../apps/friendly/src/modules/food/food.route.test.ts)
- [apps/friendly/src/modules/food/food-api.adapter.ts](../../apps/friendly/src/modules/food/food-api.adapter.ts)
- [apps/friendly/src/modules/food/food-api.adapter.test.ts](../../apps/friendly/src/modules/food/food-api.adapter.test.ts)
- [apps/friendly/src/modules/food/food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts)
- [apps/friendly/src/modules/food/food-import.service.test.ts](../../apps/friendly/src/modules/food/food-import.service.test.ts)
- [apps/friendly/src/modules/food/food-import-registry.ts](../../apps/friendly/src/modules/food/food-import-registry.ts)
- [apps/friendly/src/modules/food/food-classify.service.ts](../../apps/friendly/src/modules/food/food-classify.service.ts)
- [apps/friendly/src/modules/food/food.prompts.ts](../../apps/friendly/src/modules/food/food.prompts.ts)
- [apps/friendly/src/modules/food/food-nutrition.service.ts](../../apps/friendly/src/modules/food/food-nutrition.service.ts)
- [apps/friendly/src/modules/food/food-nutrition.test.ts](../../apps/friendly/src/modules/food/food-nutrition.test.ts)
- [apps/friendly/src/modules/food/food-recognition-quality.service.ts](../../apps/friendly/src/modules/food/food-recognition-quality.service.ts)
- [apps/friendly/src/modules/food/food-recognition-quality.route.test.ts](../../apps/friendly/src/modules/food/food-recognition-quality.route.test.ts)
- [apps/friendly/src/plugins/food-import.ts](../../apps/friendly/src/plugins/food-import.ts)
- [apps/friendly/scripts/load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts)
- [apps/friendly/scripts/food-catalog-status.ts](../../apps/friendly/scripts/food-catalog-status.ts)
- [apps/friendly/scripts/probe-food-api.ts](../../apps/friendly/scripts/probe-food-api.ts)
- [packages/shared/src/api/food.api.ts](../../packages/shared/src/api/food.api.ts) (+[test](../../packages/shared/src/api/food.api.test.ts))
- [packages/shared/src/hooks/useFood.ts](../../packages/shared/src/hooks/useFood.ts)
- [apps/web/src/routes/admin/AdminFoodPage.tsx](../../apps/web/src/routes/admin/AdminFoodPage.tsx) (+[test](../../apps/web/src/routes/admin/AdminFoodPage.test.tsx))
- [apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts)
