---
topic: analytics
type: codebase
last_compiled: 2026-06-25
source_count: 16
status: active
---

# analytics

## Purpose [coverage: high — 6 sources]

식당을 가로지르는 **글로벌 메뉴 통계 + 카테고리 트리 + 전역 LLM 머지** 도메인을 소유한다. 식당별로 따로 정규화된 `MenuCanonical` 그룹들을 LLM으로 다시 한 번 묶어 "이 식당의 김치찌개 = 저 식당의 묵은지김치찌개" 같은 가로지르기 질문에 답할 수 있는 단일 진실(`GlobalMenuCanonical`)을 만든다. 각 글로벌 메뉴는 표시용 displayName, 안정적 globalKey, 그리고 계층 categoryPath(예: `"찌개·전골 > 김치찌개"`)를 갖는다.

이 토픽은 [web](web.md) admin 대시보드의 "글로벌 메뉴" / "카테고리 트리" / "글로벌 머지 운영" 화면을 뒷받침한다. 식당별 메뉴 그룹핑(distinct nameNorm → canonicalName) 자체는 별도 [menu-grouping](menu-grouping.md) 흐름의 책임이고, 여기서는 그 결과물을 입력으로 받아 가로지르기에만 집중한다.

17차(2026-06)부터 카테고리 트리를 만드는 알고리즘([`category-tree.ts`](../../apps/friendly/src/modules/analytics/category-tree.ts) `buildCategoryTree`)이 공용 모듈로 분리되어, 전역(어드민)뿐 아니라 **개별 식당 공개 페이지**의 "이 식당 메뉴 카테고리 트리"(`restaurant` 모듈 `getCategoryTree`)도 동일 구현을 쓴다.

**18차(2026-06): 전량 재계산 성능 최적화** — 글로벌 머지를 자주, 전량(full=true)으로 돌리면서 (1) pm2 `max_memory_restart` 가 트리거하는 OOM, (2) 직렬 청크 호출의 느림, (3) 매번 변하지 않은 청크까지 LLM 재호출하는 낭비가 드러났다. 이를 청크 **병렬 풀** + **청크 결과 캐시** + **Link insert 배치 스트리밍** + **청크 재시도** + **단일 머지 락**으로 해소했다(commit e45fb0c). 관련 컨셉 [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)(병렬 풀·단일 락), [versioned-llm-prompts](../concepts/versioned-llm-prompts.md), [stream-driven-cache-merge](../concepts/stream-driven-cache-merge.md)(잡 SSE).

## Architecture [coverage: high — 7 sources]

`apps/friendly/src/modules/analytics/` 한 모듈에 라우트·서비스·잡 레지스트리·프롬프트·트리 빌더가 모여 있다. 라우트는 admin 보호된 REST + SSE이고, 무거운 일은 모두 `AnalyticsService`로 위임된다. 글로벌 머지는 한 번에 하나만 도는 시스템 전역 잡 — placeId 단위가 아니다.

Key files:
- [`analytics.route.ts`](../../apps/friendly/src/modules/analytics/analytics.route.ts) — Fastify 라우트, JWT/관리자 가드, SSE hijack, 잡 러너 entry. `operationLog` 주입(서비스 내부 OperationRun 계측).
- [`analytics.service.ts`](../../apps/friendly/src/modules/analytics/analytics.service.ts) — `runGlobalMerge`(머지 락 + OperationRun 래퍼) → `executeGlobalMerge`(두-패스 본문), `callChunksPooled`(병렬 풀), `callOneChunk`(캐시+재시도), `parseMergeResponse`(mappings 배열 + 구형 호환), `getOverview`/`getGlobalMenus`/`getCategoryTree`, `normalizeCategoryPath`, `TOP_WHITELIST`, `mergeChunkCacheKey`/`MERGE_SCHEMA_HASH`, `TtlCache`
- [`category-tree.ts`](../../apps/friendly/src/modules/analytics/category-tree.ts) — `buildCategoryTree(leaves) → CategoryTreeNodeType[]`. categoryPath 리스트를 계층 트리로. 전역·식당별 공용
- [`global-merge.prompts.ts`](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts) — system prompt **v3**, JSON schema(`{ mappings: [...] }` 배열), `GLOBAL_MERGE_VERSION = 3`, `GLOBAL_MERGE_CHUNK_SIZE = 10`
- [`global-merge-job-registry.ts`](../../apps/friendly/src/modules/analytics/global-merge-job-registry.ts) — in-memory 단일 잡 레지스트리, inflight 가드, pub/sub
- [`analytics.test.ts`](../../apps/friendly/src/modules/analytics/analytics.test.ts) — 두-패스, **병렬 처리 직렬=병렬 동일**, **청크 캐시 무손실(재실행 LLM 0회)**, mappings 배열 파싱, categoryPath 보존, q/category(`찌개·전골`) 필터, category tree 누적 합산 등
- 운영 스크립트: [`scripts/run-global-merge.ts`](../../apps/friendly/scripts/run-global-merge.ts), [`scripts/probe-merge.ts`](../../apps/friendly/scripts/probe-merge.ts), **(신규)** [`scripts/snapshot-global-merge.ts`](../../apps/friendly/scripts/snapshot-global-merge.ts)

`runGlobalMerge` → `executeGlobalMerge` 흐름:

1. **단일 머지 락** — `runGlobalMerge` 진입 시 인스턴스 플래그 `mergeInflight` 검사. 이미 진행 중이면 빈 결과로 skip(어드민 수동 + 스케줄 자동이 동시에 전량 리셋 트랜잭션에 진입해 서로의 중간 상태를 덮는 사고 방지). 단일 프로세스 + 앱 전역 singleton service 가정.
2. `MenuCanonical` 전체에서 distinct `canonicalNorm` 별 가장 빈번한(동률은 사전순 첫) 표기를 골라 input variants 결정.
3. **Pass 1** — chunk size **10**으로 분할, `callChunksPooled` 가 청크들을 **병렬 풀**로 LLM 호출(동시 in-flight 청크 promise 수 ≤ `MERGE_POOL_SIZE`). 각 청크는 `callOneChunk` — **캐시 조회 → 미스면 재시도 LLM 호출 → 성공 응답 캐시**. 응답은 `{ mappings: [{ variant, canonical, categoryPath }] }` 배열. 진행은 완료 순으로 emit 하되 결과는 인덱스 순 배열로 반영(순서 의존 보존).
4. **Pass 2** — pass1의 distinct canonical 들 사이의 충돌을 다시 LLM에 태운다(청크간 보더 이슈 해소). 후보가 chunk size 이하면 한 콜, 넘으면 다시 청크 분할. pass2 categoryPath 우선, 없으면 pass1 path fallback.
5. **DB 적용 (단일 트랜잭션)** — `GlobalMenuCanonical` upsert by globalKey + 미사용 globalKey 삭제, `GlobalMenuCanonicalLink` 전량 reset 후 재작성. Link 재작성은 **`LINK_INSERT_BATCH=1000` 단위로 스트리밍 createMany** — 전체를 단일 배열로 쌓아 한 방에 insert 하면 대량 데이터에서 피크 메모리가 터진다(pm2 OOM 의 실제 원인). 같은 트랜잭션 안에서 배치로 흘려보내 원자성은 유지하고 메모리만 상수화. 이번 런이 path를 못 주면 **기존 row의 categoryPath 보존**(`existingPathByKey`).
6. 트랜잭션 후 read 캐시(`readCache`) clear, OperationRun done 마감(skipped/failedChunks 메타 포함).

LLM 호출은 grammar `format`을 **주지 않는다** — `callOneChunk` 주석대로 ollama-cloud에서 format을 주면 응답이 통째로 비거나 categoryPath가 빠진다. 프롬프트만 주고 파서가 견고히 JSON을 추출한다(`probe:merge`로 검증).

### 성능 최적화 상수 (analytics.service.ts)

- `GLOBAL_MERGE_RETRY_LIMIT = 3` — 청크 LLM 호출 점증 백오프 재시도(첫 시도 포함). 일시 timeout/429/upstream 흡수. summary.service 와 동일 패턴. 모두 소진하면 호출자가 식별 매핑으로 폴백하되 `failedChunks` 로 집계(조용한 손실 → 부분완료 가시화).
- `LINK_INSERT_BATCH = 1000` — Link createMany 배치 크기(OOM 방어).
- `MERGE_POOL_SIZE = env.OLLAMA_CLOUD_MAX_CONCURRENT` — 동시에 메모리에 떠 있는 in-flight 청크 promise 수 상한. 실제 네트워크 동시성은 어댑터의 `ConcurrencyGate` 가 같은 env 로 강제(우회 불가)하므로, 풀을 게이트 cap 과 같게 잡아 큐 대기 없이 cap 을 꽉 채워 쓴다.
- `MERGE_SCHEMA_HASH` — sha256(systemPrompt | version | TOP_WHITELIST | 샘플링 파라미터) 앞 16자. 청크 캐시 무효화 축(복합 해시 — 이 중 하나라도 바뀌면 캐시 키가 달라져 옛 청크 결과가 자연 미스).
- `mergeChunkCacheKey(model, variants)` = sha256(model | schemaHash | `JSON.stringify(variants)`). variants 순서를 그대로 보존하므로 정확히 같은 입력일 때만 히트 → 히트 결과 = 그 입력의 실제 LLM 응답과 동일(**무손실**).

## Talks To [coverage: high — 6 sources]

- **`@repo/api-contract`** (zod import) — `AnalyticsOverview`, `GlobalMenuQuery`/`Result`, `GlobalMergeJob*`, `CategoryTreeNode`, `Routes.Analytics.*`. 모든 응답이 `fastify-type-provider-zod`로 자동 검증됨. 자세한 스키마는 [api-contract](api-contract.md).
- **`ai` 모듈** ([`AiConfigService`](../../apps/friendly/src/modules/ai/ai.config.service.ts) + [`adapter-cache`](../../apps/friendly/src/modules/ai/adapter-cache.ts)) — `ollama-cloud` provider 해석. provider 미설정이면 `AnalyticsError('no_provider')`. 입력이 0이면 `AnalyticsError('no_inputs')`. 어댑터 `ConcurrencyGate` 가 실동시성을 `OLLAMA_CLOUD_MAX_CONCURRENT` 로 강제.
- **`logs` 모듈** ([`OperationLogService`](../../apps/friendly/src/modules/logs/operation-log.service.ts)) — `runGlobalMerge` 가 서비스 내부에서 `global-merge` OperationRun 을 감싼다. stage: load/resolve_provider/pass1/pass2/merge_chunk/save. 재시도 소진(식별 매핑 폴백)·skipped(no_new_inputs/no_inputs) 사유가 영속 로그·meta 로 남아 "조용한 손실"을 사후 추적. 호출자가 둘(어드민=jobId, 스케줄=parentRunId)이라 계측을 서비스 내부에 둬 누락을 막았다.
- **`summary` 모듈** ([`extractFirstJsonObject`, `normalizeTerm`](../../apps/friendly/src/modules/summary/summary.service.ts)) — JSON 추출과 정규화 함수 재사용. `MenuMention.nameNorm` ↔ `MenuCanonical.nameNorm` 매칭으로 통계 join.
- **`menu-grouping`(식당 단위)** — `MenuCanonical` 행을 입력으로 받기만 하고 직접 호출은 하지 않음. 의존 방향은 한 방향(이 토픽 → menu-grouping 산출물). [menu-grouping](menu-grouping.md).
- **`restaurant` 모듈** — `category-tree.ts`의 `buildCategoryTree`를 import해 공개 식당별 카테고리 트리(`GET /restaurants/public/:placeId/category-tree`)를 같은 노드 구조로 만든다. 의존 방향은 restaurant → analytics(트리 빌더만).
- **schedule** — 어드민이 cron으로 "미분류 식당 메뉴 정규화 → 전역 머지"를 자동 실행하는 루틴이 [schedule](schedule.md)에 있고, AdminAnalyticsPage가 그 UI를 같이 호스팅한다.
- **Prisma / SQLite** — 트랜잭션으로 `GlobalMenuCanonical*` reset + 배치 Link insert, raw SQL로 sentiment GROUP BY (Prisma의 N+1 회피), `GlobalMergeChunkCache` upsert/findUnique.

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
| GET | `/restaurants/public/:placeId/category-tree` | 공개. 이 식당 멘션만 누적한 `{ roots: CategoryTreeNode[] }`. coverage 없으면 빈 배열 |

SSE 약속: 연결 직후 `snapshot` 1회 emit(replay). 끝난 잡이면 `done` 즉시 + close. 진행 중이면 `chunk` push + 15초마다 `: hb` heartbeat. `GlobalMergeJobChunkProgress = { pass: 1|2, chunkIndex, chunkTotal, mappedInChunk }`. 병렬 풀이라 `chunk` event 는 도착(완료) 순으로 오고 인덱스가 단조 증가하지 않을 수 있다 — registry `recordChunk` 가 doneChunks/totalChunks 를 max 처리.

운영 CLI (서버 우회, package.json scripts):
- `pnpm --filter friendly run-merge -- [--full]` — `runGlobalMerge` 직접 실행 + categoryPath 커버리지 출력.
- `pnpm --filter friendly probe:merge [N] [tokens]` — 같은 입력을 운영 스키마/format 없음/배열 스키마 3변량으로 돌려 raw 응답·토큰·파싱가능성 비교. 빈 응답/truncation 진단.
- `pnpm --filter friendly snapshot:merge [out.json]` / `-- --diff a.json b.json` — **(신규)** 머지 결과 골든셋 스냅샷·비교. 그룹 추가/삭제·norm 재매핑·categoryPath 변경을 diff 해 무손실 변경(병렬화·캐시·스트리밍)이 결과를 안 바꿨는지 객관 검증.

## Data [coverage: high — 5 sources]

소유 테이블 (전부 [`schema.prisma`](../../apps/friendly/prisma/schema.prisma)):

- **`GlobalMenuCanonical`** — `id`, `globalKey`(unique), `displayName`, `categoryPath?`, `version`, `model`, `createdAt`/`updatedAt`. `categoryPath`에 단일 인덱스(not-null 필터용; prefix LIKE는 결과 후처리).
- **`GlobalMenuCanonicalLink`** — `MenuCanonical` ↔ `GlobalMenuCanonical` 다대일. `menuCanonicalId`가 unique(한 식당 그룹 = 정확히 한 글로벌 그룹). `restaurantId`, `localCanonicalNorm` 비정규화(통계 raw 쿼리 join 절감). onDelete:Cascade.
- **`GlobalMergeChunkCache`** — **(신규)** 머지 청크 LLM 결과 메모이즈. `id`, `cacheKey`(unique), `mappingsJson`, `model`, `schemaHash`(인덱스), `createdAt`. cacheKey = sha256(model | schemaHash | variants). 성공 응답만 저장(실패 청크는 안 남겨 다음 머지가 재시도). 전량 머지여도 변하지 않은 청크는 히트로 LLM 0회.

읽기 전용 의존:
- **`MenuCanonical`** (소유 menu-grouping) — distinct `canonicalNorm`이 머지 입력.
- **`MenuMention`** (소유 summary) — `(restaurantId, nameNorm)` 기준 raw SQL GROUP BY로 sentiment 카운트. 전역 통계와 식당별 트리가 동일 쿼리 재사용.
- **`ReviewSummary`** — overview의 `analyzedReviewCount`(status=done)만.

마이그레이션:
- [`20260508134403_add_analytics_tables`](../../apps/friendly/prisma/migrations/20260508134403_add_analytics_tables/migration.sql) — `menu_mentions` + `review_tags`.
- [`20260508145554_add_global_menu_canonicals`](../../apps/friendly/prisma/migrations/20260508145554_add_global_menu_canonicals/migration.sql) — 글로벌 두 테이블.
- [`20260508154445_add_global_menu_category_path`](../../apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql) — `categoryPath` 컬럼 + 인덱스.
- [`20260619075115_add_random_crawl`](../../apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql) — **`global_merge_chunk_cache` 테이블 생성** + cacheKey unique / schemaHash 인덱스 (random_crawl 테이블과 같은 마이그레이션에 동봉).

**v3는 마이그레이션 없음** — 스키마 변경이 아니라 categoryPath의 *값 규약*(택소노미)이 바뀐 것이라 DB 컬럼은 그대로다. 적용은 데이터 재작성(full 재머지)으로만 일어난다.

잡 상태는 메모리만(`global-merge-job-registry.ts`). FINISHED_TTL 10분, 1분마다 GC. 통계 read 캐시 `TtlCache` 60초, 머지 done 시 `clear()`. 단일 인스턴스 가정 — [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md).

## Key Decisions [coverage: high — 7 sources]

- **18차(2026-06): 청크 병렬 풀(`callChunksPooled`, 풀 = 게이트 cap)** — 직렬 청크 호출이 전량 재계산을 느리게 했다. 청크를 병렬로 띄우되 동시 in-flight promise 수를 `MERGE_POOL_SIZE`(=`OLLAMA_CLOUD_MAX_CONCURRENT`)로 cap. 실 네트워크 동시성은 어댑터 게이트가 강제하므로 이 풀은 "메모리에 떠 있는 promise 수"를 게이트 cap 과 맞춰 큐 대기 없이 cap 을 꽉 채워 쓰는 용도(메모리 보호). 결과는 인덱스 순 배열로 반영 — categoryPath first-non-null 채택이 순서 의존이라 병렬이어도 직렬과 비트 동일. [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md).
- **18차(2026-06): 청크 결과 캐시(`GlobalMergeChunkCache`) — 무손실 메모이즈** — 같은 청크(입력 표기 배열, 순서 그대로)를 다시 묻지 않는다. cacheKey 가 variants 순서를 보존하므로 히트 결과 = 그 입력의 실제 LLM 응답과 동일(무손실). schemaHash 가 프롬프트·버전·화이트리스트·샘플링을 묶어, 그중 하나라도 바뀌면 키가 달라져 옛 캐시는 자연 미스. 캐시 조회/저장 실패(일시 DB 락)는 삼키고 미스로 간주 — 캐시는 최적화일 뿐 머지를 멈추면 안 된다.
- **18차(2026-06): Link insert 배치 스트리밍(`LINK_INSERT_BATCH`) — OOM 수정** — 전체 링크(1천여 행 이상)를 단일 배열로 쌓아 한 방에 createMany 하면 피크 메모리가 터져 pm2 `max_memory_restart` 가 머지를 중단시켰다(실제 원인). 같은 트랜잭션 안에서 1000 단위로 흘려보내 원자성 유지 + 메모리 상수화.
- **18차(2026-06): 청크 재시도(`GLOBAL_MERGE_RETRY_LIMIT=3`) + `failedChunks` 가시화** — 일시 timeout/429/upstream 을 점증 백오프로 흡수. 모두 소진하면 그 청크를 식별 매핑으로 폴백하되 `failedChunks` 로 집계해 result/run meta 에 노출 — 조용한 손실을 부분완료로 가시화.
- **18차(2026-06): 단일 머지 락(`mergeInflight`)** — 어드민 수동 + 스케줄 자동이 동시에 전량 리셋 트랜잭션에 들어가면 서로의 중간 상태를 덮는다. 인스턴스 플래그 하나로 상호배제, 이미 진행 중이면 빈 결과 skip. 단일 프로세스 + 앱 전역 singleton 가정.
- **17차(2026-06): 택소노미 음식종류→재료·메뉴군 전환 (`GLOBAL_MERGE_VERSION` 2→3, full 재머지 필요)** — 최상위 축을 *음식 종류*에서 **재료·메뉴군**으로: `고기 / 해산물 / 밥 / 면 / 국·탕 / 찌개·전골 / 김치 / 반찬 / 튀김 / 회·초밥 / 분식 / 디저트 / 음료 / 주류 / 기타`. 깊이 2~3단계. categoryPath 를 새로 채우려면 **full=true 재머지** 한 번. [versioned-llm-prompts](../concepts/versioned-llm-prompts.md) 인스턴스.
- **17차(2026-06): 출력 맵→배열 (Ollama grammar fix)** — `{ mappings: [{variant,canonical,categoryPath}] }` 배열로 변경. Ollama(llama.cpp) grammar 가 additionalProperties 값 스키마를 변환 못 해 응답이 통째로 비던 버그 회피. 파서는 신규 배열 + 구형(맵/문자열) 모두 수용.
- **17차(2026-06): 청크 50→10 (reasoning 모델 완주 우선)** — reasoning 모델은 청크가 크면 thinking 토큰 폭증으로 60s 타임아웃·truncation → 빈 응답 → 식별 매핑 silent 손상. `probe:merge`로 10개≈2900토큰 안정 확인. 작게 잡고 pass2 재통합 — 정확도보다 "완주" 우선.
- **17차(2026-06): `buildCategoryTree` 공용화** — categoryPath 리스트 → 계층 트리(모든 prefix 노드화 + 잎 통계 부모 누적, 자식은 멘션 많은 순, positiveRatio 계산)를 단일 구현으로 전역·식당별 공용.
- **카테고리 트리에 별도 테이블 없음** — `categoryPath` 단일 컬럼 + 메모리 트리 빌드. 필터는 `prefix === path || path.startsWith(prefix + " > ")`. 깊이 ≤ 3, 노드 수백 규모라 단일 컬럼이 압승.
- **`normalizeCategoryPath` 화이트리스트 prepend** — 모델이 가끔 슬래시·별표기를 써서 표준 `" > "`로 통일하고, 최상위가 `TOP_WHITELIST`(재료·메뉴군 15종) 외면 `"기타"` prepend — 루트 폭발 방지.
- **두-패스 머지** — pass1은 청크 경계 안에서만 일관. 다른 청크의 변형을 pass2가 distinct canonical끼리 다시 묶어 해소. 단일 호출은 토큰 한도·정확도 폭락이라 chunk + reconcile이 절충점.
- **단일-잡 + 409 응답** — `inflightJobId()` 한 줄 가드. 두 어드민이 동시에 눌러도 두 번째가 409 + 기존 snapshot을 받아 같은 진행 화면을 본다.
- **SSE 첫 emit으로 snapshot 재생 / DB reset 후 createMany / 이전 버전 결정 보존** — 새로고침해도 SSE 한 번에 현재 상태; Link 는 매 머지마다 전량 reset(멱등+stale 청소); v1(string→string)·v2(`{canonical,categoryPath}` 객체) 회신도 fallback 수용하되 새 path 는 full 재실행 필요.

## Gotchas [coverage: medium — 6 sources]

- **청크 캐시 테이블은 마이그레이션에 있다 (드리프트 아님)** — `global_merge_chunk_cache` 는 [`20260619075115_add_random_crawl`](../../apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql) 가 `CREATE TABLE` 한다. 과거 개발 중 수동 생성(스키마 drift)으로 운영돼 본 이력이 있을 수 있으나, **현재 커밋된 코드는 정식 마이그레이션** 이다. 운영 DB 가 이 마이그레이션 이전 상태에서 수동 테이블로 굴러왔다면 `_prisma_migrations` 와 실제 스키마 정합을 한 번 확인(`db:migrate` 적용 시 "already exists" 충돌 가능).
- **`TOP_WHITELIST` ↔ 프롬프트 동기화 필수** — `analytics.service.ts`의 `TOP_WHITELIST`와 `global-merge.prompts.ts`의 [카테고리 path 규칙] 최상위 목록이 어긋나면, LLM이 정상 출력한 path가 전부 `"기타 > …"`로 떨어진다. 둘은 항상 같은 15종. 게다가 `TOP_WHITELIST` 는 `MERGE_SCHEMA_HASH` 의 입력이라 바꾸면 **청크 캐시가 전량 무효화**(의도된 동작 — 규칙이 바뀌면 재계산해야 한다).
- **세그먼트 구분자 금지 문자** — 카테고리 이름에 `/` `>` `→` `|` 금지(`normalizeCategoryPath`가 이 문자들로 쪼갠다). 복합어는 가운뎃점(·) — "국·탕"이 정답.
- **증분(full=false) vs 전체(full=true) 재머지** — v3 택소노미나 새 카테고리 규약을 적용하려면 반드시 full=true. 증분은 미링크 그룹만 단순 chunking 하고 기존 path 를 안 바꾼다. full=false 에서 신규(미링크) 입력이 없으면 totalChunks=0 → run 은 done(skipped: no_new_inputs).
- **`failedChunks > 0` 이면 done 이어도 부분완료** — 재시도까지 실패한 청크는 식별 매핑으로 폴백돼 그 메뉴가 그룹화/categoryPath 없이 떨어진다. result/run meta 의 `failedChunks` 로만 드러나므로(에러 아님) 운영 로그에서 확인. `probe:merge` 로 토큰·파싱가능성 먼저 점검.
- **병렬이어도 결정적이어야 한다** — categoryPath first-non-null 채택이 순서 의존이라, `callChunksPooled` 는 완료 순으로 진행을 emit 하되 **결과는 인덱스 순 배열**로 반환해 직렬과 비트 동일을 보장. 응답 도착 순서를 역전시켜도 결과가 같은지 테스트가 검증한다("직렬=병렬 동일"). 새 병렬 경로를 고칠 때 이 불변식 깨지 않게 주의.
- **버전 < 3 stale 매핑 / `includeUnlinked` 가짜 그룹 / `pathByGlobalKey` first non-null** — 구버전 row 는 stale 배지만, 자동 마이그레이션 안 함; `unlinked:<canonicalNorm>` 가짜 그룹은 categoryPath 항상 null(비교용); 같은 globalKey 의 여러 norm 이 다른 path 면 pass2 우선 → pass1 → first non-null, 의심되면 full=true 한 번.
- **dev.db 잔재로 테스트 입력 카운트 변동** — 테스트는 절대값 대신 `toBeGreaterThanOrEqual` + 부분 매치. afterEach 가 `globalMenuCanonical` + `globalMergeChunkCache` 를 비운다(캐시를 안 비우면 callIndex 기반 mock 이 히트로 호출이 줄어 깨진다). 새 테스트도 같은 패턴 유지.
- **다이닝코드 행은 placeId null** — analytics는 네이버 전용 스코프라 placeId null인 식당은 통계 집계에서 skip(스키마 응답이 `placeId: z.string()`이라 직렬화 실패 방지).

## Sources

- [`apps/friendly/src/modules/analytics/global-merge.prompts.ts`](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts)
- [`apps/friendly/src/modules/analytics/analytics.service.ts`](../../apps/friendly/src/modules/analytics/analytics.service.ts)
- [`apps/friendly/src/modules/analytics/category-tree.ts`](../../apps/friendly/src/modules/analytics/category-tree.ts)
- [`apps/friendly/src/modules/analytics/analytics.route.ts`](../../apps/friendly/src/modules/analytics/analytics.route.ts)
- [`apps/friendly/src/modules/analytics/global-merge-job-registry.ts`](../../apps/friendly/src/modules/analytics/global-merge-job-registry.ts)
- [`apps/friendly/src/modules/analytics/analytics.test.ts`](../../apps/friendly/src/modules/analytics/analytics.test.ts)
- [`apps/friendly/scripts/run-global-merge.ts`](../../apps/friendly/scripts/run-global-merge.ts)
- [`apps/friendly/scripts/probe-merge.ts`](../../apps/friendly/scripts/probe-merge.ts)
- [`apps/friendly/scripts/snapshot-global-merge.ts`](../../apps/friendly/scripts/snapshot-global-merge.ts)
- [`apps/friendly/prisma/schema.prisma`](../../apps/friendly/prisma/schema.prisma)
- [`apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql`](../../apps/friendly/prisma/migrations/20260508154445_add_global_menu_category_path/migration.sql)
- [`apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql`](../../apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql)
- [`packages/api-contract/src/schemas/analytics.ts`](../../packages/api-contract/src/schemas/analytics.ts)
- [`packages/api-contract/src/schemas/restaurant.ts`](../../packages/api-contract/src/schemas/restaurant.ts)
- [`apps/web/src/routes/admin/AdminAnalyticsPage.tsx`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx)
