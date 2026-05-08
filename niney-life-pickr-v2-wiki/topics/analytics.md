---
topic: analytics
type: codebase
last_compiled: 2026-05-09
source_count: 11
status: active
---

# analytics

## Purpose [coverage: high — 6 sources]

식당을 가로지르는 **글로벌 메뉴 통계 + 카테고리 트리 + 전역 LLM 머지** 도메인을 소유한다. 식당별로 따로 정규화된 `MenuCanonical` 그룹들을 LLM으로 다시 한 번 묶어 "이 식당의 김치찌개 = 저 식당의 묵은지 김치찌개" 같은 가로지르기 질문에 답할 수 있는 단일 진실(`GlobalMenuCanonical`)을 만든다. 각 글로벌 메뉴는 표시용 displayName, 안정적 globalKey, 그리고 계층 categoryPath(`"한식 > 찌개 > 김치찌개"`)를 갖는다.

이 토픽은 admin 대시보드의 "글로벌 메뉴" / "카테고리 트리" / "글로벌 머지 운영" 화면을 뒷받침한다. 식당별 메뉴 그룹핑(distinct nameNorm → canonicalName) 자체는 별도 [menu-grouping](../../apps/friendly/src/modules/summary/) 흐름의 책임이고, 여기서는 그 결과물을 입력으로 받아 가로지르기에만 집중한다.

## Architecture [coverage: high — 5 sources]

`apps/friendly/src/modules/analytics/` 한 모듈에 라우트·서비스·잡 레지스트리·프롬프트가 모여 있다. 라우트는 admin 보호된 REST + SSE이고, 무거운 일은 모두 `AnalyticsService`로 위임된다. 글로벌 머지는 한 번에 하나만 도는 시스템 전역 잡 — placeId 단위가 아니다.

Key files:
- [`analytics.route.ts`](../../apps/friendly/src/modules/analytics/analytics.route.ts) — Fastify 라우트, JWT/관리자 가드, SSE hijack, 잡 러너 entry
- [`analytics.service.ts`](../../apps/friendly/src/modules/analytics/analytics.service.ts) — `runGlobalMerge` 두-패스, `getOverview`/`getGlobalMenus`/`getCategoryTree`, `normalizeCategoryPath`
- [`global-merge.prompts.ts`](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts) — system prompt v2, JSON schema, `GLOBAL_MERGE_VERSION = 2`, `GLOBAL_MERGE_CHUNK_SIZE = 50`
- [`global-merge-job-registry.ts`](../../apps/friendly/src/modules/analytics/global-merge-job-registry.ts) — in-memory 단일 잡 레지스트리, inflight 가드, pub/sub
- [`analytics.test.ts`](../../apps/friendly/src/modules/analytics/analytics.test.ts) — 14개 케이스 (두-패스, fallback, no_provider, 진행 콜백, 식당 합산, includeUnlinked, q/category 필터, overview, normalizeCategoryPath, category tree)

`runGlobalMerge` 흐름:

1. `MenuCanonical` 전체에서 distinct `canonicalNorm` 별 가장 짧은 / 사전순 첫 표기를 골라 input variants 결정.
2. **Pass 1** — chunk size 50으로 분할, 각 청크별로 LLM 호출. 응답은 `{ variant: { canonical, categoryPath } }` 객체. `progress.onChunk({ pass: 1, … })` 발화.
3. **Pass 2** — pass1의 distinct canonical 들 사이의 충돌을 한 번 더 LLM에 태운다 (청크간 보더 이슈 해소). pass1 결과가 청크 1개에 들어가면 그래도 한 번 호출 — 컨텍스트 일관성 우선. pass2의 categoryPath가 우선, 없으면 pass1 path fallback.
4. `normalizeTerm(finalName)`을 globalKey로 써서 `GlobalMenuCanonical` upsert + `GlobalMenuCanonicalLink` 전량 reset.

## Talks To [coverage: high — 4 sources]

- **`@repo/api-contract`** (zod import) — `AnalyticsOverview`, `GlobalMenuQuery`/`Result`, `GlobalMergeJob*`, `CategoryTreeResult`, `Routes.Analytics.*`. 모든 응답이 `fastify-type-provider-zod`로 자동 검증됨.
- **`ai` 모듈** ([`AiConfigService`](../../apps/friendly/src/modules/ai/ai.config.service.ts) + [`adapter-cache`](../../apps/friendly/src/modules/ai/adapter-cache.ts)) — `ollama-cloud` provider 해석. provider 미설정이면 `AnalyticsError('no_provider')`.
- **`summary` 모듈** ([`extractFirstJsonObject`, `normalizeTerm`](../../apps/friendly/src/modules/summary/summary.service.ts)) — JSON 추출과 정규화 함수 재사용. `MenuMention.nameNorm` ↔ `MenuCanonical.nameNorm` 매칭으로 통계 join.
- **`menu-grouping`(식당 단위)** — `MenuCanonical` 행을 입력으로 받기만 하고 직접 호출은 하지 않음. 의존 방향은 한 방향(이 토픽 → menu-grouping 산출물).
- **Prisma / SQLite** — 트랜잭션으로 `GlobalMenuCanonical*` reset, raw SQL로 sentiment GROUP BY (Prisma의 N+1 회피).

## API Surface [coverage: high — 3 sources]

모두 admin only. 라우트 상수는 [`Routes.Analytics`](../../packages/api-contract/src/routes.ts).

| Method | Path | 설명 |
|---|---|---|
| GET | `/admin/analytics/overview` | 대시보드 카드 카운터(`restaurantCount`, `analyzedReviewCount`, `globalLinkedRatio`, `lastGlobalMergeAt`, `globalVersion`) |
| GET | `/admin/analytics/global-menus` | querystring: `q`, `category`(prefix), `sort`(`mentions`/`positive`/`positiveRatio`/`restaurants`), `minMentions`(기본 5), `limit`(≤200), `includeUnlinked` |
| GET | `/admin/analytics/category-tree` | `currentVersion` + 트리 루트들. 자식 통계는 부모로 누적 합산되어 어느 레벨에서도 그 가지 합계 |
| POST | `/admin/analytics/global-merge-jobs` | body `{ full: boolean }`. inflight 시 **409 + 기존 snapshot** |
| GET | `/admin/analytics/global-merge-jobs/:id` | snapshot 조회 (재접속/새로고침용) |
| GET | `/admin/analytics/global-merge-jobs/:id/events` | SSE — `?token=` 쿼리 인증 지원, `chunk`/`done` named event |

SSE 약속: 연결 직후 `snapshot` 1회 emit (replay 역할). 잡이 이미 끝났으면 `done` 즉시 + close. 진행 중이면 `chunk` 이벤트가 pub/sub으로 push되고 15초마다 `: hb` heartbeat.

`GlobalMergeJobChunkProgress = { pass: 1|2, chunkIndex, chunkTotal, mappedInChunk }`.

## Data [coverage: high — 4 sources]

소유 테이블 (전부 [`schema.prisma`](../../apps/friendly/prisma/schema.prisma)):

- **`GlobalMenuCanonical`** — `id`, `globalKey`(unique), `displayName`, `categoryPath?`, `version`, `model`, `createdAt`/`updatedAt`. `categoryPath`에 단일 인덱스 (prefix LIKE 쿼리는 결과 후처리로 처리, 이 인덱스는 not-null 필터용).
- **`GlobalMenuCanonicalLink`** — `MenuCanonical` ↔ `GlobalMenuCanonical` 다대일. `menuCanonicalId`가 unique (한 식당 그룹 = 정확히 한 글로벌 그룹). `restaurantId`, `localCanonicalNorm` 비정규화 — 통계 raw 쿼리에서 join 한 번 줄이려고. onDelete:Cascade로 식당/그룹 삭제 시 자동 정리.

읽기 전용 의존:
- **`MenuCanonical`** (소유는 menu-grouping) — distinct `canonicalNorm`이 머지 입력.
- **`MenuMention`** (소유는 summary) — `(restaurantId, nameNorm)` 기준 raw SQL GROUP BY로 sentiment 카운트. 통계 함수 두 군데에서 동일 쿼리 재사용.
- **`ReviewSummary`** — overview의 `analyzedReviewCount`(status=done) 카운트만.

마이그레이션:
- [`20260508134403_add_analytics_tables`](../../apps/friendly/prisma/migrations/20260508134403_add_analytics_tables/migration.sql) — `menu_mentions` + `review_tags`.
- [`20260508145554_add_global_menu_canonicals`](../../apps/friendly/prisma/migrations/20260508145554_add_global_menu_canonicals/migration.sql) — 글로벌 두 테이블.
- [`20260508154445_add_global_menu_category_path`](../../apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql) — `categoryPath` 컬럼 + 인덱스 추가 (v1 → v2 동반).

잡 상태는 메모리만(`global-merge-job-registry.ts`). FINISHED_TTL 10분, 1분마다 GC.

## Key Decisions [coverage: high — 5 sources]

- **두-패스 머지** — pass1 청크별 결과는 청크 경계 안에서만 일관됨. 다른 청크의 김치찌개 변형이 따로 그룹으로 남는 걸 pass2가 distinct canonical 들끼리 다시 한 번 묶어 해소. 단일 호출로 모두 보내면 토큰 한도를 넘고 정확도가 폭락 — chunk + reconcile이 절충점.
- **카테고리 트리에 별도 테이블 없음** — `categoryPath`를 `"한식 > 찌개 > 김치찌개"` 단일 컬럼으로 두고, 필터는 `prefix === path || path.startsWith(prefix + " > ")`, 트리 빌드는 메모리에서. 트리 깊이 ≤ 3, 노드 수 ≤ 수백 규모라 정합성·이주 비용 대비 단일 컬럼이 압승.
- **`normalizeCategoryPath` 화이트리스트 prepend** — 모델이 가끔 "한식/찌개" 슬래시, "›/→/|" 같은 별표기를 쓴다. 표준 `" > "`로 통일하고, 최상위가 `한식/중식/일식/양식/분식/디저트/음료/주류/기타` 외면 `"기타"`를 prepend — 머지 시각화의 루트 폭발을 막는다.
- **단일-잡 + 409 응답** — `globalMergeJobRegistry.inflightJobId()` 한 줄 가드. 두 어드민이 동시에 누르면 두 번째 호출이 409와 함께 **기존 잡 snapshot**을 받아 자연스럽게 같은 진행 화면을 본다.
- **SSE 첫 emit으로 snapshot 재생** — 클라이언트가 새로고침해도 GET-snapshot + open-SSE 두 번 호출이 아니라 SSE 한 번에서 곧장 현재 상태를 받는다. `chunk`/`done`은 그 뒤 push.
- **`GLOBAL_MERGE_VERSION` 1 → 2** — 응답 형태가 string에서 `{ canonical, categoryPath }`로 바뀜. v1 회신도 fallback으로 받지만, categoryPath 채우려면 사용자가 한 번 "전체 재실행"을 눌러야 한다.
- **DB reset 후 createMany** — `GlobalMenuCanonicalLink`는 매 머지마다 전량 비우고 다시 작성. 멱등성과 stale link 청소를 한 번에 — 잡이 어느 시점에 죽어도 다음 실행이 깨끗한 상태에서 시작.
- **JSON schema 강제 + identity fallback** — provider에 `format: GLOBAL_MERGE_JSON_SCHEMA` 전달하지만, 응답이 schema를 깨거나 키를 누락하면 그 variant는 자기 자신을 canonical로 두고 진행 — 중간에 멈추지 않는다.

## Gotchas [coverage: medium — 3 sources]

- **버전 1 → 2 stale 매핑** — 기존 v1 row는 `categoryPath = null`. overview의 `globalVersion`/`lastGlobalMergeAt` 비교로만 표시되고, 카테고리 트리/필터에서는 자동 누락된다. **사용자가 한 번 "전체 재실행" 클릭 필요** — 자동 마이그레이션은 의도적으로 안 함(LLM 비용 통제).
- **`includeUnlinked = true`** — globalKey가 `unlinked:<canonicalNorm>` prefix로 가짜 그룹화 됨. categoryPath는 항상 null. 운영 화면에서 "전역 정규화 전 모습" 비교용일 뿐, 카테고리 트리/필터에는 안 들어간다.
- **`full=false` 의 한계** — service 내 주석대로 단순 chunking만 — 기존 매핑된 그룹의 displayName을 컨텍스트로 같이 보내지 않는다. 정확도가 중요한 정기 작업은 `full=true` 권장.
- **`finishedAt` TTL** — 잡 종료 후 10분 지나면 GC로 사라진다. 그 사이 SSE 재접속하면 404 — UI는 그 케이스에 overview의 `lastGlobalMergeAt`로 대체.
- **dev.db 잔재로 테스트 입력 카운트가 변동** — 테스트는 절대값 비교 대신 `toBeGreaterThanOrEqual` + `wantedKeys` 부분 매치로 작성됨. 테스트 추가할 때 같은 패턴 유지 필요.
- **`finalCategoryByCanonical` first non-null** — pass1과 pass2가 같은 globalKey에 다른 categoryPath를 줄 수 있다. pass2 우선이지만 pass2가 path 빠뜨리면 pass1이 살아남고, 그 외 충돌은 first-write-wins. 정확도가 의심되면 `full=true`로 한 번 더 돌리는 것이 가장 단순한 회복.

## Sources

- [`apps/friendly/src/modules/analytics/global-merge.prompts.ts`](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts)
- [`apps/friendly/src/modules/analytics/analytics.service.ts`](../../apps/friendly/src/modules/analytics/analytics.service.ts)
- [`apps/friendly/src/modules/analytics/analytics.route.ts`](../../apps/friendly/src/modules/analytics/analytics.route.ts)
- [`apps/friendly/src/modules/analytics/global-merge-job-registry.ts`](../../apps/friendly/src/modules/analytics/global-merge-job-registry.ts)
- [`apps/friendly/src/modules/analytics/analytics.test.ts`](../../apps/friendly/src/modules/analytics/analytics.test.ts)
- [`apps/friendly/prisma/schema.prisma`](../../apps/friendly/prisma/schema.prisma)
- [`apps/friendly/prisma/migrations/20260508134403_add_analytics_tables/migration.sql`](../../apps/friendly/prisma/migrations/20260508134403_add_analytics_tables/migration.sql)
- [`apps/friendly/prisma/migrations/20260508145554_add_global_menu_canonicals/migration.sql`](../../apps/friendly/prisma/migrations/20260508145554_add_global_menu_canonicals/migration.sql)
- [`apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql`](../../apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql)
- [`packages/api-contract/src/schemas/analytics.ts`](../../packages/api-contract/src/schemas/analytics.ts)
- [`packages/api-contract/src/routes.ts`](../../packages/api-contract/src/routes.ts)
