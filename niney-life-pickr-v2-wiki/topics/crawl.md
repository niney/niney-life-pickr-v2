---
topic: crawl
last_compiled: 2026-05-07
sources_count: 9
status: active
aliases: [naver-place, scraping, playwright, sse-jobs]
---

# crawl — Naver Place 크롤러

`apps/friendly/src/modules/crawl/`에 위치한 어드민 전용 크롤러. 사용자가 붙여넣은 네이버 지도/Place URL을 받아 Playwright로 모바일 페이지를 띄우고, Apollo cache(`window.__APOLLO_STATE__`)와 GraphQL 응답에서 식당 메타데이터·메뉴·블로그/방문자 리뷰를 추출해 구조화된 JSON으로 돌려준다. 진행 상황은 SSE로 스트리밍되며, 작업은 메모리 상의 Job registry에서 관리된다.

## Purpose [coverage: high — 4 sources]

가게를 골라주는 서비스의 데이터 인입 통로. 어드민이 네이버 Place URL을 한 줄 붙여넣으면 식당 한 곳의 모든 사실 데이터(이름·주소·영업시간·메뉴·평점·리뷰)를 한 번에 긁어 와 후속 의사결정 모델이 쓸 수 있게 정규화한다.

호출자:
- 어드민 웹 UI(`AdminCrawlTestPage`) — 폼에 URL을 넣고 SSE로 진행률을 받음.
- 개발자용 1회성 진단 스크립트 `apps/friendly/scripts/dev-capture-visitor.ts` — Playwright를 직접 띄워 방문자 리뷰 wire 응답을 `__debug__/`에 떨어뜨림.
- 외부 도구(curl/스크립트) — 헤더에 `Authorization: Bearer <jwt>` 실어 동일 라우트 사용.

권한은 항상 `app.authenticate + app.requireAdmin`. 일반 사용자는 호출 불가.

## Architecture [coverage: high — 5 sources]

요청 흐름은 단방향이다.

1. **Route** (`crawl.route.ts`) — Fastify 라우트가 인증·검증을 거친 뒤 `CrawlService.startCrawl()`을 호출.
2. **Service** (`crawl.service.ts`) — rate-limit / in-flight dedupe / 30초 캐시 / 동시 실행 캡 검사 → `JobRegistry.create()`로 Job 생성 → `runJob()`을 fire-and-forget으로 띄우고 `jobId`만 즉시 반환.
3. **URL normalizer** (`url-normalizer.ts`) — `naver.me` 단축 URL은 `fetch(redirect: 'follow')`로 풀고, `/p/entry/place/{id}`, `/restaurant/{id}`, `?id=` 등 여러 패턴에서 `placeId` 추출 후 표준 모바일 URL `https://m.place.naver.com/restaurant/{id}/home`로 정규화.
4. **Playwright adapter** (`adapters/naver-place.playwright.adapter.ts`) — Chromium(모바일 UA·iPhone viewport)으로 표준 URL 진입 → `__APOLLO_STATE__` 스냅샷 → Apollo cache에서 place 노드/`placeDetail(...)` 컨테이너를 찾아 메타·메뉴·통계·블로그 리뷰 추출 → `partial` 이벤트 발행 → 방문자 리뷰 전용 서브페이지(`/review/visitor`)에서 "더보기" 자동 클릭하며 wire 응답 캡처 → Apollo + wire 병합 후 최종 데이터 반환.
5. **Job registry** (`job-registry.ts`) — 메모리 `Map<jobId, InternalJob>`. `addEvent()`로 이벤트를 누적·subscriber에게 fan-out 하고, denormalized 필드(`stage`/`visitorCount`/`status`/`result`)를 갱신. 종료 후 5분 TTL로 GC.

**SSE 전송**은 라우트에서 직접 `reply.hijack()` 후 `text/event-stream`을 수동으로 흘려 보낸다. 모든 이벤트가 `seq` 번호를 갖고 registry의 `events[]`에 보관되므로, EventSource가 끊겼다 재접속할 때 `Last-Event-ID` 헤더 또는 `?afterSeq=`로 빠진 구간만 replay 받는다. 종료된 Job에 재접속하면 누락된 이벤트만 흘리고 stream을 닫고, 이미 따라잡았다면 204로 자동 재연결을 끊는다.

## Talks To [coverage: high — 4 sources]

- **Playwright (Chromium)** — `apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts`에서 모듈 스코프 `browserPromise` 하나로 launch. `onClose` 훅에서 `closeBrowser()` 호출. 헤드리스 토글(`CRAWL_HEADLESS=0`), slowMo, viewport hold 시간 등 디버그 노브가 환경 변수로 노출.
- **Naver Place** — `m.place.naver.com/restaurant/{id}/home`(메인), `m.place.naver.com/restaurant/{id}/review/visitor`(방문자 리뷰 서브페이지). `pcmap.place.naver.com`, `place.map.naver.com`, `api.place.naver.com/graphql`, `m.place.naver.com/graphql`의 JSON 응답을 `page.on('response')`로 가로채 캡처.
- **api-contract 스키마** (`packages/api-contract/src/schemas/crawl.ts`) — `CrawlNaverPlaceInput`, `StartCrawlResult`, `CrawlEvent`, `CrawlJob`, `CrawlStage`, `NaverPlaceData` 등 모든 입출력이 zod 스키마. `fastify-type-provider-zod`가 검증 + OpenAPI 자동 생성.
- **어드민 웹** — `Routes.Crawl.naverPlace`로 POST → 받은 `jobId`로 `Routes.Crawl.jobEvents(id)`를 EventSource 구독. 토큰을 헤더로 못 싣는 EventSource의 한계 때문에 `?token=<jwt>` 쿼리 파라미터도 인정.
- **JobRegistry singleton** (`jobRegistry`) — `crawl.route.ts`와 `crawl.service.ts`가 동일 인스턴스를 import해 작업 상태를 공유.

## API Surface [coverage: high — 2 sources]

베이스 prefix는 `/api/v1`. `Routes.Crawl`(`packages/api-contract/src/routes.ts`)에서 한 곳에 정의.

| Method | Path | Auth | Body / Params | 200 응답 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/admin/crawl/naver-place` | `authenticate + requireAdmin` (Bearer) | `{ url: string(URL) }` (`CrawlNaverPlaceInput`) | `StartCrawlResult` — `{ ok: true, jobId, deduped }` 또는 `{ ok: false, error, message, triedUrl? }`. `error`는 `rate_limited` / `unsupported_format` / `redirect_failed` / `max_concurrent` / `fetch_failed` 등. 분류된 실패도 HTTP 200으로 내려 클라이언트 인라인 표시. |
| GET | `/api/v1/admin/crawl/jobs` | `authenticate + requireAdmin` | — | `CrawlJobListResult` — `{ jobs: CrawlJob[] }`. 호출 actor가 만든 진행 중 + 최근 종료 작업만. |
| DELETE | `/api/v1/admin/crawl/jobs/:id` | `authenticate + requireAdmin` | `params: { id }` | 204 No Content (idempotent — 이미 끝났어도 204). 내부적으로 `AbortController.abort()`. |
| GET | `/api/v1/admin/crawl/jobs/:id/events` | JWT(헤더) **또는** `?token=<jwt>` 쿼리, `role === 'ADMIN'` + 본인 Job | `?afterSeq=<n>` 또는 `Last-Event-ID` 헤더 | `text/event-stream`. `id: <seq>` / `event: <type>` / `data: <CrawlEvent JSON>` 라인. 이미 종료되고 클라가 따라잡았으면 204. 15초마다 `: hb\n\n` 코멘트 heartbeat. `done`/`error` 이벤트 후 서버가 stream 종료. |

이벤트 타입(`CrawlEvent` discriminated union):
- `progress` — `{ stage }` (스테이지 변경)
- `partial` — `{ data: NaverPlaceData }` (메인 페이지 파싱 직후, 방문자 리뷰 전)
- `visitor_progress` — `{ count }` ("더보기" 한 번마다)
- `done` — `{ result: CrawlNaverPlaceResult }` (terminal)
- `error` — `{ error, message }` (terminal)

## Data [coverage: high — 3 sources]

**Job 모델** (`InternalJob` in `job-registry.ts`, `CrawlJob` 공개 스키마):
- `id` — UUID
- `url` — 원본 입력 URL
- `placeId` — 추출된 placeId(정규화 실패 시 `null`)
- `actorId` — 소유자 userId
- `status` — `'running' | 'done' | 'failed' | 'cancelled'`
- `stage` — `'queued' | 'normalizing' | 'launching' | 'loading_main' | 'parsing_main' | 'loading_visitor' | 'paginating_visitor' | 'finalizing' | 'done'`
- `startedAt` / `finishedAt` — ISO 문자열
- `visitorCount` — 페이지네이션 진행 중 누적 카운트
- `result` — 종료 시점에만 채워지는 `CrawlNaverPlaceResult`
- (내부) `events: CrawlEvent[]` — replay 용 전체 이벤트 버퍼(상한 1000), `subscribers: Set<JobSubscriber>` 라이브 구독자, `abort: AbortController`

**상한**:
- actor당 동시 실행 3개 (`MAX_CONCURRENT_PER_ACTOR`) → 초과 시 `MaxConcurrentJobsError` → `error: 'max_concurrent'`
- actor당 호출 간격 1초 (`RATE_LIMIT_WINDOW_MS`) → `error: 'rate_limited'`
- placeId 캐시 30초 (`CACHE_TTL_MS`) — 캐시 hit 시 즉시 `progress(done)` + `done` 이벤트만 내는 1회성 Job 합성
- 종료 Job TTL 5분 (`FINISHED_TTL_MS`)
- 방문자 리뷰 페이지네이션 30 페이지 (`CRAWL_VISITOR_MAX_PAGES`, env 오버라이드 가능), 클릭 간 300 ms (`CRAWL_VISITOR_PAGE_DELAY_MS`)

**`NaverPlaceData` 추출 필드**(`packages/api-contract/src/schemas/crawl.ts`):
- 메타 — `placeId`, `name`, `category`, `address`/`roadAddress`, `phone`, `latitude`/`longitude`, `rating`, `reviewCount`, `rawSourceUrl`
- `businessHours` — `placeDetail.newBusinessHours(...)` 컨테이너의 `businessHours[]`(WorkingHoursInfo) 배열을 평일별 `요일 HH:MM-HH:MM` 또는 `요일 휴무` 라인으로 직렬화 후 `; ` join
- `imageUrls` — 다중 prefix(`images`, `cpImages`, `sasImages`, `menuImages`)에서 수집, https 강제 + `#900x676` 같은 thumbnail anchor 제거, 최대 20장
- `menus` — `Menu:{placeId}_{i}` 정규화 entry 또는 `placeDetail.menus(...)` 배열에서 `name|price` 키로 dedupe, 최대 100개. 각 menu는 `imageUrls` 6장까지.
- `reviewStats` — `VisitorReviewStatsResult:{placeId}`에서 평균 평점, 별점 분포(`ratingDistribution`), 테마 키워드(`themeKeywords`), 사진/텍스트/작성자 수.
- `blogReviews` — `placeDetail.fsasReviews(...).items[]` 또는 `FsasReview:` entry. URL 기준 dedupe, 본문은 200자 excerpt, 최대 30건.
- `visitorReviews` — Apollo(초기 ~20건) + wire(이후 "더보기" 페이지)를 병합. `id`/`reviewId`로 cross-source dedupe, 본문은 500자 컷, 최대 200건. 이미지 6장.

**디버그 캡처**: `CRAWL_DEBUG_CAPTURE=1`일 때 `apps/friendly/src/modules/crawl/__debug__/` 아래에 `place-{placeId}-{ts}.json`(메인 캡처+ApolloState)과 `visitor-{placeId}-{label}-{ts}.json` / `visitor-{placeId}-{label}-bodies-{ts}.json`(방문자 리뷰 wire 응답 + Apollo) 덤프. 진단용 별도 1회성 스크립트 `apps/friendly/scripts/dev-capture-visitor.ts`는 `__debug__/after.json` + `after-meta.json`을 떨어뜨려 visitor 리뷰 wire 포맷을 파서와 동일 로직으로 검증.

## Key Decisions [coverage: high — 4 sources]

- **HTTP 직접 호출 대신 Playwright** — 네이버 Place는 React/Apollo SPA. 서버사이드 렌더된 `__APOLLO_STATE__`에 메타·메뉴·리뷰가 정규화된 형태로 있어, DOM scraping 보다 cache 객체 직접 추출이 훨씬 안정적. "더보기" 클릭 같은 동적 페이지네이션도 자연스럽게 처리.
- **Apollo cache가 1차 source of truth** — DOM 셀렉터는 클래스명이 빈번히 바뀌지만 GraphQL 타입(`PlaceDetailBase`, `Menu`, `FsasReview`, `VisitorReview`)과 필드명은 상대적으로 안정. 캐시 키에 인자가 JSON으로 인코딩된 점(예: `placeDetail({"id":"..."})`)을 감안해 prefix-match 로직 (`findFieldByPrefix`)으로 처리.
- **SSE + Job 모델** — 크롤이 분 단위(특히 방문자 페이지네이션). 동기 응답으로 묶으면 클라이언트 타임아웃·재시도 폭풍이 됨. `startCrawl`이 `jobId`만 즉시 반환하고 진행 상황은 SSE로 스트리밍하는 모델로 분리. EventSource가 헤더를 못 실으니 `?token=<jwt>` 쿼리도 받음(헤더 인증도 fall-through). 토큰은 logger redact 대상.
- **이미지 핫링크 우회** — 네이버 이미지 CDN URL을 그대로 보존하되 `http://` → `https://` 강제(혼합 콘텐츠 방지)하고 `#900x676` 같은 클라이언트 표시용 anchor를 제거. 어드민 페이지에서 hotlink 시 referer 문제는 `<img referrerpolicy="no-referrer">`로 별도 회피(아래 Gotchas).
- **메모리 Job registry, 외부 큐 없음** — `CLAUDE.md` 규칙(단일 인스턴스 + Redis 금지)에 맞춰 `Map<id, InternalJob>` 하나. 서버 재시작 시 in-flight Job은 어차피 Playwright 브라우저와 함께 죽으므로 영속성 의미 없음. TTL GC 1분 주기, idle 시 timer.unref().
- **In-flight dedupe + 30초 캐시 + actor당 동시 3개 캡** — 더블 클릭/concurrent 트리거 보호. dedupe는 같은 actor + 같은 placeId가 `running`이면 그 jobId 그대로 반환(`deduped: true`). 캐시 hit은 `start → done` 이벤트만 합성한 1회성 Job으로 같은 코드 경로 유지.
- **부분 결과(`partial` 이벤트)** — 메인 페이지가 파싱되는 즉시 방문자 리뷰 없이 한 번 발행. UI가 카드를 먼저 그리고 visitor 리스트는 아래에서 스트리밍.
- **별도 디버그 스크립트** (`scripts/dev-capture-visitor.ts`) — `dev:api` 띄우지 않고도 wire 응답 포맷 검증·파서 회귀 확인. Apollo cache가 더보기 결과를 writeQuery 하지 않는다는 사실 발견의 근거.

## Gotchas [coverage: high — 3 sources]

- **방문자 리뷰 "더보기" 자동 페이지네이션** — Naver SPA는 더보기 결과를 `writeQuery`로 Apollo cache에 쓰지 않음. 즉 `__APOLLO_STATE__`만 봐서는 초기 ~20건이 끝. 어댑터는 (1) 페이지 스크롤 → (2) `리뷰 더보기` / `더보기` 셀렉터 후보 4종을 last-match로 클릭 → (3) `api.place.naver.com/graphql` 응답을 `waitForResponse`로 동기화 → (4) Apollo + wire를 `id`로 cross-dedupe하며 합치는 과정을 30 페이지까지 반복. 연속 2회 응답이 없으면 조기 종료.
- **이미지 hotlink referer 요건** — 네이버 이미지 CDN은 referer 검사로 외부 로드를 거절할 수 있음. URL 정규화는 https + anchor 제거까지만 하고, 실제 회피는 클라이언트 측 `<img referrerpolicy="no-referrer">`를 통해 처리.
- **Apollo cache 모양은 변한다** — 최근 `c2837ea` 커밋이 `images`/`businessHours`를 실제 Apollo cache shape(NewBusinessHour wrapper의 `businessHours[]`, images의 `__ref` 배열)으로 다시 매핑. 새 필드를 추가할 때는 정규화 entry(`Type:{id}`)와 `placeDetail(...)` 컨테이너 양쪽을 다 뒤져야 안전. `findFieldByPrefix`로 인자 들어간 키도 잡을 것.
- **SSE 토큰을 쿼리에 실음** — EventSource는 헤더를 못 실어 `?token=<jwt>` 허용. logger redact 설정으로 토큰이 로그에 남지 않게 했지만, URL 전체가 다른 채널(referer, 분석 툴)로 새지 않도록 항상 짧게 유지. 헤더 인증이 가능한 클라이언트(curl, fetch+EventSource polyfill)는 헤더를 우선.
- **`__debug__/` 캡처는 git에 넣지 말 것** — JSON이 수십 MB. `CRAWL_DEBUG_CAPTURE=1` 환경에서만 떨어지고 untracked로 둠. `dev-capture-visitor.ts`도 동일 디렉토리 사용.
- **Headed 디버그 모드의 hold** — `CRAWL_HEADLESS=0`이면 `CRAWL_HOLD_MS`(기본 5초) 동안 visitor 페이지를 닫지 않고 대기. 헤드리스 운영 환경에서는 자동으로 0이라 영향 없지만 로컬에서 개발할 때는 응답이 그만큼 늦게 옴.
- **단일 Chromium 인스턴스 공유** — `getBrowser()`가 모듈 스코프 `browserPromise`로 lazy launch. 동시 Job들이 같은 Browser에서 별도 BrowserContext를 만들어 격리. `app.close()` 시 `closeBrowser()`로 종료.

## Sources [coverage: high — 9 sources]

- [apps/friendly/src/modules/crawl/crawl.route.ts](../../apps/friendly/src/modules/crawl/crawl.route.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts)
- [apps/friendly/src/modules/crawl/crawl.test.ts](../../apps/friendly/src/modules/crawl/crawl.test.ts)
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts)
- [apps/friendly/src/modules/crawl/url-normalizer.ts](../../apps/friendly/src/modules/crawl/url-normalizer.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts)
- [apps/friendly/scripts/dev-capture-visitor.ts](../../apps/friendly/scripts/dev-capture-visitor.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
