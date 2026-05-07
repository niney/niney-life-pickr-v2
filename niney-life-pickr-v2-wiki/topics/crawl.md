---
topic: crawl
last_compiled: 2026-05-07
sources_count: 10
status: active
aliases: [naver-place, scraping, playwright, sse-jobs, job-queue]
---

# crawl — Naver Place 크롤러

`apps/friendly/src/modules/crawl/`에 위치한 어드민 전용 크롤러. 사용자가 붙여넣은 네이버 지도/Place URL을 받아 Playwright로 모바일 페이지를 띄우고, Apollo cache(`window.__APOLLO_STATE__`)와 GraphQL 응답에서 식당 메타데이터·메뉴·블로그/방문자 리뷰를 추출해 구조화된 JSON으로 돌려주면서 동시에 DB(Restaurant + VisitorReview)에 영속화한다. 진행 상황은 SSE로 스트리밍되며, 작업은 메모리 상의 Job registry에서 actor당 FIFO 큐로 관리된다.

## Purpose [coverage: high — 4 sources]

가게를 골라주는 서비스의 데이터 인입 통로. 어드민이 네이버 Place URL을 한 줄 붙여넣으면 식당 한 곳의 모든 사실 데이터(이름·주소·영업시간·메뉴·평점·리뷰)를 한 번에 긁어 와 후속 의사결정 모델이 쓸 수 있게 정규화하고 DB에 적재한다. 적재된 방문자 리뷰는 곧장 AI 요약 큐로 흘러간다.

호출자:
- 어드민 웹 UI(`AdminCrawlTestPage`) — 폼에 URL을 넣고 SSE로 진행률을 받음.
- 개발자용 1회성 진단 스크립트 `apps/friendly/scripts/dev-capture-visitor.ts` — Playwright를 직접 띄워 방문자 리뷰 wire 응답을 `__debug__/`에 떨어뜨림.
- 외부 도구(curl/스크립트) — 헤더에 `Authorization: Bearer <jwt>` 실어 동일 라우트 사용.

권한은 항상 `app.authenticate + app.requireAdmin`. 일반 사용자는 호출 불가.

## Architecture [coverage: high — 6 sources]

요청 흐름은 단방향이며, 어댑터의 콜백을 통해 DB 영속화가 가지처럼 붙는다.

1. **Route** (`crawl.route.ts`) — Fastify 라우트가 인증·검증을 거친 뒤 `CrawlService.startCrawl(url, actorId, mode)`을 호출. SSE는 별도 GET `events` 엔드포인트.
2. **Service** (`crawl.service.ts`) — rate-limit / in-flight dedupe / 30초 캐시(`mode === 'create'`만) 검사 → `JobRegistry.create()`로 Job 생성 → actor 슬롯 가용 여부에 따라 즉시 `runJob`을 fire-and-forget 또는 `pending: PendingStart[]` FIFO에 enqueue → `jobId`(+`queued?`)만 즉시 반환.
3. **Mode 사전처리** — `runJob` 진입 시 `mode`가 `recrawl`이면 `restaurants.clearReviewsAndSummaries(restaurantId)`로 기존 리뷰/요약을 cascade-delete. `update`이면 `restaurants.getExistingReviewKeys(restaurantId)`로 dedup 키 셋을 만들어 어댑터에 `existingReviewKeys`로 넘김 → 어댑터가 한 페이지가 100% 기존 리뷰면 페이지네이션을 조기 종료.
4. **URL normalizer** (`url-normalizer.ts`) — `naver.me` 단축 URL은 `fetch(redirect: 'follow')`로 풀고, `/p/entry/place/{id}`, `/restaurant/{id}`, `?id=` 등 여러 패턴에서 `placeId` 추출 후 표준 모바일 URL `https://m.place.naver.com/restaurant/{id}/home`로 정규화.
5. **Playwright adapter** (`adapters/naver-place.playwright.adapter.ts`) — Chromium(모바일 UA·iPhone viewport)으로 표준 URL 진입 → `__APOLLO_STATE__` 스냅샷 → 메타·메뉴·통계·블로그 리뷰 추출 → `onPartial(data)` 콜백 → 방문자 리뷰 서브페이지(`/review/visitor`)에서 "더보기" 자동 클릭하며 wire 응답 캡처 → 페이지 단위로 `onVisitorBatch(batch)` 콜백 → Apollo + wire 병합 후 최종 데이터 반환.
6. **Persist tail** (service 내부) — `runJob`은 `persistTail: Promise<void>` 체인 하나를 들고 있다. `onPartial`은 `restaurants.upsertRestaurantFromCrawl(partial)`을 tail에 append해 `restaurantId`를 잡고, `onVisitorBatch`는 `restaurants.persistReviewBatch(restaurantId, batch)`를 tail에 append. 어댑터는 절대 블로킹하지 않으면서 한 Job 내에서는 batch가 직렬화돼 같은 식당의 dedup snapshot이 race 하지 않는다. `persistReviewBatch`가 반환한 `{newReviews}`로 `summary.queueSummariesForReviews()` 트리거 + `visitor_batch` SSE 이벤트(`addedCount`, `persistedReviews[]`) 발행. 마지막에 Apollo 초기 ~20건도 같은 경로로 통과시키고(dedup 덕에 idempotent), tail이 완전히 비워질 때까지 await한 뒤 `done` 이벤트.
7. **Job registry** (`job-registry.ts`) — 메모리 `Map<jobId, InternalJob>`. 내부 `phase: 'queued' | 'active' | 'finished'` 라이프사이클(공개 `status`는 기존 4-값 유지). `addEvent()`로 이벤트를 누적·subscriber에게 fan-out 하고, denormalized 필드(`stage`/`visitorCount`/`status`/`result`)를 갱신. 종료 후 5분 TTL로 GC.
8. **Queue 디스패치** — `runJob().finally(() => flushQueue(actorId))`가 슬롯이 비는 즉시 `pending`에서 같은 actor의 다음 Job을 꺼내 `markActive` + `runJob` 시작. `hasSlotForActor`가 false인 동안에는 새 Job이 enqueue만 되고 `progress: stage='queued'` 이벤트로 SSE 구독자에게 대기 상태를 즉시 알린다.

**SSE 전송**은 라우트에서 직접 `reply.hijack()` 후 `text/event-stream`을 수동으로 흘려 보낸다. 모든 이벤트가 `seq` 번호를 갖고 registry의 `events[]`에 보관되므로, EventSource가 끊겼다 재접속할 때 `Last-Event-ID` 헤더 또는 `?afterSeq=`로 빠진 구간만 replay 받는다. 종료된 Job에 재접속하면 누락된 이벤트만 흘리고 stream을 닫고, 이미 따라잡았다면 204로 자동 재연결을 끊는다.

## Talks To [coverage: high — 5 sources]

- **Playwright (Chromium)** — `adapters/naver-place.playwright.adapter.ts`에서 모듈 스코프 `browserPromise` 하나로 launch. `onClose` 훅에서 `closeBrowser()` 호출. 헤드리스 토글(`CRAWL_HEADLESS=0`), slowMo, viewport hold 시간 등 디버그 노브가 환경 변수로 노출.
- **Naver Place** — `m.place.naver.com/restaurant/{id}/home`(메인), `m.place.naver.com/restaurant/{id}/review/visitor`(방문자 리뷰 서브페이지). `pcmap.place.naver.com`, `place.map.naver.com`, `api.place.naver.com/graphql`, `m.place.naver.com/graphql`의 JSON 응답을 `page.on('response')`로 가로채 캡처.
- **api-contract 스키마** (`packages/api-contract/src/schemas/crawl.ts`) — `CrawlNaverPlaceInput`(+`mode`), `StartCrawlResult`(+`queued?`), `CrawlEvent`(+`visitor_batch`), `CrawlJob`, `CrawlStage`, `NaverPlaceData`, `PersistedVisitorReview` 등이 모두 zod. `fastify-type-provider-zod`가 검증 + OpenAPI 자동 생성.
- **RestaurantService / SummaryService** — `CrawlService` 생성자가 두 서비스를 주입받아 persist tail에서 `findByPlaceId`, `clearReviewsAndSummaries`, `getExistingReviewKeys`, `upsertRestaurantFromCrawl`, `persistReviewBatch`, `queueSummariesForReviews`를 호출.
- **어드민 웹** — `Routes.Crawl.naverPlace`로 POST → 받은 `jobId`로 `Routes.Crawl.jobEvents(id)`를 EventSource 구독. `visitor_batch.persistedReviews`를 그대로 detail 캐시에 머지해 follow-up GET을 생략. 토큰을 헤더로 못 싣는 EventSource의 한계 때문에 `?token=<jwt>` 쿼리 파라미터도 인정.
- **JobRegistry singleton** (`jobRegistry`) — `crawl.route.ts`와 `crawl.service.ts`가 동일 인스턴스를 import해 작업 상태를 공유.

## API Surface [coverage: high — 2 sources]

베이스 prefix는 `/api/v1`. `Routes.Crawl`(`packages/api-contract/src/routes.ts`)에서 한 곳에 정의.

| Method | Path | Auth | Body / Params | 200 응답 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/admin/crawl/naver-place` | `authenticate + requireAdmin` (Bearer) | `{ url: string(URL), mode?: 'create'|'recrawl'|'update' }` (`CrawlNaverPlaceInput`) | `StartCrawlResult` — `{ ok: true, jobId, deduped, queued? }` 또는 `{ ok: false, error, message, triedUrl? }`. `queued: true`이면 슬롯 대기 중. `error`는 `rate_limited` / `unsupported_format` / `redirect_failed` / `fetch_failed` 등. 분류된 실패도 HTTP 200으로 내려 클라이언트 인라인 표시. |
| GET | `/api/v1/admin/crawl/jobs` | `authenticate + requireAdmin` | — | `CrawlJobListResult` — `{ jobs: CrawlJob[] }`. 호출 actor가 만든 진행 중(queued+active) + 최근 종료 작업. |
| DELETE | `/api/v1/admin/crawl/jobs/:id` | `authenticate + requireAdmin` | `params: { id }` | 204 No Content (idempotent). active면 `AbortController.abort()`(어댑터가 `CrawlCancelledError`로 종료), queued면 `pending`에서 제거 + service가 `error: 'cancelled'` 이벤트 직접 발행. |
| GET | `/api/v1/admin/crawl/jobs/:id/events` | JWT(헤더) **또는** `?token=<jwt>` 쿼리, `role === 'ADMIN'` + 본인 Job | `?afterSeq=<n>` 또는 `Last-Event-ID` 헤더 | `text/event-stream`. `id: <seq>` / `event: <type>` / `data: <CrawlEvent JSON>` 라인. 이미 종료되고 클라가 따라잡았으면 204. 15초마다 `: hb\n\n` 코멘트 heartbeat. `done`/`error` 이벤트 후 서버가 stream 종료. |

이벤트 타입(`CrawlEvent` discriminated union):
- `progress` — `{ stage }` (스테이지 변경; `'queued'` 포함)
- `partial` — `{ data: NaverPlaceData }` (메인 페이지 파싱 직후, 방문자 리뷰 전)
- `visitor_progress` — `{ count }` ("더보기" 한 번마다, wire에서 본 누적 개수)
- `visitor_batch` — `{ reviews, addedCount, persistedReviews }` (한 페이지 DB 영속화 직후. `addedCount`는 dedup 후 INSERT된 개수, `persistedReviews`는 서버 id·`fetchedAt` 포함한 실제 DB row들)
- `done` — `{ result: CrawlNaverPlaceResult }` (terminal)
- `error` — `{ error, message }` (terminal; 큐에서 취소된 Job은 `error: 'cancelled'`)

`CrawlErrorCode` enum에는 `max_concurrent`가 여전히 포함돼 있지만, 큐 도입 이후로는 service가 절대 emit 하지 않는다. `MaxConcurrentJobsError` 클래스도 backward-compat용으로 export만 유지되고 throw 되지 않는다.

## Data [coverage: high — 4 sources]

**Job 모델** (`InternalJob` in `job-registry.ts`, `CrawlJob` 공개 스키마):
- `id` — UUID
- `url` — 원본 입력 URL
- `placeId` — 추출된 placeId(정규화 실패 시 `null`)
- `actorId` — 소유자 userId
- `phase` (내부) — `'queued' | 'active' | 'finished'`. 공개 `status`는 그대로 4-값.
- `status` — `'running' | 'done' | 'failed' | 'cancelled'` (queued+active 모두 `'running'`로 노출, `stage === 'queued'`로 구별)
- `stage` — `'queued' | 'normalizing' | 'launching' | 'loading_main' | 'parsing_main' | 'loading_visitor' | 'paginating_visitor' | 'finalizing' | 'done'`
- `startedAt` / `finishedAt` — ISO 문자열
- `visitorCount` — 페이지네이션 진행 중 wire 누적 카운트(persisted 개수가 아님)
- `result` — 종료 시점에만 채워지는 `CrawlNaverPlaceResult`
- (내부) `events: CrawlEvent[]` — replay 용 전체 이벤트 버퍼(상한 1000), `subscribers: Set<JobSubscriber>` 라이브 구독자, `abort: AbortController`

**DB 부수효과** — 한 Job이 끝나기까지 다음 row들이 만들어지거나 갱신된다:
- Restaurant 1건 — `onPartial`에서 upsert, 종료 직전에 완전 스냅샷으로 한 번 더 upsert.
- VisitorReview N건 — 페이지마다 `persistReviewBatch`로 dedup 후 신규분만 INSERT. `recrawl` 모드는 사전에 기존 리뷰를 모두 삭제. `update` 모드는 어댑터가 `existingReviewKeys`로 조기 종료해 신규분만 들어옴.
- Summary 큐 — 신규 VisitorReview id가 `summary.queueSummariesForReviews(placeId, ids)`로 흘러가 별도 SSE 채널에서 처리.

**상한**:
- actor당 동시 active 3개 (`MAX_CONCURRENT_PER_ACTOR`) → 초과분은 `pending` FIFO에 무제한 대기 (예외 발생 X)
- actor당 호출 간격 1초 (`RATE_LIMIT_WINDOW_MS`) → `error: 'rate_limited'`
- placeId 캐시 30초 (`CACHE_TTL_MS`) — `mode === 'create'`만 적용. hit 시 즉시 `progress(done)` + `done` 이벤트만 내는 1회성 Job 합성.
- 종료 Job TTL 5분 (`FINISHED_TTL_MS`)
- 방문자 리뷰 페이지네이션 30 페이지 (`CRAWL_VISITOR_MAX_PAGES`, env 오버라이드 가능), 클릭 간 300 ms (`CRAWL_VISITOR_PAGE_DELAY_MS`)
- 이벤트 버퍼 Job당 1000건 (`EVENT_BUFFER_MAX`, 백스톱)

**`NaverPlaceData` 추출 필드**(`packages/api-contract/src/schemas/crawl.ts`):
- 메타 — `placeId`, `name`, `category`, `address`/`roadAddress`, `phone`, `latitude`/`longitude`, `rating`, `reviewCount`, `rawSourceUrl`
- `businessHours` — `placeDetail.newBusinessHours(...)` 컨테이너의 `businessHours[]`(WorkingHoursInfo) 배열을 평일별 `요일 HH:MM-HH:MM` 또는 `요일 휴무` 라인으로 직렬화 후 `; ` join
- `imageUrls` — 다중 prefix(`images`, `cpImages`, `sasImages`, `menuImages`)에서 수집, https 강제 + `#900x676` 같은 thumbnail anchor 제거, 최대 20장
- `menus` — `Menu:{placeId}_{i}` 정규화 entry 또는 `placeDetail.menus(...)` 배열에서 `name|price` 키로 dedupe, 최대 100개. 각 menu는 `imageUrls` 6장까지.
- `reviewStats` — `VisitorReviewStatsResult:{placeId}`에서 평균 평점, 별점 분포, 테마 키워드, 사진/텍스트/작성자 수.
- `blogReviews` — URL 기준 dedupe, 본문은 200자 excerpt, 최대 30건.
- `visitorReviews` — Apollo(초기 ~20건) + wire(이후 "더보기" 페이지)를 병합. `id`/`reviewId`로 cross-source dedupe, 본문은 500자 컷, 최대 200건. `externalId` 필드로 DB dedup 연결.

**디버그 캡처**: `CRAWL_DEBUG_CAPTURE=1`일 때 `apps/friendly/src/modules/crawl/__debug__/`에 메인/방문자 wire 덤프. 진단 스크립트 `dev-capture-visitor.ts`도 동일 디렉토리.

## Key Decisions [coverage: high — 6 sources]

- **HTTP 직접 호출 대신 Playwright** — 네이버 Place는 React/Apollo SPA. 서버사이드 렌더된 `__APOLLO_STATE__`에 메타·메뉴·리뷰가 정규화된 형태로 있어 DOM scraping보다 cache 객체 직접 추출이 안정적.
- **Apollo cache가 1차 source of truth** — DOM 셀렉터는 잘 바뀌지만 GraphQL 타입과 필드명은 안정. 캐시 키에 인자가 JSON으로 인코딩된 점을 감안해 prefix-match (`findFieldByPrefix`)으로 처리.
- **SSE + Job 모델** — 크롤이 분 단위. 동기 응답으로 묶으면 클라이언트 타임아웃·재시도 폭풍이 됨. EventSource가 헤더를 못 실으니 `?token=<jwt>` 쿼리도 받음.
- **Persist tail (Promise chain)** — 어댑터의 `onPartial`/`onVisitorBatch` 콜백은 동기적으로 끝나야 다음 페이지로 넘어가지만, DB 쓰기는 비동기. 한 Job 내부에서 `persistTail = persistTail.then(...)` 체인 하나를 두면 (a) 어댑터를 블로킹하지 않고 (b) 같은 식당에 대한 두 batch가 dedup snapshot에 race 하지 않는다. 마지막에 `await persistTail`로 모든 영속화가 끝난 뒤에야 `done` 이벤트를 emit.
- **`visitor_batch.persistedReviews`로 follow-up GET 제거** — 예전엔 클라가 batch 받을 때마다 detail을 다시 GET 했음. 이제 서버가 INSERT된 row들을 그대로 SSE에 실어 보내 클라가 detail 캐시에 직접 머지. 한 크롤당 N개의 round-trip 절약.
- **Apollo 초기 ~20건도 끝에 같은 경로로** — Apollo 분량은 `onVisitorBatch` 콜백을 거치지 않음. `runJob` 마지막에 `persistBatch(data.visitorReviews)`로 한 번 더 흘려 같은 dedup 경로를 타게 함. 이미 들어간 row는 dedup으로 걸러져 idempotent.
- **다중 Job 큐는 in-process FIFO** — `CLAUDE.md` 규칙(단일 인스턴스 + Redis 금지)에 따라 외부 큐 없이 `pending: PendingStart[]` 배열 하나. actor당 active 3 캡 초과는 throw 하지 않고 enqueue. `findInFlightByPlace`는 queued+active 모두 검사해 같은 placeId 중복 enqueue 방지. 슬롯이 비는 즉시 `runJob.finally`에서 `flushQueue(actorId)`가 같은 actor의 다음 Job을 꺼내 `markActive`+start.
- **Mode 분기는 `runJob` 진입 시 한 번만** — `recrawl`은 cascade-delete 후 깨끗한 상태에서 시작, `update`는 기존 키 셋을 어댑터에 미리 넘겨 페이지네이션 조기 종료. `create`만 30초 캐시 short-circuit 적용(나머지는 의도가 "fresh"이므로 우회).
- **In-flight dedupe + 30초 캐시** — 더블 클릭/concurrent 트리거 보호. dedupe는 같은 actor + 같은 placeId가 phase!==finished면 그 jobId 그대로 반환(`deduped: true`). 캐시 hit은 `start → done` 합성 1회성 Job.
- **부분 결과(`partial` 이벤트)** — 메인 페이지 파싱 즉시 한 번 발행. UI가 카드를 먼저 그리고 visitor 리스트는 아래에서 스트리밍.

## Gotchas [coverage: high — 4 sources]

- **방문자 리뷰 "더보기" 자동 페이지네이션** — Naver SPA는 더보기 결과를 `writeQuery`로 Apollo cache에 쓰지 않음. 어댑터는 페이지 스크롤 → 셀렉터 후보 last-match 클릭 → `api.place.naver.com/graphql` 응답 `waitForResponse` → Apollo + wire를 `id`로 cross-dedupe하며 30 페이지까지 반복. 연속 2회 응답이 없으면 조기 종료. `update` 모드면 한 페이지가 100% 기존 리뷰일 때도 조기 종료.
- **In-flight dedupe는 phase를 가로지른다** — `findInFlightByPlace`가 queued + active 모두 검사. 따라서 사용자가 첫 요청이 큐에 잠겨 있을 때 다시 클릭해도 새 Job이 안 생기고 같은 jobId를 받는다.
- **Cancel 두 경로** — active Job 취소는 `AbortController.abort()`로 어댑터가 `CrawlCancelledError`를 던지며 종료(자체적으로 `error` 이벤트 emit). queued Job 취소는 어댑터가 한 번도 안 돈 상태이므로 service가 `pending` 배열에서 제거하고 직접 `error: 'cancelled'`를 emit해 seq 일관성을 유지. `JobRegistry.cancel()`이 반환하는 `CancelOutcome`(`'aborted' | 'queued-cancelled' | 'noop'`)으로 두 경로를 분기.
- **`max_concurrent` 에러는 더 이상 발생하지 않음** — 스키마/enum에는 남아 있지만 큐가 모든 over-cap 요청을 흡수. 클라이언트는 대신 `StartCrawlResult.queued === true`를 보고 대기 UI를 표시.
- **Apollo 초기 리뷰 재영속화는 dedup으로 안전** — 마지막 `persistBatch(data.visitorReviews)`는 이미 들어간 row와 새로 들어온 row를 모두 포함하지만 `persistReviewBatch`가 `externalId`/콘텐츠 키로 dedup해 idempotent.
- **`visitorCount`는 wire 누적, `addedCount`는 DB 신규** — 두 숫자는 다르다. `update` 모드에서 wire가 200건 들어와도 신규 INSERT는 5건일 수 있음. UI가 진행률을 그릴 때 둘을 헷갈리지 말 것.
- **이미지 hotlink referer** — 클라이언트 측 `<img referrerpolicy="no-referrer">`로 회피.
- **Apollo cache 모양은 변한다** — 새 필드 추가 시 정규화 entry(`Type:{id}`)와 `placeDetail(...)` 컨테이너 양쪽을 다 뒤져야 안전. `findFieldByPrefix` 사용.
- **SSE 토큰을 쿼리에 실음** — EventSource 한계로 `?token=<jwt>` 허용. logger redact 설정으로 로그엔 안 남지만 referer 등 다른 채널 누출 주의.
- **`__debug__/` 캡처는 git에 넣지 말 것** — 수십 MB. `CRAWL_DEBUG_CAPTURE=1`에서만 떨어지며 untracked.
- **단일 Chromium 인스턴스 공유** — `getBrowser()`가 모듈 스코프 `browserPromise`로 lazy launch. 동시 Job들이 같은 Browser에서 별도 BrowserContext를 만들어 격리. `app.close()` 시 `closeBrowser()`로 종료.

## Sources [coverage: high — 10 sources]

- [apps/friendly/src/modules/crawl/crawl.route.ts](../../apps/friendly/src/modules/crawl/crawl.route.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts)
- [apps/friendly/src/modules/crawl/crawl.test.ts](../../apps/friendly/src/modules/crawl/crawl.test.ts)
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts)
- [apps/friendly/src/modules/crawl/job-registry.test.ts](../../apps/friendly/src/modules/crawl/job-registry.test.ts)
- [apps/friendly/src/modules/crawl/url-normalizer.ts](../../apps/friendly/src/modules/crawl/url-normalizer.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts)
- [apps/friendly/scripts/dev-capture-visitor.ts](../../apps/friendly/scripts/dev-capture-visitor.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
