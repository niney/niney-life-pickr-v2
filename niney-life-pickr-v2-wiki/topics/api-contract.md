---
topic: api-contract
last_compiled: 2026-05-09
sources_count: 15
status: active
aliases: [zod, schemas, ssot, contracts, "@repo/api-contract", naver-search-result, crawl-search-query, crawl-search-result, search-bbox]
---

# api-contract — Zod 공유 스키마 (SSOT)

`@repo/api-contract` 은 모노레포 전체의 API I/O 단일 진실 공급원(Single Source of Truth)이다.
서버(friendly)와 클라이언트(web/mobile, `@repo/shared` 경유) 양쪽이 동일한 Zod 스키마와
라우트 경로 상수를 공유한다.

## Purpose [coverage: high — 5 sources]

API 의 입력/출력을 한 곳에서 정의하기 위한 Zod 스키마 패키지다. 동일한 스키마가
세 가지 역할을 동시에 수행한다.

- **friendly (Fastify)** — `fastify-type-provider-zod` 가 동일 스키마로 요청/응답을
  런타임 검증하고, 그 메타데이터로 OpenAPI 문서를 자동 생성한다.
- **web / mobile** — `@repo/shared` 의 fetch 함수가 `z.infer<typeof X>` 로 추출한
  타입으로 정적 타입을 부여한다 (런타임 파싱은 옵션).
- **route 경로** — `routes.ts` 의 `Routes.*` 가 서버 라우터 등록과 클라이언트 호출
  양쪽에 같은 문자열을 공급해, 경로 오타로 인한 미스매치를 컴파일 타임에 차단한다.

CLAUDE.md 에 명시된 핵심 규칙 그대로다 — _"FE/BE 모두 사용하는 타입/검증 로직은 반드시
`packages/api-contract/src/schemas/` 에 zod 스키마로 정의한다"_ ([CLAUDE.md](../../CLAUDE.md)).

## Architecture [coverage: high — 6 sources]

### 디렉터리 구조

```
packages/api-contract/
├── package.json          # exports: src/*.ts 직접 노출 (no build)
├── tsconfig.json         # @repo/config/tsconfig/base.json 상속
└── src/
    ├── index.ts          # 모든 스키마 + Routes namespace 재내보내기
    ├── routes.ts         # API_PREFIX + 도메인별 경로 상수
    └── schemas/
        ├── common.ts        # Id, Timestamp, ErrorResponse, Pagination
        ├── auth.ts          # Register/Login/AuthResponse
        ├── user.ts          # Role, User, PublicUser
        ├── picks.ts         # Pick, PickCategory, Create/Update/Result
        ├── admin.ts         # AdminUsersResponse, SetRole
        ├── crawl.ts         # NaverPlace 크롤러 + Job/SSE Event 모델 + VisitorReviewVideo + 검색 스키마 (어드민 발견용)
        ├── restaurant.ts    # 어드민 상세/목록 + 공개 랭킹/리스트/상세 + 리뷰 분석 + summary SSE + insights/smart-pick + analytics backfill
        ├── menu-grouping.ts # 식당 단위 메뉴 정규화 + ranking + grouping job (다건/SSE)
        ├── analytics.ts     # 글로벌(식당 가로지르기) 메뉴 통계 + 머지 잡 + category tree (z.lazy 재귀)
        ├── ai.ts            # AI 호출 + 배치 + LLM Provider 관리
        └── settings-map.ts  # 외부 지도 SDK provider config (admin + public reveal)
```

### 빌드 없는 src 직접 노출

[packages/api-contract/package.json](../../packages/api-contract/package.json) 는 `dist/`
가 아니라 `src/` 를 그대로 `exports` 한다.

```json
"main": "./src/index.ts",
"types": "./src/index.ts",
"exports": {
  ".": "./src/index.ts",
  "./schemas/*": "./src/schemas/*.ts",
  "./routes": "./src/routes.ts"
}
```

이 구조 덕분에 tsx (friendly), Vite (web), Metro (mobile) 가 모두 워크스페이스 소스를
바로 트랜스파일한다. Turborepo 의 변경 감지도 빌드 산출물을 거치지 않기 때문에
`pnpm typecheck` 한 번이면 모든 소비자가 즉시 영향을 본다. friendly 는 `injected`
의존성 (workspace + nodeLinker=hoisted) 으로 src 를 직접 본다 — 빌드 산출물 없이도
런타임에서 이 패키지가 그대로 import 가능한 이유.

### 도메인 분할

[src/index.ts](../../packages/api-contract/src/index.ts) 는 단순한 배럴 — 도메인별
파일을 그대로 `export *` 하고, `routes.ts` 는 `Routes` 네임스페이스로 재노출한다.

```ts
export * from './schemas/common.js';
export * from './schemas/auth.js';
export * from './schemas/user.js';
export * from './schemas/picks.js';
export * from './schemas/admin.js';
export * from './schemas/crawl.js';
export * from './schemas/restaurant.js';
export * from './schemas/menu-grouping.js';
export * from './schemas/analytics.js';
export * from './schemas/ai.js';
export * from './schemas/settings-map.js';
export * as Routes from './routes.js';
```

ESM `.js` 확장자는 TypeScript NodeNext 해석을 위한 의도적 표기 (실파일은 `.ts`).

### 도메인 간 의존 방향 (one-way)

`restaurant.ts` 가 `crawl.ts` 의 `NaverPlaceData`/`VisitorReview` 뿐 아니라
공개 상세에 평탄화해 노출하는 `BlogReview`/`MenuItem` 까지 import 한다. 역방향은
절대 없다. `visitor_batch` SSE 가 페이로드로 실어 보내는 `PersistedVisitorReview`
도 — 의미상 "맛집 상세에 머지될 행" 이지만 — 의도적으로 `crawl.ts` 에 정의했다.
restaurant → crawl 순환이 발생하지 않도록 한 방향만 허용한다.

`menu-grouping.ts` 와 `analytics.ts` 는 각자 독립 — 서로 import 하지 않고, restaurant
에도 의존하지 않는다. 식당 단위 ranking (`menu-grouping`) 과 글로벌 통계 (`analytics`)
가 같은 canonical 그룹 모델을 공유하지만 stat 페이로드의 모양은 별도로 선언해서 변경
파급을 좁힌다. `menu-grouping.MenuRankingItem.global` 만이 글로벌과 연결된 뷰인데,
이 필드는 `analytics.GlobalMenuStat` 을 import 하지 않고 inline object 로 풀어 쓴 것.

`settings-map.ts` 는 다른 어떤 schemas/ 파일도 import 하지 않는다 — provider config
모델은 LLM `LlmProviderConfig` 와 형태가 비슷하지만 의도적으로 중복 선언했다 (지도
provider 는 `model/maxConcurrent` 같은 LLM 고유 옵션을 갖지 않으므로).

## Talks To [coverage: medium — 3 sources]

- **friendly (apps/friendly)** — 각 `*.route.ts` 가 `RegisterInput`, `CrawlEvent`,
  `RestaurantListResult`, `RestaurantPublicListResult`, `RestaurantPublicDetail`,
  `RestaurantSummaryReviewEvent`, `RestaurantInsights`, `RestaurantSmartPickInput/Result`,
  `MenuRankingResult`, `MenuGroupingJobInput/Snapshot`, `GlobalMenuResult`,
  `GlobalMergeJobInput/Snapshot`, `CategoryTreeResult`, `AdminUsersResponse`,
  `AiCompleteInput`, `UpdateLlmProviderInput`, `MapProviderConfig`, `MapProviderPublicConfig`
  등을 `schema: { body, response }` 로 등록하면 fastify-type-provider-zod 가 검증 +
  핸들러 타입 추론 + OpenAPI 스펙 생성을 한 번에 처리한다.
- **@repo/shared** — `Routes.Auth.login`, `Routes.Crawl.jobEvents(id)`,
  `Routes.Restaurant.summaryEvents` (constant), `Routes.Restaurant.reanalyze(id)`,
  `Routes.Restaurant.menusGroup(id)`, `Routes.Restaurant.menusRanking(id)`,
  `Routes.Restaurant.analyticsBackfill`, `Routes.Restaurant.smartPick`,
  `Routes.Restaurant.publicList`, `Routes.Restaurant.publicByPlaceId(placeId)`,
  `Routes.Restaurant.publicInsights(placeId)`,
  `Routes.Analytics.{restaurantsStatus, groupingJobs, groupingJobEvents(id), overview, globalMenus, globalMergeJobs, globalMergeJobEvents(id), categoryTree}`,
  `Routes.SettingsMap.{list, provider(id), secret(id), publicConfig}`,
  `Routes.Media.thumbnail`, `Routes.Ai.complete` 같은
  경로 헬퍼/상수와 `z.infer<typeof AuthResponse>` 같은 추론 타입을 import 해서 fetch
  래퍼와 React Query 훅을 구성한다.
- **web / mobile** — `@repo/shared` 를 통해 간접 의존. 직접 import 도 가능하지만
  관례상 fetch 헬퍼 경유. 신규 공개 페이지(맛집 지도/상세) 도 동일 — 비로그인
  컨텍스트지만 contract 는 어드민과 같은 패키지에서 추론.

순환 의존 규칙: shared → api-contract 만 허용, 반대 방향은 금지 ([CLAUDE.md](../../CLAUDE.md)).

## API Surface [coverage: high — 13 sources]

### `schemas/common.ts` — [common.ts](../../packages/api-contract/src/schemas/common.ts)

| Export | 용도 |
| --- | --- |
| `IdSchema` / `Id` | 비어있지 않은 문자열 ID |
| `TimestampSchema` | ISO 8601 datetime 문자열 |
| `ErrorResponseSchema` / `ErrorResponse` | Fastify 에러 형식 (`statusCode`, `error`, `message`) |
| `PaginationQuerySchema` / `PaginationQuery` | `page`, `limit` (coerce, 기본 1/20, 최대 100) |
| `PaginatedSchema(item)` | 제네릭 페이지 응답 빌더 (`items`, `total`, `page`, `limit`) |

### `schemas/auth.ts` — [auth.ts](../../packages/api-contract/src/schemas/auth.ts)

| Export | 용도 |
| --- | --- |
| `RegisterInput` | email + 8~100자 password |
| `LoginInput` | email + 비어있지 않은 password |
| `AuthResponse` | `{ token, user }` JWT 응답 |

### `schemas/user.ts` — [user.ts](../../packages/api-contract/src/schemas/user.ts)

| Export | 용도 |
| --- | --- |
| `RoleSchema` / `Role` | `'USER' \| 'ADMIN'` |
| `UserSchema` / `User` | id, email, role, timestamps |
| `PublicUserSchema` / `PublicUser` | id + createdAt 만 노출 |

### `schemas/picks.ts` — [picks.ts](../../packages/api-contract/src/schemas/picks.ts)

| Export | 용도 |
| --- | --- |
| `PickCategorySchema` | `food / activity / movie / travel / other` |
| `PickSchema` / `Pick` | 하나의 선택지 묶음 (title 1~100자, options 2~20개) |
| `CreatePickInput` | `title + options + category` (zod `.pick()`) |
| `UpdatePickInput` | `CreatePickInput.partial()` |
| `PickResultSchema` / `PickResult` | `{ pickId, chosen, pickedAt }` |

### `schemas/admin.ts` — [admin.ts](../../packages/api-contract/src/schemas/admin.ts)

| Export | 용도 |
| --- | --- |
| `AdminUsersResponse` | `{ users: User[] }` |
| `SetRoleParams` | URL param 검증 (`id`) |
| `SetRoleBody` | `{ role: 'USER' \| 'ADMIN' }` |

### `schemas/crawl.ts` — [crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)

| Export | 용도 |
| --- | --- |
| `CrawlMode` | `'create' \| 'recrawl' \| 'update'` |
| `CrawlNaverPlaceInput` | `{ url, mode }` URL 입력 |
| `MenuItem` | 메뉴 한 건 (name, price, recommend, imageUrls). restaurant.ts 의 공개 상세에서도 재사용 |
| `ReviewThemeKeyword` / `RatingDistributionBucket` / `ReviewStats` | 리뷰 통계 |
| `BlogReview` | 블로그 리뷰 항목. restaurant.ts 의 `RestaurantPublicDetail.blogReviews` 에서도 재사용 |
| `VisitorReviewVideo` | 방문자 리뷰 영상 (`posterUrl` = 썸네일 프록시 가능, `videoUrl` = Akamai 직링크 — 프록시 안 함) |
| `VisitorReview` | 방문자 리뷰 (`videos: VisitorReviewVideo[].default([])`, `externalId: string \| null \| undefined` — 영속화용 dedup 키) |
| `PersistedVisitorReview` | DB 영속화 후의 행 모양 (`VisitorReview.extend({ id, externalId: nullable, fetchedAt })`). `visitor_batch` SSE 페이로드 |
| `NaverPlaceData` | 크롤 결과 본체 (장소 메타 + 메뉴 + 리뷰 통계 + 리뷰 목록) |
| `CrawlErrorCode` | 에러 코드 enum (11종) |
| `CrawlNaverPlaceResult` | `discriminatedUnion('ok')` — 동기 결과 |
| `CrawlStage` | SSE 진행 단계 enum (queued → done) |
| `CrawlEvent` | SSE 이벤트 (`progress / partial / visitor_progress / visitor_batch / done / error`). `visitor_batch` 는 `addedCount` + `persistedReviews` 를 추가로 실어 클라이언트가 detail GET 없이 캐시에 머지 가능 |
| `CrawlJobStatus` / `CrawlJob` | 잡 상태 + 잡 본체 |
| `StartCrawlInput` / `StartCrawlResult` | 잡 시작 입력/결과. 성공 분기에 `deduped: boolean`, optional `queued: boolean` (true = 동시성 캡 도달, FIFO 큐 대기 중. 자리가 나면 자동 시작, 그 동안 SSE 는 `stage='queued'`) |
| `CrawlJobListResult` | `{ jobs: CrawlJob[] }` |
| **`NaverSearchResult`** | **신규 (검색 — 어드민 발견 전용).** 네이버 PC 지도 키워드 검색 결과 한 항목. `{ placeId, name, category, address, roadAddress, lat, lng, phone, thumbnailUrl, reviewCount, rawSourceUrl }`. `placeId` 는 네이버 응답의 `id`, `lat/lng` 는 응답의 `y/x` 를 Number 변환, `rawSourceUrl` 은 `https://map.naver.com/p/entry/place/{placeId}` 합성 — 기존 url-normalizer 가 placeId 추출 가능한 정규 진입 URL |
| **`CrawlSearchQuery`** | **신규 (검색).** querystring `{ q: 1~100자, bbox? }`. `bbox` regex `^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$` 는 공개 맛집 `RestaurantPublicListQuery.bbox` 와 같은 패턴 |
| **`CrawlSearchResult`** | **신규 (검색).** `{ items: NaverSearchResult[], source: 'playwright' }`. `source` 는 어떤 어댑터가 응답을 만들었는지 노출 — 추후 비공식 fallback 추가 가능성을 enum 으로 표현 (현재는 단일 값) |

### `schemas/restaurant.ts` — [restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)

어드민 (운영용) + 공개 (게스트/비로그인용) 두 갈래의 식당 스키마를 한 파일에 묶었다.
공개 스키마는 어드민 모델에서 운영 메타 (status/errorCode/model) 를 의도적으로
제거하고 평탄화한 별개 객체다 — 같은 데이터지만 노출 표면이 다르다.

| Export | 용도 |
| --- | --- |
| `ReviewSummaryStatus` | `'pending' \| 'running' \| 'done' \| 'failed'` enum — 리뷰 단위 AI 요약 상태 (어드민 전용) |
| `ReviewSentiment` | `'positive' \| 'negative' \| 'neutral' \| 'mixed'` — 전체 감정 |
| `MenuSentiment` | `'positive' \| 'negative' \| 'neutral'` — 메뉴 단위 (mixed 없음) |
| `ReviewAnalysisMenu` | `{ name, sentiment?, traits: z.array(z.string()).optional().default([]) }` — 리뷰에서 추출된 메뉴 한 건. `traits` 는 v4 LLM 출력 (예: `["진한", "얼큰한", "푸짐한"]`). v3 잔존 행 호환을 위해 optional + default([]) — output 타입은 항상 배열. 어드민/공개 양쪽이 공유 |
| `ReviewAnalysis` | LLM 한 호출이 출력하는 구조화 분석. `{ summary, sentiment, sentimentScore(-1~1), satisfactionScore(1~5), menus, tips, keywords }` |
| `ReviewSummary` | DB 영속화된 분석 결과. `text` 는 `ReviewAnalysis.summary` 와 동일. `sentiment/sentimentScore/satisfactionScore/menus/tips/keywords` 모두 nullable (구버전 행 호환). 운영 메타 (`status/model/errorCode/errorMessage/startedAt/finishedAt`) 도 동봉 |
| `VisitorReviewWithSummary` | `VisitorReview.extend({ id, externalId: nullable, fetchedAt, summary: ReviewSummary.nullable() })` — 어드민 상세 페이지가 받는 리뷰 행 |
| `RestaurantDetail` | `GET /admin/restaurants/place/:placeId` 응답. 메타 + `snapshot: NaverPlaceData` (visitorReviews 비움) + `reviews: VisitorReviewWithSummary[]` |
| `RestaurantListItem` | 어드민 목록용 압축 행. 메타 + 요약 카운트 (`summaryPending/Running/Done/Failed`) + 분석 집계 (`avgSentimentScore`, `avgSatisfactionScore`, `positive/negative/neutral/mixedCount`) 인라인 |
| `RestaurantListResult` | `{ items: RestaurantListItem[] }` |
| `RestaurantDeleteResult` | `{ ok: true, deletedReviewCount }` |
| `RestaurantReanalyzeResult` | `{ ok: true, queued }` — `analysisVersion` 백필 트리거 응답 |
| `RestaurantAnalyticsBackfillResult` | `{ ok: true, processed }` — 정규화 분석 테이블 (menu_mentions / review_tags) 일회성 백필 응답. LLM 재호출 없이 이미 저장된 menusJson/tipsJson/keywordsJson 을 풀어쓰는 작업 |
| `RestaurantSmartPickInput` | `{ candidatePlaceIds?, strategy: 'balanced' \| 'satisfaction' \| 'positive' }` — 가중 랜덤 픽 입력 |
| `RestaurantSmartPickResult` | `{ picked: { placeId, name, weight, avgSentimentScore, avgSatisfactionScore } \| null, candidates, strategy }` |
| `RestaurantInsightMenuStat` / `RestaurantInsightTermStat` | 식당 단위 집계 항목 |
| `RestaurantInsights` | `{ analyzedCount, avgSentimentScore, avgSatisfactionScore, sentimentDistribution, topMenus, topTips, topKeywords }` — 식당 단위 인사이트. 어드민 + 공개 둘 다 동일 응답 객체를 사용 (`Routes.Restaurant.insights` / `publicInsights` 가 같은 schema) |
| `RestaurantRankingQuery` / `RestaurantRankingItem` / `RestaurantRankingResult` | 공개 랭킹 (홈 카드용). 긍/부 비율 정렬, 중립 토글, minMentions 컷오프 |
| **`RestaurantPublicListQuery`** | **신규.** 공개 지도 리스트 querystring. `q?(1~120자)`, `category?(1~80자)`, `bbox?` (`"minLng,minLat,maxLng,maxLat"` regex `^-?\d+(\.\d+)?,...$`), `sort: 'recent' \| 'satisfaction' \| 'positive' \| 'rating' (default 'recent')`, `limit: 1~200 (default 60)`, `offset: ≥0` |
| **`RestaurantPublicListItem`** | **신규.** 공개 지도 행. 어드민 `RestaurantListItem` 과 분리된 별개 모양. `placeId, name, category, address, roadAddress, rating, reviewCount, latitude, longitude, thumbnailUrl, firstCrawledAt` + AI 통계 (`analyzedCount, avgSentimentScore, avgSatisfactionScore, positiveCount, negativeCount, neutralCount`). 어드민 `mixedCount` 는 빠짐 — 공개 화면은 3범주 분포만 노출 |
| **`RestaurantPublicListResult`** | **신규.** `{ items: RestaurantPublicListItem[], total }`. 어드민 list 와 달리 `total` 동봉 — 페이지네이션이 가능한 공개 리스트라 |
| **`PublicReviewAnalysis`** | **신규.** 공개 상세 페이지가 받는 리뷰 분석 객체. `{ text, sentiment, sentimentScore, satisfactionScore, menus, tips, keywords, finishedAt }`. 어드민 `ReviewSummary` 의 운영 메타 (`status/model/errorCode/errorMessage/startedAt`) 를 의도적으로 제거 — 사용자가 볼 필요 없음. 분석 안 된 리뷰는 부모 객체에서 `analysis: null` 로 표현 |
| **`PublicVisitorReview`** | **신규.** 공개 리뷰 행. `{ id, authorName, rating, body, visitedAt, imageUrls, videos, fetchedAt, analysis: PublicReviewAnalysis \| null }`. `externalId` 같은 dedup 메타도 빠짐. `analysis` 가 nullable 이라 미분석 리뷰도 본문/사진과 함께 그대로 노출 가능 |
| **`RestaurantPublicDetail`** | **신규.** 공개 상세 응답. 식당 본체 (`placeId, name, category, address, roadAddress, phone, businessHours, rating, reviewCount, latitude, longitude, rawSourceUrl, firstCrawledAt`) + snapshot 평탄화 필드 (`imageUrls, menus: MenuItem[], blogReviews: BlogReview[]`) + `reviews: PublicVisitorReview[]`. 어드민 `RestaurantDetail` 의 `snapshot: NaverPlaceData` 중첩을 제거하고 BE service 가 재구성한 모양 |
| `RestaurantSummaryProgress` | `{ totalReviews, pending, running, done, failed, recentDone[] }`. `GET /summary-status` 응답이자 SSE snapshot 페이로드의 베이스 |
| `RestaurantSummaryReviewEvent` | `type: 'review'` SSE 페이로드 — 리뷰 1건 분석 종료 시 푸시. `placeId` 태그 + 분석 필드 모두 운반 (sentiment/sentimentScore/satisfactionScore/menus/tips/keywords). `menus[].traits` 도 함께 흘러 클라이언트 캐시 머지에 그대로 합성 |
| `RestaurantSummarySnapshotEvent` | `RestaurantSummaryProgress.extend({ placeId })` — SSE 첫 연결 시 보내는 스냅샷 |

### `schemas/menu-grouping.ts` — [menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)

식당 단위 메뉴 정규화 + ranking + 다건 그룹핑 잡(SSE).

| Export | 용도 |
| --- | --- |
| `MenuRankingSort` | enum `'mentions' \| 'positive' \| 'positiveRatio' \| 'negative'` — 정렬 키 |
| `MenuRankingQuery` | `{ sort.default('mentions'), minMentions: coerce.int.min(1).default(1) }` — querystring |
| `MenuRankingItem` | 그룹 한 건. `{ canonicalName, canonicalKey, mapped, mentionCount, positive, negative, neutral, positiveRatio: number\|null, variants: string[], topTraits: string[] (그룹 traits 빈도 TOP3), sampleReviewIds, global: { globalKey, displayName, totalMentions, positive, negative, positiveRatio, restaurantCount } \| null }`. `global` 은 글로벌 머지가 이 그룹을 GlobalMenuCanonical 에 링크한 경우만 채워짐 — UI "이 식당 vs 전체 평균" 위젯 입력 |
| `MenuRankingResult` | `{ placeId, totalMentions, groupedCount, unmappedMenus: string[], groupedAt: string\|null, modelVersion: int\|null, currentVersion: int, items: MenuRankingItem[] }`. `modelVersion` ≠ `currentVersion` → FE "재실행 권장" 배지 |
| `MenuGroupRunResult` | 단일 식당 그룹핑 동기 응답. `{ ok: true, placeId, inputCount, groupCount, mappedCount, model: string\|null, version: int }` |
| `MenuGroupingRestaurantStatus` | 운영 화면 행. `{ placeId, name, category, totalReviews, analyzedReviews, distinctMenus, mappedMenus, unmappedMenus, lastGroupedAt: string\|null, storedVersion: int\|null }` |
| `MenuGroupingRestaurantStatusList` | `{ currentVersion, items: MenuGroupingRestaurantStatus[] }` |
| `MenuGroupingJobInput` | `{ placeIds: string[].min(1) }` — 글로벌 "전체 정규화" 는 명시적 placeIds 로만 받는다 |
| `MenuGroupingJobState` | enum `'pending' \| 'running' \| 'done' \| 'failed'` |
| `MenuGroupingJobItemState` | enum `'pending' \| 'running' \| 'done' \| 'failed' \| 'skipped'` (item 단위 — `skipped` 추가) |
| `MenuGroupingJobItem` | `{ placeId, state, inputCount/groupCount/mappedCount: int\|null, errorCode/Message: string\|null, startedAt/finishedAt: string\|null }` |
| `MenuGroupingJobSnapshot` | `{ jobId, state, total, doneCount, failedCount, skippedCount, startedAt, finishedAt: string\|null, items: MenuGroupingJobItem[] }`. 재접속/새로고침 시 SSE 전 GET |
| `MenuGroupingJobItemEvent` | `{ type: 'item', jobId, item }` — 식당 한 건 끝날 때마다 push |
| `MenuGroupingJobDoneEvent` | `{ type: 'done', jobId, state, finishedAt }` |

### `schemas/analytics.ts` — [analytics.ts](../../packages/api-contract/src/schemas/analytics.ts)

식당 가로지르기 글로벌 메뉴 통계 + 머지 잡 + 카테고리 트리.

| Export | 용도 |
| --- | --- |
| `GlobalMenuStat` | `{ globalKey, displayName, categoryPath: string\|null, totalMentions, restaurantCount, positive, negative, neutral, positiveRatio: number\|null, topRestaurants: { placeId, name, mentionCount, positive, negative, positiveRatio }[] }`. `categoryPath` = 계층 path 문자열 (예: `"한식 > 찌개 > 김치찌개"`) |
| `GlobalMenuQuerySort` | enum `'mentions' \| 'positive' \| 'positiveRatio' \| 'restaurants'` |
| `GlobalMenuQuery` | `{ q?, category?, sort.default('mentions'), minMentions: coerce.int.default(5), limit: coerce.int.max(200).default(50), includeUnlinked: coerce.boolean.default(false) }`. `category` 는 path prefix 필터 (`"한식"` → `"한식 > %"` 모두) |
| `GlobalMenuResult` | `{ totalGroups, linkedRestaurantCount, linkedRatio: number\|null, currentVersion, items: GlobalMenuStat[] }` |
| `AnalyticsOverview` | 대시보드 카드. `{ restaurantCount, analyzedReviewCount, totalMentionCount, perRestaurantGroupCount, globalLinkedCount, globalGroupCount, globalLinkedRatio: number\|null, lastGlobalMergeAt: string\|null, globalVersion }` |
| `GlobalMergeJobInput` | `{ full: boolean.default(false) }` — false 면 새로 추가된 MenuCanonical 만 머지 |
| `GlobalMergeJobState` | enum `'pending' \| 'running' \| 'done' \| 'failed'` |
| `GlobalMergeJobChunkProgress` | `{ pass: int (1=청크별 매핑, 2=청크간 충돌 해소), chunkIndex, chunkTotal, mappedInChunk }` |
| `GlobalMergeJobSnapshot` | `{ jobId, state, inputCount, finalGroupCount, totalChunks, doneChunks, errorCode/Message, startedAt, finishedAt: string\|null }` |
| `GlobalMergeJobChunkEvent` | `{ type: 'chunk', jobId, progress }` SSE |
| `GlobalMergeJobDoneEvent` | `{ type: 'done', jobId, state, finalGroupCount, finishedAt }` SSE |
| `CategoryTreeNode` | **재귀 z.lazy 스키마** — `{ path, label, totalMentions, positive, negative, positiveRatio: number\|null, children?: CategoryTreeNode[] }`. type alias `CategoryTreeNodeType` 를 먼저 선언한 뒤 `z.ZodType<CategoryTreeNodeType> = z.lazy(...)` 로 정의해 TS 가 재귀 추론 가능 |
| `CategoryTreeResult` | `{ currentVersion, roots: CategoryTreeNode[] }`. leaf 통계는 부모로 누적 합산되어 어느 레벨에서도 그 가지의 합계 |

### `schemas/ai.ts` — [ai.ts](../../packages/api-contract/src/schemas/ai.ts)

| Export | 용도 |
| --- | --- |
| `AiCompleteInput` | `{ prompt(1~8000), model: string(1~100), systemPrompt?(≤2000), temperature?(0~2), maxTokens?(int ≤4096) }` — alias enum 없이 raw model id 직접 |
| `AiErrorCode` | enum: `rate_limited / upstream_failed / timeout / invalid_response / provider_unavailable / provider_disabled / no_api_key` |
| `AiTokenUsage` | `{ promptTokens, completionTokens }` 둘 다 nullable int |
| `AiCompleteResult` | `discriminatedUnion('ok')` — 성공: `{ text, model, durationMs, tokens }`, 실패: `{ error, message }` |
| `AiCompleteBatchItem` | `AiCompleteInput.extend({ clientId?(1~64) })` — 응답 매칭 키 |
| `AiCompleteBatchInput` | `{ items: array(min 1, max 10) }` — 배치당 최대 10건 |
| `AiCompleteBatchResultItem` | item 별 성공/실패 union, `clientId` 보존 |
| `AiCompleteBatchResult` | `{ results: AiCompleteBatchResultItem[] }` |
| `LlmProviderId` | enum (현재 `'ollama-cloud'` 단일) |
| `LlmProviderConfig` | read-only view: `{ provider, hasApiKey, apiKeyMasked, baseUrl, defaultModel, enabled, maxConcurrent, updatedAt }` — apiKey 평문은 노출하지 않음 |
| `LlmProviderListResult` | `{ providers: LlmProviderConfig[] }` |
| `UpdateLlmProviderInput` | write-only PUT body. `apiKey?(min1)` 빈/undefined → 보존, `baseUrl/defaultModel` `nullable.optional` (null = 비우기, undefined = 변경 없음), `enabled?`, `maxConcurrent?(1~100)` |
| `TestLlmProviderInput` | `{ model? }` — 기본 alias 대신 특정 모델 id 검증용 override |
| `TestLlmProviderResult` | `discriminatedUnion('ok')` — 성공: `{ model, durationMs, sample }`, 실패: `{ error, message }` |
| `LlmModelListResult` | `{ models: string[] }` — 빈 배열은 "지원 안 함/실패" 의 정상 응답 (FE 는 free text 입력으로 fallback) |

### `schemas/settings-map.ts` — [settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)

외부 지도 SDK provider config (현재 vworld 단일). LLM provider 와 같은 read/write 분리 패턴.

| Export | 용도 |
| --- | --- |
| `MapProviderId` | enum `'vworld'` (카카오/네이버 추가 시 확장) |
| `MapProviderConfig` | read view. `{ provider, hasApiKey, apiKeyMasked, domains: string\|null, updatedAt: string\|null }` — `LlmProviderConfig` 와 동일하게 apiKey 평문은 노출하지 않음 |
| `MapProviderListResult` | `{ providers: MapProviderConfig[] }` |
| `UpdateMapProviderInput` | write PUT body. `apiKey?(min1)` 빈/undefined → 보존, `domains: nullable.optional` (null = 비우기, undefined = 변경 없음). LLM 과 같은 세 가지 의도 (set/clear/no-change) 표현 |
| `MapProviderSecret` | admin-only 평문 키 reveal. `{ provider, apiKey: string\|null, domains: string\|null }`. vworld JS SDK init URL 에 평문 키가 들어가야 해서 클라이언트가 한 번은 평문을 받아야 함 |
| **`MapProviderPublicConfig`** | **신규.** 공개 페이지 (맛집 지도) 가 호출하는 키 노출 라우트의 응답. `{ provider, apiKey: string }`. admin secret 과 데이터는 같지만 의도가 다른 별개 스키마 — admin 은 진단/관리 목적, public 은 클라사이드 WMTS 호출 목적. 키 미등록 시 BE 가 404 |

### `routes.ts` — [routes.ts](../../packages/api-contract/src/routes.ts)

`API_PREFIX = '/api/v1'` 고정. 도메인별 객체:

| Namespace | 키 | 경로 |
| --- | --- | --- |
| `Auth` | register, login, me, logout | `/auth/...` |
| `Users` | list, byId(id) | `/users[/:id]` |
| `Picks` | list, create, byId(id) | `/picks[/:id]` |
| `Admin` | listUsers, setUserRole(id) | `/admin/users[/:id/role]` |
| `Media` | thumbnail (constant) | `/media/thumbnail` (Naver 이미지 프록시, 인증 불필요) |
| `Crawl` | naverPlace, jobs, job(id), jobEvents(id), **search (constant)** | `/admin/crawl/...` (어드민 발견 페이지가 `search` 로 키워드+선택 영역 후보 조회) |
| `Restaurant` | **공개:** ranking (constant), **publicList (constant)**, **publicByPlaceId(placeId)**, **publicInsights(placeId)** / **어드민:** list, byPlaceId(placeId), delete(placeId), summaryStatus(placeId), summaryEvents (constant), reanalyze(placeId), insights(placeId), smartPick (constant), menusGroup(placeId), menusRanking(placeId), analyticsBackfill (constant) | `/restaurants/...` (공개) + `/admin/restaurants/...` (어드민) |
| `Analytics` | restaurantsStatus (constant), groupingJobs (constant), groupingJob(id), groupingJobEvents(id), overview (constant), globalMenus (constant), globalMergeJobs (constant), globalMergeJob(id), globalMergeJobEvents(id), categoryTree (constant) | `/admin/analytics/...` |
| `Ai` | complete, completeBatch, providers, provider(id), testProvider(id), providerModels(id) | `/admin/ai/...` |
| `SettingsMap` | list, provider(id), secret(id), **publicConfig (constant)** | `/admin/settings/map/...` (admin) + `/settings/map/public` (public) |
| `Health` | (단일 상수) | `/health` |

`Routes.Restaurant.summaryEvents` 는 함수가 아니라 단일 상수
`/api/v1/admin/restaurants/summary-events` 다. 다중 placeId 는 query string 으로
`?placeId=A&placeId=B&…&token=<jwt>` 형태로 전달 — 한 브라우저 탭에서 여러 맛집의
요약 진행률을 단일 SSE 연결로 멀티플렉싱한다.

`Routes.Restaurant.smartPick` 은 niney 의 본 목적("선택을 대신 골라주기")에 분석
결과를 직접 활용하는 가장 작은 통합 지점 — 등록된 맛집 중 가중 랜덤 픽.
`Routes.Restaurant.reanalyze(placeId)` 는 `analysisVersion` 이 비었거나 구버전인 행을
재크롤 없이 다시 큐잉한다.

`Routes.Restaurant.publicList`, `publicByPlaceId`, `publicInsights` 는 비로그인
게스트도 호출할 수 있는 공개 진입점이다. 각각 `/api/v1/restaurants/public`,
`/api/v1/restaurants/public/:placeId`, `/api/v1/restaurants/public/:placeId/insights`
경로로 노출. 어드민 트리(`/admin/restaurants/...`) 와 의도적으로 별도 prefix 를 써서
인증 미들웨어 분기를 path 레벨에서 한다 — 공개 라우트는 JWT 가드 없이 로드되고,
응답 schema 도 운영 메타가 빠진 별도 객체를 사용한다.

`Routes.Restaurant.menusGroup(placeId)` 는 단일 식당의 distinct nameNorm 들을
LLM 으로 canonical 그룹에 매핑하는 동기 호출 (보통 2~5초). `menusRanking(placeId)` 는
그 결과 + 긍/부 카운트 + `MenuRankingItem.global` 링크까지 묶어 내려준다.
`analyticsBackfill` 은 정규화 테이블 (menu_mentions / review_tags) 의 일회성 백필 —
LLM 재호출 없이 기존 menusJson/tipsJson/keywordsJson 을 풀어쓰는 인덱스 reseed.

`Routes.Analytics` 는 두 갈래의 진입점이다 — 식당 단위 그룹핑 잡(`groupingJobs/Job/JobEvents`,
`restaurantsStatus`) 과 글로벌 머지(`globalMergeJobs/Job/JobEvents`, `globalMenus`,
`overview`, `categoryTree`). `globalMenuCanonical` 모델 자체는 두 번 노출되는데,
하나는 잡 진행(머지)이고 다른 하나는 통계 조회(`globalMenus`/`categoryTree`) — 같은
데이터의 쓰기 경로와 읽기 경로를 분리한 형태.

`Routes.SettingsMap.publicConfig` 는 admin 가드를 통과 못하는 공개 페이지가 vworld
WMTS 키를 받기 위한 단일 상수 (`/api/v1/settings/map/public`). 같은 키가 admin 의
`secret(id)` 로도 평문 노출되지만, 공개 라우트는 별도 prefix 를 가져 인증 미들웨어
분기가 path 만으로 결정된다. WMTS 키는 어차피 브라우저 Network 탭에 노출되는
클라사이드 자원이라 admin 평문과 보안 등급이 동등하다 — 단지 라우트 가드가 다를 뿐.

`Routes.Media.thumbnail` 은 Naver 호스팅 이미지를 friendly 가 JPEG 로 프록시해서
내려주는 단일 상수다. 리뷰 이미지 자체가 공개 자원이라 인증 헤더 없이 그대로
`<img src>` 로 쓸 수 있도록 의도적으로 public.

## Data [coverage: high — 9 sources]

순수 contract 패키지로, 자체 데이터(persistence/cache) 는 없다 — 모든 모양은
스키마 정의로만 존재한다. Prisma 모델(`reviews`, `restaurants`, `review_summaries`,
`menu_mentions`, `review_tags`, `MenuCanonical`, `GlobalMenuCanonical`,
`map_provider_configs` 등) 매핑은 friendly 토픽 참조 — DB 스키마의 SSOT 는
`apps/friendly/prisma/schema.prisma`.

스키마 간 의존 관계 (compose 방향):

- **`UserSchema`** ← `auth.AuthResponse.user`, `admin.AdminUsersResponse.users[]`
- **`RoleSchema`** ← `user.UserSchema.role`, `admin.SetRoleBody.role`
- **`PickSchema`** → `CreatePickInput` (`.pick`) → `UpdatePickInput` (`.partial`);
  `PickResultSchema.pickId` 가 `Pick.id` 를 참조 (스키마 자체 FK는 없고 의미상 연결)
- **`NaverPlaceData`** = `MenuItem[]` + `ReviewStats?` + `BlogReview[]` + `VisitorReview[]`
- **`NaverSearchResult`** (어드민 발견 — 검색 결과 한 항목) = 다음 필드 매핑.
  네이버 PC 지도 응답의 wire 모양을 그대로 노출하지 않고, contract 단계에서 정규화한
  형태:

  | 필드 | 타입 | 출처 / 의미 |
  | --- | --- | --- |
  | `placeId` | `string` | 네이버 응답 `id` 그대로 — url-normalizer 가 추출하는 키 |
  | `name` | `string` | 가게명 |
  | `category` | `string \| null` | 분류 (예: `"한식"`) |
  | `address` | `string \| null` | 지번 주소 |
  | `roadAddress` | `string \| null` | 도로명 주소 |
  | `lat` | `number \| null` | 응답 `y` 를 Number 변환 (네이버는 string) |
  | `lng` | `number \| null` | 응답 `x` 를 Number 변환 (네이버는 string) |
  | `phone` | `string \| null` | 전화번호 |
  | `thumbnailUrl` | `string \| null (URL)` | 대표 이미지 |
  | `reviewCount` | `int \| null` | 리뷰 수 |
  | `rawSourceUrl` | `string (URL)` | `https://map.naver.com/p/entry/place/{placeId}` 합성 — 등록 시 url-normalizer 입구로 그대로 사용 |

- **`CrawlSearchQuery`** / **`CrawlSearchResult`** — `q + bbox?` 입력 / `items + source('playwright')`
  출력. `source` 는 어댑터 fallback 노출용 enum (현재 단일 값, 추후 'unofficial' 페어 가능성)
- **`MenuItem` / `BlogReview`** — `crawl.ts` 정의 + `restaurant.ts` 의
  `RestaurantPublicDetail.{menus, blogReviews}` 에서 직접 import. snapshot 평탄화
  필드라 BE service 가 NaverPlaceData 를 풀어 채운다
- **`VisitorReview`** = 텍스트/별점 + `imageUrls[]` + `videos: VisitorReviewVideo[].default([])`
  + `externalId?` (영속화용)
- **`CrawlJob`** = 메타(id, url, placeId, status, stage, timestamps, visitorCount)
  + `result: CrawlNaverPlaceResult | null`
- **`CrawlNaverPlaceResult`** / **`StartCrawlResult`** — 둘 다 `discriminatedUnion('ok')` 로
  성공/실패 분기. `StartCrawlResult` 는 성공 분기에 `deduped` 필수 + `queued?` optional
- **`CrawlEvent`** — `discriminatedUnion('type')` 로 6종 SSE, 모두 `seq: number` 로 dedupe
- **`PersistedVisitorReview`** = `VisitorReview.extend({ id, externalId: nullable, fetchedAt })`
- **`ReviewAnalysis`** (LLM 출력) → `ReviewSummary` (DB 행, 모두 nullable) →
  `RestaurantSummaryReviewEvent` (SSE 페이로드, `placeId` 태그) /
  `PublicReviewAnalysis` (운영 메타 제거, 항상 finished 한 분석만)
- **`ReviewAnalysisMenu`** = `{ name, sentiment?, traits.default([]) }` — `traits` 는 v4 LLM
  필드, optional+default 로 v3 행 호환. 모든 ReviewAnalysis/ReviewSummary/SummaryReviewEvent
  /PublicReviewAnalysis 의 `menus[]` 가 이 모양을 공유
- **`VisitorReviewWithSummary`** (어드민) = `VisitorReview.extend({ id, externalId: nullable,
  fetchedAt, summary: ReviewSummary.nullable() })` — 어드민 상세 응답의 라이브 행
- **`PublicVisitorReview`** (공개) = `{ id, authorName, rating, body, visitedAt,
  imageUrls, videos, fetchedAt, analysis: PublicReviewAnalysis.nullable() }` —
  `VisitorReview` 를 그대로 extend 하지 않고 필드를 다시 선언. dedup 메타
  (`externalId`) 와 운영 메타 (`status/model/errorCode`) 가 빠진 슬림 모양
- **`RestaurantDetail`** (어드민) = 메타 + `snapshot: NaverPlaceData` (visitorReviews 비움) +
  `reviews: VisitorReviewWithSummary[]`
- **`RestaurantPublicDetail`** (공개) = 메타 (어드민과 거의 동일 + `roadAddress`,
  `businessHours`, `latitude`, `longitude`) + snapshot 평탄화 (`imageUrls`, `menus`,
  `blogReviews`) + `reviews: PublicVisitorReview[]`. 어드민의 `snapshot` 중첩 객체
  자체가 사라지고 BE service 가 풀어 평면 응답을 구성
- **`RestaurantListItem`** (어드민) = 메타 + 요약 카운트(4종) + 분석 집계 인라인
  (`mixedCount` 포함)
- **`RestaurantPublicListItem`** (공개) = 좌표(`latitude/longitude`) + 도로명 + 대표
  이미지 + AI 통계 (3범주 분포 — `mixedCount` 빠짐). 어드민 list 와 의도적으로 다른
  필드 셋
- **`RestaurantInsights`** = 식당 단위 — `topMenus` 빈도순 + 메뉴별 sentiment 분포.
  어드민 `Routes.Restaurant.insights(placeId)` 와 공개 `Routes.Restaurant.publicInsights(placeId)`
  가 동일 응답 객체 사용 (운영 메타가 본래 없는 통계라 분리 불필요)
- **`RestaurantSmartPickResult.picked.weight`** = strategy 별 가중치 (`balanced` /
  `satisfaction` / `positive`)
- **`RestaurantSummarySnapshotEvent`** = `RestaurantSummaryProgress.extend({ placeId })`
- **`MenuRankingItem`** ↔ **`GlobalMenuStat`** — `MenuRankingItem.global` 이 식당 단위
  ranking 에서 글로벌 비교를 inline 으로 노출. 양쪽 모두 `positiveRatio: number\|null`
  공유 (긍/부 0 = null, 정렬 시 마지막)
- **`MenuGroupingJobSnapshot`** = `{ jobId, state, total, doneCount, failedCount,
  skippedCount, ..., items: MenuGroupingJobItem[] }`. SSE `MenuGroupingJobItemEvent` /
  `MenuGroupingJobDoneEvent` 가 같은 잡을 점진적으로 채움
- **`GlobalMergeJobSnapshot`** = 청크 누적 진행률. `GlobalMergeJobChunkEvent.progress` 가
  `{ pass(1\|2), chunkIndex, chunkTotal, mappedInChunk }` — pass=1 매핑, pass=2 충돌 해소
- **`CategoryTreeNode`** — z.lazy 재귀. `path/label/누적통계 + children?` 가 self-include.
  leaf 합계가 부모로 누적되어 있어 어느 노드에서도 부분합 그대로
- **`AnalyticsOverview`** = 식당/리뷰/멘션 카운트 + 글로벌 매핑 진척도(`globalLinkedRatio`)
  + 마지막 머지 시각/버전. globalMergeJob 이 끝날 때마다 갱신
- **`AiCompleteBatchItem`** = `AiCompleteInput.extend({ clientId? })` — 단건 input 확장
- **`AiCompleteResult`** / **`TestLlmProviderResult`** / **`AiCompleteBatchResultItem`**
  — 모두 `discriminatedUnion('ok')`, 실패 케이스 `AiErrorCode` enum 공유
- **`LlmProviderConfig`** (read view) ↔ **`UpdateLlmProviderInput`** (write body) — 같은
  엔터티의 read/write 분리. read 는 `apiKeyMasked`, write 는 `apiKey`. null=clear,
  undefined=무변경
- **`MapProviderConfig`** (read) ↔ **`UpdateMapProviderInput`** (write) ↔
  **`MapProviderSecret`** (admin reveal) ↔ **`MapProviderPublicConfig`** (public reveal)
  — 같은 provider 데이터의 4가지 시점. read 는 마스킹, write 는 평문 입력 + null/clear
  의도, secret 은 admin only 평문, public 은 게스트도 받을 수 있는 평문. 데이터는
  `apiKey` 한 컬럼이지만 수신자/의도가 달라 스키마를 4개로 쪼갬

## Key Decisions [coverage: high — 8 sources]

- **Zod 채택 (vs JSON Schema 직접 작성, vs io-ts)** — 런타임 검증 + 정적 타입 추론을 한
  스키마로 처리하고, fastify-type-provider-zod 와 한 번에 결합돼 OpenAPI 까지 자동 생성된다.
  `z.infer<typeof X>` 로 클라이언트 타입까지 무료. **TS interface 직접 사용 금지** — 모든
  공유 타입은 zod 스키마에서 추론한다.
- **빌드 없는 src 직접 export** — `package.json` `exports` 가 `./src/*.ts` 를 가리킨다.
  tsup/rollup 빌드 단계가 없어 변경 즉시 모든 워크스페이스에 반영되고, Turborepo 캐시 무효화도
  단순해진다. friendly 는 `injected` workspace 의존성으로 src 를 그대로 본다.
- **도메인별 파일 분할 + 한 방향 import** — `auth/user/picks/admin/crawl/restaurant/
  menu-grouping/analytics/ai/settings-map/common` 으로 쪼갠다. `restaurant.ts` 가
  `crawl.ts` 의 `NaverPlaceData`/`VisitorReview`/`BlogReview`/`MenuItem` 을 참조하지만
  역방향은 금지. `menu-grouping` 과 `analytics` 는 서로 import 하지 않고
  `MenuRankingItem.global` 을 inline object 로 중복 선언해 변경 파급을 좁힌다 — "같은
  모양이지만 의미적으로 다른 페이로드" 를 의도적으로 분리.
- **공개/어드민 스키마 분리** — `RestaurantPublicListItem` 은 어드민 `RestaurantListItem`
  과 데이터 출처가 같지만 별개 zod 객체다. 어드민 행은 운영 메타 (`summaryPending/
  Running/Done/Failed` 카운트 + `mixedCount`) 가 핵심이고, 공개 행은 좌표/대표
  이미지/도로명/AI 점수가 핵심이라 필드 셋이 근본적으로 다르다. 공개 응답에 운영
  메타가 누설될 가능성을 타입 시스템으로 차단. 마찬가지로 `PublicReviewAnalysis` 는
  어드민 `ReviewSummary` 의 `status/model/errorCode/errorMessage/startedAt` 를 의도적
  으로 제거한 슬림 객체 — 사용자가 볼 필요 없는 운영 메타가 절대 클라이언트에 가지
  않는다.
- **공개 detail 의 평탄화 (snapshot 중첩 제거)** — 어드민 `RestaurantDetail` 은
  `snapshot: NaverPlaceData` 를 그대로 동봉하는 반면, 공개 `RestaurantPublicDetail`
  은 BE service 가 `imageUrls`, `menus`, `blogReviews` 를 평탄화해서 평면 응답을
  구성한다. 공개 클라이언트가 `restaurant.snapshot.menus` 같은 중첩 경로를 알 필요
  없도록 한 결정 — wire 모양이 BE 내부 구조 (NaverPlaceData) 와 분리됐다.
- **vworld public config 별도 스키마** — `MapProviderPublicConfig` 와
  `MapProviderSecret` 는 데이터 (`{ provider, apiKey }`) 가 사실상 같지만 의도가
  다른 별개 스키마다. admin secret 은 진단/관리 목적 (마스킹된 `MapProviderConfig` 와
  쌍을 이룸), public config 는 클라사이드 WMTS 호출 목적 (게스트도 호출). 라우트도
  `/admin/settings/map/:id/secret` (admin) vs `/settings/map/public` (public) 으로 분리
  되어 인증 가드가 path 레벨에서 결정된다. WMTS 키는 어차피 Network 탭에 노출되는
  클라사이드 자원이라 보안 등급은 동등하지만, "왜 이 키를 받는가" 의 의도를 스키마로
  명시한 셈.
- **`bbox` 는 string + regex** — 지도 viewport bbox 는 4개 숫자 (`minLng,minLat,maxLng,
  maxLat`) 인데 `z.tuple([number, number, number, number])` 가 아닌 단일 문자열 + regex
  검증으로 받는다. 이유는 (1) querystring 친화 — `?bbox=A,B,C,D` 한 줄로 끝나고 (2)
  배열 querystring (`?bbox=A&bbox=B&...`) 의 표준 부재, (3) BE 가 split 한 번으로 파싱
  가능. regex 는 `^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$` — 음수와
  소수점 모두 허용.
- **`z.discriminatedUnion('type')` for SSE union** — `CrawlEvent` 6종, summary review/snapshot,
  `MenuGroupingJob{Item,Done}Event`, `GlobalMergeJob{Chunk,Done}Event` 모두 `type` literal
  로 분기. zod 가 분기 자동 추론 → 클라이언트 switch 가 완전히 좁혀진 타입을 본다.
- **`z.literal('review')` + placeId 태그 for summary SSE** — 멀티플렉싱된 `summary-events`
  는 review-done 푸시와 progress snapshot 두 종류를 한 채널로 흘린다. 각 이벤트가 `placeId`
  를 자체 운반해 클라이언트가 demux 하고, HTTP/1.1 의 origin 당 6 SSE 캡을 회피한다.
- **`visitor_batch.persistedReviews` 로 detail GET 생략** — 페이지네이션이 한 번 끝날
  때마다 서버는 INSERT 직후의 행(서버 부여 id, fetchedAt 포함) 을 그대로 SSE 로
  내려준다. 클라이언트가 별도 GET 으로 detail 을 다시 받지 않고 React Query 캐시에
  바로 머지. 네트워크 왕복 + 서버 부하 동시 감소.
- **라우트 경로 상수화 + Routes namespace re-export** — 문자열 리터럴을 코드 곳곳에
  흩뿌리는 대신 `Routes.Crawl.job(id)`, `Routes.Restaurant.byPlaceId(placeId)`,
  `Routes.Restaurant.publicByPlaceId(placeId)`, `Routes.Analytics.groupingJobEvents(id)`,
  `Routes.SettingsMap.publicConfig` 형태의 함수/상수를 강제한다. `index.ts` 가
  `export * as Routes from './routes.js'` 로 namespace 묶음을 노출 — 패키지 간
  심볼 충돌(예: `Auth`, `Crawl`, `Analytics`, `SettingsMap` 같은 평문 이름) 을
  우회하는 핵심 트릭.
- **`ReviewAnalysis` ↔ `ReviewSummary` ↔ `PublicReviewAnalysis` 3단 분리** — LLM
  출력 스키마(엄격, 모든 필드 required), DB 영속화 스키마(모두 nullable, 구버전 행
  호환), 공개 응답 스키마(운영 메타 제거 + 항상 finished 한 분석만) 로 같은 분석
  데이터의 세 시점을 구분. `text` 컬럼 = `summary` 필드 매핑으로 1~2문장 요약 UI 와
  호환되면서, 새 분석 필드(sentiment/score/menus/tips/keywords) 는 점진적으로 채울 수
  있다. (`reanalyze` 엔드포인트가 그 백필 트리거)
- **`traits` 의 optional + default([])** — v4 LLM 출력에 추가됐지만 v3 잔존 행을 깨뜨리지
  않기 위해 `z.array(z.string()).optional().default([])`. zod 의 input 타입에선 optional,
  output 타입에선 항상 배열 → FE 코드는 `menu.traits.map(...)` 무조건 호출 가능.
- **`z.lazy` 로 재귀 스키마** — `CategoryTreeNode` 가 라이브러리 첫 재귀 스키마. type
  alias `CategoryTreeNodeType` 를 먼저 선언한 뒤 `z.ZodType<CategoryTreeNodeType> = z.lazy(...)`
  형태로 정의해야 TS 가 self-reference 를 추론한다. `z.ZodType` 명시적 어노테이션 없으면
  컴파일 에러.
- **글로벌 머지의 read/write 경로 분리** — 같은 `globalMenuCanonical` 데이터를 잡 잡 진행
  (`globalMergeJobs/Job/JobEvents`, write side) 과 통계 조회 (`globalMenus`, `categoryTree`,
  `overview`, read side) 두 경로로 분리. 잡이 도는 동안에도 read 응답은 직전 머지 결과를
  안정적으로 노출 — 청크 머지 도중의 partial state 가 통계 응답에 누설되지 않음.
- **AI 영역 read/write 스키마 분리** — `LlmProviderConfig` (read) 는 `apiKeyMasked` 만,
  `UpdateLlmProviderInput` (write) 는 `apiKey` 평문을 받는다. 평문 키가 응답 schema 에
  존재할 가능성을 타입으로 차단. PUT 본문에서도 `apiKey?` (빈/undefined → 보존),
  `baseUrl/defaultModel` `nullable.optional` (null=clear, undefined=무변경) 으로 의도를
  세 가지 상태로 명확화. 같은 패턴이 `MapProviderConfig` ↔ `UpdateMapProviderInput`
  에도 그대로 복제됨.
- **검색 응답 `source` enum — 어댑터 fallback 노출** — `CrawlSearchResult.source` 는
  현재 `'playwright'` 단일이지만 enum 으로 둔다. 직접 fetch 가 가능해지는 시점에
  `'unofficial' | 'playwright'` 페어로 확장 — UI 디버그 배지·운영 로그에서 어떤
  어댑터가 동작했는지 추적할 수 있도록 응답 메타로 박은 결정. 단일 값을 string
  literal type 으로 두지 않고 enum 으로 일찍 모양을 잡아 두면 추후 추가 시
  consumer 측 switch 분기를 강제할 수 있다.
- **CLAUDE.md 규칙** — _"공유 스키마는 `@repo/api-contract` 에 추가"_ 가 명시된 핵심 규칙
  ([CLAUDE.md](../../CLAUDE.md)).

## Gotchas [coverage: high — 8 sources]

- **변경의 파급력** — 스키마 한 줄 수정이 friendly + web + mobile 모두에 컴파일 타임 영향을
  준다. 장점인 동시에 함정 — 필드 제거나 타입 좁히기는 모든 소비자 코드를 깨뜨린다.
  optional 추가는 안전, required 추가/제거는 위험.
- **새 스키마 추가 시 `index.ts` re-export 잊지 말 것** — 도메인 파일에 export 만 추가
  하고 `index.ts` 의 `export * from './schemas/<x>.js'` 를 잊으면 소비자는 패키지
  루트에서 import 못 한다. ESM `.js` 확장자도 함께 — 실파일은 `.ts`. 최근 추가된
  `menu-grouping.js` / `analytics.js` / `settings-map.js` 도 같은 패턴. 이번 라운드의
  공개 restaurant 스키마(`RestaurantPublicListItem` 등) 와 `MapProviderPublicConfig`
  는 기존 `restaurant.js` / `settings-map.js` 안에 추가됐으므로 별도 배럴 수정 불필요
  였다 — 단, 새 도메인 파일을 만들 땐 반드시 index 도 함께 손대야 한다.
- **공개 스키마 변경 ↔ BE service 평탄화 로직 동기화 필수** — `RestaurantPublicDetail`
  은 BE service 가 `NaverPlaceData` 를 풀어 `imageUrls`/`menus`/`blogReviews` 를
  평탄화한다. 공개 스키마에 필드 추가/삭제할 때 반드시 friendly 의 detail 빌더와
  같이 수정해야 한다 — 어드민 `RestaurantDetail.snapshot` 처럼 자동 매핑되지 않는다.
  마찬가지로 `PublicReviewAnalysis` 도 어드민 `ReviewSummary` 에서 운영 메타를 빼고
  `PublicVisitorReview.analysis` 에 매핑하는 변환 로직이 BE 에 있다. `RestaurantSummary
  ReviewEvent` 같은 SSE 페이로드는 운영 메타를 그대로 운반하므로 공개 detail 빌더와
  분리해서 봐야 한다.
- **mixed sentiment 는 공개 응답에서 빠짐** — `ReviewSentiment` enum (4범주) 자체는
  공개/어드민 모두 공유하지만, `RestaurantPublicListItem` 의 `positiveCount /
  negativeCount / neutralCount` 분포는 3범주만 노출한다 (어드민 `RestaurantListItem`
  의 `mixedCount` 가 빠짐). `PublicReviewAnalysis.menus[].sentiment` 는 본래 메뉴 단위
  `MenuSentiment` (3범주) 로 mixed 가 없어 동일. 단지 카운트 분포 모양만 바뀐 것 —
  공개 화면 그래프가 3범주 도넛 차트라는 가정에 맞춤. mixed 행을 별도로 surface 하는
  대신 모두 어드민 화면으로만 보낸다.
- **`Routes.Restaurant.summaryEvents` 가 함수 → 상수로 바뀐 breaking change** — 이전엔
  `summaryEvents(placeId)` 로 placeId 가 path 의 일부였다. 현재는
  `/api/v1/admin/restaurants/summary-events` 단일 상수이고 placeId 는 query 로
  전달 (`?placeId=A&placeId=B&…&token=<jwt>`). 호출부에서 함수 호출 형태로 그대로
  남아 있으면 string 호출 시도로 깨진다 — 업그레이드 시 모든 소비자 검색 필요.
- **공개 라우트는 path prefix 가 다름** — `Routes.Restaurant.publicList` 등은
  `/api/v1/restaurants/public...` 이고 어드민은 `/api/v1/admin/restaurants...` 이다.
  Fastify 측 인증 미들웨어가 path prefix 로 분기하므로, 새 공개 라우트 추가 시 반드시
  `/restaurants/...` (또는 그 외 비-admin prefix) 트리에 두어야 한다 — `/admin/...`
  아래에 두면 게스트는 401 을 받는다. `Routes.SettingsMap.publicConfig` 도 같은
  이유로 `/api/v1/settings/map/public` 이지 `/api/v1/admin/...` 가 아니다.
- **`VisitorReview.externalId` 의 트리플 상태 (`string | null | undefined`)** —
  `nullable().optional()` 로 정의됐다. 영속화 계층의 dedup 키이자 — `PersistedVisitorReview`
  / `VisitorReviewWithSummary` 에서는 `nullable()` (즉 `string | null`) 로 좁혀 항상
  존재함을 강제한다. `PublicVisitorReview` 는 아예 이 필드를 노출하지 않는다 — dedup
  은 BE 내부 사정이라 외부 표면에서 빠짐.
- **`VisitorReview.videos` 의 zod default 처리** — `z.array(...).default([])` 로 정의됐다.
  파싱 시 자동 채움이라 input 타입에는 optional 이지만 output 타입은 항상 존재. FE
  코드가 `.videos.map(...)` 직접 호출 가능 — but 직렬화 후 wire 로 나갈 때는 빈 배열을
  명시적으로 보내거나 생략해도 무방. crawl 어댑터의 reanalyze 백필 시 구버전 행을
  주의. 공개 `PublicVisitorReview.videos` 는 default 가 없는 일반 array 라 BE 가
  반드시 빈 배열이라도 채워 보내야 한다.
- **`videoUrl` 은 썸네일 프록시 대상이 아님** — `VisitorReviewVideo.posterUrl` 은
  Naver `video-phinf.pstatic.net` JPEG 라 `Routes.Media.thumbnail` 통과 가능하지만,
  `videoUrl` 은 서명된 Akamai .mp4 (단명 + CDN 직링크) 다. FE 에서 직접 `<video src>`
  로 붙여야 하고, 만료되면 다시 크롤해야 한다.
- **빌드 단계 추가 금지** — `package.json` `exports` 가 `src/` 를 직접 가리키므로 tsup/rollup
  같은 번들러를 끼우면 워크스페이스 전체 import 경로가 깨진다. 만약 외부에 npm publish 가
  필요해지면 `exports` 분기와 함께 빌드 산출물을 따로 마련해야 한다.
- **순환 의존 금지** — `@repo/shared → @repo/api-contract` 는 OK, 반대 방향은 금지
  ([CLAUDE.md](../../CLAUDE.md)). api-contract 는 React/fetch/Fastify 어떤 것도 import 하면
  안 되고 오직 Zod 만 의존한다 ([package.json](../../packages/api-contract/package.json)).
  도메인 파일 사이에서도 `restaurant → crawl` 한 방향만 — `PersistedVisitorReview` /
  `VisitorReviewVideo` 가 `crawl.ts` 에 위치하는 이유. 이번 라운드에서 restaurant 가
  추가로 import 하게 된 `BlogReview`/`MenuItem` 도 같은 방향. `menu-grouping` 과
  `analytics` / `settings-map` 도 서로 import 하지 않는다.
- **`.js` 확장자 표기** — 실 파일은 `.ts` 지만 import 는 `.js` 로 써야 한다 (NodeNext
  해석). [src/index.ts](../../packages/api-contract/src/index.ts) 패턴을 따를 것.
- **`z.coerce` 의 함정** — `PaginationQuerySchema` 의 `page/limit`,
  `MenuRankingQuery.minMentions`, `GlobalMenuQuery.{minMentions, limit, includeUnlinked}`,
  `RestaurantPublicListQuery.{limit, offset}`, `RestaurantRankingQuery.{minMentions,
  limit, offset}` 가 모두 `z.coerce.*` — 쿼리스트링이 문자열로 오므로 의도된 변환이지만,
  다른 곳에서 정수만 받으려는 경우 `coerce` 생략 여부를 의식해야 한다. `coerce.boolean`
  은 빈 문자열도 true 가 됨 — false 로 보내려면 그냥 생략.
- **`bbox` regex 는 BE 파싱과 동기 필수** — `RestaurantPublicListQuery.bbox` 는 `^-?\d+
  (\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$` 로 4개 숫자 콤마 구분만 허용
  한다. 공백, 트레일링 콤마, 공학 표기법 모두 거부. BE service 가 `split(',').map(Number)`
  로 파싱하는 형태라 둘 중 한쪽만 바꾸면 검증 통과한 입력을 BE 가 NaN 으로 만든다 —
  regex 와 split 로직은 한 묶음으로 수정해야 한다.
- **`z.lazy` 의 `z.ZodType` 명시 필요** — `CategoryTreeNode` 정의 시 `const X = z.lazy(...)`
  만 쓰면 TS 가 self-reference 를 추론하지 못해 `any` 로 떨어지거나 컴파일 에러를 낸다.
  type alias 를 먼저 선언한 뒤 `z.ZodType<CategoryTreeNodeType> = z.lazy(...)` 로
  명시 어노테이션을 박아야 한다. analytics.ts 패턴을 따를 것 — 새 재귀 스키마 추가 시
  같은 함정.
- **zod `default()` 의 input/output 타입 불일치** — `traits: z.array(z.string()).optional().default([])`
  처럼 default 를 박으면 `z.input<typeof X>` 에선 `string[] | undefined` 지만
  `z.output<typeof X>` (즉 `z.infer`) 에선 `string[]` 로 좁혀진다. fastify-type-provider-zod
  는 응답에 output 을, 요청에 input 을 쓰는데 — 동일 스키마가 양쪽에 등장하면 클라이언트
  payload 작성 시엔 omit 가능하지만 서버에서 받은 response 는 항상 채워져 있다고 믿어도 된다.
  헷갈리지 말 것.
- **`MenuRankingItem.global` 이 inline object** — analytics 의 `GlobalMenuStat` 과 모양은
  비슷하지만 별개 zod 객체다. 양쪽을 동시에 변경할 일이 생기면 양쪽을 모두 손봐야 함 —
  cross-import 를 피하려고 의도적으로 중복시킨 구조. 같은 패턴이
  `MapProviderPublicConfig` ↔ `MapProviderSecret` 사이에도 적용 — 데이터는 같지만
  의도가 달라 별개 객체.
- **`MenuGroupingJobItemState` 만 `'skipped'` 추가** — job 전체 state(`MenuGroupingJobState`)
  엔 없는 추가 enum 값이다. 이미 매핑이 최신 버전이라 LLM 호출 없이 건너뛴 식당 — UI 는
  done 과 별개 색상으로 표기 권장.
- **`Routes.Ai.X` namespace re-export 가 vite esbuild prebundle 에서 깨질 수 있음** —
  `index.ts` 가 `export * as Routes from './routes.js'` 형태로 namespace 를 묶어 내보낸다.
  소비자가 `Routes.Ai.complete` 처럼 namespace 로 접근하면 일부 번들러 (특히 Vite
  esbuild prebundle 단계) 에서 트리쉐이킹/네임스페이스 인식이 깨져 `undefined` 가 되는
  케이스가 있다. 회피책으로 friendly 측은 `const AiRoutes = Routes.Ai` 로 한 단계
  우회하고, web 측은 일부 경로를 path 로 하드코드한다 — workspace 패키지 해석 이슈.
  새로 추가된 `Routes.Analytics`, `Routes.SettingsMap` 도 동일 위험에 노출됨.
- **`AiCompleteInput.model` 은 enum 이 아니라 `z.string()`** — 초기 설계는 alias enum
  (`'fast' | 'smart'`) 로 추상화하려 했으나, 프로바이더마다 모델 라인업이 너무 빠르게
  바뀌고 admin 이 직접 모델 id 를 지정하는 케이스 (예: `gpt-oss:20b`) 가 빈번해서 raw
  string 으로 확장됐다. 검증은 `min(1).max(100)` 만 — 알려지지 않은 모델 id 도 그대로
  upstream 에 forward 되며, 프로바이더 단계에서 거부되면 `AiErrorCode.upstream_failed`
  로 매핑된다. 즉 입력 단계의 zod 가 모델 존재 여부까지 보장하지 않는다.
- **`LlmModelListResult.models` 가 빈 배열** — 프로바이더가 모델 목록 API 를 지원하지
  않거나 호출에 실패한 경우의 정상 응답이다. FE 는 이 경우 에러로 surface 하지 말고
  free text 입력으로 fallback 해야 한다 (스키마 주석에 명시됨).
- **`ReviewSummary` 의 분석 필드는 모두 nullable** — 구버전 행이나 파싱 실패 시 null
  이다. FE 는 `summary.sentiment ?? '...'` 처럼 null-safe 렌더 필수. `analysisVersion`
  컬럼이 비었거나 구버전이면 `Routes.Restaurant.reanalyze(placeId)` 로 백필 트리거.
  공개 응답 (`PublicReviewAnalysis`) 에서는 모든 필드가 required 라 미분석 행은
  부모 객체 (`PublicVisitorReview`) 에서 `analysis: null` 로 표현 — null 검사를 분석
  객체 자체에서 한다.
- **`MenuRankingResult.modelVersion` ≠ `currentVersion`** — 마지막 그룹핑 실행 시점의
  버전과 현재 서버 인식 버전이 다르면 정규화가 stale 이다. UI 는 "재실행 권장" 배지를
  띄우고 `Routes.Restaurant.menusGroup(placeId)` 또는 batch 잡으로 재정렬.
- **`MapProviderPublicConfig` 키 미등록 시 404** — 공개 라우트 응답이 빈 객체나 null
  이 아니라 HTTP 404 다. 공개 페이지가 200 만 success 로 처리하는 패턴이라면 `useQuery`
  의 `404 → setError` 분기를 명시적으로 처리해야 한다. 어드민 list (`MapProviderListResult`)
  는 키가 없어도 `hasApiKey: false` 의 행을 200 으로 내려준다 — 의도가 다른 두 라우트가
  status 도 다르게 동작한다는 사실 자체가 함정.
- **`NaverSearchResult.lat/lng` 는 number — 네이버 응답의 `y/x` 는 string 이라 어댑터에서
  Number 변환** — 잘못 string 으로 두면 OL `fromLonLat` 가 깨진다. 같은 변환 패턴이
  어드민 발견 어댑터에 박혀 있음 ([crawl](crawl.md) 참조). zod 측은 이미 `z.number().nullable()`
  로 수신부 검증을 강제하지만, BE 어댑터에서 변환을 빠뜨리면 검증 실패가 raw upstream
  에러로 surface 되므로 변환 로직 + zod 두 곳을 한 묶음으로 봐야 한다.

## Sources [coverage: high — 15 sources]

- [packages/api-contract/package.json](../../packages/api-contract/package.json)
- [packages/api-contract/tsconfig.json](../../packages/api-contract/tsconfig.json)
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
- [packages/api-contract/src/schemas/common.ts](../../packages/api-contract/src/schemas/common.ts)
- [packages/api-contract/src/schemas/auth.ts](../../packages/api-contract/src/schemas/auth.ts)
- [packages/api-contract/src/schemas/user.ts](../../packages/api-contract/src/schemas/user.ts)
- [packages/api-contract/src/schemas/picks.ts](../../packages/api-contract/src/schemas/picks.ts)
- [packages/api-contract/src/schemas/admin.ts](../../packages/api-contract/src/schemas/admin.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)
- [packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)
- [packages/api-contract/src/schemas/analytics.ts](../../packages/api-contract/src/schemas/analytics.ts)
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts)
- [packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)
- [CLAUDE.md](../../CLAUDE.md) — "공유 스키마는 `@repo/api-contract` 에 추가" 규칙
