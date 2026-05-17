---
topic: crawl
last_compiled: 2026-05-17
status: active
---

# crawl — 다중 출처 크롤러 (Naver Place + 캐치테이블 + 다이닝코드)

`apps/friendly/src/modules/crawl/`에 위치한 어드민 전용 크롤러. Naver Place / 캐치테이블 / 다이닝코드 세 출처를 모두 다루며, 각 출처마다 어댑터 비용 분포가 다르다 (Naver = Playwright 풀세션, 캐치테이블 = Playwright 안에서 fetch 가로채기, 다이닝코드 = HTTP 직접). 잡 패턴도 4가지 — 단일 Naver 크롤(SSE), Naver/캐치테이블/다이닝코드 키워드 검색(동기), 다이닝코드 가게 저장(단일 동기), 다이닝코드 일괄 저장(SSE).

## Purpose [coverage: high — 5 sources]

가게를 골라주는 서비스의 다출처 데이터 인입 통로. 어드민이 출처별 입력(네이버 Place URL, 캐치테이블 키워드/shopRef, 다이닝코드 키워드/vRid)을 주면 가게 사실 데이터(메타·메뉴·리뷰·이미지·평점 분포)를 한 번에 긁어와 정규화하고 DB에 적재한다. 적재된 리뷰는 곧장 AI 요약 큐로 흘러가고, 등록 직후 cross-source canonical 후보가 자동으로 검토 큐에 들어간다.

호출자:
- 어드민 웹 UI — `AdminCrawlTestPage`(네이버 URL → SSE), `AdminDiscoverPage`(검색 → 다중 startCrawl), `AdminCatchtableShopPage` / `AdminDiningcodeShopPage`(검색·상세 검증), 정식 `AdminDiningcodePage`(다이닝코드 일괄 저장 SSE).
- 개발자용 진단 스크립트 `apps/friendly/scripts/dev-capture-visitor.ts` / `dev-capture-search.ts`.
- 외부 도구(curl/스크립트) — Bearer 헤더 또는 SSE 시 `?token=<jwt>`.

권한은 항상 `app.authenticate + app.requireAdmin`.

## Architecture [coverage: high — 10 sources]

### 어댑터 비용 분포

| 출처 | 어댑터 | 비용 모델 | 비고 |
|---|---|---|---|
| Naver Place | `naver-place.playwright.adapter.ts` | Playwright Chromium (모바일 UA, iPhone viewport) + Apollo cache + GraphQL wire 가로채기 | SSR Apollo SPA → Playwright 필수 |
| Naver Search | `naver-search.http.adapter.ts` | HTTP nx-api GraphQL 직접 호출 | (이전 Playwright 어댑터에서 HTTP 로 이행 — `source: 'http'`) |
| 캐치테이블 Search | `catchtable-search.playwright.adapter.ts` | Playwright 페이지 1개를 warm 유지 + `page.evaluate(fetch(...))` | CF 봇 보호 — 직접 fetch 차단, 페이지 안에서 호출 |
| 캐치테이블 Shop | `catchtable-shop.playwright.adapter.ts` | `/ct/shop/{ref}` 진입 후 `page.on('response')` 로 자동 호출 가로채기 + 메뉴/리뷰 영역까지 스크롤 | 별도 Browser/Context 인스턴스 |
| 다이닝코드 Search | `diningcode-search.http.adapter.ts` | HTTP `POST /API/isearch/` 직접 호출 | CORS 열림 + CF 없음 |
| 다이닝코드 Shop | `diningcode-shop.http.adapter.ts` | HTTP `POST /API/profile/` 직접 호출 — 한 방에 16섹션 모두 옴 | 페이지네이션도 같은 endpoint 에 `tab=review&page=N` |

### 4가지 잡 패턴

1. **단일 Naver 크롤 (SSE)** — `POST /naver-place` → 백그라운드 `runJob` → `persistTail` 체인으로 `onPartial`/`onVisitorBatch` 직렬 영속화 → SSE `progress`/`partial`/`visitor_progress`/`visitor_batch`/`done` 이벤트. JobRegistry 가 actor 단위 max 5 + FIFO 큐 관리 (자동 발견 잡의 group-of-5 동시 시작과 맞춤). (이전 글에서 자세히 다룬 흐름 그대로.)
2. **Naver/캐치테이블/다이닝코드 검색 (동기)** — `searchPlaces` / `searchCatchtable` / `searchDiningcode` 가 어댑터 호출 후 한 번에 반환. 잡 모델 없음.
3. **단일 다이닝코드 가게 저장 (동기)** — `POST /diningcode/shop/:vRid/save` → `saveDiningcodeShop` 가 `fetchDiningcodeShop` → 리뷰 1~totalPage 페이지 직렬 fetch (페이지 간 200ms) → `upsertRestaurantFromDiningcode` → `generateProposalsForRestaurant` → `mapDiningcodeReviewToRaw` → `persistReviewBatch` → `summaries.queueSummariesForReviews('dc:<vRid>', ids)`. 응답은 fetch 가 다 끝나야 200 — 평균 가게당 수 초.
4. **다이닝코드 일괄 저장 (SSE)** — `POST /diningcode/bulk-save/jobs` (body.vRids[]) → `diningcodeBulkSaveRegistry.create()` → 백그라운드 `runDiningcodeBulkSave(id, vRids)` → `markRunning` → vRid 직렬 loop: `markItemStart` → `saveDiningcodeShop(vRid)` → 성공/실패/abort 분기로 `finishItem(...)` → `markFinished`. SSE 는 menu-grouping 잡과 동일한 `snapshot`/`item`/`done` named-event 패턴.

### Persist tail & canonical 후크

- 단일 Naver 잡과 다이닝코드 저장 모두에 동일한 후크가 붙는다. `crawl.service.ts`의 `generateProposalsForRestaurant(restaurantId)` 가 `restaurants.getCanonicalIdForRestaurant` → `proposals.generateForCanonical(canonical)` 호출. 실패해도 `try/catch` 로 삼켜 등록 흐름은 안 막는다 — 큐는 보조 채널.
- 다이닝코드 리뷰 영속화는 `RestaurantService.mapDiningcodeReviewToRaw` 가 `dc:rv:<rvId>` 형태 externalId 로 매핑 → `persistReviewBatch` 의 (restaurantId, externalId) unique constraint 가 idempotent dedupe.

### Naver 종료 후 다이닝코드 자동 매칭+머지 (C안)

Naver 단일 크롤이 `done` 직전, `generateProposalsForRestaurant` 와 별개로 `tryAutoMatchDiningcode(canonicalId)` 가 fire-and-forget 으로 호출된다. 흐름:

1. canonical 검증 — `this.canonical` 주입 + canonical 에 `'diningcode'` source 가 아직 없음 + 좌표 보유 (셋 다 만족 못 하면 skip).
2. `searchDiningcodePlaces(name, { lat, lng, distance: 200, size: 5, order: 'r_score' })` — 좌표 기준 200m 반경 검색. `strictDistance=true` 가 기본이라 광역 fallback 자동 제거.
3. 이미 등록된 vRid 제외 — `findRegisteredDiningcodeByVRids` 로 다른 canonical 에 묶여 있는 후보 컷.
4. `scoreMatch` 로 (name, distance) 점수화 후 정렬. 임계: `nameScore ≥ 0.85` (`AUTO_DC_NAME_THRESHOLD`) + `distanceM ≤ 50` (`AUTO_DC_DISTANCE_THRESHOLD_M`) + `top1.score - top2.score ≥ 0.1` (`AUTO_DC_TIE_GAP`).
5. 통과 시 `saveDiningcodeShop(vRid)` → 새 DC canonical 생성됨 → `canonical.merge(dcCanonicalId, naverCanonicalId)` 호출.

임계 못 넘으면 silent skip — `ProposalService` 가 별도 채널로 후보 큐 적재. 임계 상수는 `crawl.service.ts` 모듈 상단 — 정책 변경 시 여기만 손대면 됨.

### 다이닝코드 일괄 저장 잡 모델

`diningcode-bulk-save-registry.ts` 의 in-memory `Map<jobId, InternalJob>`. menu-grouping 잡 레지스트리와 동형:
- `state: 'pending' | 'running' | 'done' | 'failed'`
- `items: DiningcodeBulkSaveJobItem[]` — 각 vRid 의 `state` (`pending`/`running`/`done`/`failed`/`skipped`) + `restaurantId`/`fetchedPages`/`newReviewCount` 또는 `errorCode`/`errorMessage`.
- 단일 `AbortController` — 취소 시 진행 중인 한 vRid 의 `saveDiningcodeShop` fetch 는 끝까지 기다리고(어댑터 abort 미지원) 이후 vRid 들은 시작 전 `skipped` 로 마무리.
- subscribers `Set<BulkSaveJobSubscriber>` 로 fan-out, 종료 후 10분 TTL GC. EventSource 재접속 시 라우트가 `GET /diningcode/bulk-save/jobs/:id` 스냅샷 먼저 받고 SSE 연결.
- `markFinished` 가 모든 item 이 terminal 일 때만 동작 — 하나라도 `done`/`skipped` 면 잡 state `done`, 모두 `failed` 면 `failed`.

### Per-actor 1잡 인스턴스 (다이닝코드 일괄)

라우트가 단순화: actor 당 한 번에 1개 잡만 (`POST` 시 기존 잡이 있어도 새로 만들지만, UI 가 동시 호출 안 함 + 다이닝코드 부담 의식). menu-grouping 과 동형. Naver 크롤의 max 5 + FIFO 와는 다른 정책.

## Talks To [coverage: high — 9 sources]

- **Playwright (Naver Place)** — `naver-place.playwright.adapter.ts` 모듈 스코프 `browserPromise` (모바일 UA, iPhone viewport). 메인+방문자 서브페이지 + GraphQL wire 가로채기.
- **Playwright (캐치테이블 검색)** — `catchtable-search.playwright.adapter.ts` 별도 Browser + warm `BrowserContext`/`Page` 1개를 모듈 캐싱 — `https://app.catchtable.co.kr/ct/map/search-map?...` 진입 후 `page.evaluate` 로 `POST /api/v6/search/list` 호출. 첫 호출 ~14s, 이후 ~200-900ms. `body.keywordSearch.keyword` 가 실제 검색어 — `keyword` 단독 필드는 무시됨. `totalShopCount >= 10000` 이면 키워드 매칭 실패 → 추천 fallback → `fallback: true`.
- **Playwright (캐치테이블 상세)** — `catchtable-shop.playwright.adapter.ts` 또 다른 별도 Browser/Context. `/ct/shop/{ref}` 진입 후 `/api/v4/shops/{ref}`, `/api/display/v2/shops/{ref}`, `/disables`, `/bookmark/count`, `/related-keywords/by-shop` 응답 가로채기. 메뉴는 `/menuAllList` 페이지 진입 후 `/api/display/v2/shops/{ref}/tabs/menu` 가로채기. AI 리뷰 종합은 `/api/review/v2/shops/{ref}/review-overview` 를 warm context 안 `page.evaluate(fetch)` 로 직접 호출.
- **다이닝코드** — HTTP 직접. `POST /API/isearch/` (검색, `application/x-www-form-urlencoded`), `POST /API/profile/` (가게 상세 + 리뷰 페이지네이션, 같은 endpoint). 응답 `result_code === '100'` 이 정상. `poi_section.total_cnt` 는 10000 캡 — 실제 매칭은 `params.rcount`.
- **api-contract 스키마** — `packages/api-contract/src/schemas/crawl.ts` 에 zod 정의: `CatchtableSearchQuery`/`CatchtableSearchResponse`/`CatchtableShopData`/`CatchtableShopMenusResponse`/`CatchtableShopReviewOverviewResponse`, `DiningcodeSearchQuery`/`DiningcodeSearchResponse`/`DiningcodeShopData`/`DiningcodeShopReviewsResponse`, `SaveDiningcodeShopResult`, `DiningcodeRegisteredQuery`/`DiningcodeRegisteredResult`, `DiningcodeBulkSaveJobInput`/`DiningcodeBulkSaveJobSnapshot`/`DiningcodeBulkSaveJobItem` (+ item/done 이벤트). 기존 Naver 스키마는 그대로 유지.
- **RestaurantService** — `upsertRestaurantFromCrawl` (네이버), `upsertRestaurantFromDiningcode` (다이닝코드 신규), `findByPlaceId`, `getExistingReviewKeys`, `clearReviewsAndSummaries`, `persistReviewBatch`, `findRegisteredDiningcodeByVRids`, `getCanonicalIdForRestaurant`, 정적 `mapDiningcodeReviewToRaw`.
- **SummaryService** — `queueSummariesForReviews(key, ids)`. Naver 는 `placeId`, 다이닝코드는 `'dc:<vRid>'` 키 — 같은 SummaryService 풀 안에서 키 충돌 없게 namespace.
- **ProposalService (CanonicalService)** — `proposals.generateForCanonical(canonicalId)` — 등록 직후 cross-source 후보 적재 후크. null 주입 가능 (테스트용).
- **JobRegistry / DiningcodeBulkSaveRegistry singleton** — 둘 다 모듈 스코프 인스턴스를 라우트와 서비스가 공유.
- **auto-discover 컨슈머** — [auto-discover](auto-discover.md) 잡이 그룹 5병렬로 `CrawlService.startCrawl` 을 호출하고 같은 jobRegistry 의 SSE 스트림(`progress`/`done`)을 await. `MAX_CONCURRENT_PER_ACTOR = 5` 가 이 그룹 크기와 맞춰져 있어 큐잉 없이 그룹이 동시에 active 로 진입.

## API Surface [coverage: high — 2 sources]

베이스 prefix `/api/v1`. 모든 라우트 `authenticate + requireAdmin`.

### Naver Place (기존)

| Method | Path | Body / Params | 응답 |
|---|---|---|---|
| POST | `/admin/crawl/naver-place` | `CrawlNaverPlaceInput` (`{url, mode}`) | `StartCrawlResult` (`{ok, jobId, deduped, queued?}`) |
| GET | `/admin/crawl/search` | `?q&bbox?` | `CrawlSearchResult` (`{items, source: 'http' | 'playwright'}`, 현재 `'http'`) |
| GET | `/admin/crawl/jobs` | — | `CrawlJobListResult` |
| DELETE | `/admin/crawl/jobs/:id` | — | 204 |
| GET | `/admin/crawl/jobs/:id/events` | `?afterSeq?` 또는 `Last-Event-ID` | `text/event-stream` (`progress`/`partial`/`visitor_progress`/`visitor_batch`/`done`/`error`) |

### 캐치테이블

| Method | Path | Body / Params | 응답 |
|---|---|---|---|
| GET | `/admin/crawl/catchtable/search` | `CatchtableSearchQuery` (`q`, `lat?`, `lon?`, `offset?`, `limit?`, `contractedOnly?`) | `CatchtableSearchResponse` (`items`, `totalShopCount`, `hasMore`, `nextOffset`, `fallback`, `elapsedMs`, `source: 'playwright'`) |
| GET | `/admin/crawl/catchtable/shop/:shopRef` | — | `CatchtableShopData` (메타 + 메뉴/리뷰 lazy nullable) |
| GET | `/admin/crawl/catchtable/shop/:shopRef/menus` | — | `CatchtableShopMenusResponse` (`menuBoards`, `menus`, `menuDetailInfo`) |
| GET | `/admin/crawl/catchtable/shop/:shopRef/review-overview` | — | `CatchtableShopReviewOverviewResponse` (`{title, sentences[], latestUpdateDate}`) — 캐치테이블 자체 AI 한 줄 + 3-4 문장 |

### 다이닝코드

| Method | Path | Body / Params | 응답 |
|---|---|---|---|
| GET | `/admin/crawl/diningcode/search` | `DiningcodeSearchQuery` (`q`, `from?`, `size?`, `order?`, `lat?`, `lng?`, `distance?`) | `DiningcodeSearchResponse` (`items`, `total`, `from`, `size`, `hasMore`, `meta`, `filteredOutCount`, `source: 'http'`) |
| GET | `/admin/crawl/diningcode/shop/:vRid` | — | `DiningcodeShopData` (한 방에 16섹션 정규화) |
| GET | `/admin/crawl/diningcode/shop/:vRid/reviews` | `?page=N` | `DiningcodeShopReviewsResponse` (리뷰 한 페이지만) |
| POST | `/admin/crawl/diningcode/shop/:vRid/save` | — | `SaveDiningcodeShopResult` (`{vRid, restaurantId, fetchedPages, totalReviewsReported, newReviewCount, queuedForAnalysis, elapsedMs}`) — 페이지 fetch 끝나야 200 |
| GET | `/admin/crawl/diningcode/registered` | `?ids=v1,v2,...` (콤마 분리) | `DiningcodeRegisteredResult` (`{items:[{vRid, restaurantId, canonicalId}]}` — 미등록 vRid 는 결과에 없음) |
| POST | `/admin/crawl/diningcode/bulk-save/jobs` | `DiningcodeBulkSaveJobInput` (`{vRids: string[1..50]}`) | `DiningcodeBulkSaveJobSnapshot` (잡 생성 후 즉시 반환, 처리 백그라운드) |
| GET | `/admin/crawl/diningcode/bulk-save/jobs/:id` | — | `DiningcodeBulkSaveJobSnapshot` (재접속/새로고침 직후 SSE 보다 먼저 호출) |
| DELETE | `/admin/crawl/diningcode/bulk-save/jobs/:id` | — | 204 (잡 abort 신호) |
| GET | `/admin/crawl/diningcode/bulk-save/jobs/:id/events` | `?token=<jwt>` 또는 헤더 | `text/event-stream` — named events: `snapshot` (최초 1회), `item` (vRid 시작/종료마다), `done` (`{state, finishedAt}`), `: hb` heartbeat 15초 |

### 캐치테이블 / 다이닝코드 어댑터 export

- `searchCatchtablePlaces`, `fetchCatchtableShop`, `fetchCatchtableShopMenus`, `fetchCatchtableShopReviewOverview`, `closeCatchtableSearchBrowser`, `closeCatchtableShopBrowser`, `CatchtableSearchError`, `CatchtableShopError`.
- `searchDiningcodePlaces`, `fetchDiningcodeShop`, `fetchDiningcodeShopReviews`, `DiningcodeSearchError`, `DiningcodeShopError`.

Fastify `onClose` 훅이 `closeBrowser()` + `closeCatchtableSearchBrowser()` + `closeCatchtableShopBrowser()` 를 `Promise.all` 로 함께 호출.

## Data [coverage: high — 5 sources]

### 다이닝코드 일괄 저장 잡 모델 (`InternalJob` in `diningcode-bulk-save-registry.ts`)

- `id` UUID, `actorId`
- `state: 'pending' | 'running' | 'done' | 'failed'`
- `items: DiningcodeBulkSaveJobItem[]` — vRid 별 (`state`, `restaurantId`, `fetchedPages`, `newReviewCount`, `errorCode`, `errorMessage`, `startedAt`, `finishedAt`)
- `startedAt` / `finishedAt` / `finishedAtMs` (GC 용)
- `events: BulkSaveJobEvent[]` (상한 1000), `subscribers: Set<...>`, `abort: AbortController`
- TTL **10분** (`FINISHED_TTL_MS = 10 * 60_000`) — Naver 잡(5분)보다 길게: 어드민이 페이지 새로고침/재방문해서 결과를 확인할 시간 더 확보.

`SaveDiningcodeShopResult` 필드: `vRid`, `restaurantId`, `fetchedPages` (첫 페이지 포함), `totalReviewsReported` (다이닝코드 보고 총수), `newReviewCount` (dedup 후 INSERT), `queuedForAnalysis` (= newReviewCount), `elapsedMs`.

### 다이닝코드 DB 부수효과

- Restaurant 1건 — `upsertRestaurantFromDiningcode(detail)` (source='diningcode', sourceId=vRid unique). 신규면 새 canonical 생성, 기존이면 기존 canonical 유지.
- VisitorReview N건 — `mapDiningcodeReviewToRaw(rv)` 가 `externalId: 'dc:rv:<rvId>'` 박아 `persistReviewBatch` 로 dedup 후 INSERT.
- Summary 큐 — `summaries.queueSummariesForReviews('dc:<vRid>', ids)`. 키 prefix `dc:` 로 네이버 placeId 와 namespace 분리.
- CanonicalProposal — `generateProposalsForRestaurant(restaurantId)` 후크가 cross-source 후보 적재. idempotent (같은 canonical 두 번 호출해도 중복 row X).

### 다이닝코드 리뷰 AI 요약 텍스트 join

`DiningcodeShopReviewType` 에 `summaryText: string | null` 필드. 어댑터는 항상 `null` 로 채우고, 서비스 레이어(`fetchDiningcodeShopDetail` / `fetchDiningcodeShopReviewsPage`)가 `restaurants.getDiningcodeReviewSummaryMap(vRid, rvIds)` 로 우리 `ReviewSummary.text` 를 join 해서 덮어씀. 외부 응답은 그대로 두고 `summaryText` 만 채우는 패턴 — DB 에 없는 리뷰는 `null` 그대로.

### 다이닝코드 검색 응답 메타

`DiningcodeSearchMeta` — `region`/`regionName`, `rcount` (실제 매칭, total 10000 캡과 별개), `order` (서버 정규화 echo), `searchType`, `altQueries[]` (오타 보정), `relatedRegions[]`, `relatedKeywords[]`, `regionMainKeywords[]`. 어드민 검증 페이지가 별도 패널로 노출.

### 다이닝코드 가게 데이터 핵심 필드

`DiningcodeShopData` — `vRid`, `name`/`branch`/`fullName`, `area`, `categories[]`/`descTags[]`/`tags[]`/`facilities[]`, `score` (0~100), `address`/`roadAddress`/`phone`/`lat`/`lng`, `thumbnailUrl`, `images[]` (restaurant 대표) + `photos[]` (사용자 사진 12장), `status` (영업 중/종료), `businessHours[]` (7일치) + `businessHoursSummary[]`, `menus[]` + `menuTotalCount` + `hasPopularMenu`, `scoreDetail` (5 카테고리 + 별점 분포 + taste/price/service/clean info 의 good/normal/bad 비율), `reviewsFirstPage` + `blogsFirstPage`, `wordcloudUrl`/`wordcloudUrlMobile`, `rawSourceUrl`.

### 캐치테이블 가게 데이터

`CatchtableShopData` — `shopRef`/`alias`/`shopName`/`shopNameEn`, `category` (foodKind), `landName` (단축 라벨), `serviceDesc`, `address`/`addressDetail`/`lat`/`lon`, `subways[]`, `phone`, `images[]`, `priceRange` (lunch/dinner min/max + 텍스트), `review` (averageScore + foodScore/ambienceScore/serviceScore), `schedule` (today + weekly), `disableDays[]`, `awardItems[]`, `relatedKeywords[]`, `bookmarkCount`, `mainService`/`contractState`/`exposeCatchtable`/`useOnline`/`useCatchtable`, lazy `menus`/`reviewSamples` (비가맹점/트리거 실패 시 null).

### 상한

- 다이닝코드 일괄 저장 input: vRid 1~50개 (`DiningcodeBulkSaveJobInput`).
- 다이닝코드 잡 TTL 10분.
- 다이닝코드 페이지네이션 페이지 간 200ms 간격.
- 다이닝코드 fetch timeout 8초 (`CRAWL_DININGCODE_TIMEOUT_MS`).
- 캐치테이블 검색 limit 1~30, 첫 호출 timeout 30s (`CATCHTABLE_WARM_TIMEOUT_MS`), networkidle 12s.
- 캐치테이블 상세 lazy settle 2.5s (`CATCHTABLE_SHOP_LAZY_MS`).

## Key Decisions [coverage: high — 12 sources]

- **출처별 비용 모델 다름** — Naver = Playwright 풀세션 (Apollo SSR), 캐치테이블 = Playwright 페이지 안 fetch 가로채기 (CF 봇 보호), 다이닝코드 = HTTP 직접 (CORS 열림 + CF 없음). 같은 "크롤" 추상화 위에 어댑터 인터페이스만 통일하고 비용은 어댑터에 가둠.
- **`MAX_CONCURRENT_PER_ACTOR` 3 → 5** — `auto-discover` 잡이 group-of-5 동시 실행으로 `startCrawl` 을 호출하면서 어드민 한 명이 5병렬을 정상 패턴으로 가지게 됨. 어드민 발견 페이지의 다중 선택 시작도 함께 받아 큐잉 없이 다 활성으로 들어감. (Playwright 풀세션 부담은 어댑터 풀이 책임.)
- **C안 — Naver 종료 후 자동 다이닝코드 매칭+머지** — Naver done 직전 `tryAutoMatchDiningcode` 가 (이름≥0.85 + 거리≤50m + top1-top2≥0.1) 임계 통과 시 `saveDiningcodeShop` + `canonical.merge` 까지 자동. 임계 못 넘으면 silent skip — `ProposalService` 가 후보 큐로 fallback. fire-and-forget 으로 Naver `done` 이벤트는 절대 안 막음.
- **다이닝코드는 한 endpoint 가 모든 걸 한다** — `POST /API/profile/` 가 가게 메타·메뉴·사진·리뷰 첫 페이지·블로그·평점 분포·워드클라우드 16섹션을 한 방에 돌려준다. 별도 lazy 호출 X. 페이지네이션도 같은 endpoint 에 `tab=review&page=N` 추가만으로 동작 — 응답이 16섹션 다 오지만 어댑터가 review 만 추려 가벼운 wire size.
- **다이닝코드 일괄 저장은 vRid 직렬** — 병렬 처리 안 함. (a) 다이닝코드 서버 부담 의식, (b) 같은 vRid 가 클라이언트 중복 송신돼도 service 에서 `Array.from(new Set(...))` 로 dedupe, (c) SSE 이벤트 순서 직관 유지. 페이지 fetch 자체도 페이지 간 200ms.
- **다이닝코드 일괄 저장은 per-actor 1잡** — Naver 의 max 3 + FIFO 큐와 다른 정책. 어드민 1명이 한 번에 한 작업만 진행 — UI 패턴이 "선택 → 일괄 저장 클릭 → 완료까지 기다림" 이라 동시 여러 잡이 부자연스러움. menu-grouping 잡 레지스트리와 동형 단순화.
- **DC 저장 시 canonical proposals 자동 큐** — `generateProposalsForRestaurant(restaurantId)` 후크가 등록 직후 cross-source 후보 적재. 실패해도 try/catch 로 삼킴 — 등록 흐름 안 막음. 같은 canonical 두 번 호출 idempotent. Naver 단일 크롤도 같은 후크 사용.
- **다이닝코드 review externalId 형태** — `dc:rv:<rvId>` — 네이버 review externalId (Naver `reviewId` 그대로) 와 namespace 분리. `(restaurantId, externalId)` unique constraint 가 idempotent dedupe 보장.
- **다이닝코드 summary 키 prefix** — `'dc:<vRid>'` 형태로 `queueSummariesForReviews` 호출. SummaryService 내부 run() 은 reviewId 만 보지만 큐 식별자가 placeId 와 안 섞이게.
- **다이닝코드 좌표 검색은 SOFT limit** — `lat/lng/distance` 박아도 다이닝코드가 키워드 매칭 fallback 으로 광역 결과를 끼워보냄("계택닭" + 강남역 500m → 광진구 본점). 어댑터가 `strictDistance` (기본 true) 로 응답 `distance` 문자열 ("451m"/"1.2km") 우선, 폴백으로 lat/lng haversine 으로 후필터링. 잘려나간 개수는 `filteredOutCount` 로 응답에 노출 — UI 가 "키워드 매칭이 반경 안에 없어 광역 결과를 숨겼습니다" 안내.
- **캐치테이블 검색 fallback 감지** — `totalShopCount >= 10000` 이면 키워드가 백엔드 매칭에 실패하고 추천 DB 전체로 fallback 된 신호. 실측 fallback 은 16849 고정. `response.fallback: true` 로 노출해 UI 가 경고.
- **캐치테이블 검색은 keywordSearch.keyword 필드 필수** — body 의 `keyword` 단독 필드는 백엔드가 무시하고 추천만 돌려줌. 반드시 `keywordSearch: { keyword }` 형태.
- **캐치테이블 검색은 warm page 재사용** — 첫 호출 ~14s (페이지 로드 + Cloudflare cookie + axios interceptor 자리 잡기), 이후 ~200-900ms. 모듈 스코프에 `contextPromise` 1개. 페이지 끊기면 재구축.
- **search·shop·place 어댑터 Browser 인스턴스 모두 별개** — 모바일 UA / 데스크톱 UA / 데스크톱 UA, viewport 도 다름. Fastify `onClose` 가 셋 다 `Promise.all` 로 정리.
- **DC bulk save TTL 10분** — Naver 잡(5분)보다 길게 잡음. 잡이 끝난 뒤 어드민이 페이지 새로고침이나 다른 탭에서 결과를 확인할 시간 확보. 단 60초 같은 단명 윈도우가 아니라 명시 10분 — `FINISHED_TTL_MS = 10 * 60_000`.

## Gotchas [coverage: high — 9 sources]

- **`MAX_CONCURRENT_PER_ACTOR` 가 3 아닌 5** — 이전 문서/어댑터 부담 추정이 "actor 당 max 3" 가정으로 작성됐다면 갱신 필요. 자동 발견 group-of-5 와 맞춤. Playwright 풀세션이 동시에 5개까지 떠 있을 수 있다는 뜻.
- **C안 자동 머지는 임계 못 넘으면 silent** — Naver done 후 `tryAutoMatchDiningcode` 가 좌표 없음 / DC source 이미 있음 / 이름·거리·tie-gap 임계 미달 중 하나라도 걸리면 그냥 return. 로그도 안 남김 (실패시 `console.error` 만). 후보는 ProposalService 가 후보 큐로 받아주는 게 fallback — UI 에서 "왜 자동 매칭이 안 됐지" 물으면 임계 + 좌표 보유 여부 확인.

- **다이닝코드 좌표 검색이 광역 결과 끼워보냄** — `strictDistance` 후필터링 없이는 "성수 카페" + 강남 좌표 검색이 성수동 카페를 그대로 돌려준다. 어댑터가 응답 `distance` 문자열을 우선 사용해 반경 밖 제거, 후필터링으로 잘려나간 개수는 `filteredOutCount` 로 노출 — UI 가 안내 띄울 책임.
- **다이닝코드 응답 카운트는 string/number 혼재** — `review_cnt`, `total_cnt`, `review_total_score` 가 `"325"` 같은 문자열로 자주 옴. 콤마 포함 ("0,1185") 도 봤음. 어댑터 `parseIntLoose` / `numOrNull` 헬퍼가 모두 흡수.
- **다이닝코드 URL protocol 누락** — `restaurant.images.list` 안 이미지 URL 이 protocol 없이 `blog.naver.com/...` 로 옴. zod `.url()` 이 reject 하므로 `httpUrlOrNull` 헬퍼가 `https://` 보강. 단 블로그 섹션의 `url` 은 schema 가 `z.string()` 으로 받아 그대로 통과 (정규 URL 보장 X — FE 가 protocol 없을 때 fallback).
- **다이닝코드 영업시간 `bhour` vs `bhour_seo`** — `bhour` 는 7일치 (오늘 포함), `bhour_seo` 는 "매일 08:00-22:00" 한 줄 요약. 둘 다 같은 shape (`duration`/`time`/`today`) 으로 정규화돼 응답.
- **다이닝코드 사장 답글 가짜값** — `reply_info.reply_dt` 가 없을 때 `"1970년 1월 1일"` 로 박혀 옴. 어댑터가 `reply_comment` 가 있을 때만 답글 노출 — null 처리 견고.
- **다이닝코드 `total_cnt` 10000 캡** — 실제 매칭 수는 `params.rcount`. 응답 메타에서 `total` 과 `rcount` 가 크게 다르면 캡에 걸린 것 — UI 표시는 `rcount` 우선.
- **캐치테이블 CF 봇 보호** — `/api/v6/search/list` 직접 fetch 는 403. Playwright 페이지 진입 → `page.evaluate(fetch(...))` 안에서만 정상 응답. Cloudflare cookie + axios interceptor 가 자리 잡을 ~1.2s 추가 sleep 필요.
- **캐치테이블 응답 모양이 가게마다 다름** — 비가맹점 / `contractState` 다양 → 메뉴/리뷰 lazy 응답이 안 잡힐 수 있음. 어댑터가 `menus`/`reviewSamples` 를 nullable 로 반환. 호출자(UI) 가 null 케이스 분기 책임.
- **캐치테이블 메뉴 endpoint warmcontext fallback** — `/menuAllList` 페이지 진입 후 응답 가로채기 실패 시 어댑터가 같은 context 의 새 페이지에서 `fetch` 한 번 더 시도. 그래도 없으면 `CatchtableShopError`.
- **DC bulk save 취소는 진행 중 vRid 끝까지** — `AbortController` 가 있지만 `saveDiningcodeShop` 안의 fetch 들이 signal 을 안 받음. abort 후 진행 중인 한 vRid 는 끝나고 다음 vRid 들이 시작 전 `skipped` 로 마무리. 즉시 stop 보장 안 됨.
- **DC bulk save 60초 TTL 아님 — 10분** — (Naver 잡 5분과 헷갈리기 쉬움.) 새로고침 후 잡 복구는 10분 안에 가능. SSE 끊겨도 `GET /jobs/:id` 스냅샷 + 재구독 패턴.
- **DC bulk save SSE 인증** — EventSource 가 헤더 못 실어서 `?token=<jwt>` 쿼리 수락. 본인 잡(`actorId === userId`) + `role === 'ADMIN'` 만 통과. registry `get(id, actorId)` 가 actor 미스매치면 null 반환 → 404.
- **Naver Search 어댑터 이행** — `naver-search.playwright.adapter.ts` 는 사라지고 `naver-search.http.adapter.ts` 로 nx-api GraphQL 직접 호출 (`source: 'http'`). 이전 글의 "PC `allSearch` 페이지 캡처 + ncaptcha 회피" 흐름은 더 이상 없음. `CrawlSearchResult.source` enum 에 `'playwright'` 값은 backward-compat 으로만 남음.
- **다이닝코드 GET 으로 호출 시 size=4 고정** — 페이지네이션 안 됨. 반드시 POST + form body 로 호출.
- **다이닝코드 `result_code` 체크 필수** — HTTP 200 인데 result_code "001" 등으로 에러 케이스 들어옴. 어댑터가 `'100'` 이 아니면 `DiningcodeShopError` / `DiningcodeSearchError` throw.

## Sources [coverage: high — 14 sources]

- [apps/friendly/src/modules/crawl/crawl.route.ts](../../apps/friendly/src/modules/crawl/crawl.route.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts)
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts)
- [apps/friendly/src/modules/crawl/diningcode-bulk-save-registry.ts](../../apps/friendly/src/modules/crawl/diningcode-bulk-save-registry.ts)
- [apps/friendly/src/modules/crawl/url-normalizer.ts](../../apps/friendly/src/modules/crawl/url-normalizer.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-search.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-search.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/catchtable-search.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/catchtable-search.playwright.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/catchtable-shop.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/catchtable-shop.playwright.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/diningcode-search.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/diningcode-search.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/diningcode-shop.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/diningcode-shop.http.adapter.ts)
- [apps/friendly/src/modules/crawl/crawl.test.ts](../../apps/friendly/src/modules/crawl/crawl.test.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
