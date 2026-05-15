---
topic: api-contract
last_compiled: 2026-05-15
sources_count: 16
status: active
aliases: [zod, schemas, ssot, contracts, "@repo/api-contract", canonical, canonical-merge, canonical-split, canonical-proposal, canonical-suggestion, catchtable, catchtable-search, catchtable-shop, diningcode, diningcode-search, diningcode-shop, diningcode-bulk-save, naver-search-result, crawl-search-query, crawl-search-result, search-bbox]
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

## Architecture [coverage: high — 7 sources]

### 디렉터리 구조

```
packages/api-contract/
├── package.json          # exports: src/*.ts 직접 노출 (no build)
├── tsconfig.json         # @repo/config/tsconfig/base.json 상속
└── src/
    ├── index.ts          # 모든 스키마 + Routes namespace 재내보내기
    ├── routes.ts         # API_PREFIX + 도메인별 경로 상수 (Auth/Users/Picks/Admin/Media/Crawl/Restaurant/Canonical/Analytics/Ai/SettingsMap/Health)
    └── schemas/
        ├── common.ts        # Id, Timestamp, ErrorResponse, Pagination
        ├── auth.ts          # Register/Login/AuthResponse
        ├── user.ts          # Role, User, PublicUser
        ├── picks.ts         # Pick, PickCategory, Create/Update/Result
        ├── admin.ts         # AdminUsersResponse, SetRole
        ├── crawl.ts         # NaverPlace 크롤러 + Job/SSE Event + VisitorReview + 네이버 검색 + 캐치테이블(검색·상세·메뉴·리뷰 종합) + 다이닝코드(검색·상세·리뷰·등록확인·일괄저장 SSE 잡)
        ├── restaurant.ts    # 어드민/공개 식당 + 리뷰 분석 + summary SSE + insights/smart-pick + analytics backfill + **canonical 단위 list (sources[])**
        ├── canonical.ts     # **신규** 가게 정체(canonical) 통합 — candidates/merge/split/dismissSuggestion + proposal 큐(list/run/accept/reject) + canonical 삭제
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
`canonical.ts` 가 이번 라운드 신규 도메인 파일로 추가됐다.

```ts
export * from './schemas/common.js';
export * from './schemas/auth.js';
export * from './schemas/user.js';
export * from './schemas/picks.js';
export * from './schemas/admin.js';
export * from './schemas/crawl.js';
export * from './schemas/restaurant.js';
export * from './schemas/canonical.js';
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

이번 라운드에서 `restaurant.ts` 가 `canonical.ts` 의 `CanonicalSuggestion` 을 import 하기
시작했다 (`CanonicalListItem.suggestion`). 방향은 restaurant → canonical 한쪽 — canonical
은 어떤 다른 도메인 스키마도 import 하지 않는다 (자체 타입만 사용). `menu-grouping.ts`
와 `analytics.ts` 는 여전히 각자 독립.

`settings-map.ts` 는 다른 어떤 schemas/ 파일도 import 하지 않는다 — provider config
모델은 LLM `LlmProviderConfig` 와 형태가 비슷하지만 의도적으로 중복 선언했다 (지도
provider 는 `model/maxConcurrent` 같은 LLM 고유 옵션을 갖지 않으므로).

## Talks To [coverage: medium — 3 sources]

- **friendly (apps/friendly)** — 각 `*.route.ts` 가 `RegisterInput`, `CrawlEvent`,
  `RestaurantListResult` (= canonical 행 묶음), `RestaurantPublicListResult`,
  `RestaurantPublicDetail`, `RestaurantSummaryReviewEvent`, `RestaurantInsights`,
  `RestaurantSmartPickInput/Result`, `MenuRankingResult`, `MenuGroupingJobInput/Snapshot`,
  `CanonicalCandidatesResult`, `CanonicalMergeInput/Result`, `CanonicalSplitInput/Result`,
  `CanonicalProposalListResult`, `CanonicalProposalAcceptInput/Result`,
  `CanonicalProposalRunResult`, `CanonicalDeleteResult`, `CatchtableSearchQuery/Response`,
  `CatchtableShopData/MenusResponse/ReviewOverviewResponse`,
  `DiningcodeSearchQuery/Response`, `DiningcodeShopData/ReviewsResponse`,
  `DiningcodeRegisteredQuery/Result`, `DiningcodeBulkSaveJobInput/Snapshot/ItemEvent/DoneEvent`,
  `GlobalMenuResult`, `GlobalMergeJobInput/Snapshot`, `CategoryTreeResult`,
  `AdminUsersResponse`, `AiCompleteInput`, `UpdateLlmProviderInput`, `MapProviderConfig`,
  `MapProviderPublicConfig` 등을 `schema: { body, response }` 로 등록하면
  fastify-type-provider-zod 가 검증 + 핸들러 타입 추론 + OpenAPI 스펙 생성을 한 번에 처리한다.
- **@repo/shared** — `Routes.Auth.login`, `Routes.Crawl.{jobEvents(id), catchtableSearch,
  catchtableShop(ref), diningcodeSearch, diningcodeShop(vRid), diningcodeShopSave(vRid),
  diningcodeRegistered, diningcodeBulkSaveJobs, diningcodeBulkSaveJobEvents(id)}`,
  `Routes.Canonical.{candidates(id), merge, split(id), dismissSuggestion(id), proposals,
  proposalsRun, proposalAccept(id), proposalReject(id), delete(id)}`,
  `Routes.Restaurant.summaryEvents`, `Routes.Restaurant.reanalyze(id)`,
  `Routes.Restaurant.menusGroup(id)`, `Routes.Analytics.*`,
  `Routes.SettingsMap.*`, `Routes.Media.thumbnail`, `Routes.Ai.complete` 같은
  경로 헬퍼/상수와 `z.infer<typeof AuthResponse>` 같은 추론 타입을 import 해서 fetch
  래퍼와 React Query 훅을 구성한다.
- **web / mobile** — `@repo/shared` 를 통해 간접 의존. 어드민 페이지(`AdminDiningcodeShopPage`
  / catchtable 검증 / canonical 후보 카드 등)도 동일 경로/스키마를 그대로 사용.

순환 의존 규칙: shared → api-contract 만 허용, 반대 방향은 금지 ([CLAUDE.md](../../CLAUDE.md)).

## API Surface [coverage: high — 14 sources]

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
| `PickSchema` / `Pick` | 하나의 선택지 묶음 |
| `CreatePickInput` / `UpdatePickInput` | create/partial 입력 |
| `PickResultSchema` / `PickResult` | `{ pickId, chosen, pickedAt }` |

### `schemas/admin.ts` — [admin.ts](../../packages/api-contract/src/schemas/admin.ts)

| Export | 용도 |
| --- | --- |
| `AdminUsersResponse` | `{ users: User[] }` |
| `SetRoleParams` / `SetRoleBody` | URL param + body 검증 |

### `schemas/crawl.ts` — [crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)

네이버 크롤러 (잡/SSE) + 어드민 발견용 네이버 검색 + **캐치테이블 패밀리** + **다이닝코드
패밀리(검색·상세·리뷰·등록 확인·일괄 저장 SSE 잡)** 가 한 파일에 묶인다. 큰 파일이지만
같은 "외부 소스 어댑터" 도메인이라 분리하지 않았다.

#### 네이버 크롤러 (기존)

| Export | 용도 |
| --- | --- |
| `CrawlMode` | `'create' \| 'recrawl' \| 'update'` |
| `CrawlNaverPlaceInput` | `{ url, mode }` URL 입력 |
| `MenuItem` | 메뉴 한 건 (restaurant.ts 공개 상세에서도 재사용) |
| `ReviewThemeKeyword` / `RatingDistributionBucket` / `ReviewStats` | 리뷰 통계 |
| `BlogReview` / `VisitorReviewVideo` / `VisitorReview` / `PersistedVisitorReview` | 리뷰/영상 모델 (`videos` default([]) 자동 채움, `externalId` dedup 키) |
| `NaverPlaceData` | 크롤 결과 본체 |
| `CrawlErrorCode` / `CrawlNaverPlaceResult` / `CrawlStage` / `CrawlEvent` | 동기/SSE 결과 |
| `CrawlJobStatus` / `CrawlJob` / `StartCrawlInput` / `StartCrawlResult` / `CrawlJobListResult` | 잡 모델 (`StartCrawlResult` 는 성공 분기에 `deduped` + optional `queued`) |
| `NaverSearchResult` / `CrawlSearchQuery` / `CrawlSearchResult` | 어드민 발견용 키워드+영역 검색 (응답 `source: 'playwright'`) |

#### 캐치테이블 (이번 라운드)

| Export | 용도 |
| --- | --- |
| `CatchtableSearchQuery` | `{ q(1~100), lat?, lon?, offset?(token), limit?(1~30), contractedOnly? }`. 페이지네이션은 offset 토큰 기반 |
| `CatchtableSearchResult` | 검색 결과 카드. `{ shopRef, shopName, foodKind, landName, urlPathAlias, rawSourceUrl, imageUrl, reviewCount, avgScore, shopPhone, lat, lon, operationStatus, mainService, badges }` |
| `CatchtableSearchResponse` | `{ items, totalShopCount, hasMore, nextOffset, source: 'playwright', fallback, elapsedMs }`. `fallback=true` 면 백엔드 추천 DB 로 떨어진 상태 — UI 경고 |
| `CatchtableShopImage` / `CatchtableShopSubway` / `CatchtableShopReview` / `CatchtableShopScheduleDay` / `CatchtableShopSchedule` / `CatchtableShopPriceRange` / `CatchtableShopMenu` / `CatchtableShopReviewSample` / `CatchtableShopRelatedKeyword` | 상세 nested 빌딩 블록 |
| `CatchtableShopData` | 가게 상세 본체 — 위 블록 + `awardItems`, `bookmarkCount`, `contractState`, `exposeCatchtable`, `useOnline`, `useCatchtable`, lazy `menus`/`reviewSamples` (비가맹점/영역 트리거 실패 시 null), `rawSourceUrl`, `fetchedAt`, `elapsedMs`, `source: 'playwright'` |
| `CatchtableShopMenuBoard` / `CatchtableShopMenuItem` / `CatchtableShopMenuDetailInfo` / `CatchtableShopMenusResponse` | lazy 메뉴 페치 응답. `{ shopRef, menuBoards, menus, menuDetailInfo, fetchedAt, elapsedMs, source: 'playwright' }` |
| `CatchtableShopReviewOverviewResponse` | 캐치테이블 AI 가 만든 한 줄 제목 + 3~4 문장 요약. `{ shopRef, title, sentences, latestUpdateDate, fetchedAt, elapsedMs, source: 'playwright' }` — 등록 검증 시 가게 성격 한눈 파악용 |

#### 다이닝코드 (이번 라운드)

| Export | 용도 |
| --- | --- |
| `DiningcodeKeywordTag` | 메뉴/특성 키워드 (`{ term, mark }`, mark=1 = 검색어 매칭 강조) |
| `DiningcodeDisplayReview` | 검색 카드 한 줄 리뷰 |
| `DiningcodeSearchQuery` / `DiningcodeSearchResult` / `DiningcodeSearchMeta` / `DiningcodeSearchResponse` | `/API/isearch/` 정규화. 카드에 `vRid`(다이닝코드 placeId), `score`(0~100), `userScore`(1~5), `keywords`, `displayReview`, `rawSourceUrl` 포함 |
| `DiningcodeShopImage` / `DiningcodeShopReviewImage` / `DiningcodeShopReview` / `DiningcodeShopReviewsSection` | 상세의 이미지/리뷰 섹션 |
| `DiningcodeShopMenu` / `DiningcodeShopBlog` / `DiningcodeShopBlogsSection` / `DiningcodeShopBusinessHour` / `DiningcodeShopStatus` / `DiningcodeShopScoreSlice` / `DiningcodeShopScoreBucket` / `DiningcodeShopScore` | 상세 nested 빌딩 블록 |
| `DiningcodeShopData` | 상세 본체. `POST /API/profile/` 한 방에 16 섹션 모두 들고 오는 응답을 통합해 표현 — 어댑터가 그대로 surface |
| `DiningcodeShopReviewsResponse` | 같은 `/API/profile/` 의 `tab=review&page=N` 응답. **16섹션 다 오지만 어댑터가 review 만 추려서 가벼운 shape 만 노출** — 페이지네이션 비용 절감 |
| `SaveDiningcodeShopResult` | DB persist 결과. **가벼운 shape — `{ vRid, restaurantId, fetchedPages, totalReviewsReported, newReviewCount, queuedForAnalysis, elapsedMs }` 만**. 전체 ShopData 를 반복 응답에 다시 싣지 않음 |

#### 다이닝코드 정식 페이지 / 일괄 저장 (이번 라운드)

| Export | 용도 |
| --- | --- |
| `DiningcodeRegisteredQuery` | `{ ids: 1~4000자 콤마 분리 vRid }`. 한 페이지 카드 30개 가정한 URL 길이 안전 범위 |
| `DiningcodeRegisteredEntry` | `{ vRid, restaurantId, canonicalId }` — 등록된 행만 |
| `DiningcodeRegisteredResult` | `{ items: DiningcodeRegisteredEntry[] }` — 미등록 vRid 는 결과에 없음 |
| `DiningcodeBulkSaveJobInput` | `{ vRids: string[].min(1).max(50) }`. 각 vRid 는 `min(1).max(80)`. 다이닝코드 부하 의식해 50건 cap |
| `DiningcodeBulkSaveJobState` | `'pending' \| 'running' \| 'done' \| 'failed'` |
| `DiningcodeBulkSaveJobItemState` | `'pending' \| 'running' \| 'done' \| 'failed' \| 'skipped'` (item 만 skipped 추가 — 이미 저장된 vRid) |
| `DiningcodeBulkSaveJobItem` | `{ vRid, state, restaurantId, fetchedPages, newReviewCount, errorCode, errorMessage, startedAt, finishedAt }` (성공 필드는 nullable) |
| `DiningcodeBulkSaveJobSnapshot` | `{ jobId, state, total, doneCount, failedCount, skippedCount, startedAt, finishedAt, items }`. 재접속 시 SSE 전 GET |
| `DiningcodeBulkSaveJobItemEvent` | `{ type: 'item', jobId, item }` SSE — vRid 한 건 끝날 때마다 |
| `DiningcodeBulkSaveJobDoneEvent` | `{ type: 'done', jobId, state, finishedAt }` SSE — menu-grouping 잡 SSE 와 동일 모양 |

### `schemas/canonical.ts` — [canonical.ts](../../packages/api-contract/src/schemas/canonical.ts) **(신규)**

가게 정체(canonical) 통합. 한 canonical = 출처 가로지르는 "같은 가게". source 별
Restaurant 행이 0~N 개 매달려 있다. 자동 매칭은 의도적으로 안 한다 — 모든 통합은
어드민이 후보를 보고 수동 확정한다.

| Export | 용도 |
| --- | --- |
| `CanonicalSourceSummary` | 카드 칩 라벨용 한 줄. `{ restaurantId, source, sourceId, placeId, name, category, rating, reviewCount }` |
| `CanonicalSummary` | `{ id, name, primaryCategory, latitude, longitude, sources: CanonicalSourceSummary[] }` — 통합 단위 카드 본체 |
| `CanonicalMatchCandidate` | `{ canonical: CanonicalSummary, score, nameScore, distanceM (null=거리 비교 안 함, 이름만 매칭) }` |
| `CanonicalCandidatesResult` | `{ target: CanonicalSummary, candidates: CanonicalMatchCandidate[] }` — `GET /admin/canonical/:id/candidates` 응답 |
| `CanonicalMergeInput` | `{ sourceCanonicalId, targetCanonicalId }`. source 의 Restaurant 들이 target 으로 이동, source 삭제. primary 메타 변경 없음 (필요시 후속 PATCH) |
| `CanonicalMergeResult` | `{ ok: true, target, movedRestaurantIds }` |
| `CanonicalSplitInput` | `{ restaurantId }`. 잘못된 merge 되돌리기 |
| `CanonicalSplitResult` | `{ ok: true, newCanonical, sourceCanonicalDeleted }` — 원본이 비어 삭제됐는지 UI 캐시 무효화용 |
| `CanonicalSuggestion` | `{ canonicalId, name, primaryCategory, score, distanceM }` — list 응답에 끼는 1차 매칭 제안 (1건만, 어드민 알림 줄용) |
| `CanonicalDismissSuggestionResult` | `{ ok: true }` — `suggestionDismissedAt` 가 채워져 더 이상 노출 안 됨 |
| `CanonicalProposalStatus` | `'open' \| 'accepted' \| 'rejected' \| 'superseded'` |
| `CanonicalProposalItem` | 자동 매칭 큐 행. `{ id, canonicalA, canonicalB(작은id, 큰id 정규화), score, nameScore, distanceM, status, createdAt }` — 임계 0.45 이상이면 모두 큐로 |
| `CanonicalProposalListResult` | `{ items: CanonicalProposalItem[] }` |
| `CanonicalProposalRunResult` | `{ created }` — 이번 재계산에서 신규로 큐 들어간 쌍 수 (open/rejected 는 skip) |
| `CanonicalProposalAcceptInput` | `{ keepSide: 'A' \| 'B' (default 'A') }` — 살아남는 가게 선택 |
| `CanonicalProposalAcceptResult` | `{ ok: true, merge: CanonicalMergeResult }` — 수락 = merge 실행 |
| `CanonicalProposalRejectResult` | `{ ok: true }` |
| `CanonicalDeleteResult` | `{ ok: true, deletedRestaurantCount, deletedReviewCount }` — FK Cascade 로 review/summary/proposal 까지 동시 삭제 |

### `schemas/restaurant.ts` — [restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)

어드민 (운영용) + 공개 (게스트/비로그인용) 두 갈래의 식당 스키마를 한 파일에 묶었다.
**이번 라운드에서 어드민 list 응답이 canonical 단위 그룹핑으로 전환됐다** — 한 행 = 한
canonical, sources[] 배열이 그 안의 출처별(Naver/DC/캐치테이블) 행을 들고 온다.

| Export | 용도 |
| --- | --- |
| `ReviewSummaryStatus` / `ReviewSentiment` / `MenuSentiment` | 상태/감정 enum |
| `ReviewAnalysisMenu` / `ReviewAnalysis` / `ReviewSummary` | LLM 출력 → DB 영속화 분석 (모두 nullable, 구버전 호환) |
| `VisitorReviewWithSummary` / `RestaurantDetail` | 어드민 상세 응답 — `snapshot: NaverPlaceData` + 리뷰 행 |
| `RestaurantSourceSummary` | **신규.** canonical 안의 출처 한 줄. `{ restaurantId, source, sourceId, placeId, name, category, address, rating, reviewCount, firstCrawledAt, lastCrawledAt, totalReviews, summaryPending/Running/Done/Failed, avgSentimentScore, avgSatisfactionScore, positiveCount, negativeCount, neutralCount, mixedCount }` |
| **`CanonicalListItem`** | **변경.** 어드민 list 의 행 = canonical. `{ canonicalId, name, primaryCategory, latitude, longitude, lastCrawledAt(가장 최근 source 활동, 기본 정렬), sources: RestaurantSourceSummary[].min(1), 통합 카운트(totalReviews, summary*), 분석 집계(가중평균 avgSentimentScore/avgSatisfactionScore + 3+1범주 카운트), candidateCount, suggestion: CanonicalSuggestion \| null }`. `suggestion` 은 `sources.length===1 && suggestionDismissedAt===null && candidateCount>=1` 일 때만 채워진다 |
| `recomputeCanonicalAggregates(sources)` | SSE patch 후 sources 갱신 시 통합 카운트/가중평균 재계산하는 client-side helper (서버 list() 와 동일 로직) |
| `RestaurantListResult` | `{ items: CanonicalListItem[] }` — **이전의 평탄 `RestaurantListItem[]` 에서 모양 자체가 바뀐 breaking change** |
| `RestaurantDeleteResult` / `RestaurantReanalyzeResult` / `RestaurantAnalyticsBackfillResult` | 기존 그대로 |
| `RestaurantSmartPickInput/Result` / `RestaurantInsights*` | 가중 랜덤 픽 + 인사이트 |
| `RestaurantRankingQuery/Item/Result` | 공개 랭킹 |
| `RestaurantPublicListQuery/Item/Result` | 공개 지도 — `mixedCount` 제외, `total` 페이지네이션 |
| `PublicReviewAnalysis` / `PublicVisitorReview` / `RestaurantPublicDetail` | 공개 응답 (운영 메타 제거, snapshot 평탄화) |
| `RestaurantSummaryProgress` / `RestaurantSummaryReviewEvent` / `RestaurantSummarySnapshotEvent` | summary SSE |

### `schemas/menu-grouping.ts` / `schemas/analytics.ts` / `schemas/ai.ts` / `schemas/settings-map.ts`

(이전 라운드 그대로 — 변경 없음. 각 도메인 표는 직전 컴파일 본 참고. core export 요약만 유지)

- **menu-grouping**: `MenuRankingSort/Query/Item/Result`, `MenuGroupRunResult`,
  `MenuGroupingRestaurantStatus[List]`, `MenuGroupingJob{Input,State,ItemState,Item,Snapshot,ItemEvent,DoneEvent}`.
  Bulk save 잡(`DiningcodeBulkSaveJob*`)이 이 패밀리의 SSE 모양을 그대로 재사용.
- **analytics**: `GlobalMenuStat/Query/Result`, `AnalyticsOverview`,
  `GlobalMergeJob{Input,State,ChunkProgress,Snapshot,ChunkEvent,DoneEvent}`,
  `CategoryTreeNode/Result` (z.lazy 재귀).
- **ai**: `AiCompleteInput/Result`, `AiCompleteBatchInput/Result`,
  `LlmProviderConfig/ListResult`, `UpdateLlmProviderInput`, `TestLlmProviderInput/Result`,
  `LlmModelListResult`.
- **settings-map**: `MapProviderConfig/ListResult`, `UpdateMapProviderInput`,
  `MapProviderSecret` (admin), `MapProviderPublicConfig` (public).

### `routes.ts` — [routes.ts](../../packages/api-contract/src/routes.ts)

`API_PREFIX = '/api/v1'` 고정. 도메인별 객체:

| Namespace | 키 | 경로 |
| --- | --- | --- |
| `Auth` | register, login, me, logout | `/auth/...` |
| `Users` | list, byId(id) | `/users[/:id]` |
| `Picks` | list, create, byId(id) | `/picks[/:id]` |
| `Admin` | listUsers, setUserRole(id) | `/admin/users[/:id/role]` |
| `Media` | thumbnail | `/media/thumbnail` (Naver 이미지 프록시, 공개) |
| `Crawl` | naverPlace, jobs, job(id), jobEvents(id), search, **catchtableSearch**, **catchtableShop(shopRef)**, **catchtableShopMenus(shopRef)**, **catchtableShopReviewOverview(shopRef)**, **diningcodeSearch**, **diningcodeShop(vRid)**, **diningcodeShopReviews(vRid)**, **diningcodeShopSave(vRid)**, **diningcodeRegistered**, **diningcodeBulkSaveJobs**, **diningcodeBulkSaveJob(id)**, **diningcodeBulkSaveJobEvents(id)** | `/admin/crawl/...` |
| `Restaurant` | **공개:** ranking, publicList, publicByPlaceId(placeId), publicInsights(placeId) / **어드민:** list, byPlaceId, delete, summaryStatus, summaryEvents, reanalyze, insights, smartPick, menusGroup, menusRanking, analyticsBackfill | `/restaurants/...` + `/admin/restaurants/...` |
| **`Canonical`** | **candidates(id), merge, split(id), dismissSuggestion(id), proposals, proposalsRun, proposalAccept(id), proposalReject(id), delete(id)** | `/admin/canonical/...` |
| `Analytics` | restaurantsStatus, groupingJobs/Job/JobEvents, overview, globalMenus, globalMergeJobs/Job/JobEvents, categoryTree | `/admin/analytics/...` |
| `Ai` | complete, completeBatch, providers, provider(id), testProvider(id), providerModels(id) | `/admin/ai/...` |
| `SettingsMap` | list, provider(id), secret(id), publicConfig | `/admin/settings/map/...` + `/settings/map/public` |
| `Health` | (단일 상수) | `/health` |

**이번 라운드 신규 라우트군:**

- `Routes.Canonical.*` — 가게 정체 통합. `delete(id)` 는 placeId 기반 식당 삭제와 별개
  — DC 만 등록된 canonical 도 지울 수 있도록 신설. FK Cascade 로 Restaurant/리뷰/summary/proposal
  까지 모두 따라간다.
- `Routes.Crawl.catchtable*` — 캐치테이블 검증 페이지(`/admin/catchtable-test`) 가 호출.
  shopRef 한 개로 상세/메뉴/리뷰 종합을 lazy 로 따로 페치 (단일 상세 페이지의 모달 안에서).
- `Routes.Crawl.diningcode*` — `/admin/diningcode-test` + 정식 `/admin/diningcode` 페이지가
  공유. 검색 → 상세 → DB 저장 + 리뷰 페이지네이션의 4 라우트. 검색 카드의 '등록됨' 배지는
  `diningcodeRegistered` (vRid 다수 한 번에).
- `Routes.Crawl.diningcodeBulkSaveJob*` — 검색 페이지 다중 선택 후 일괄 저장. menu-grouping
  잡 SSE 와 동일한 snapshot/item/done 페어 패턴.

## Data [coverage: high — 10 sources]

순수 contract 패키지로, 자체 데이터(persistence/cache) 는 없다 — 모든 모양은
스키마 정의로만 존재한다. Prisma 모델 매핑은 friendly 토픽 참조 — DB 스키마의 SSOT 는
`apps/friendly/prisma/schema.prisma`.

주요 compose 관계 (변경/신규만 강조):

- **`CanonicalSummary`** = `{ id, name, primaryCategory, latitude, longitude, sources: CanonicalSourceSummary[] }`
  — canonical 도메인의 core. proposal/candidate/list 응답이 모두 이 모양을 재사용.
- **`CanonicalListItem`** (어드민 list 행) = `{ canonicalId, name, primaryCategory, ..., sources:
  RestaurantSourceSummary[].min(1), 통합 카운트 + 분석 집계, candidateCount, suggestion: CanonicalSuggestion\|null }`.
  통합 카운트는 sources 합 + 가중평균 (helper `recomputeCanonicalAggregates` 가 재계산 로직 SSOT).
- **`CanonicalProposalItem`** = `{ id, canonicalA, canonicalB(작은id, 큰id 순서로 정규화),
  score, nameScore, distanceM, status, createdAt }` — 자동 매칭 큐 행. `CanonicalProposalAcceptInput.keepSide`
  로 어느 쪽이 살아남는지 결정 → 내부적으로 `CanonicalMergeResult` 반환.
- **`CatchtableSearchResponse`** = `{ items, totalShopCount, hasMore, nextOffset, source: 'playwright',
  fallback, elapsedMs }` — 단방향 페이지 토큰(`nextOffset`) 페이지네이션. `fallback` 은
  키워드가 백엔드 매칭 안 돼 추천 DB 로 떨어진 신호.
- **`CatchtableShopData`** = 큰 nested object — `images/subways/priceRange/review/schedule/relatedKeywords`
  + lazy `menus/reviewSamples`(nullable). Playwright 가 가게 페이지 진입 시 자동 발사되는
  응답을 가로채 정규화한 모양 그대로 contract 에 흡수했다. 검증 페이지의 SSOT 역할 — BE/FE
  중간 가공 없이 wire 모양이 type 으로 흐른다.
- **`DiningcodeShopData`** = `POST /API/profile/` 한 방의 16 섹션 통합. 그러나
  **`DiningcodeShopReviewsResponse`** 와 **`SaveDiningcodeShopResult`** 는 같은 16 섹션
  응답에서 review 만 / 저장 결과 카운터만 추려낸 가벼운 shape — 페이지네이션·일괄 저장
  반복 호출이라 페이로드를 작게 유지.
- **`DiningcodeBulkSaveJobSnapshot`** = `{ jobId, state, total, done/failed/skippedCount, startedAt,
  finishedAt, items: DiningcodeBulkSaveJobItem[] }`. SSE per-event 는 menu-grouping 과
  **동일 모양** — `DiningcodeBulkSaveJobItemEvent { type: 'item', jobId, item }` +
  `DiningcodeBulkSaveJobDoneEvent { type: 'done', jobId, state, finishedAt }`. `z.literal`
  tagged union 으로 클라이언트 switch 가 자동 좁힘.

(이전 라운드의 NaverSearchResult / RestaurantPublicDetail / ReviewAnalysis 분리 / GlobalMenuStat /
CategoryTreeNode / LlmProviderConfig 등의 compose 관계는 그대로 유효 — 마지막 컴파일 본 참조)

## Key Decisions [coverage: high — 9 sources]

- **Zod 채택 (vs JSON Schema 직접 작성, vs io-ts)** — 런타임 검증 + 정적 타입 추론을 한
  스키마로 처리하고, fastify-type-provider-zod 와 한 번에 결합돼 OpenAPI 까지 자동 생성된다.
  `z.infer<typeof X>` 로 클라이언트 타입까지 무료. **TS interface 직접 사용 금지** — 모든
  공유 타입은 zod 스키마에서 추론한다.
- **빌드 없는 src 직접 export** — `package.json` `exports` 가 `./src/*.ts` 를 가리킨다.
  tsup/rollup 빌드 단계가 없어 변경 즉시 모든 워크스페이스에 반영되고, Turborepo 캐시
  무효화도 단순해진다. friendly 는 `injected` workspace 의존성으로 src 를 그대로 본다.
- **도메인별 파일 분할 + 한 방향 import** — `auth/user/picks/admin/crawl/restaurant/canonical/
  menu-grouping/analytics/ai/settings-map/common` 으로 쪼갠다. `restaurant.ts` 가 `crawl.ts`
  와 `canonical.ts` 를 import 하지만 역방향은 금지. canonical 은 자체 타입만 — 외부 의존
  zero. "같은 모양이지만 의미가 다른" 페이로드는 의도적으로 inline 중복.
- **어드민 list 응답이 canonical 단위 그룹핑으로 전환** — 이전엔 `RestaurantListItem` (1 행
  = 1 placeId) 였지만, 이번 라운드부터 list 응답 행 = canonical 이고 `sources: RestaurantSourceSummary[]`
  배열로 그 안의 출처별(Naver/DC/캐치테이블) 행이 묶여 내려간다. 같은 가게가 여러 출처에
  걸쳐 등록될 수 있어 — 운영 화면에서 두 행으로 보이면 "병합" 흐름이 강제로 발생하기 때문.
  통합 카운트와 가중평균은 sources 합으로 서버가 계산하고, 클라이언트는 SSE patch 후
  `recomputeCanonicalAggregates(sources)` helper 로 같은 로직을 재실행한다.
- **canonical 자동 매칭은 의도적으로 안 함** — proposal 큐에 임계 0.45 이상이면 모두 들어가지만,
  자동 머지는 안 한다. 좌표/이름 매칭이 자주 false positive 를 만들고, 정체 통합은 되돌리기
  비용이 크기 때문에 항상 어드민 수동 확정. `CanonicalSuggestion` 도 같은 철학 — 등록 직후
  list 알림 줄에 1차 매칭을 노출하되 "병합" 버튼은 어드민이 직접 누른다. `dismissSuggestion`
  으로 "합칠 게 없음" 영구 닫기도 제공.
- **proposal 의 ProposalAcceptInput.keepSide** — 수락 시 어느 쪽이 살아남는지(target) 를 어드민이
  명시 선택. 기본 'A' (정규화된 작은 id 쪽). 자동 정책 없음 — primary 메타(name/category/coords)는
  target 쪽 그대로 유지된다 (필요하면 후속 PATCH 로 갱신).
- **DC bulk save SSE 가 menu-grouping 잡과 동일 모양** — `z.literal('item')` / `z.literal('done')`
  tagged union, 같은 `snapshot/item/done` 시퀀스. SSE 라이프사이클 코드를 재사용하기 위해
  의도적으로 모양을 일치시켰다. `MenuGroupingJobItemState` 의 `'skipped'` 추가 패턴도
  `DiningcodeBulkSaveJobItemState` 에 동일하게 도입 — 이미 저장된 vRid 는 스킵.
- **DC 응답이 16섹션 다 오지만 두 응답 shape 는 가볍게** — `DiningcodeShopData` 는 통합
  본체로 16 섹션 모두 노출하지만, 페이지네이션 호출(`DiningcodeShopReviewsResponse`) 과
  영속화 결과(`SaveDiningcodeShopResult`) 는 review 만 / 저장 카운터만 담은 슬림 shape.
  반복 호출 페이로드를 작게 유지하려는 의도 — 어댑터가 같은 응답에서 필요한 부분만 추려
  re-shape 한다.
- **CatchtableShopData 가 큰 nested object — Playwright capture 를 SSOT 로** — 가게 페이지
  진입 시 자동 발사되는 응답을 가로채 그대로 정규화 모양으로 흡수. BE/FE 중간 가공 없이
  wire shape 가 type 으로 흐른다. 단점은 외부 스키마 변동에 약함 — 캐치테이블 응답이 바뀌면
  contract 와 어댑터를 함께 손봐야 한다.
- **공개/어드민 스키마 분리** — `RestaurantPublicListItem` 은 어드민 `CanonicalListItem` 과
  데이터 출처가 같지만 별개 zod 객체다. 어드민 행은 sources/통합 카운트/proposal 제안이
  핵심이고, 공개 행은 좌표/대표 이미지/3범주 분포가 핵심. 공개 응답에 운영 메타가 누설될
  가능성을 타입 시스템으로 차단.
- **`bbox` 는 string + regex** — 지도 viewport bbox 는 `?bbox=A,B,C,D` 한 줄로 끝나고
  BE 가 split 한 번으로 파싱 가능. regex `^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$`.
- **`z.discriminatedUnion('type')` for SSE union** — `CrawlEvent` 6종, summary review/snapshot,
  `MenuGroupingJob{Item,Done}Event`, `DiningcodeBulkSaveJob{Item,Done}Event`,
  `GlobalMergeJob{Chunk,Done}Event` 모두 `type` literal 로 분기.
- **라우트 경로 상수화 + Routes namespace re-export** — 문자열 리터럴을 코드 곳곳에
  흩뿌리는 대신 `Routes.Canonical.candidates(id)`, `Routes.Crawl.diningcodeShopSave(vRid)`,
  `Routes.Crawl.catchtableShopMenus(shopRef)` 같은 함수/상수를 강제. namespace 충돌을
  우회하는 핵심 트릭.
- **`ReviewAnalysis` ↔ `ReviewSummary` ↔ `PublicReviewAnalysis` 3단 분리** — LLM 출력/DB 영속화/공개
  응답의 세 시점 구분. (변경 없음)
- **`z.lazy` 로 재귀 스키마** — `CategoryTreeNode` (변경 없음).
- **CLAUDE.md 규칙** — _"공유 스키마는 `@repo/api-contract` 에 추가"_ 가 명시된 핵심 규칙
  ([CLAUDE.md](../../CLAUDE.md)).

## Gotchas [coverage: high — 10 sources]

- **변경의 파급력** — 스키마 한 줄 수정이 friendly + web + mobile 모두에 컴파일 타임 영향을
  준다. 필드 제거나 타입 좁히기는 모든 소비자 코드를 깨뜨린다. optional 추가는 안전, required
  추가/제거는 위험.
- **list 응답 모양이 바뀐 breaking change** — `RestaurantListResult.items` 가
  `RestaurantListItem[]` (1 행 = 1 placeId, 통합 카운트 인라인) 에서
  `CanonicalListItem[]` (1 행 = 1 canonical, `sources: RestaurantSourceSummary[]` 안에 출처별
  카운트) 로 모양 자체가 바뀌었다. 어드민 페이지가 카드 안에서 sources 를 다시 매핑하도록
  업그레이드 필요. SSE patch 도 source 한 행만 갱신하므로 클라이언트는
  `recomputeCanonicalAggregates(sources)` helper 로 통합 카운트를 다시 계산해야 한다.
- **`CanonicalListItem.suggestion` 채워지는 조건이 까다로움** — `sources.length === 1 &&
  suggestionDismissedAt === null && candidateCount >= 1` 세 조건 모두 만족할 때만 채워진다.
  즉 신규 등록 직후 한 출처만 묶인 상태에서, 어드민이 "무시" 안 누른, 후보가 적어도 하나 있는
  canonical 에만 노출. 이미 multi-source 가 된 canonical 은 `candidates` API 로 따로 조회해야 함.
- **canonical proposal 쌍은 (작은 id, 큰 id) 정규화** — 자동 매칭이 (A,B) 와 (B,A) 두 번
  들어가는 걸 막기 위해 항상 정규화. `keepSide: 'A' \| 'B'` 의 A/B 는 정규화된 순서를
  가리키므로 UI 라벨이 "왼쪽/오른쪽" 같은 위치 의존 표현이면 헷갈릴 수 있다.
- **DC bulk save `vRids` 캡 50 / 각 vRid 길이 80** — `DiningcodeBulkSaveJobInput.vRids.max(50)` +
  각 항목 `min(1).max(80)`. 다이닝코드 부하 의식한 보수 수치라 어드민 페이지에서 더 많이
  선택하면 클라사이드에서 cap 검증 + 분할 전송 필요. 어댑터의 페이지 간 200ms 간격과 같이
  재검토할 사안.
- **DC `sourceId` / `vRid` 길이 한계** — `DiningcodeRegisteredEntry.vRid` 도 동일한 정규화
  된 vRid 식별자를 쓴다. URL 파라미터 길이 안전(`ids` querystring `.max(4000)`)을 위해
  콤마 분리로 받아 BE 가 split. 한 페이지 카드 30개 가정한 cap — 그 이상 한 번에 조회하려면
  POST body 로 바꿔야 한다.
- **DC `/API/profile/` 한 번에 16 섹션이 다 옴** — `DiningcodeShopData` 가 통합 본체로 큰 응답.
  페이지네이션 호출(`tab=review&page=N`) 도 같은 응답을 받지만 `DiningcodeShopReviewsResponse`
  는 review 부분만 추려서 노출 — 어댑터에서 server-side filter. wire 응답 자체가 작아지는 게
  아니므로 다이닝코드 부하는 동일. 페이지네이션 폴링 시 의식할 것.
- **catchtable lazy 필드의 null** — `CatchtableShopData.menus` / `reviewSamples` 는 비가맹점
  이거나 영역 트리거 실패 시 null. UI 가 `?? []` 폴백 안 하면 .map 호출이 깨진다. `menus`
  lazy 페치(`CatchtableShopMenusResponse`) 는 별도 라우트라 가맹점만 의미가 있다.
- **catchtable `nextOffset` 페이지네이션** — `offset` 이 숫자가 아니라 응답이 발급하는 토큰
  문자열. 첫 호출 미지정, 다음 호출은 직전 응답의 `nextOffset`. `hasMore=false` 면 끝.
  `fallback=true` 도 같이 보면 "결과 없음 vs 추천 fallback" 구분 가능.
- **catchtable `source: 'playwright'`** — 캐치테이블은 Playwright 캡처를 SSOT 로 흡수 — 응답
  필드들이 캐치테이블 wire 모양에 강하게 결합. 외부 스키마 변경 시 contract 도 따라 손봐야
  함. naver/diningcode 처럼 HTTP 어댑터로 전환할 여지 없음(CF 보호로 인해).
- **공개 라우트는 path prefix 가 다름** — `Routes.Restaurant.publicList` 등은
  `/api/v1/restaurants/public...` 이고 어드민은 `/api/v1/admin/restaurants...` 이다.
  Fastify 측 인증 미들웨어가 path prefix 로 분기하므로, 새 공개 라우트 추가 시 반드시
  `/restaurants/...` (또는 그 외 비-admin prefix) 트리에 두어야 한다.
- **`Routes.Canonical.delete(id)` 는 placeId 기반 식당 삭제와 별개** — `Routes.Restaurant.delete(placeId)`
  는 한 출처 행만 지우지만, canonical delete 는 그 안의 모든 Restaurant + FK Cascade 로
  review/summary/proposal 까지 삭제. 어드민이 의도와 다른 라우트를 호출하면 복구 비용 큼.
- **canonical 분리 시 원본 canonical 이 비면 삭제** — `CanonicalSplitResult.sourceCanonicalDeleted`
  를 클라이언트가 참고해야 캐시 무효화 (원본 행의 카드/링크 invalidate). 단순히 새 canonical 만
  추가한다고 가정하면 stale 데이터 남음.
- **mixed sentiment 는 공개 응답에서 빠짐** — 공개 list 의 `positive/negative/neutralCount` 는
  3범주만. 어드민 canonical/source 카운트는 `mixedCount` 포함.
- **`Routes.Restaurant.summaryEvents` 가 함수 → 상수로 바뀐 breaking change** — 이전엔
  `summaryEvents(placeId)` 였다. 현재는 `/api/v1/admin/restaurants/summary-events` 단일 상수이고
  placeId 는 query (`?placeId=A&placeId=B&…&token=<jwt>`).
- **빌드 단계 추가 금지** — `package.json` `exports` 가 `src/` 를 직접 가리키므로 tsup/rollup
  같은 번들러를 끼우면 워크스페이스 전체 import 경로가 깨진다.
- **순환 의존 금지** — `@repo/shared → @repo/api-contract` 는 OK, 반대 방향은 금지
  ([CLAUDE.md](../../CLAUDE.md)). 도메인 파일 사이에서도 `restaurant → crawl`,
  `restaurant → canonical` 한 방향만. canonical 은 다른 도메인 schemas 를 import 하지 않는다.
- **`.js` 확장자 표기** — 실 파일은 `.ts` 지만 import 는 `.js` 로 써야 한다 (NodeNext 해석).
  `canonical.ts` 도 `index.ts` 에서 `'./schemas/canonical.js'` 로 import.
- **`z.coerce` 의 함정** — `PaginationQuerySchema`, `MenuRankingQuery.minMentions`,
  `GlobalMenuQuery`, `RestaurantPublicListQuery`, `CatchtableSearchQuery.{lat, lon, limit,
  contractedOnly}`, `DiningcodeSearchQuery` 가 모두 `z.coerce.*`. `coerce.boolean` 은 빈
  문자열도 true.
- **`z.lazy` 의 `z.ZodType` 명시 필요** — `CategoryTreeNode` (변경 없음).
- **`Routes.Ai.X` namespace re-export 가 vite esbuild prebundle 에서 깨질 수 있음** —
  `Routes.Canonical`, `Routes.SettingsMap`, `Routes.Analytics` 도 동일 위험. 회피책으로
  friendly 측은 `const CanonicalRoutes = Routes.Canonical` 로 한 단계 우회.
- **`MapProviderPublicConfig` 키 미등록 시 404** — 어드민 list 는 200 + `hasApiKey: false`
  로 내려준다 — 의도가 다른 두 라우트가 status 도 다르게 동작.
- **`NaverSearchResult.lat/lng` 는 number — 네이버 응답 y/x 는 string 변환 필수** —
  잘못 string 두면 OL `fromLonLat` 깨짐. 같은 변환 패턴이 발견 어댑터에 박혀 있음
  ([crawl](crawl.md) 참조). `DiningcodeSearchResult.lat/lng`, `CatchtableSearchResult.lat/lon`
  도 모두 number nullable 로 통일.

## Sources [coverage: high — 16 sources]

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
- [packages/api-contract/src/schemas/canonical.ts](../../packages/api-contract/src/schemas/canonical.ts)
- [packages/api-contract/src/schemas/menu-grouping.ts](../../packages/api-contract/src/schemas/menu-grouping.ts)
- [packages/api-contract/src/schemas/analytics.ts](../../packages/api-contract/src/schemas/analytics.ts)
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts)
- [packages/api-contract/src/schemas/settings-map.ts](../../packages/api-contract/src/schemas/settings-map.ts)
- [CLAUDE.md](../../CLAUDE.md) — "공유 스키마는 `@repo/api-contract` 에 추가" 규칙
