---
topic: analytics
type: codebase
last_compiled: 2026-06-06
source_count: 13
status: active
---

# analytics

## Purpose [coverage: high — 6 sources]

식당을 가로지르는 **글로벌 메뉴 통계 + 카테고리 트리 + 전역 LLM 머지** 도메인을 소유한다. 식당별로 따로 정규화된 `MenuCanonical` 그룹들을 LLM으로 다시 한 번 묶어 "이 식당의 김치찌개 = 저 식당의 묵은지김치찌개" 같은 가로지르기 질문에 답할 수 있는 단일 진실(`GlobalMenuCanonical`)을 만든다. 각 글로벌 메뉴는 표시용 displayName, 안정적 globalKey, 그리고 계층 categoryPath(예: `"찌개·전골 > 김치찌개"`)를 갖는다.

이 토픽은 [web](web.md) admin 대시보드의 "글로벌 메뉴" / "카테고리 트리" / "글로벌 머지 운영" 화면을 뒷받침한다. 식당별 메뉴 그룹핑(distinct nameNorm → canonicalName) 자체는 별도 [menu-grouping](menu-grouping.md) 흐름의 책임이고, 여기서는 그 결과물을 입력으로 받아 가로지르기에만 집중한다.

17차(2026-06)부터 카테고리 트리를 만드는 알고리즘([`category-tree.ts`](../../apps/friendly/src/modules/analytics/category-tree.ts) `buildCategoryTree`)이 공용 모듈로 분리되어, 전역(어드민)뿐 아니라 **개별 식당 공개 페이지**의 "이 식당 메뉴 카테고리 트리"(`restaurant` 모듈 `getCategoryTree`)도 동일 구현을 쓴다.

## Architecture [coverage: high — 6 sources]

`apps/friendly/src/modules/analytics/` 한 모듈에 라우트·서비스·잡 레지스트리·프롬프트·트리 빌더가 모여 있다. 라우트는 admin 보호된 REST + SSE이고, 무거운 일은 모두 `AnalyticsService`로 위임된다. 글로벌 머지는 한 번에 하나만 도는 시스템 전역 잡 — placeId 단위가 아니다.

Key files:
- [`analytics.route.ts`](../../apps/friendly/src/modules/analytics/analytics.route.ts) — Fastify 라우트, JWT/관리자 가드, SSE hijack, 잡 러너 entry
- [`analytics.service.ts`](../../apps/friendly/src/modules/analytics/analytics.service.ts) — `runGlobalMerge` 두-패스, `getOverview`/`getGlobalMenus`/`getCategoryTree`, `normalizeCategoryPath`, `TOP_WHITELIST`, `parseMergeResponse`(mappings 배열 + 구형 호환), `TtlCache`
- [`category-tree.ts`](../../apps/friendly/src/modules/analytics/category-tree.ts) — **(신규)** `buildCategoryTree(leaves) → CategoryTreeNodeType[]`. categoryPath 리스트를 계층 트리로. 전역·식당별 공용
- [`global-merge.prompts.ts`](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts) — system prompt **v3**, JSON schema(`{ mappings: [...] }` 배열), `GLOBAL_MERGE_VERSION = 3`, `GLOBAL_MERGE_CHUNK_SIZE = 10`
- [`global-merge-job-registry.ts`](../../apps/friendly/src/modules/analytics/global-merge-job-registry.ts) — in-memory 단일 잡 레지스트리, inflight 가드, pub/sub
- [`analytics.test.ts`](../../apps/friendly/src/modules/analytics/analytics.test.ts) — 두-패스, mappings 배열 파싱, categoryPath 보존(약한 런이 덮어쓰지 않음), q/category(`찌개·전골`) 필터, category tree 누적 합산 등
- 운영 스크립트 **(신규)**: [`scripts/probe-merge.ts`](../../apps/friendly/scripts/probe-merge.ts), [`scripts/run-global-merge.ts`](../../apps/friendly/scripts/run-global-merge.ts)

`runGlobalMerge` 흐름:

1. `MenuCanonical` 전체에서 distinct `canonicalNorm` 별 가장 빈번한(동률은 사전순 첫) 표기를 골라 input variants 결정.
2. **Pass 1** — chunk size **10**으로 분할, 각 청크별로 LLM 호출. 응답은 `{ mappings: [{ variant, canonical, categoryPath }] }` 배열(파서가 norm별 객체로 변환). `progress.onChunk({ pass: 1, … })` 발화.
3. **Pass 2** — pass1의 distinct canonical 들 사이의 충돌을 한 번 더 LLM에 태운다(청크간 보더 이슈 해소). pass1 결과가 한 청크에 들어가도 한 번 호출 — 컨텍스트 일관성 우선. pass2 categoryPath 우선, 없으면 pass1 path fallback.
4. `normalizeTerm(finalName)`을 globalKey로 써서 `GlobalMenuCanonical` upsert + `GlobalMenuCanonicalLink` 전량 reset. 이번 런이 path를 못 주면 **기존 row의 categoryPath 보존**(`existingPathByKey`) — 약한/빈 런이 좋은 path를 null로 덮지 않게.

LLM 호출은 grammar `format`을 **주지 않는다** — `callOneChunk` 주석대로 ollama-cloud에서 format을 주면 응답이 통째로 비거나 categoryPath가 빠진다. 프롬프트만 주고 파서가 견고히 JSON을 추출한다(`probe:merge`로 검증).

## Talks To [coverage: high — 5 sources]

- **`@repo/api-contract`** (zod import) — `AnalyticsOverview`, `GlobalMenuQuery`/`Result`, `GlobalMergeJob*`, `CategoryTreeNode`, `Routes.Analytics.*`. 모든 응답이 `fastify-type-provider-zod`로 자동 검증됨. 자세한 스키마는 [api-contract](api-contract.md).
- **`ai` 모듈** ([`AiConfigService`](../../apps/friendly/src/modules/ai/ai.config.service.ts) + [`adapter-cache`](../../apps/friendly/src/modules/ai/adapter-cache.ts)) — `ollama-cloud` provider 해석. provider 미설정이면 `AnalyticsError('no_provider')`. 입력이 0이면 `AnalyticsError('no_inputs')`.
- **`summary` 모듈** ([`extractFirstJsonObject`, `normalizeTerm`](../../apps/friendly/src/modules/summary/summary.service.ts)) — JSON 추출과 정규화 함수 재사용. `MenuMention.nameNorm` ↔ `MenuCanonical.nameNorm` 매칭으로 통계 join.
- **`menu-grouping`(식당 단위)** — `MenuCanonical` 행을 입력으로 받기만 하고 직접 호출은 하지 않음. 의존 방향은 한 방향(이 토픽 → menu-grouping 산출물). [menu-grouping](menu-grouping.md).
- **`restaurant` 모듈** — `category-tree.ts`의 `buildCategoryTree`를 import해 공개 식당별 카테고리 트리(`GET /restaurants/public/:placeId/category-tree`)를 같은 노드 구조로 만든다. 의존 방향은 restaurant → analytics(트리 빌더만).
- **schedule** — 어드민이 cron으로 "미분류 식당 메뉴 정규화 → 전역 머지"를 자동 실행하는 루틴이 [schedule](schedule.md)에 있고, AdminAnalyticsPage가 그 UI를 같이 호스팅한다.
- **Prisma / SQLite** — 트랜잭션으로 `GlobalMenuCanonical*` reset, raw SQL로 sentiment GROUP BY (Prisma의 N+1 회피).

## API Surface [coverage: high — 3 sources]

admin 라우트는 [`Routes.Analytics`](../../packages/api-contract/src/routes.ts), 공개 식당별 트리는 `Routes.Restaurant.publicCategoryTree`.

| Method | Path | 설명 |
|---|---|---|
| GET | `/admin/analytics/overview` | 카드 카운터(`restaurantCount`, `analyzedReviewCount`, `globalLinkedRatio`, `lastGlobalMergeAt`, `globalVersion=3`) |
| GET | `/admin/analytics/global-menus` | querystring: `q`, `category`(prefix, 예 `찌개·전골`), `sort`(`mentions`/`positive`/`positiveRatio`/`restaurants`), `minMentions`(기본 5), `page`/`pageSize`, `includeUnlinked` |
| GET | `/admin/analytics/category-tree` | `currentVersion` + 트리 루트들. 자식 통계는 부모로 누적 합산 |
| POST | `/admin/analytics/global-merge-jobs` | body `{ full: boolean }`. inflight 시 **409 + 기존 snapshot** |
| GET | `/admin/analytics/global-merge-jobs/:id` | snapshot 조회 (재접속/새로고침용) |
| GET | `/admin/analytics/global-merge-jobs/:id/events` | SSE — `?token=` 쿼리 인증, `chunk`/`done` named event |
| GET | `/restaurants/public/:placeId/category-tree` | **(신규)** 공개. 이 식당 멘션만 누적한 `{ roots: CategoryTreeNode[] }`. coverage 없으면 빈 배열 |

SSE 약속: 연결 직후 `snapshot` 1회 emit(replay). 끝난 잡이면 `done` 즉시 + close. 진행 중이면 `chunk` push + 15초마다 `: hb` heartbeat. `GlobalMergeJobChunkProgress = { pass: 1|2, chunkIndex, chunkTotal, mappedInChunk }`.

## Data [coverage: high — 4 sources]

소유 테이블 (전부 [`schema.prisma`](../../apps/friendly/prisma/schema.prisma)):

- **`GlobalMenuCanonical`** — `id`, `globalKey`(unique), `displayName`, `categoryPath?`, `version`, `model`, `createdAt`/`updatedAt`. `categoryPath`에 단일 인덱스(not-null 필터용; prefix LIKE는 결과 후처리).
- **`GlobalMenuCanonicalLink`** — `MenuCanonical` ↔ `GlobalMenuCanonical` 다대일. `menuCanonicalId`가 unique(한 식당 그룹 = 정확히 한 글로벌 그룹). `restaurantId`, `localCanonicalNorm` 비정규화(통계 raw 쿼리 join 절감). onDelete:Cascade.

읽기 전용 의존:
- **`MenuCanonical`** (소유 menu-grouping) — distinct `canonicalNorm`이 머지 입력.
- **`MenuMention`** (소유 summary) — `(restaurantId, nameNorm)` 기준 raw SQL GROUP BY로 sentiment 카운트. 전역 통계와 식당별 트리가 동일 쿼리 재사용.
- **`ReviewSummary`** — overview의 `analyzedReviewCount`(status=done)만.

마이그레이션:
- [`20260508134403_add_analytics_tables`](../../apps/friendly/prisma/migrations/20260508134403_add_analytics_tables/migration.sql) — `menu_mentions` + `review_tags`.
- [`20260508145554_add_global_menu_canonicals`](../../apps/friendly/prisma/migrations/20260508145554_add_global_menu_canonicals/migration.sql) — 글로벌 두 테이블.
- [`20260508154445_add_global_menu_category_path`](../../apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql) — `categoryPath` 컬럼 + 인덱스.

**v3는 마이그레이션 없음** — 스키마 변경이 아니라 categoryPath의 *값 규약*(택소노미)이 바뀐 것이라 DB 컬럼은 그대로다. 적용은 데이터 재작성(full 재머지)으로만 일어난다.

잡 상태는 메모리만(`global-merge-job-registry.ts`). FINISHED_TTL 10분, 1분마다 GC. 통계 read 캐시 `TtlCache` 60초, 머지 done 시 `clear()`. 단일 인스턴스 가정 — `../concepts/in-memory-singleton-gates.md` 참고.

## Key Decisions [coverage: high — 6 sources]

- **17차(2026-06): 택소노미 음식종류→재료·메뉴군 전환 (`GLOBAL_MERGE_VERSION` 2→3, full 재머지 필요)** — 최상위 축을 한식/일식/양식 같은 *음식 종류*에서 **재료·메뉴군**으로 바꿨다: `고기 / 해산물 / 밥 / 면 / 국·탕 / 찌개·전골 / 김치 / 반찬 / 튀김 / 회·초밥 / 분식 / 디저트 / 음료 / 주류 / 기타`. 깊이 2~3단계("면 > 냉면 > 물냉면", "고기 > 삼겹살"). 진짜 버전 bump이라 categoryPath를 새로 채우려면 사용자가 한 번 **full=true 재머지**를 돌려야 한다(증분만으론 기존 path 안 바뀜). `../concepts/versioned-llm-prompts.md`의 새 인스턴스.
- **17차(2026-06): 출력 맵→배열 (Ollama grammar fix)** — 프롬프트/스키마를 `additionalProperties` 맵에서 `{ mappings: [{variant,canonical,categoryPath}] }` 배열로 변경. Ollama(llama.cpp) grammar가 additionalProperties 값 스키마를 변환 못 해 응답이 통째로 비어 식별매핑·categoryPath가 전멸하던 버그 회피. 배열+items는 안정 강제. 파서는 신규 배열 + 구형(맵/문자열)을 모두 수용.
- **17차(2026-06): 청크 50→10 (reasoning 모델 완주 우선)** — reasoning 모델(deepseek 등)은 청크가 크면 thinking 토큰이 폭증해 60s 타임아웃·truncation으로 빈 응답이 되고, 그 청크 메뉴가 식별 매핑으로 떨어져 grouping·categoryPath가 조용히 손상된다. `probe:merge`로 10개≈2900토큰 안정, 20개 빈 응답/타임아웃 확인. 작게 잡고 pass2에서 재통합 — 정확도보다 "완주" 우선.
- **17차(2026-06): `buildCategoryTree` 공용화** — categoryPath 리스트 → 계층 트리(모든 prefix 노드화 + 잎 통계 부모 누적, 자식은 멘션 많은 순, positiveRatio 계산)를 단일 구현으로 빼 전역(어드민)·식당별(공개) 양쪽이 같은 규칙을 쓴다.
- **17차(2026-06): categoryPath 유실 복구**(commit e1c4554) — 전역 머지에서 categoryPath가 유실되던 회귀 수정. `existingPathByKey`로 약한 런이 좋은 path를 null로 덮어쓰지 않게 보존.
- **카테고리 트리에 별도 테이블 없음** — `categoryPath` 단일 컬럼 + 메모리 트리 빌드. 필터는 `prefix === path || path.startsWith(prefix + " > ")`. 깊이 ≤ 3, 노드 수백 규모라 단일 컬럼이 정합성·이주 비용 대비 압승.
- **`normalizeCategoryPath` 화이트리스트 prepend** — 모델이 가끔 슬래시·별표기를 써서 표준 `" > "`로 통일하고, 최상위가 `TOP_WHITELIST`(재료·메뉴군 15종) 외면 `"기타"` prepend — 루트 폭발 방지.
- **두-패스 머지** — pass1은 청크 경계 안에서만 일관. 다른 청크의 변형을 pass2가 distinct canonical끼리 다시 묶어 해소. 단일 호출은 토큰 한도·정확도 폭락이라 chunk + reconcile이 절충점.
- **단일-잡 + 409 응답** — `inflightJobId()` 한 줄 가드. 두 어드민이 동시에 눌러도 두 번째가 409 + 기존 snapshot을 받아 같은 진행 화면을 본다.
- **SSE 첫 emit으로 snapshot 재생** — 새로고침해도 SSE 한 번에서 곧장 현재 상태. `chunk`/`done`은 그 뒤 push.
- **DB reset 후 createMany** — `GlobalMenuCanonicalLink`는 매 머지마다 전량 reset. 멱등성 + stale link 청소를 한 번에.
- **이전 버전 결정 보존** — v1: 단순 string→string 매핑. v2(16차): `categoryPath` 출력 추가, `{ canonical, categoryPath }` 객체 형태. v1/v2 회신도 fallback으로 받지만 새 path를 채우려면 full 재실행 필요(LLM 비용 통제로 자동 마이그레이션 안 함).

## Gotchas [coverage: medium — 4 sources]

- **`TOP_WHITELIST` ↔ 프롬프트 동기화 필수** — `analytics.service.ts`의 `TOP_WHITELIST`와 `global-merge.prompts.ts`의 [카테고리 path 규칙] 최상위 목록이 어긋나면, LLM이 정상 출력한 path가 전부 `"기타 > …"`로 떨어진다. 둘은 항상 같은 15종이어야 한다.
- **세그먼트 구분자 금지 문자** — 카테고리 이름에 `/` `>` `→` `|` 금지(`normalizeCategoryPath`가 이 문자들로 쪼갠다). 복합어는 가운뎃점(·) — "국/탕"으로 쓰면 두 segment로 분리된다("국·탕"이 정답).
- **증분(full=false) vs 전체(full=true) 재머지** — v3 택소노미나 새 카테고리 규약을 적용하려면 반드시 full=true. 증분은 미링크 그룹만 단순 chunking하고 기존 path를 안 바꾼다. 정기 작업·버전 bump 후엔 full 권장.
- **빈 응답 → 식별 매핑 silent 손상** — 청크가 타임아웃/truncation으로 빈 응답이면 그 청크 메뉴가 자기 자신을 canonical로(식별 매핑) 두고 categoryPath null로 떨어진다. 에러가 아니라 조용한 품질 저하라 `probe:merge`로 토큰·파싱가능성을 먼저 확인. 청크 10 + 보존 로직으로 완화했지만 근본은 모델 한계.
- **버전 < 3 stale 매핑** — 구버전 row는 v3 택소노미가 아니다. overview `globalVersion`/`lastGlobalMergeAt`로 stale 배지 표시만 되고, 자동 마이그레이션은 의도적으로 안 함 — 사용자가 full 재실행 클릭 필요.
- **`includeUnlinked = true`** — globalKey가 `unlinked:<canonicalNorm>` prefix 가짜 그룹. categoryPath는 항상 null. 비교용일 뿐 트리/필터엔 안 들어간다.
- **`pathByGlobalKey` first non-null** — 같은 globalKey의 여러 norm이 다른 path를 줄 수 있어 pass2 우선 → pass1 fallback → globalKey 단위 first non-null. 의심되면 full=true로 한 번 더가 가장 단순한 회복.
- **dev.db 잔재로 테스트 입력 카운트 변동** — 테스트는 절대값 대신 `toBeGreaterThanOrEqual` + 부분 매치. 새 테스트도 같은 패턴 유지.
- **다이닝코드 행은 placeId null** — analytics는 네이버 전용 스코프라 placeId null인 식당은 통계 집계에서 skip(스키마 응답이 `placeId: z.string()`이라 직렬화 실패 방지).

## Sources

- [`apps/friendly/src/modules/analytics/global-merge.prompts.ts`](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts)
- [`apps/friendly/src/modules/analytics/analytics.service.ts`](../../apps/friendly/src/modules/analytics/analytics.service.ts)
- [`apps/friendly/src/modules/analytics/category-tree.ts`](../../apps/friendly/src/modules/analytics/category-tree.ts)
- [`apps/friendly/src/modules/analytics/analytics.route.ts`](../../apps/friendly/src/modules/analytics/analytics.route.ts)
- [`apps/friendly/src/modules/analytics/global-merge-job-registry.ts`](../../apps/friendly/src/modules/analytics/global-merge-job-registry.ts)
- [`apps/friendly/src/modules/analytics/analytics.test.ts`](../../apps/friendly/src/modules/analytics/analytics.test.ts)
- [`apps/friendly/scripts/probe-merge.ts`](../../apps/friendly/scripts/probe-merge.ts)
- [`apps/friendly/scripts/run-global-merge.ts`](../../apps/friendly/scripts/run-global-merge.ts)
- [`apps/friendly/prisma/schema.prisma`](../../apps/friendly/prisma/schema.prisma)
- [`apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql`](../../apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql)
- [`packages/api-contract/src/schemas/analytics.ts`](../../packages/api-contract/src/schemas/analytics.ts)
- [`packages/api-contract/src/schemas/restaurant.ts`](../../packages/api-contract/src/schemas/restaurant.ts)
- [`apps/web/src/routes/admin/AdminAnalyticsPage.tsx`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx)
</content>
</invoke>
