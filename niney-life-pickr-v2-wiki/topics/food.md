---
topic: food
last_compiled: 2026-08-30
sources_count: 46
status: active
aliases: [음식, 음식카탈로그, food-catalog, FoodItem, food-import, 음식적재, food-classify, 음식분류, nutrition, 영양정보, allergen, 알레르기, source-observation, merge-conflict, reverse-restaurant, 파는곳, recognition-quality, 인식품질, evidence-first-sort, 근거-우선-정렬, foodRestaurantEvidenceScore, food-catalog-status, status:food-catalog, deploy-case-7, 배포-자동-적재, food_catalog_data, stat_val, load-food-catalog, DEFAULT_FILES, data/open/food, mfds-nutrition.csv, hansik-800.xlsx, FOOD_API_KEY, 등록되지-않은-서비스키, backfill-meal-nutrition]
---

# food — 음식 카탈로그·출처 감사·식당 역검색

**2026-08-22~24 변경 흡수 — 역검색 정렬 근거 우선(`0906df3`)·배포 자동 적재 케이스 7(`dae1cc9`)·영양성분 API 선택화(`edb7f44`)·로더 기본 경로(`809b7e0`)**: (1) `GET /api/v1/food/:id/restaurants` 의 정렬이 바뀌었다 — [food.service.ts](../../apps/friendly/src/modules/food/food.service.ts)의 `foodRestaurantEvidenceScore`(`menu_catalog` 2 + `review_mentions` 1)가 좌표 유무와 무관하게 1차 키다. 좌표가 있으면 근거 등급 → 거리 → 언급 수 → 평점, 없으면 근거 등급 → 언급 수 → 평점 → 리뷰 수(이전엔 좌표 있을 때 거리 우선, 없을 때 `evidence.length`). 현재 판매를 보장할 수 없는 역검색에서 가까운 리뷰 한 건보다 메뉴판+리뷰가 함께 확인된 식당을 먼저 보이기 위해서다. [food.route.test.ts](../../apps/friendly/src/modules/food/food.route.test.ts)에 사용자 좌표 0m 의 리뷰 전용 fixture(`restaurant-review-only`)를 더해 회귀를 잡는다(10건). 계약은 주석만, 응답 형식·DB 무변경. 소비처(앱 판매처 바텀시트)는 [meal](meal.md). (2) 배포 — [food-catalog-status.ts](../../apps/friendly/scripts/food-catalog-status.ts)(`status:food-catalog`)가 `ok items=N classified=C nutrition=U meals=M` 한 줄(테이블 없음 P2021 이면 `missing`)을 내고, [deploy.sh](../../deploy.sh)의 `food_catalog_data [force]` 가 API 배포 케이스 1·2·4 마다 점검한다: 테이블 없음 → skip(마이그레이션 뒤), 상태 해석 실패 → skip("0 종"으로 넘겨짚어 LLM 분류 전량 재실행을 돌지 않게), `items=0` 이고 배포본(`data/open/food/mfds-nutrition.csv` 또는 `hansik-800.xlsx`)이 있으면 `load:food-catalog --classify --backfill-nutrition` + `backfill:meal-nutrition`(기존 식단 항목의 빈 영양 스냅샷 채움, 기존 값 보존). 케이스 7 이 강제 재적재. `stat_val` 은 bash 정규식 — sed `\b` 가 GNU 확장이라 BSD sed 에서 빈 값이 되던 것(일상지도 적재와 같은 골격, [life-map](life-map.md)). 카탈로그가 비면 오류 없이 자동완성·영양·추천 후보가 조용히 반쪽이 되므로 배포 후 종수를 확인한다([deploy-friendly.md](../../docs/deploy-friendly.md)). (3) 문서·env — `FOOD_API_KEY`(data.go.kr 15100070)는 **선택**이고 배포본 CSV 가 기본(같은 데이터, 쿼터 0). 비우면 `BUS_API_KEY` 폴백인데 data.go.kr 는 데이터셋마다 활용신청이 따로라 미신청 키는 `30 등록되지 않은 서비스키`(키가 틀린 게 아님)([.env.example](../../apps/friendly/.env.example)·[data-sources.md](../../docs/data-sources.md)). (4) [load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts) — `--file` 없이도 `DEFAULT_FILES`(`data/open/food/mfds-nutrition.csv`·`hansik-800.xlsx`)를 cwd → 리포 루트 순으로 찾아(`findDataFile`), 인자 없는 `load:food-catalog` 가 파일 2개 + 레시피 API + 외식 어휘 **전체 재적재**가 됐다. `--source=all` 에 800선도 자동 포함(이전엔 `--file` 있을 때만), nutrition 은 파일 우선 → 없으면 API. 원본은 리포에 안 넣는다(`data/open/` .gitignore).

**2026-08-22~24 신설·확장**: [meal](meal.md)의 검색·인식 교정·영양·알레르기 근거·추천 후보를 받치는 마스터 데이터 도메인이다. 여러 공공/내부 source를 하나의 정규화 카탈로그로 합치되, 필드별 관측값과 충돌을 보존해 대표값의 출처와 운영 결정을 추적한다.

## Purpose [coverage: high — 11 sources]

- 음식 이름·별칭을 검색하고 사진 인식 결과를 `FoodItem`에 exact/alias/fuzzy 단계로 연결한다.
- 조리 형태 19종, 주재료 13종, 요리 계통 7종, 재료·1인분 영양·알레르기 슬롯·출처를 한 카탈로그에 모은다.
- 식약처 영양 표준데이터, 식품안전나라·농림 레시피, global menu canonical, 수동 자료를 주기 적재한다.
- 같은 음식에 서로 다른 source 값이 들어오면 값을 조용히 잃지 않고 field-level observation과 검토 가능한 conflict를 남긴다.
- 음식에서 역으로 메뉴·리뷰 근거가 있는 식당을 찾는다. 이는 현재 판매 보장이 아니라 수집된 evidence 검색이다.
- 어드민은 카탈로그·영양 coverage·source observation/conflict·적재·사진 인식 품질을 함께 운영한다.

## Architecture [coverage: high — 19 sources]

| 구성 | 책임 |
|---|---|
| `food.ts` 계약 + `Routes.Food` | taxonomy, 검색, allergen/evidence, observation/conflict, import·SSE DTO의 Zod SSOT |
| `FoodService` | 활성 음식 검색, exact/alias/fuzzy match, 음식→식당 역검색, 어드민 CRUD·통계 |
| `FoodImportService` | source fetch → normalize → batch fold → `nameNorm` merge/upsert → observation/conflict 기록 → 선택적 classify |
| `food-source-audit.ts` | 문자열/배열/숫자 canonical JSON, field-level source observation 수집·동일 증거 dedupe |
| `FoodMergeConflictService` | open queue, optimistic baseline 확인, keep/accept/dismiss, accept 뒤 다른 대안 rebase |
| `food-api.adapter.ts` | 외부 API pagination과 응답 형태 정규화; 비밀 키는 friendly 안에서만 사용 |
| `foodImportRegistry` + `scheduleRegistry` | 단일 in-flight, phase/stat, cron timer, SSE subscriber의 process singleton |
| `FoodClassifyService` | 미분류/구버전 행을 chat LLM으로 세 축 분류하고 enum 재검증 |
| `FoodNutritionService` | 영양이 빈 일반 음식에 좁은 donor를 골라 추정값과 `nutritionFrom` 기록 |
| `food-allergen.ts` | 공개 재료 문자열만으로 19종을 결정적으로 추론하고 `unknown|inferred|verified` 상태·근거를 직렬화; 운영자 검수 보존 백필 |
| `FoodRecognitionQualityService` | recognition lineage와 최종 meal item을 비교한 confidence/version별 aggregate |
| `AdminFoodPage` | 검색·필터·수정, nutrition/allergen coverage와 검수, observation/conflict 해결, import와 인식 품질 UI |
| `food-catalog-status.ts` + `deploy.sh` `food_catalog_data` | 배포 시 카탈로그 종수 점검 → 비어 있으면 배포본 첫 적재(+LLM 분류·영양 보강·식단 스냅샷 채움), 케이스 7 강제 재적재(2026-08-23) |

적재 기본값은 매월 1일 04:00 `Asia/Seoul`이며 `mfds-nutrition`, `mfds-recipe`, `mafra-recipe`, `menu-canonical`을 쓴다. 부팅 시 과거 `running`을 `interrupted`로 닫고 cron을 다시 등록한다. 겹친 실행은 `skipped` 이력만 남긴다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)).

import는 같은 batch의 동일 `nameNorm` seed를 먼저 접되 원본 seed를 audit용으로 유지한다. 대표 행의 빈 필드를 채운 뒤에도 각 source의 비어 있지 않은 단일값이 대표값과 다르면 conflict를 만든다. alias·popularity처럼 자동 합산하는 값도 observation에는 남지만 conflict 대상은 아니다.

## Talks To [coverage: high — 14 sources]

- **식약처 전국통합식품영양성분정보(15100070)** — 기본은 배포본 `data/open/food/mfds-nutrition.csv`(쿼터 0), API 는 파일이 없을 때만 `FOOD_API_KEY || BUS_API_KEY`(2026-08-23 부터 선택); 100g 값을 `servingG` 기준 1인분으로 환산한다.
- **식품안전나라 `COOKRCP01`** — `FOOD_RECIPE_API_KEY`; 대표명·분류·재료를 보강한다.
- **농림수산식품교육문화정보원 레시피** — `MAFRA_API_KEY`; 기본/재료 API를 합쳐 주재료·요리 계통을 보강한다.
- **global menu canonical** — 서로 다른 식당 2곳 이상에서 관측된 비노이즈 메뉴를 적재하고, `GlobalMenuCanonicalLink → MenuCanonical → Restaurant/CanonicalRestaurant`를 역검색 주 연결축으로 쓴다.
- **리뷰 `MenuMention`** — 같은 exact canonical/name evidence의 언급 수·sentiment를 식당 결과에 합친다.
- **[meal](meal.md)** — 인식명이 카탈로그에 연결되고 분류·영양 provenance·allergen evidence를 기록 시점 snapshot으로 가져간다. 추천도 같은 근거를 best-effort로 소비한다.
- **AI chat provider** — 구버전 분류만 갱신한다. provider가 없으면 source 적재는 성공하고 분류만 경고로 건너뛴다([versioned-llm-prompts](../concepts/versioned-llm-prompts.md)).
- **operation-log / SSE** — import 단계는 범용 로그에 남고 어드민 EventSource는 `?token=` ADMIN JWT로 snapshot/progress/done을 받는다([sse-token-auth](../concepts/sse-token-auth.md)).

## API Surface [coverage: high — 11 sources]

사용자 두 API도 로그인 필요하고 나머지는 `ADMIN` 전용이다.

| 메서드 | 경로 | 권한·역할 |
|---|---|---|
| `GET` | `/api/v1/food/search?q=&limit=` | USER+, 활성 카탈로그 자동완성(최대 20) |
| `GET` | `/api/v1/food/:id/restaurants` | USER+, menu/review exact evidence 역검색; 좌표는 쌍으로 입력 |
| `GET` / `POST` | `/api/v1/admin/food/items` | ADMIN 검색·source·taxonomy·nutrition·allergen status 필터 목록 / 수기 등록 |
| `PATCH` | `/api/v1/admin/food/items/:id` | ADMIN 대표값·별칭·taxonomy·재료·알레르기 검수·영양·활성 상태 수정 |
| `GET` | `/api/v1/admin/food/stats` | ADMIN total/active/classified, source/taxonomy, direct/estimated/missing 영양, unknown/inferred/verified 알레르기, observation/open conflict 수 |
| `GET` | `/api/v1/admin/food/merge-conflicts` | ADMIN open/resolved conflict와 최근 field observation 조회 |
| `PATCH` | `/api/v1/admin/food/merge-conflicts/:id` | ADMIN `keep_existing|accept_incoming|dismiss` 해결 |
| `GET` | `/api/v1/admin/food/recognition-quality?days=&model=&version=&confidenceBucket=` | ADMIN lineage 기반 교정·confidence 품질 aggregate; `confidenceBucket=low\|medium\|high` 필터(서버·어드민 UI 가 같은 enum, 2026-08-30 누락 보충) |
| `GET` / `PUT` | `/api/v1/admin/food/import` | ADMIN 적재 설정·다음 실행 조회 / cron·source·classify 저장 |
| `POST` / `GET` | `/api/v1/admin/food/import/run`, `/runs`, `/preview` | 수동 실행·이력·cron preview |
| `GET` | `/api/v1/admin/food/import/run-events?token=` | ADMIN snapshot/progress/done SSE + heartbeat |

역검색은 좌표가 있으면 `radiusM` 안의 canonical 식당을 **근거 등급(메뉴판+리뷰 > 메뉴판 > 리뷰) → 거리 → 언급 → 평점** 순으로, 없으면 근거 등급 → 언급 → 평점 → 리뷰 수 순으로 최대 30개 반환한다(2026-08-24 부터 좌표가 있어도 근거가 거리보다 먼저). 모든 응답에 “현재 판매 여부를 보장하지 않는다”는 고정 notice가 포함된다.

## Data [coverage: high — 11 sources]

| 모델 | 핵심 필드 |
|---|---|
| `FoodItem` | unique `nameNorm`, 이름/별칭, 3축 taxonomy, ingredients, allergen/evidence JSON + `allergenStatus`, serving/영양, `nutritionFrom`, 대표 source/id/category, sourceRefs, popularity, active, classify model/version |
| `FoodSourceObservation` | food, field, canonical `valueJson`, source/sourceId, observedAt. 대표값 선택과 무관하게 원천 근거 보존 |
| `FoodMergeConflict` | existing/incoming JSON, source/sourceId, `open|kept_existing|accepted_incoming|dismissed`, resolution actor/time |
| `FoodImportConfig` | `jobType='food-import'` 1행, enabled/cron/timezone, sources/classify, last run/status |
| `FoodImportRun` | trigger, running/done/failed/skipped/interrupted, source별 counts/errors, classifiedCount, 시간 |

`FoodSource`는 `mfds-nutrition|mfds-recipe|mafra-recipe|hansik-800|menu-canonical|manual`이다. 대표 source는 최초 출처를 유지하고 이후 출처는 `sourceRefsJson` 합집합으로 누적한다.

관측값은 whitespace를 정리하고 배열을 trim·dedupe·sort하며 유한 숫자를 6자리로 반올림한 canonical JSON이다. 동일 food/source/sourceId/field/value observation을 중복 생성하지 않는다. conflict도 representative/incoming 쌍을 dedupe해 같은 월간 입력이 open 항목을 반복 생성하지 않는다.

영양 coverage는 값 유무와 `nutritionFrom`을 기준으로 direct/estimated/missing을 구분한다. 알레르기는 `unknown`(판정 근거 없음), `inferred`(공개 재료 문자열 규칙), `verified`(운영자 검수)를 구분한다. 자동 import/backfill은 verified를 덮지 않으며 빈 allergen 배열만으로 안전을 뜻하지 않는다.

## Key Decisions [coverage: high — 21 sources]

- **2026-08-24 — 역검색은 근거 신뢰도가 거리보다 먼저** — 판매를 보장 못 하는 결과에서 "가깝다"는 신호가 "확인됐다"를 이기면 안 된다. `foodRestaurantEvidenceScore`(메뉴판 2 + 리뷰 1)를 1차 키로, 같은 등급 안에서만 거리·언급·평점. 계약·DB 는 그대로고 정렬 의미만 바뀌었다.
- **2026-08-23 — 배포가 카탈로그 공백을 자동 복구하되, 상태를 못 읽으면 건드리지 않는다** — 빈 카탈로그는 에러가 없어 알아채기 어렵다. `status:food-catalog` 한 줄 ↔ `deploy.sh` `stat_val` 파서의 계약으로 일상지도 적재와 동형. 오판 비용(LLM 분류 전량 재실행)이 크므로 해석 실패·테이블 없음은 skip 하고 `items=0` 일 때만 첫 적재, 강제는 케이스 7 로 분리.
- **2026-08-22/23 — 소스는 파일 우선, API 는 대안** — 배포본 CSV/XLSX 가 API 와 같은 데이터인데 쿼터를 쓰고 데이터셋별 활용신청 함정(`30`)까지 있다. 로더가 표준 경로(`data/open/food/`)를 알아 인자 없는 전체 재적재가 가능하고, `FOOD_API_KEY` 는 선택으로 내렸다.
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

## Gotchas [coverage: high — 18 sources]

- **역검색 정렬이 바뀌어 "가장 가까운 식당" 이 1등이 아닐 수 있다.** 리뷰만 있는 0m 식당보다 메뉴판+리뷰 근거의 먼 식당이 위(2026-08-24). 앱 시트 문구("근거 신뢰도와 거리 순")가 이 순서를 설명한다.
- **`status:food-catalog` 출력 형식은 `deploy.sh` 와의 계약이다.** `ok items=N classified=C nutrition=U meals=M` 첫 토큰·키 이름을 바꾸면 배포가 `missing`/skip 으로 빠진다. `classified` 는 3축 모두 채워진 활성 행만 센다.
- **케이스 7 강제 재적재는 `--classify` 로 LLM 분류를 다시 돈다.** chat 모델이 없으면 조용히 건너뛰므로 분류 수가 그대로면 어드민 AI 설정을 먼저 확인. 배포본이 `data/open/food/` 에 없으면 첫 적재도 케이스 7 도 안내만 하고 끝난다(서버마다 손으로 올린다 — 리포 밖). 외식 어휘는 그 서버의 식당·리뷰에서 나와 종수가 서버마다 다르다(정상).
- **외부 키 이름이 source별로 다르다.** 영양은 `FOOD_API_KEY`가 없으면 `BUS_API_KEY`, 레시피는 `FOOD_RECIPE_API_KEY`, `MAFRA_API_KEY`다. 누락은 해당 source error이지 부팅 실패가 아니다. 영양은 배포본 CSV 가 있으면 키가 아예 필요 없고, 폴백 `BUS_API_KEY` 는 15100070 활용신청이 없으면 `30 등록되지 않은 서비스키`로 실패한다(키 오류 아님).
- **`hansik-800`은 자동 API source가 아니다.** 월간 cron 의 기본 source 목록에는 없고 CLI 적재 전용이다 — 단 2026-08-22 부터 `load-food-catalog.ts` 가 표준 경로 `data/open/food/hansik-800.xlsx` 를 알아 `--file` 없이도 `--source=all` 에 포함된다.
- **JSON `contains`는 후보 축소일 뿐이다.** alias/sourceRefs는 SQLite JSON 문자열이므로 LIKE 후보 뒤 서버가 파싱·정확 비교한다.
- **observation이 많다고 conflict는 아니다.** alias/popularity 합산이나 canonical 값이 같은 여러 출처도 observation은 남지만 open conflict가 되지 않는다.
- **conflict resolution은 current representative에 조건부다.** 목록을 연 뒤 누군가 대표값을 바꾸면 keep/accept가 409다. 최신 conflict/observation을 다시 읽어야 한다.
- **accept가 다른 대안을 자동 승인하지 않는다.** 동일 incoming 중복만 닫고 다른 incoming은 새 baseline과 비교할 open 검토로 남는다.
- **allergen `unknown`은 무알레르겐이 아니다.** `inferred`의 빈 목록도 공개 재료에서 알려진 항목을 못 찾았다는 뜻뿐이며 숨은 재료·미표기·교차접촉을 보장하지 않는다. 음식명 keyword는 추론 근거로 쓰지 않는다.
- **강제 영양 새로고침은 명시 옵션이다.** 일반 import는 채워진 영양을 보존하고 `refreshNutrition`만 direct source로 다시 쓰며 추정 표시를 지운다.
- **import registry는 process memory다.** 다중 Fastify 인스턴스에서 보장되지 않는 것은 **cron 단일성**(인스턴스마다 타이머가 돈다)이다. in-flight 단일성은 `foodImportRegistry.isActive() || (await this.hasActiveRun())`(DB 의 `running` run 조회)이 함께 막아 대체로 보장되고, 두 인스턴스가 같은 순간 시작하는 짧은 경합 창만 남는다(2026-08-30 뉘앙스 정정).
- **SSE 완료 뒤 DB query를 다시 읽어야 한다.** live event는 진행 snapshot이며 최종 목록·통계는 invalidate 후 재조회한다.
- **역검색 0건은 음식 404와 다르다.** food가 있지만 exact evidence가 없으면 notice+빈 배열이 정상이고 좌표 한쪽만 보내면 400이다.
- **인식 품질 version 필터가 있다.** model/version으로 비교할 수 있고, 손상된 schema/JSON만 제외한다. 정상 과거 prompt version을 임의로 버리지 않는다.
- **confidence 교정은 lineage 경계를 지킨다.** 다른 bucket의 manual/lineage 항목을 단순 순서 pairing해 추가·삭제로 오판하지 않는다.
- **meal의 `foodId`는 FK가 아니다.** 카탈로그 수정·비활성화가 과거 영양 snapshot을 자동 재계산하지 않는다.

## Sources [coverage: high — 46 sources]

- [packages/api-contract/src/schemas/food.ts](../../packages/api-contract/src/schemas/food.ts)
- [packages/api-contract/src/schemas/allergen.ts](../../packages/api-contract/src/schemas/allergen.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Food`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — Food·source audit 모델과 canonical/menu/review 관계
- [apps/friendly/prisma/migrations/20260822105913_add_food_catalog/migration.sql](../../apps/friendly/prisma/migrations/20260822105913_add_food_catalog/migration.sql)
- [apps/friendly/prisma/migrations/20260822150205_add_food_nutrition_from/migration.sql](../../apps/friendly/prisma/migrations/20260822150205_add_food_nutrition_from/migration.sql)
- [apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql](../../apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql)
- [apps/friendly/prisma/migrations/20260824040000_food_allergen_evidence_status/migration.sql](../../apps/friendly/prisma/migrations/20260824040000_food_allergen_evidence_status/migration.sql)
- [apps/friendly/src/modules/food/food.service.ts](../../apps/friendly/src/modules/food/food.service.ts)
- [apps/friendly/src/modules/food/food.route.ts](../../apps/friendly/src/modules/food/food.route.ts)
- [apps/friendly/src/modules/food/food.route.test.ts](../../apps/friendly/src/modules/food/food.route.test.ts)
- [apps/friendly/src/modules/food/food-api.adapter.ts](../../apps/friendly/src/modules/food/food-api.adapter.ts)
- [apps/friendly/src/modules/food/food-api.adapter.test.ts](../../apps/friendly/src/modules/food/food-api.adapter.test.ts)
- [apps/friendly/src/modules/food/food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts)
- [apps/friendly/src/modules/food/food-import.service.test.ts](../../apps/friendly/src/modules/food/food-import.service.test.ts)
- [apps/friendly/src/modules/food/food-allergen.ts](../../apps/friendly/src/modules/food/food-allergen.ts) (+[test](../../apps/friendly/src/modules/food/food-allergen.test.ts))
- [apps/friendly/src/modules/food/food-source-audit.ts](../../apps/friendly/src/modules/food/food-source-audit.ts)
- [apps/friendly/src/modules/food/food-merge-conflict.service.ts](../../apps/friendly/src/modules/food/food-merge-conflict.service.ts) (+[test](../../apps/friendly/src/modules/food/food-merge-conflict.test.ts))
- [apps/friendly/src/modules/food/food-import-registry.ts](../../apps/friendly/src/modules/food/food-import-registry.ts)
- [apps/friendly/src/modules/food/food-classify.service.ts](../../apps/friendly/src/modules/food/food-classify.service.ts)
- [apps/friendly/src/modules/food/food.prompts.ts](../../apps/friendly/src/modules/food/food.prompts.ts)
- [apps/friendly/src/modules/food/food-nutrition.service.ts](../../apps/friendly/src/modules/food/food-nutrition.service.ts)
- [apps/friendly/src/modules/food/food-nutrition.test.ts](../../apps/friendly/src/modules/food/food-nutrition.test.ts)
- [apps/friendly/src/modules/food/food-recognition-quality.service.ts](../../apps/friendly/src/modules/food/food-recognition-quality.service.ts)
- [apps/friendly/src/modules/food/food-recognition-quality.route.test.ts](../../apps/friendly/src/modules/food/food-recognition-quality.route.test.ts)
- [apps/friendly/src/plugins/food-import.ts](../../apps/friendly/src/plugins/food-import.ts)
- [apps/friendly/scripts/load-food-catalog.ts](../../apps/friendly/scripts/load-food-catalog.ts)
- [apps/friendly/scripts/backfill-food-allergens.ts](../../apps/friendly/scripts/backfill-food-allergens.ts)
- [apps/friendly/scripts/food-catalog-status.ts](../../apps/friendly/scripts/food-catalog-status.ts)
- [apps/friendly/scripts/probe-food-api.ts](../../apps/friendly/scripts/probe-food-api.ts)
- [apps/friendly/scripts/backfill-meal-nutrition.ts](../../apps/friendly/scripts/backfill-meal-nutrition.ts) — *배포 적재 뒤 기존 식단 항목 영양 스냅샷 채움*
- [apps/friendly/package.json](../../apps/friendly/package.json) — *load:food-catalog · status:food-catalog · backfill:* · probe:food-api*
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — *FOOD_API_KEY 선택·활용신청 함정 주석(edb7f44)*
- [deploy.sh](../../deploy.sh) — *food_catalog_data(케이스 1·2·4 자동 점검) + 케이스 7(dae1cc9)*
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — *음식 카탈로그 적재 절차*
- [docs/data-sources.md](../../docs/data-sources.md) — *원본 출처·보관 위치(data/open/food)·적재 명령*
- [packages/shared/src/api/food.api.ts](../../packages/shared/src/api/food.api.ts) (+[test](../../packages/shared/src/api/food.api.test.ts))
- [packages/shared/src/hooks/useFood.ts](../../packages/shared/src/hooks/useFood.ts)
- [apps/web/src/routes/admin/AdminFoodPage.tsx](../../apps/web/src/routes/admin/AdminFoodPage.tsx) (+[test](../../apps/web/src/routes/admin/AdminFoodPage.test.tsx))
- [apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts)
