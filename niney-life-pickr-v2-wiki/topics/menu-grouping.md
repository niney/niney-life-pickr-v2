---
topic: menu-grouping
type: codebase
last_compiled: 2026-05-09
source_count: 9
status: active
---

# menu-grouping

## Purpose [coverage: high -- 9 sources]

식당별로 흩어진 메뉴 표기 변형을 LLM 한 번 호출로 canonical 그룹에 묶어, 그 위에서 메뉴 단위 순위/긍부정 통계를 낼 수 있게 하는 도메인. 한 식당 안에 `김치찌개`, `김치 찌개`, `묵은지김치찌개` 같은 표기가 섞여 있으면 사람 눈엔 같은 메뉴지만, `MenuMention.nameNorm` 단위로만 집계하면 같은 음식이 셋으로 쪼개져 mention 통계가 망가진다. 이 모듈이 그 갭을 메운다 — `MenuCanonical` 테이블에 `(restaurantId, nameNorm) → canonicalName` 매핑을 보관하고, 순위 응답에서 그 키로 GROUP BY 한다. 매핑이 없는 행은 자기 자신을 그룹키로 쓰는 fallback 으로 자연 처리되므로 그룹핑 미실행 식당도 깨지지 않는다.

운영자가 직접 트리거하는 수동 도메인이다. 분석(요약) 파이프라인이 끝나도 자동으로 안 돌고, 관리자 페이지의 정규화 화면에서 단일 식당 동기 호출 또는 batch 잡으로 명시 실행한다. 비용 통제 + 예측 가능성이 자동 트리거보다 더 중요하다고 본 결정. 글로벌 비교 위젯은 `analytics` 토픽이 만든 `GlobalMenuCanonicalLink` 를 소비해서 sibling 식당의 멘션을 합산한다 — 이 모듈은 그 링크의 소비자이지 생산자가 아니다.

## Architecture [coverage: high -- 5 sources]

코어는 `MenuGroupingService` 한 클래스. 두 개의 진입점이 있다.

1. **단일 식당 동기**: `restaurant.route.ts` 의 `POST /menus/group/:placeId` — 응답까지 2~5초 블로킹. 관리자 화면에서 한 식당씩 누를 때.
2. **batch**: `menu-grouping.route.ts` 의 `POST /admin/analytics/grouping-jobs` (placeIds 배열) → 백그라운드 + SSE `item`/`done` event. 한 화면에서 여러 식당을 한꺼번에 돌릴 때.

batch 측은 `groupingJobRegistry` (in-memory, actorId 격리, item 단위 startedAt/finishedAt + state) 가 진행 상황을 들고 있고, FINISHED_TTL_MS=10분 GC 로 자동 청소된다. SSE 라우트는 토큰 query param 인증(EventSource 가 헤더 못 보냄) — `summary-events` 와 같은 패턴.

LLM 입력은 한 식당의 distinct `nameNorm` + 그 norm 의 가장 빈도 높은 원문 표기를 variant 로 모은 배열이다. `MENU_GROUPING_CHUNK_SIZE=80` 으로 잘라 호출 — Ollama num_ctx 8192 안에서 입력+출력 합 안전 한도. 현실 식당은 메뉴 100개 미만이라 거의 단일 청크로 끝나고, 80개 넘으면 분할 — 같은 청크 안에서만 묶이는 한계는 수용 (분할 자체가 드문 경우라 충돌도 드물다).

Key files:
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts) -- `groupForRestaurant`, `getRanking`, `getRestaurantsStatus`. `summary.service` 의 `normalizeTerm` / `extractFirstJsonObject` 재사용.
- [apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts) -- 시스템 프롬프트 + 3개 few-shot + `MENU_GROUPING_VERSION=1` + chunk size 80 + Ollama JSON schema (`additionalProperties: { type: 'string' }`).
- [apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts) -- admin batch + SSE.
- [apps/friendly/src/modules/menu-grouping/grouping-job-registry.ts](../../apps/friendly/src/modules/menu-grouping/grouping-job-registry.ts) -- in-memory job registry, item 단위 진행, AbortController 한 개로 cancel, TTL GC.
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) -- `Routes.Restaurant.menusGroup/menusRanking` 단일 식당 라우트.

## Talks To [coverage: high -- 6 sources]

- **ai** (in-process: `AiConfigService.getResolved('ollama-cloud')` + `adapterCache`) -- LLM provider/model 해석. 미설정이면 `MenuGroupingError('no_provider')` 던지고 라우트가 422 로 변환.
- **summary** (in-process: `normalizeTerm`, `extractFirstJsonObject`) -- canonicalNorm 정규화 규칙을 멘션과 일치시켜야 GROUP BY 키가 맞춰진다.
- **restaurant** (HTTP: `/menus/group`, `/menus/ranking`) -- 단일 식당 동기 진입점이 restaurant 라우트 안에 있다 (placeId 기반).
- **analytics → `GlobalMenuCanonicalLink`** (DB read) -- `getRanking` 의 `items[].global` 필드. 글로벌 머지를 돌렸을 때만 채워지고, 안 돌렸으면 null. 이 모듈이 글로벌 링크를 만드는 게 아니라 읽기만 한다.
- **prisma / SQLite** (DB: `menu_canonicals` 테이블 소유 + `menu_mentions` 읽기) -- delete + createMany 트랜잭션으로 idempotent 재실행.

## API Surface [coverage: high -- 4 sources]

단일 식당 (`restaurant.route.ts`):

- `POST Routes.Restaurant.menusGroup(:placeId)` → `MenuGroupRunResult` (2~5초 동기).
  에러 매핑: `restaurant_not_found` → 404, `no_menus` → 409, `no_provider` → 422.
- `GET Routes.Restaurant.menusRanking(:placeId)?sort&minMentions` → `MenuRankingResult`.
  `sort`: `mentions`(기본) | `positive` | `negative` | `positiveRatio`. `minMentions` 기본 1.

Batch (`menu-grouping.route.ts`):

- `GET Routes.Analytics.restaurantsStatus` → `{ currentVersion, items: MenuGroupingRestaurantStatus[] }` — 관리자 페이지 메인 테이블. distinct/mapped/unmapped + lastGroupedAt + storedVersion.
- `POST Routes.Analytics.groupingJobs` body=`{ placeIds: [...] }` → `MenuGroupingJobSnapshot`. 빈 배열 거부 (전체 정규화도 명시 placeIds 로만).
- `GET Routes.Analytics.groupingJob(:id)` → `MenuGroupingJobSnapshot` (재접속 시 현재 진행 상태 polling).
- `GET Routes.Analytics.groupingJobEvents(:id)?token=...` → SSE: `snapshot`, `item`, `done`. 15초 heartbeat.

Zod 계약 ([packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)) 의 핵심 — `MenuRankingItem.global` 은 `{globalKey, displayName, totalMentions, positive, negative, positiveRatio, restaurantCount}` 또는 `null`. `mapped: false` 인 아이템은 정의상 global 도 없다.

## Data [coverage: high -- 3 sources]

`MenuCanonical` ([apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) line 95-111, [migration](../../apps/friendly/prisma/migrations/20260508142840_add_menu_canonicals/migration.sql)):

```
restaurantId  String  -- FK, onDelete: Cascade
nameNorm      String  -- MenuMention.nameNorm 과 동일 정규화 (소문자+공백/특수문자 제거)
canonicalName String  -- LLM 이 고른 대표 표기 (UI 표시)
canonicalNorm String  -- normalizeTerm(canonicalName) — 통계 GROUP BY 키
version       Int     -- MENU_GROUPING_VERSION (현재 1) — 프롬프트/모델 변경 시 stale 식별
model         String? -- 어느 LLM 모델로 매핑했는지 감사 로그
createdAt     DateTime
@@unique([restaurantId, nameNorm])
@@index([restaurantId, canonicalNorm])
```

`(restaurantId, nameNorm)` 유니크 — 한 식당의 한 nameNorm 은 정확히 한 그룹에만 속한다. `groupForRestaurant` 는 `deleteMany` + `createMany` 를 한 트랜잭션 안에서 실행해 idempotent — 다시 돌리면 처음부터 다시 만든다.

`globalLink: GlobalMenuCanonicalLink?` 1:1 관계가 옵셔널 — 글로벌 머지가 돈 식당만 채워진다. 머지/링크는 `analytics` 도메인 책임.

`MenuMention` 은 멘션 한 건마다 한 행 (이 모듈의 입력). `traitsJson` 은 string[] 직렬화 — `getRanking` 이 그룹별 topTraits TOP3 집계할 때 파싱.

## Key Decisions [coverage: high -- 9 sources]

- **자동 트리거 안 함** -- 분석(요약) 끝나도 그룹핑 안 돈다. 비용 통제 + 예측 가능성. 운영자가 정규화 화면에서 명시 실행. `MENU_GROUPING_VERSION` 변경 시에도 자동 재실행 안 하고, status 응답이 storedVersion 을 같이 내려서 UI 가 "재실행 권장" 배지를 띄운다.
- **chunk size 80, 분할 한계 수용** -- 한 청크 안에서만 같은 그룹으로 묶을 수 있다는 한계는 받아들였다. 80 = num_ctx 4096~8192 안에서 입력+출력 안전 한도 (메뉴 30 토큰 평균 × 80 ≈ 2400 토큰). 현실 식당의 distinct 메뉴는 100개 미만이라 분할 자체가 드물어서 충돌도 드물다.
- **delete + createMany idempotent** -- 부분 업데이트 안 한다. 그룹핑은 식당 전체를 다시 본다. 멘션이 추가되면 다시 돌릴 뿐. 청크 간 canonical 충돌 reconciliation 로직을 안 만들어도 되는 단순화.
- **fallback to nameNorm** -- 매핑 안 된 nameNorm 은 자기 자신을 그룹키로. `mapped: false` 플래그로 UI 가 "분류 권장" 마크 표시. 그룹핑 한 번도 안 돈 식당도 ranking 응답이 깨지지 않는다 ([fallback test](../../apps/friendly/src/modules/menu-grouping/menu-grouping.test.ts) line 177-194).
- **bestNameByNorm 으로 variant 선택** -- LLM 입력은 nameNorm 자체가 아니라 그 norm 의 가장 빈도 높은 원문 표기. 사용자가 실제로 쓴 표기로 LLM 이 판단하도록 하기 위해 (norm 은 공백 제거된 인공적 키).
- **glob 비교는 식당 단위 N+1** -- targetGlobalIds 모은 뒤 sibling 식당별로 한 쿼리씩 (식당당 1쿼리). 한 globalKey 에 1~10 식당이 일반적이라 OK. raw SQL 단일 쿼리화는 더 빨라야 할 때.
- **batch in-memory only** -- 서버 재시작 시 in-flight 잡 사라짐. LLM 비용은 다시 들지만 결과는 idempotent — 사용자가 재실행 하면 됨. 운영 부담 < 단순성.
- **LLM JSON schema 강제는 값만** -- 키는 입력 표기 그대로 써야 하므로 schema 로 못 잡고 (`additionalProperties: string`), 키가 빠진 경우는 자기 자신을 canonical 로 두는 fallback ([service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts) line 127-131).

## Gotchas [coverage: high -- 5 sources]

- **순위 정렬 시 null positiveRatio 는 마지막** -- 긍/부 둘 다 0 (전부 neutral) 이면 ratio null. `positiveRatio` 정렬에서 뒤로 밀리고 mentionCount 내림차순으로 동률 처리 ([service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts) line 603-611).
- **traitsJson 파싱 실패는 무시** -- malformed traitsJson 행이 있어도 try/catch 로 그 한 건만 건너뛴다. 통계 수렴이 우선.
- **글로벌 비교 멘션 0 코너 케이스** -- MenuCanonical 에 globalLink 가 있지만 sibling 식당이 멘션 0인 경우. globalField 를 빈 값(`totalMentions: 0`, `positiveRatio: null`) 로 채워서 표시는 한다.
- **단일 식당 동기 호출 2~5초 블로킹** -- LLM 한 번. 80개 넘으면 청크별 순차 호출이라 더 길어진다. UI 가 spinner 필수.
- **batch cancel 즉시 안 멈춤** -- AbortController 는 큐의 다음 식당부터 skipped 처리. 진행 중이던 LLM 호출은 어댑터 abort 미지원이라 끝까지 기다린다.
- **`MenuGroupingError('no_menus')` 는 batch 에서 skipped 로 분류** -- failed 가 아님 ([route.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts) line 222-227). 멘션 없는 식당은 정상 케이스라 잡 전체를 실패시키지 않는다.
- **storedVersion = MIN(version)** -- 한 식당의 매핑 행들 중 가장 옛 버전을 노출. 일부만 옛 버전이어도 "재실행 권장" 트리거.

## Sources

- [apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.route.ts)
- [apps/friendly/src/modules/menu-grouping/grouping-job-registry.ts](../../apps/friendly/src/modules/menu-grouping/grouping-job-registry.ts)
- [apps/friendly/src/modules/menu-grouping/menu-grouping.test.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.test.ts)
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260508142840_add_menu_canonicals/migration.sql](../../apps/friendly/prisma/migrations/20260508142840_add_menu_canonicals/migration.sql)
- [packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)
