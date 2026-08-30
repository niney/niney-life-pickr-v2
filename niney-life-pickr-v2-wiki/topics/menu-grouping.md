---
topic: menu-grouping
last_compiled: 2026-08-30
sources_count: 21
status: active
aliases: [메뉴 정규화, 메뉴 그룹핑, menu-grouping, MenuCanonical, menu_canonicals, canonicalName, canonicalNorm, MENU_GROUPING_VERSION, MENU_GROUPING_CHUNK_SIZE, packBySimilarity, jamoBigramDice, toJamo, pickCanonicalName, callChunkWithSplit, callIndexGroups, groupingJobRegistry, grouping-jobs, restaurant_menu_groups, restaurant_menus, replaceRestaurantMenuGroups, mergeMenuGroups, menusGroup, menusRanking, MenuRankingResult, restaurantsStatus, buildLlmProviderEnv]
---

# menu-grouping — 식당 단위 메뉴 표기 LLM 정규화(canonical 그룹) + 원본 메뉴 그룹 영속

**2026-08-22 변경 흡수 — 라우트 env 조립 `buildLlmProviderEnv()`(`cc8399a`); `MENU_GROUPING_VERSION = 2` 현재값 확인**: [menu-grouping.route.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts) 가 자체 `LlmProviderEnv` 리터럴 대신 [`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 로 `AiConfigService` 를 조립하고(스케줄러 경로의 인스턴스는 [plugins/schedule.ts](../../apps/friendly/src/plugins/schedule.ts) 가 같은 함수로), [menu-grouping.test.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.test.ts) 의 가짜 `defaultModels` 는 5키(`meal-photo`·`meal-recommend`). 현재값 정합: `MENU_GROUPING_VERSION` 은 v2 분할·머지 재설계(`5dd2db8` 2026-06-13) 이후 **2** 그대로 — ai 토픽의 옛 표가 1 로 적혀 있던 것은 24차에서 정정됐다. 같은 날 다른 JSON 호출들이 `@repo/utils` `thinkOptionForModel` 로 사고를 끄도록 바뀌었지만(`5cdbc0f`) 이 모듈은 **미적용** — `callIndexGroups` 의 자체 분기(`model.includes('gpt-oss') ? { think: 'low' } : {}`)만 있어 다른 추론 모델엔 `think` 를 안 보낸다(아래 Gotchas).

**2026-06-27 추가 — 원본(source) 메뉴 그룹 크롤·영속 계층**: 아래 canonical 그룹핑이 *리뷰 멘션*(`MenuMention.nameNorm`)을 LLM 으로 묶는 **분석 계층**이라면, 이번에 추가된 `restaurant_menu_groups`/`restaurant_menus` 는 크롤 시점 **공식 메뉴판**을 원본 그룹/정렬/출처째로 보존하는 **인입 계층**이다(둘은 별개 테이블·별개 목적·서로 GROUP BY 로 안 엮인다). 네이버 `/menu/list` 서브페이지에서 그룹 단위로 긁은 결과([crawl](crawl.md) 의 `extractBaeminMenuGroups`)를 `RestaurantService.replaceRestaurantMenuGroups` 가 source 단위로 재적재하고, 공개 detail 은 `mergeMenuGroups` 로 노출한다. 기존 flat `menus`·`snapshotJson`·`MenuCanonical` 은 불변 — 순수 가산.

## Purpose [coverage: high — 13 sources]

식당별로 흩어진 메뉴 표기 변형을 LLM 으로 canonical 그룹에 묶어, 그 위에서 메뉴 단위 순위/긍부정 통계를 낼 수 있게 하는 도메인. 한 식당 안에 `김치찌개`, `김치 찌개`, `묵은지김치찌개` 같은 표기가 섞여 있으면 사람 눈엔 같은 메뉴지만, `MenuMention.nameNorm` 단위로만 집계하면 같은 음식이 셋으로 쪼개져 mention 통계가 망가진다. 이 모듈이 그 갭을 메운다 — `MenuCanonical` 테이블에 `(restaurantId, nameNorm) → canonicalName` 매핑을 보관하고, 순위 응답에서 그 키로 GROUP BY 한다. 매핑이 없는 행은 자기 자신을 그룹키로 쓰는 fallback 으로 자연 처리되므로 그룹핑 미실행 식당도 깨지지 않는다.

운영자가 직접 트리거하는 수동 도메인이다. 분석(요약) 파이프라인이 끝나도 자동으로 안 돌고, 관리자 페이지의 정규화 화면에서 단일 식당 동기 호출 또는 batch 잡으로 명시 실행한다. 비용 통제 + 예측 가능성이 자동 트리거보다 더 중요하다고 본 결정. 글로벌 비교 위젯은 `analytics` 토픽이 만든 `GlobalMenuCanonicalLink` 를 소비해서 sibling 식당의 멘션을 합산한다 — 이 모듈은 그 링크의 소비자이지 생산자가 아니다.

**v2(2026-06) 분할·머지 재설계**: v1 은 "입력 전 항목을 에코"하는 출력 계약(O(N) 출력)이었는데, 이 출력이 reasoning 모델의 thinking 토큰과 `maxTokens` 예산을 나눠 쓰다가 큰 식당에서 응답이 잘려 `parse_failed` 운영 장애를 냈다. v2 는 출력을 "병합 그룹만, 인덱스 배열로"(`{"groups":[[0,1,2]]}`) 축소해 호출당 출력을 식당 크기와 무관한 수십 토큰으로 고정하고, canonical 이름 결정은 LLM 에서 코드로 옮겼다. 아키텍처 제안서는 [docs/menu-grouping-split-merge.html](../../docs/menu-grouping-split-merge.html)(보존 문서). 관련 컨셉 [versioned-llm-prompts](../concepts/versioned-llm-prompts.md).

## Architecture [coverage: high — 9 sources]

코어는 `MenuGroupingService` 한 클래스. 두 개의 진입점이 있다.

1. **단일 식당 동기**: `restaurant.route.ts` 의 `POST /menus/group/:placeId` — 응답까지 블로킹. 관리자 화면에서 한 식당씩 누를 때.
2. **batch**: `menu-grouping.route.ts` 의 `POST /admin/analytics/grouping-jobs` (placeIds 배열) → 백그라운드 + SSE `item`/`done` event. 한 화면에서 여러 식당을 한꺼번에 돌릴 때.

batch 측은 `groupingJobRegistry` (in-memory, actorId 격리, item 단위 startedAt/finishedAt + state) 가 진행 상황을 들고 있고, FINISHED_TTL_MS=10분 GC 로 자동 청소된다. SSE 라우트는 토큰 query param 인증(EventSource 가 헤더 못 보냄) — [sse-token-auth](../concepts/sse-token-auth.md) 패턴.

**v2 파이프라인** (`doGroupForRestaurant`): 한 식당의 distinct `nameNorm` + 그 norm 의 가장 빈도 높은 원문 표기를 variant 로 모은 뒤, 다음 4단계로 묶는다.

1. **유사도 패킹 분할** — `packBySimilarity(variants, chunkSize)` 가 비슷한 표기를 같은 청크에 모은다(자모 bigram Dice). 청크 size 상한 `MENU_GROUPING_CHUNK_SIZE=30`.
2. **1단계: 청크 내 그룹핑(LLM, 병렬)** — 각 청크를 `callChunkWithSplit` 로 호출. 출력은 인덱스-그룹 배열 `{"groups":[[i,j],…]}`. 병렬 호출이고 실동시성은 어댑터 게이트가 조절. 실패 청크는 이분할 재시도 1단계, 그래도 실패면 그 항목들이 singleton 으로 머지 라운드에 진입(실패가 "포기"에서 "문맥 약화"로 강등).
3. **2단계: 대표 머지(LLM)** — `currentGroups()` 의 각 그룹 대표(`pickCanonicalName`)를 모아 `packBySimilarity(reps, MENU_GROUPING_MERGE_CHUNK_SIZE=60)` 로 재판정. 청크가 갈라놓은 쌍을 그룹 대표끼리 다시 묶는다. 대표가 한 콜에 다 들어가면 전수 비교 = one-shot 동등 커버리지. 최대 `MAX_MERGE_ROUNDS=2` 라운드, 단일 콜이거나 병합 0건이면 fixpoint 로 즉시 종료.
4. **union-find 확정** — 1단계+머지의 모든 병합이 한 `parent` Map 에 모이고 전이적으로 합쳐진다(a~b, b~c ⇒ a~c). canonical 은 `pickCanonicalName` 으로 코드가 결정.

이 설계로 v1 의 "같은 청크 안에서만 묶인다" 제약이 사라졌다 — 청크가 분리한 쌍을 대표 머지가 회복하므로 유사도 패킹 임계값이 그룹핑 recall 을 깎지 않는다(게이트가 아니라 배치 휴리스틱).

Key files:
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts) -- `groupForRestaurant`(계측 래퍼) / `doGroupForRestaurant`(본문) / `callChunkWithSplit` / `callIndexGroups` / `getRanking` / `getRestaurantsStatus`. `pickCanonicalName` export. `summary.service` 의 `normalizeTerm` / `extractFirstJsonObject` 재사용.
- [apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts) -- 시스템 프롬프트(인덱스-그룹 계약) + few-shot 3개 + `MENU_GROUPING_VERSION=2` + `MENU_GROUPING_JSON_SCHEMA`(groups: integer 배열의 배열) + `MENU_GROUPING_CHUNK_SIZE=30` / `MENU_GROUPING_MERGE_CHUNK_SIZE=60` + `buildGroupingUserPrompt`.
- [apps/friendly/src/modules/menu-grouping/menu-grouping.similarity.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.similarity.ts) -- **(신규)** `toJamo` / `jamoBigramDice` / `packBySimilarity`. 한글 음절을 초·중·종성 자모로 분해 후 bigram Dice. 유사 블록 union-find → maxChunk 크기로 결정적 패킹.
- [apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts) -- admin batch + SSE. `runJob` 가 placeId 한 개씩 순차 처리, `groupForRestaurant({ jobId, trigger: 'manual' })` 로 OperationRun 연계.
- [apps/friendly/src/modules/menu-grouping/grouping-job-registry.ts](../../apps/friendly/src/modules/menu-grouping/grouping-job-registry.ts) -- in-memory job registry, item 단위 진행, AbortController 한 개로 cancel, TTL GC.
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) -- `Routes.Restaurant.menusGroup/menusRanking` 단일 식당 라우트.

### 원본 메뉴 그룹 영속 (crawl → DB → 공개 detail) [2026-06-27]

위 canonical 그룹핑과 **독립된 계층**. LLM 을 안 쓰고, 크롤이 뽑은 원본 메뉴 그룹을 그대로 저장·병합·표시한다.

- **적재 — `RestaurantService.replaceRestaurantMenuGroups(restaurantId, groups)`** ([restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)) — `upsertRestaurantFromCrawl` 이 `data.menuGroups` 가 있을 때만 호출. `$transaction` 안에서 **source 단위로** `restaurant_menus` → `restaurant_menu_groups` 를 delete 후, 그룹·메뉴를 `$executeRaw` 로 재삽입(그룹 id `rmg_<uuid>`, 메뉴 id `rm_<uuid>`, `rawJson` 에 원본 JSON, `isRepresentative = menu.recommend === true`). Prisma 모델이 아니라 raw SQL 을 쓰는 건 마이그레이션 미적용 로컬 DB 방어 — 호출 전체가 `.catch(console.warn)` 로 감싸여 테이블이 없어도 크롤/upsert 는 계속된다(best-effort, 순수 가산).
- **병합 — `mergeMenuGroups(naverSnap, dcSnap, tbSnap)`** ([restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts)) — 공개 detail(`RestaurantPublicDetail`)의 `menuGroups` 필드. naver 스냅샷에 실제 `menuGroups` 가 있으면 그대로, 없으면 `mergeMenus` 로 합친 flat 을 **단일 그룹으로 래핑**(source 는 naver/tabling/diningcode/merged 중 실제 채운 출처, name `'메뉴'`, 각 메뉴에 sortOrder 부여). 즉 그룹 있는 네이버는 원본 그룹, 없으면 1그룹 fallback.
- **평탄화 — `flattenMenuGroups`** — flat `menus` 자체는 크롤 시점에 [crawl](crawl.md) 어댑터(`naver-place.playwright.adapter.ts`)가 이미 평탄화('대표메뉴' 중복 제거 + `sourceMenuId ?? name|price` dedup)해 `snapshotJson` 에 넣으므로, 이 영속 계층은 그룹 원본만 따로 보존한다(함수는 서비스가 아니라 어댑터 소유).
- **표시(웹)** — [MenuTab.tsx](../../apps/web/src/components/restaurant/detail/MenuTab.tsx) 는 `menuGroups`(메뉴 있는 그룹만) 가 있으면 그룹 섹션별로 렌더(헤더 `총 N개 · M개 그룹`, 그룹마다 개수), 없으면 기존 flat 그리드. [HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx) 미리보기는 `'대표메뉴'` 그룹이 있으면 그 메뉴를 우선 노출. 상세 UI 는 [web](web.md).

### 모델 호출 파라미터 (v2)

`callIndexGroups` 가 `provider.complete` 를 부를 때: `TEMPERATURE=1.0`(v1 의 0.1 은 reasoning 반복 루프로 토큰을 태우는 보조 원인이었다), `MAX_TOKENS=2000`(출력이 수십 토큰뿐이라 나머지는 reasoning 여유분 — thinking 토큰도 `num_predict` 에 합산된다), `NUM_CTX=8192`, `format: MENU_GROUPING_JSON_SCHEMA`, 그리고 모델명에 `gpt-oss` 가 들어가면 `think: 'low'`(thinking 을 못 끄고 기본 medium 이라 low 로 줄여 토큰 예산을 지킨다; 다른 모델은 think 미지원일 수 있어 미전달).

## Talks To [coverage: high — 8 sources]

- **ai** (in-process: `AiConfigService.getResolved('ollama-cloud', 'chat')` + `adapterCache`) -- LLM provider/model 해석. 미설정이면 `MenuGroupingError('no_provider')` 던지고 라우트가 422 로 변환. `AiConfigService` 는 라우트·schedule 플러그인 모두 `buildLlmProviderEnv()`(2026-08-22)로 조립.
- **crawl → 원본 메뉴 그룹** (DB write via RestaurantService) -- **(신규/2026-06-27, 원본 메뉴 그룹 계층 한정)** [crawl](crawl.md) 어댑터가 `/menu/list` 에서 `extractBaeminMenuGroups` 로 뽑은 `MenuGroup[]` 이 `restaurant_menu_groups`/`restaurant_menus` 적재의 입력. canonical(멘션) 그룹핑과는 무관 — 같은 도메인 이름을 쓰지만 데이터 경로가 다름.
- **web → `RestaurantPublicDetail.menuGroups`** (HTTP read) -- **(신규/2026-06-27, 원본 메뉴 그룹 계층 한정)** MenuTab/HomeTab 이 공개 detail 의 `menuGroups` 를 그룹 섹션·대표메뉴 미리보기로 소비. [web](web.md).
- **summary** (in-process: `normalizeTerm`, `extractFirstJsonObject`) -- canonicalNorm 정규화 규칙을 멘션과 일치시켜야 GROUP BY 키가 맞춰진다.
- **logs** (in-process: `OperationLogService`) -- **(신규/v2)** 식당별 그룹핑 1회 = OperationRun 1개. `startRun`/`log`(stage: load/resolve_provider/plan/chunk/merge/save)/`finishRun`. 미주입이면 계측 없이 기존 흐름 그대로(테스트 호환). 자세한 계측 모델은 [logs](logs.md) 및 [operation-log-instrumentation](../concepts/operation-log-instrumentation.md).
- **restaurant** (HTTP: `/menus/group`, `/menus/ranking`) -- 단일 식당 동기 진입점이 restaurant 라우트 안에 있다 (placeId 기반).
- **analytics → `GlobalMenuCanonicalLink`** (DB read) -- `getRanking` 의 `items[].global` 필드. 글로벌 머지를 돌렸을 때만 채워지고, 안 돌렸으면 null. 이 모듈이 글로벌 링크를 만드는 게 아니라 읽기만 한다. [analytics](analytics.md).
- **prisma / SQLite** (DB: `menu_canonicals` 테이블 소유 + `menu_mentions` 읽기) -- delete + createMany 트랜잭션으로 idempotent 재실행.

## API Surface [coverage: high — 4 sources]

단일 식당 (`restaurant.route.ts`):

- `POST Routes.Restaurant.menusGroup(:placeId)` → `MenuGroupRunResult` (동기 LLM — 청크/머지 콜 수에 비례).
  에러 매핑: `restaurant_not_found` → 404, `no_menus` → 409, `no_provider` → 422.
  결과 객체: `{ ok, placeId, inputCount, groupCount, mappedCount, model, version }`.
- `GET Routes.Restaurant.menusRanking(:placeId)?sort&minMentions` → `MenuRankingResult`.
  `sort`: `mentions`(기본) | `positive` | `negative` | `positiveRatio`. `minMentions` 기본 1.

Batch (`menu-grouping.route.ts`):

- `GET Routes.Analytics.restaurantsStatus` → `{ currentVersion, items: MenuGroupingRestaurantStatus[] }` — 관리자 페이지 메인 테이블. distinct/mapped/unmapped + lastGroupedAt + storedVersion + attentionCount(전체 기준). `currentVersion = MENU_GROUPING_VERSION`(현재 2).
- `POST Routes.Analytics.groupingJobs` body=`{ placeIds: [...] }` → `MenuGroupingJobSnapshot`. 빈 배열 거부 (전체 정규화도 명시 placeIds 로만).
- `GET Routes.Analytics.groupingJob(:id)` → `MenuGroupingJobSnapshot` (재접속 시 현재 진행 상태 polling).
- `GET Routes.Analytics.groupingJobEvents(:id)?token=...` → SSE: `snapshot`, `item`, `done`. 15초 heartbeat.

Zod 계약 ([packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)) 의 핵심 — `MenuRankingItem.global` 은 `{globalKey, displayName, totalMentions, positive, negative, positiveRatio, restaurantCount}` 또는 `null`. `mapped: false` 인 아이템은 정의상 global 도 없다. 스키마 상세는 [api-contract](api-contract.md).

## Data [coverage: high — 5 sources]

`MenuCanonical` ([apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma), [migration](../../apps/friendly/prisma/migrations/20260508142840_add_menu_canonicals/migration.sql)):

```
restaurantId  String  -- FK, onDelete: Cascade
nameNorm      String  -- MenuMention.nameNorm 과 동일 정규화 (소문자+공백/특수문자 제거)
canonicalName String  -- 코드가 고른 대표 표기 (UI 표시) — v2 부터 LLM 이 아니라 pickCanonicalName
canonicalNorm String  -- normalizeTerm(canonicalName) — 통계 GROUP BY 키
version       Int     -- MENU_GROUPING_VERSION (현재 2) — 프롬프트/모델 변경 시 stale 식별
model         String? -- 어느 LLM 모델로 매핑했는지 감사 로그
createdAt     DateTime
@@unique([restaurantId, nameNorm])
@@index([restaurantId, canonicalNorm])
```

`(restaurantId, nameNorm)` 유니크 — 한 식당의 한 nameNorm 은 정확히 한 그룹에만 속한다. `doGroupForRestaurant` 는 `deleteMany` + `createMany` 를 한 트랜잭션 안에서 실행해 idempotent — 다시 돌리면 처음부터 다시 만든다. 저장 시 `canonicalName = canonicalByVariant.get(variant) ?? variant`(매핑 누락 시 자기 자신), `canonicalNorm = normalizeTerm(canonical) || norm`.

`globalLink: GlobalMenuCanonicalLink?` 1:1 관계가 옵셔널 — 글로벌 머지가 돈 식당만 채워진다. 머지/링크는 `analytics` 도메인 책임.

`MenuMention` 은 멘션 한 건마다 한 행 (이 모듈의 입력). `traitsJson` 은 string[] 직렬화 — `getRanking` 이 그룹별 topTraits TOP3 집계할 때 파싱.

### 원본 메뉴 그룹 테이블 (2026-06-27, `MenuCanonical` 과 별개)

크롤 공식 메뉴판 보존용 가산 테이블 2종 ([schema.prisma](../../apps/friendly/prisma/schema.prisma), [migration](../../apps/friendly/prisma/migrations/20260627073000_add_restaurant_source_menus/migration.sql)). `MenuCanonical` 과 무관 — 통계 GROUP BY 에 안 들어간다.

`RestaurantMenuGroup` (`restaurant_menu_groups`):

```
restaurantId  String  -- FK, onDelete: Cascade
source        String  -- 예: 'naver-baemin' (크롤 출처)
sourceGroupId String? -- 원본 그룹 id 또는 Apollo 키 suffix
name          String  -- 그룹명 ('대표메뉴' / '세트 메뉴' 등)
sortOrder     Int     -- 그룹 등장 순서
rawJson       String? -- 원본 그룹 JSON 통째 보존
@@unique([restaurantId, source, sourceGroupId])
@@index([restaurantId, source, sortOrder])
```

`RestaurantMenu` (`restaurant_menus`):

```
restaurantId     String   -- FK, onDelete: Cascade
groupId          String?  -- RestaurantMenuGroup FK, onDelete: Cascade
source           String
sourceMenuId     String?  -- unique 아님(같은 메뉴가 '대표메뉴'+카테고리에 중복 노출 가능)
name             String
price            String?
description      String?
imageUrlsJson    String   -- default '[]'
isRepresentative Boolean  -- menu.recommend === true
sortOrder        Int
rawJson          String?
@@index([restaurantId, source, sortOrder])
@@index([groupId, sortOrder])
@@index([restaurantId, source, sourceMenuId])
```

`replaceRestaurantMenuGroups` 가 source 단위 `deleteMany`(raw) + 재삽입으로 idempotent — 재크롤하면 그 source 그룹을 통째로 다시 만들고 다른 source 는 안 건드린다. 기존 `restaurants.snapshotJson` 과 공개 flat `menus` 는 불변.

## Key Decisions [coverage: high — 14 sources]

- **2026-06-27: 원본 메뉴 그룹은 `MenuCanonical` 과 별개 가산 테이블** -- `restaurant_menu_groups`/`restaurant_menus` 는 공식 메뉴판 원본(그룹/정렬/출처/rawJson) 보존, `MenuCanonical` 은 리뷰 멘션 정규화 — 목적·입력·GROUP BY 가 다르다. 같은 "메뉴 그룹" 이름을 쓰지만 섞으면 안 됨. 기존 snapshotJson·flat menus·MenuCanonical 불변.
- **2026-06-27: 영속은 best-effort raw SQL** -- `replaceRestaurantMenuGroups` 가 Prisma 모델 대신 `$executeRaw` + 호출 전체 `.catch(console.warn)`. 마이그레이션 미적용 DB 에서도 크롤/upsert 를 안 막으려는 방어(스냅샷은 여전히 `menuGroups` 를 들고 있어 손실 아님). drift 위험은 Gotchas.
- **2026-06-27: source 단위 delete 후 재삽입(idempotent)** -- `MenuCanonical` 의 delete+createMany 관용과 동형. 재크롤하면 그 source 그룹을 통째로 다시 만들고 다른 source 는 안 건드림. 그룹→메뉴 순으로 지우고(FK cascade) 그룹→메뉴 순으로 넣는다.
- **2026-06-27: 공개 detail 병합은 naver 그룹 우선, 없으면 flat 1그룹** -- `mergeMenuGroups` 가 네이버 스냅샷의 실제 그룹을 그대로 쓰고, 없으면 merged flat 을 단일 그룹(`name:'메뉴'`)으로 래핑. 그룹 표시 가능한 클라이언트만 `menuGroups` 를 쓰고 나머지는 flat `menus` 로 하위호환.
- **v2(2026-06): 출력 계약 "전 항목 에코" → "병합 그룹만, 인덱스로"** -- v1 의 O(N) 에코 출력이 reasoning 토큰과 `maxTokens` 를 나눠 쓰다 큰 식당에서 잘려 `parse_failed` 운영 장애를 냈다. v2 응답은 `{"groups":[[0,1,2]]}` — 묶을 게 없으면 빈 배열, 묶을 상대 없는 표기는 출력 안 함. 출력이 식당 크기와 무관하게 수십 토큰으로 고정돼 reasoning 과 다퉈도 잘릴 게 없다. `MENU_GROUPING_VERSION` 1→2. [versioned-llm-prompts](../concepts/versioned-llm-prompts.md) 의 인스턴스.
- **v2(2026-06): canonical 결정을 LLM → 코드(`pickCanonicalName`)로** -- LLM 은 membership(어느 표기가 같은 음식인가)만 판정하고, 대표 이름은 코드가 결정적으로 고른다: ① 최단 표기 ② 동률 시 멘션 빈도 최다 ③ 그래도 동률이면 사전순. 머지 라운드가 비교하는 "대표"와 저장되는 canonical 이 같은 규칙이라 일관. 입력에 없는 이름이 canonical 로 저장될 수 없다(LLM 환각 표기 차단). 테스트에서 직접 검증할 수 있게 export.
- **v2(2026-06): 분할 → 청크 내 그룹핑(병렬) → 대표 머지 → union-find** -- v1 의 "같은 청크 안에서만 묶인다" 제약을 대표 머지 라운드로 제거. 청크가 갈라놓은 쌍은 그룹 대표끼리 한 번 더 LLM 에 태워 회복. union 은 단조적이라 라운드를 더 돌아도 과병합 방향으로 안 흐른다. 대표가 한 콜에 다 들어가면 전수 비교 = one-shot 동등.
- **v2(2026-06): 유사도 패킹(`packBySimilarity`)은 게이트가 아니라 휴리스틱** -- 자모 bigram Dice(≥0.45)로 비슷한 표기를 같은 청크에 모아 1단계 병합 기회를 높일 뿐, 묶을지는 전적으로 LLM 판정. 여기서 갈라놓아도 대표 머지가 커버하므로 임계값이 recall 을 깎지 않는다. "공기밥/공깃밥"처럼 받침 한 글자 차이를 음절 bigram 은 놓치지만 자모 bigram 은 잡는다(`toJamo`). 입력 첫 등장 순서 기준이라 같은 입력이면 항상 같은 출력(결정적).
- **v2(2026-06): 청크 size 80 → 30, TEMPERATURE 0.1 → 1.0** -- 작게 잡을수록 호출당 reasoning 부담이 줄어 안정적(분할이 갈라놓은 쌍은 머지가 커버하므로 작게 잡는 비용이 없다). 온도는 gpt-oss 권장 ≈1.0 — v1 의 0.1 이 reasoning 반복 루프를 유발했다.
- **v2(2026-06): 실패 청크 이분할 재시도 + `all_chunks_failed` 승격** -- 청크 콜이 실패하면 `callChunkWithSplit` 가 절반으로 나눠 재시도 1단계. 끝내 실패한 항목은 singleton 으로 머지 라운드 진입(실패의 "포기 → 문맥 약화" 강등). **전** 호출이 실패하면 결과가 전부 identity fallback 이라 비즈니스 결과는 유지하되 OperationRun 만 `all_chunks_failed` 로 승격(`throw` 로 표현 못 하는 "결과는 살았지만 사실상 그룹핑 안 됨" 상태).
- **OperationRun 계측 = `groupForRestaurant` 1회** -- run 경계가 메서드 1회. `finishRun` 은 정확히 한 번(`finished` 플래그 + finally 방어 마감)으로 running 고아 방지. `no_menus` 는 done(skipped) 으로, `no_provider` 는 자동분석 제외 코드로 마감. batch 잡의 registry jobId 를 `OperationRun.jobId` 로 넘겨 어드민 로그에서 같은 잡의 식당별 run 을 묶어 본다.
- **자동 트리거 안 함** -- 분석(요약) 끝나도 그룹핑 안 돈다. 비용 통제 + 예측 가능성. 운영자가 정규화 화면에서 명시 실행. `MENU_GROUPING_VERSION` 변경 시에도 자동 재실행 안 하고, status 응답이 storedVersion 을 같이 내려서 UI 가 "재실행 권장" 배지를 띄운다.
- **delete + createMany idempotent** -- 부분 업데이트 안 한다. 그룹핑은 식당 전체를 다시 본다. 멘션이 추가되면 다시 돌릴 뿐.
- **bestNameByNorm 으로 variant 선택** -- LLM 입력은 nameNorm 자체가 아니라 그 norm 의 가장 빈도 높은 원문 표기. 사용자가 실제로 쓴 표기로 LLM 이 판단하도록 (norm 은 공백 제거된 인공적 키).
- **glob 비교는 식당 단위 N+1** -- `getRanking` 이 targetGlobalIds 모은 뒤 sibling 식당별로 한 쿼리씩 (식당당 1쿼리). 한 globalKey 에 1~10 식당이 일반적이라 OK. raw SQL 단일 쿼리화는 더 빨라야 할 때.
- **batch in-memory only** -- 서버 재시작 시 in-flight 잡 사라짐. LLM 비용은 다시 들지만 결과는 idempotent — 사용자가 재실행 하면 됨. [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md).

## Gotchas [coverage: high — 9 sources]

- **(원본 메뉴 그룹) 마이그레이션 안 되면 조용히 스킵** -- `replaceRestaurantMenuGroups` 가 `.catch(console.warn)` 라 `restaurant_menu_groups`/`restaurant_menus` 테이블이 없으면 영속만 빠지고 크롤은 완료. 그 환경은 두 테이블이 비어 있을 수 있으나 스냅샷의 `menuGroups` 는 여전히 채워져 공개 detail 은 정상. (운영 배포 시 마이그레이션 적용 확인.)
- **(원본 메뉴 그룹) `sourceMenuId` 는 unique 아님** -- 같은 메뉴가 '대표메뉴'와 실제 카테고리에 동시 노출되므로 `restaurant_menus` 에 unique 제약을 안 뒀다(스키마 주석). dedup 은 크롤 어댑터의 `flattenMenuGroups`(flat 용)와 그룹 내 dedup 이 담당.
- **(원본 메뉴 그룹) MenuCanonical 통계와 연결 안 됨** -- `restaurant_menus` 는 표시·재가공용이고, 순위/멘션 GROUP BY 는 여전히 `MenuMention`/`MenuCanonical`. 두 계층을 조인하는 코드는 아직 없음 — 섞지 말 것.
- **canonical 은 코드가 정한다 — LLM 응답의 이름은 무시** -- v2 부터 LLM 의 `groups` 인덱스만 쓴다. `callIndexGroups` 는 범위 밖/비정수/중복 인덱스를 버리고 유효 인덱스 2개 미만 그룹은 무시 — 형식 이탈이 병합 오류로 번지지 않게 방어적으로 좁힌다. 대표 이름을 바꾸려면 프롬프트가 아니라 `pickCanonicalName` 을 고쳐야 한다.
- **순위 정렬 시 null positiveRatio 는 마지막** -- 긍/부 둘 다 0 (전부 neutral) 이면 ratio null. `positiveRatio` 정렬에서 뒤로 밀리고 mentionCount 내림차순으로 동률 처리.
- **traitsJson 파싱 실패는 무시** -- malformed traitsJson 행이 있어도 try/catch 로 그 한 건만 건너뛴다. 통계 수렴이 우선.
- **글로벌 비교 멘션 0 코너 케이스** -- MenuCanonical 에 globalLink 가 있지만 sibling 식당이 멘션 0인 경우. globalField 를 빈 값(`totalMentions: 0`, `positiveRatio: null`) 로 채워서 표시는 한다.
- **단일 식당 동기 호출 블로킹** -- 청크/머지 콜이 LLM 직렬·병렬 혼합이라 식당 규모에 비례해 길어진다. UI 가 spinner 필수.
- **batch cancel 즉시 안 멈춤** -- AbortController 는 큐의 다음 식당부터 skipped 처리. 진행 중이던 LLM 호출은 어댑터 abort 미지원이라 끝까지 기다린다.
- **`MenuGroupingError('no_menus')` 는 batch 에서 skipped 로 분류** -- failed 가 아님. 멘션 없는 식당은 정상 케이스라 잡 전체를 실패시키지 않는다.
- **storedVersion = MIN(version)** -- 한 식당의 매핑 행들 중 가장 옛 버전을 노출. 일부만 옛 버전이어도 "재실행 권장" 트리거. v1 매핑이 남은 식당은 v2 재실행 대상.
- **유사도 블록이 maxChunk 를 넘으면 잘린다** -- 같은 계열 표기가 chunkSize(30)를 초과하면 블록이 maxChunk 단위로 슬라이스된다. 잘린 조각은 대표 머지가 다시 만나게 하므로 결과엔 영향 없지만, 매우 큰 동일 계열 식당에선 머지 라운드 콜이 늘 수 있다.
- **dev.db 잔재로 테스트 입력 카운트 변동** -- analytics 와 공유하던 패턴(analytics 는 2026-08-22 부터 `useIsolatedDatabase()` 로 격리 — [analytics](analytics.md)). menu-grouping 테스트는 여전히 `.env` 의 DB 위에서 placeId prefix(`mg-`)로 격리하고 afterEach 청소, 단언은 절대값 대신 부분 매치/하한 비교. 전량 삭제하는 테스트를 새로 쓰면 격리부터.
- **`think` 는 gpt-oss 에만 보낸다 — `thinkOptionForModel` 미적용** -- `callIndexGroups` 는 모델명에 `gpt-oss` 가 있을 때만 `think: 'low'`, 그 외엔 필드를 아예 안 보낸다. 2026-08-22 실측으로 qwen3.5 계열은 `think` 미지정 시 출력 토큰을 사고에 다 써 content 가 빈 문자열로 온다는 것이 확인됐고 다른 JSON 호출들은 `thinkOptionForModel`(gpt-oss `'low'`/그 외 `false`)로 바뀌었다([ai](ai.md)). chat 기본 모델을 qwen3.5 류로 바꾸면 이 모듈은 `parse_failed` 로 되돌아갈 수 있다 — 그때 같은 헬퍼로 맞출 것.

## Sources [coverage: high — 21 sources]

- [apps/friendly/src/modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) (`buildLlmProviderEnv()` — 라우트·플러그인 env 조립, 2026-08-22)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.similarity.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.similarity.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts) (2026-08-22 — `buildLlmProviderEnv()`)
- [apps/friendly/src/modules/menu-grouping/grouping-job-registry.ts](../../apps/friendly/src/modules/menu-grouping/grouping-job-registry.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.test.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.test.ts) (2026-08-22 — `defaultModels` 5키 픽스처)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.similarity.test.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.similarity.test.ts)
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260508142840_add_menu_canonicals/migration.sql](../../apps/friendly/prisma/migrations/20260508142840_add_menu_canonicals/migration.sql)
- [packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)
- [docs/menu-grouping-split-merge.html](../../docs/menu-grouping-split-merge.html) (아키텍처 제안서, 보존 문서)
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts) (원본 메뉴 그룹 영속 — `replaceRestaurantMenuGroups`)
- [apps/friendly/src/modules/restaurant/restaurant.merge.ts](../../apps/friendly/src/modules/restaurant/restaurant.merge.ts) (`mergeMenuGroups`)
- [apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts) (`extractBaeminMenuGroups`/`flattenMenuGroups`)
- [apps/friendly/prisma/migrations/20260627073000_add_restaurant_source_menus/migration.sql](../../apps/friendly/prisma/migrations/20260627073000_add_restaurant_source_menus/migration.sql)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts) (`MenuGroup`/`MenuGroupItem`)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) (`RestaurantPublicDetail.menuGroups`)
- [apps/web/src/components/restaurant/detail/MenuTab.tsx](../../apps/web/src/components/restaurant/detail/MenuTab.tsx)
- [apps/web/src/components/restaurant/detail/HomeTab.tsx](../../apps/web/src/components/restaurant/detail/HomeTab.tsx)
