---
topic: crawl
last_compiled: 2026-06-25
status: active
source_count: 26
aliases: [job-log, crawl-job-log, job-log-service, log-channel, log-seq-dedup, stealth, jitter, 429, playwright-extra, anti-bot, tabling, 테이블링, tabling-search, tabling-sitemap, tabling-place, tabling-bulk-save, sse-seq, review-stats, visitor-review-stats, place-partner-promotion]
---

# crawl — 다중 출처 크롤러 (Naver Place + 캐치테이블 + 다이닝코드 + 테이블링)

`apps/friendly/src/modules/crawl/`에 위치한 어드민 전용 크롤러. Naver Place / 캐치테이블 / 다이닝코드 / **테이블링** 네 출처를 다루며, 각 출처마다 어댑터 비용 분포가 다르다 (Naver = Playwright 풀세션, 캐치테이블 = Playwright 안에서 fetch 가로채기, 다이닝코드·테이블링 = HTTP 직접). 잡 패턴은 5가지 — 단일 Naver 크롤(SSE), Naver/캐치테이블/다이닝코드/테이블링 키워드 검색(동기), 다이닝코드·테이블링 가게 저장(단일 동기), 다이닝코드 일괄 저장(SSE), 테이블링 일괄 저장(SSE).

**2026-06-25 변경 흡수 — ① 테이블링(tabling) 신규 출처(무인증 REST), ② 정확한 방문자 리뷰 수 어댑터, ③ SSE seq 단일화(78% 멈춤 fix), ④ 백그라운드 크롤→자동 enrich 체인**:

- **테이블링 신규 출처** — `mobile-v2-api.tabling.co.kr` 무인증 REST(웹·앱 공유 백엔드)를 다이닝코드/네이버 nx-api 와 같은 순수 HTTP 어댑터로 흡수. 어댑터 4종: [tabling-search.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-search.http.adapter.ts) (키워드 검색 `POST /v1/search/restaurants/map`), [tabling-shop.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-shop.http.adapter.ts) (가게 상세 = `/v1/restaurant/:idx` + `/menu` + `/review` 합본 + 리뷰 커서 페이지네이션), [tabling-place.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-place.http.adapter.ts) (미입점 place 의 JSON-LD 얕은 티어), [tabling-sitemap.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-sitemap.http.adapter.ts) (검색 외 전수 발견 백본). 일괄 저장 SSE 잡은 [tabling-bulk-save-registry.ts](../../apps/friendly/src/modules/crawl/tabling-bulk-save-registry.ts) — 다이닝코드 일괄 저장 레지스트리와 동형. 테이블링 저장은 **좌표 기반 로컬 canonical 자동매칭**(외부 검색 API 없이 우리 DB 만 스코어링) + **place↔partner 자동 승격**(같은 가게의 얕은 place 행을 풍부한 partner 행으로 머지). 자세한 머지 동작은 [canonical](canonical.md).
- **정확한 방문자 리뷰 수** — 신규 [naver-review-stats.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-review-stats.http.adapter.ts) 가 `getVisitorReviewStats` GraphQL 을 페이지 없이 직접 호출(호출당 ~60ms). 검색 카드의 "방문자 리뷰" 를 별점-only 리뷰를 뺀 `displayReviewCount` 로 정확히 표시.
- **SSE seq 단일화 (78% 멈춤 fix)** — [crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) 의 `emit()` 이 `operationLog.allocSeq()` 단일 카운터를 `log` 이벤트와 공유. 리뷰가 많을 때 진행이 78%에서 멈추고 `done` 이 드롭되던 근본 원인 — crawl 이벤트와 log 이벤트가 각자 seq 카운터를 쓰면 클라이언트 `(jobId, seq)` dedup 이 한쪽(특히 done)을 영영 버렸다.
- **백그라운드 크롤 → 자동 enrich** — 크롤 → 리뷰 적재 → 요약 큐 → (요약 완료 시) review-search enrich + review-clustering 군집화 체인. enrich 훅 자체는 [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) 의 요약 종료 훅에 주입돼 있어 crawl 모듈은 트리거(요약 큐잉)만 책임진다 — 상세는 [logs](logs.md) / review-search 토픽.

**2026-05-25 변경 흡수 — Naver Playwright 어댑터 stealth + 더보기 jitter (429 우회) + visitor 캡처 dev 스크립트 3종**: [naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts) 가 기존 `playwright` 대신 `playwright-extra` + `puppeteer-extra-plugin-stealth` 로 launch — `chromium.use(StealthPlugin())` 한 줄로 `navigator.webdriver`, plugins, permissions, `chrome.runtime` 등 자동화 시그널을 일반 Chrome 처럼 위장해 네이버 anti-bot 우회. "더보기" 클릭 사이 지연도 고정 3s 에서 base 5s + random(0..3s) 랜덤 jitter (`CRAWL_VISITOR_PAGE_DELAY_MS` + `CRAWL_VISITOR_PAGE_DELAY_JITTER_MS`) 로 변경 — 실제 429 차단 사고 후 패턴 인식 회피 목적. catchtable 어댑터들은 자체 `playwright` import 그대로라 영향 받지 않음. 디버깅용 dev 스크립트 3종 신규: [dev-capture-visitor.ts](../../apps/friendly/scripts/dev-capture-visitor.ts) (헤디드 + 더보기 1회 클릭, 모든 JSON wire 응답 → `__debug__/after.json` + 파서 E2E 검증), [dev-fetch-visitor-html.ts](../../apps/friendly/scripts/dev-fetch-visitor-html.ts) (Playwright 없이 `fetch()` 한 번 + 차단 페이지 감지 + Apollo state 추출), [dev-open-visitor-page.ts](../../apps/friendly/scripts/dev-open-visitor-page.ts) (홈 진입 → 리뷰 탭 클릭 자연 흐름, `DEV_OPEN_STEALTH=0` 으로 stealth 끄고 비교).

**2026-05-19 변경 흡수 — 잡 단계별 영속 로그 시스템 도입**: 신규 [job-log.service.ts](../../apps/friendly/src/modules/crawl/job-log.service.ts) 가 모든 크롤+요약 단계의 로그를 (1) pino, (2) `prisma.crawlJobLog` DB, (3) `jobRegistry` SSE + 조건부 `summaryEventsBus` fan-out 까지 한 호출에 흘려보낸다. 모노톤 `seq` 카운터로 같은 로그가 두 SSE 양쪽에 가도 `(jobId, seq)` 로 클라이언트 dedup. `CrawlEvent` zod union 에 신규 `'log'` variant 추가 (`CrawlLogLevel: info|warn|error`, `stage`, `message`, `meta?`, `seq`, `at`). `crawl.service.ts` 가 페이지 로드/리뷰 적재/오류 등 모든 단계를 `channel: 'crawl'` 로 흘리고, `summary.service.ts` 는 LLM 단계(`summary_queue`/`summary_run`/`summary_chunk`/`summary_retry`/`summary_failed`) 를 `channel: 'summary'` 로 흘려보내 같은 잡의 크롤+요약 로그가 한 패널에서 보인다. 잡 종료 후에도 DB 의 `CrawlJobLog` 가 살아남아 패널 재진입 시 전체 로그 복원, 같은 placeId 의 재크롤 누적 로그는 상세 페이지 "크롤 로그" 아코디언이 cursor pagination 으로 가져온다. 자세한 건 [friendly 토픽](./friendly.md) 의 CrawlJobLog 시스템 / Data 섹션 참조.

## Purpose [coverage: high — 6 sources]

가게를 골라주는 서비스의 다출처 데이터 인입 통로. 어드민이 출처별 입력(네이버 Place URL, 캐치테이블 키워드/shopRef, 다이닝코드 키워드/vRid, 테이블링 키워드/idx/objectId)을 주면 가게 사실 데이터(메타·메뉴·리뷰·이미지·평점 분포)를 한 번에 긁어와 정규화하고 DB에 적재한다. 적재된 리뷰는 곧장 AI 요약 큐로 흘러가고(그 다음 요약 종료 훅이 review-search enrich + 군집화를 자동 트리거), 등록 직후 cross-source canonical 후보가 자동으로 검토 큐에 들어간다. 테이블링/다이닝코드 저장은 좌표 기반 자동 머지까지 동기적으로 수행한다.

호출자:
- 어드민 웹 UI — `AdminCrawlTestPage`(네이버 URL → SSE), `AdminDiscoverPage`(검색 → 다중 startCrawl), `AdminCatchtableShopPage` / `AdminDiningcodeShopPage`(검색·상세 검증), 정식 `AdminDiningcodePage`(다이닝코드 일괄 저장 SSE), 테이블링 검색·발견·일괄 저장 페이지.
- 개발자용 진단 스크립트 `apps/friendly/scripts/dev-capture-visitor.ts` / `dev-capture-search.ts`.
- 외부 도구(curl/스크립트) — Bearer 헤더 또는 SSE 시 `?token=<jwt>`.

권한은 항상 `app.authenticate + app.requireAdmin`.

## Architecture [coverage: high — 16 sources]

### 테이블링 어댑터 4종 (무인증 REST + JSON-LD + 사이트맵)

테이블링은 host 두 개를 쓴다 — REST(`mobile-v2-api.tabling.co.kr`)와 웹(`www.tabling.co.kr`). 어댑터 분포:

- **`tabling-search.http.adapter.ts`** — `POST /v1/search/restaurants/map` 키워드 검색. body 는 `{search, pageSize:20, sort:'RECOMMEND', categories:[], distance:700}`. **`distance:700` 이 핵심 스위치** — 좌표 없이 이 키를 실으면 ES 가 "내주변 추천" 모드를 끄고 키워드 관련성 정렬로 전환(없으면 키워드를 거의 무시하고 기본 좌표 부근만 돌려줌). 700 은 공식 웹 클라이언트 고정 기본값(반경 의미보다 모드 플래그에 가까움). 페이지네이션은 응답 `last`(Elasticsearch `search_after` 토큰, 길이 3 배열)를 JSON 직렬화해 다음 호출 `last` 로 넘기는 커서 방식 — 경계에서 1건 겹칠 수 있어 호출자가 idx dedup. 정렬은 `RECOMMEND`/`DISTANCE`/`RATING` 만 유효(그 외 `ONLY_SORT` 400). 응답 카드에 좌표·평점·추천메뉴가 실려 상세 호출 전에도 등록 후보 추리기 가능.
- **`tabling-shop.http.adapter.ts`** — `GET /v1/restaurant/:idx`(상세, 필수) + `/v1/restaurant/:idx/menu`(메뉴, best-effort) + `/v1/review/restaurant/:idx`(리뷰 첫 페이지, best-effort)를 `Promise.all` 합본. 리뷰 페이지네이션(`fetchTablingShopReviews`)은 **`lastIdx` 커서** 기반 — 직전 페이지 마지막 리뷰의 idx(24-hex ObjectId)를 `lastIdx` 로 넘긴다(리뷰의 `cursorId` 필드는 페이지네이션 토큰이 아님 — 주의). 좌표는 string("37.54…")으로 와서 `numOrNull` 이 number 변환.
- **`tabling-place.http.adapter.ts`** — 미입점 place(`/place/:objectId`)는 모바일 API 가 없고(전부 404) 서버 렌더 HTML 의 JSON-LD(`FoodEstablishment`)만 있다. name/좌표(geo)/주소/평점/cuisine 으로 머지키(이름+좌표)는 충족하나 메뉴·리뷰 없음. JSON-LD 는 `<script>` 태그가 아니라 Next.js App Router 의 **RSC flight(`self.__next_f.push`) 안에 이중 인코딩**된 문자열이라, flight 디코드 후 `FoodEstablishment` 를 감싼 stringified prop 을 한 번 더 파싱해야 객체를 얻는다(`<script type="application/ld+json">` 태그 fallback 도 보유).
- **`tabling-sitemap.http.adapter.ts`** — 키워드 검색 API 와 별개의 전수 발견 백본. `GET /sitemap-shop.xml`(partner `/restaurant/:idx`, ~4k) + `GET /sitemap-place-{1..5}.xml`(미입점 `/place/:objectId`, 각 ~45k). 둘 다 무인증 정적 XML, robots.txt 전체 Allow. 호출자가 결과를 직렬+간격으로 save 에 흘려보내는 저부하 원칙.

모든 어댑터가 `CRAWL_TABLING_TIMEOUT_MS`(기본 8000) 공용 timeout 과 데스크톱 UA. 외부 signal 없으면 자체 `AbortController` timeout.

### Naver 어댑터 stealth 적용 (2026-05-25)

`naver-place.playwright.adapter.ts` 가 `playwright` 의 `chromium` 대신 `playwright-extra` 의 `chromium` 을 import 하고 모듈 로드 시 `chromium.use(StealthPlugin())` 을 한 번 호출 — `puppeteer-extra-plugin-stealth` 가 puppeteer/playwright 양쪽 호환 패턴이라 `playwright-extra` 의 `chromium.use()` 가 그대로 받아 적용. `navigator.webdriver` 제거, `navigator.plugins`/`languages` 위장, `chrome.runtime` 주입, permissions API patch 등 자동화 탐지 시그널을 통째로 가린다. 어댑터 파일 최상단에 `/// <reference lib="dom" />` 추가 — `playwright-extra` 래퍼는 `playwright` 단독 import 와 달리 DOM 타입을 ambient 로 끌어오지 않아서 `page.evaluate(() => window.scrollTo(...))` 같은 in-browser 콜백 컴파일에 필요. `Browser`/`BrowserContext` 타입은 여전히 `playwright` 에서 type-only import (`playwright-extra` 의 `chromium.launch()` 반환을 `as Promise<Browser>` 캐스팅). catchtable 어댑터 2종은 자체 `playwright` 직접 import 라 stealth 영향 없음 — 다른 anti-bot 모델 (CF) 대상이라 stealth 가 도움 안 됨.

### 더보기 jitter (랜덤 지연)

`computeVisitorPageDelay()` 가 매 클릭마다 `VISITOR_PAGE_DELAY_MS` (기본 5000) + `Math.floor(Math.random() * VISITOR_PAGE_DELAY_JITTER_MS)` (기본 3000) 를 계산. 결과적으로 5~8초 사이 랜덤 — 고정 3s 대비 패턴 인식 회피. 이전 글의 "3s 정적 지연" 흐름은 더 이상 없음. env 로 둘 다 조정 가능 (`CRAWL_VISITOR_PAGE_DELAY_MS` / `CRAWL_VISITOR_PAGE_DELAY_JITTER_MS`). jitter=0 이면 비활성 (고정 cadence).

### 정확한 방문자 리뷰 수 어댑터 (naver-review-stats)

`naver-review-stats.http.adapter.ts` 는 `POST https://api.place.naver.com/graphql` 의 `getVisitorReviewStats` 를 페이지 없이 직접 호출하는 가벼운 어댑터(호출당 ~60ms, 다건 병렬). 검색 카드의 "방문자 리뷰" 수를 정확히 표시하는 용도:
- `x-wtm-graphql` 헤더 필수 — `buildWtmHeader(placeId)` 가 `base64(JSON{arg:placeId, type:'restaurant', source:'place'})` 후 패딩(`=`) 제거. 네이버가 봇 차단용으로 검사.
- 검색 API(`restaurantList`)의 `visitorReviewCount` = `visitorReviewsTotal` 로 별점-only 리뷰까지 포함한 전체. 네이버 페이지가 크게 보여주는 "방문자 리뷰" 는 별점만 남긴 리뷰(`ratingReviewsTotal`)를 뺀 값 → `displayReviewCount = max(0, visitor − rating)`.
- 실패(네트워크/차단/형식)는 throw 하지 않고 `null` 반환 — best-effort 보강. `fetchVisitorReviewStatsMany` 가 다수 placeId 를 병렬로(실패 항목은 맵에서 빠짐). `parseVisitorReviewStats` 는 순수 함수로 분리(테스트용).

### Dev 디버깅 스크립트 (visitor 캡처 3종)

`apps/friendly/scripts/` 하위 세 진단 스크립트. 어댑터 본체와 같은 stealth + 모바일 UA 설정으로 재현성 보장:
- `dev-capture-visitor.ts` — 헤디드 Playwright + stealth + 더보기 1회 클릭, 모든 JSON wire 응답을 `__debug__/after.json` (visitor reviews 응답만 필터) + `__debug__/after-meta.json` (url/method/status 메타) 로 덤프. 내부에 어댑터의 `parseVisitorReviewsFromCaptured` 와 동일한 파서 미러 — `dev:api` 없이 어댑터 파이프라인 E2E 검증.
- `dev-fetch-visitor-html.ts` — Playwright 없이 `fetch()` 한 번으로 m.place 페이지 HTML 받고 `__debug__/visitor-<placeId>-raw-<stamp>.html` / `-apollo-<stamp>.json` / `-summary-<stamp>.json` 셋트 생성. `detectBlockPage()` 가 "과도한 요청"/"비정상적인 접근"/"CAPTCHA" 키워드 매칭으로 차단 페이지 식별. cheerio 셀렉터 설계 입력 자료용.
- `dev-open-visitor-page.ts` — 자연스러운 navigation 시뮬레이션 (홈 → dwell 2.5s → "리뷰" 탭 클릭 → 비주얼 확인 대기). `DEV_OPEN_STEALTH=0` 환경변수로 stealth 끄고 비교 가능 — anti-bot 우회 효과 사람이 직접 확인용.

세 스크립트 모두 동일 `__debug__/` 디렉터리(`apps/friendly/src/modules/crawl/__debug__/`)에 출력 — 어댑터 본체의 `CRAWL_DEBUG_CAPTURE=1` 덤프와 같은 위치.

### 어댑터 비용 분포

| 출처 | 어댑터 | 비용 모델 | 비고 |
|---|---|---|---|
| Naver Place | `naver-place.playwright.adapter.ts` | `playwright-extra` Chromium + stealth (모바일 UA, iPhone viewport) + Apollo cache + GraphQL wire 가로채기 + 더보기 jitter | SSR Apollo SPA → Playwright 필수, 429 우회 위해 stealth + jitter |
| Naver Search | `naver-search.http.adapter.ts` | HTTP nx-api GraphQL 직접 호출 | (이전 Playwright 어댑터에서 HTTP 로 이행 — `source: 'http'`) |
| Naver Review Stats | `naver-review-stats.http.adapter.ts` | HTTP `api.place.naver.com/graphql` 직접(페이지 없음) | 검색 카드 "방문자 리뷰" 수 보강, best-effort null |
| 캐치테이블 Search | `catchtable-search.playwright.adapter.ts` | Playwright 페이지 1개를 warm 유지 + `page.evaluate(fetch(...))` | CF 봇 보호 — 직접 fetch 차단, 페이지 안에서 호출 |
| 캐치테이블 Shop | `catchtable-shop.playwright.adapter.ts` | `/ct/shop/{ref}` 진입 후 `page.on('response')` 로 자동 호출 가로채기 + 메뉴/리뷰 영역까지 스크롤 | 별도 Browser/Context 인스턴스 |
| 다이닝코드 Search | `diningcode-search.http.adapter.ts` | HTTP `POST /API/isearch/` 직접 호출 | CORS 열림 + CF 없음 |
| 다이닝코드 Shop | `diningcode-shop.http.adapter.ts` | HTTP `POST /API/profile/` 직접 호출 — 한 방에 16섹션 모두 옴 | 페이지네이션도 같은 endpoint 에 `tab=review&page=N` |
| 테이블링 Search | `tabling-search.http.adapter.ts` | HTTP `POST /v1/search/restaurants/map` 직접 | 무인증 ES 백엔드, `distance:700` 관련성 스위치, `last` 커서 |
| 테이블링 Shop | `tabling-shop.http.adapter.ts` | HTTP `/v1/restaurant/:idx` + `/menu` + `/review` 합본 | 무인증, 좌표 string, 리뷰 `lastIdx` 커서 |
| 테이블링 Place | `tabling-place.http.adapter.ts` | HTTP `www/place/:objectId` HTML → RSC flight 안 JSON-LD | 미입점 얕은 티어(메뉴·리뷰 없음) |
| 테이블링 Sitemap | `tabling-sitemap.http.adapter.ts` | HTTP 정적 XML(`/sitemap-shop.xml`, `/sitemap-place-{1..5}.xml`) | 검색 외 전수 발견 백본 |

### 5가지 잡 패턴

1. **단일 Naver 크롤 (SSE)** — `POST /naver-place` → 백그라운드 `runJob` → `persistTail` 체인으로 `onPartial`/`onVisitorBatch` 직렬 영속화 → SSE `progress`/`partial`/`visitor_progress`/`visitor_batch`/`done` 이벤트. JobRegistry 가 actor 단위 max 5 + FIFO 큐 관리 (자동 발견 잡의 group-of-5 동시 시작과 맞춤). `done` 직전 `tryAutoMatchDiningcode` fire-and-forget.
2. **Naver/캐치테이블/다이닝코드/테이블링 검색 (동기)** — `searchPlaces` / `searchCatchtable` / `searchDiningcode` / `searchTabling` 가 어댑터 호출 후 한 번에 반환. 잡 모델 없음.
3. **단일 다이닝코드/테이블링 가게 저장 (동기)** — `POST /diningcode/shop/:vRid/save` 또는 `/tabling/shop/:idx/save` → fetch → 리뷰 전 페이지 직렬 fetch(페이지 간 200ms) → upsert → `generateProposalsForRestaurant` → review 매핑 → `persistReviewBatch` → `queueSummariesForReviews`. 테이블링은 추가로 좌표 기반 로컬 자동매칭 + place↔partner 승격을 **동기**로 수행해 결과를 응답에 싣는다. 응답은 fetch 가 다 끝나야 200 — 평균 가게당 수 초.
4. **다이닝코드 일괄 저장 (SSE)** — `POST /diningcode/bulk-save/jobs` (body.vRids[]) → `diningcodeBulkSaveRegistry.create()` → 백그라운드 `runDiningcodeBulkSave` → vRid 직렬 loop. SSE `snapshot`/`item`/`done` named-event.
5. **테이블링 일괄 저장 (SSE)** — `POST /tabling/bulk-save/jobs` (body.idxs[1..50]) → `tablingBulkSaveRegistry.create()` → 백그라운드 `runTablingBulkSave(id, idxs)` → idx 직렬 loop: `markItemStart` → `saveTablingShop(idx)` → 성공/실패/abort 분기 `finishItem`. 다이닝코드 일괄 저장과 동형 — item 에 `autoMatched`/`matchedCanonicalId` 추가 노출.

### Persist tail & canonical 후크

- 단일 Naver 잡과 다이닝코드/테이블링 저장 모두에 동일한 후크가 붙는다. `crawl.service.ts`의 `generateProposalsForRestaurant(restaurantId)` 가 `restaurants.getCanonicalIdForRestaurant` → `proposals.generateForCanonical(canonical)` 호출. 실패해도 `try/catch` 로 삼켜 등록 흐름은 안 막는다 — 큐는 보조 채널.
- 다이닝코드 리뷰 영속화는 `RestaurantService.mapDiningcodeReviewToRaw` 가 `dc:rv:<rvId>` 형태 externalId 로 매핑, 테이블링은 `mapTablingReviewToRaw` 가 `tb:rv:<idx>`(idx=24-hex ObjectId) externalId 로 매핑 → `persistReviewBatch` 의 (restaurantId, externalId) unique constraint 가 idempotent dedupe.

### Naver 종료 후 다이닝코드 자동 매칭+머지 (C안)

Naver 단일 크롤이 `done` 직전, `generateProposalsForRestaurant` 와 별개로 `tryAutoMatchDiningcode(canonicalId)` 가 fire-and-forget 으로 호출된다. 흐름:

1. canonical 검증 — `this.canonical` 주입 + canonical 에 `'diningcode'` source 가 아직 없음 + 좌표 보유 (셋 다 만족 못 하면 skip).
2. `searchDiningcodePlaces(name, { lat, lng, distance: 200, size: 5, order: 'r_score' })` — 좌표 기준 200m 반경 검색. `strictDistance=true` 가 기본이라 광역 fallback 자동 제거.
3. 이미 등록된 vRid 제외 — `findRegisteredDiningcodeByVRids` 로 다른 canonical 에 묶여 있는 후보 컷.
4. `scoreMatch` 로 (name, distance) 점수화 후 정렬. 임계: `nameScore ≥ 0.85` (`AUTO_DC_NAME_THRESHOLD`) + `distanceM ≤ 50` (`AUTO_DC_DISTANCE_THRESHOLD_M`) + `top1.score - top2.score ≥ 0.1` (`AUTO_DC_TIE_GAP`).
5. 통과 시 `saveDiningcodeShop(vRid)` → 새 DC canonical 생성됨 → `canonical.merge(dcCanonicalId, naverCanonicalId)` 호출.

임계 못 넘으면 silent skip — `ProposalService` 가 별도 채널로 후보 큐 적재. 임계 상수는 `crawl.service.ts` 모듈 상단 — 정책 변경 시 여기만 손대면 됨.

### 테이블링 저장 후 자동매칭 + place↔partner 승격

테이블링 저장(`saveTablingShop`/`saveTablingPlace`)은 외부 검색 없이 **우리 DB 의 좌표 박스 안 후보만** 스코어링하는 두 단계 머지를 **동기**로 수행한다(같은 임계 상수 `AUTO_DC_*` 재사용):

- **`tryAutoMatchTabling(canonicalId)`** — 테이블링 canonical 을 기존 네이버/DC canonical 에 자동 머지. `findCanonicalAutoMatchCandidates` 로 좌표 박스 후보를 받아 이미 `'tabling'` source 가 있는 canonical 은 제외, `scoreMatch` 점수화. 임계 통과 시 `canonical.merge(tablingCanonicalId, keepId)` 후 keep canonicalId 반환. 미달이면 `null`(제안 큐가 보조 채널).
- **`tryLinkTablingPlacePartner(canonicalId, selfIsPartner)`** — place(미입점 JSON-LD)와 partner(입점, 풍부) 행은 **둘 다 source='tabling'** 이라 `tryAutoMatchTabling`(다른 source 만 후보) 과 제안 큐(새 source 만)가 양쪽 다 건너뛰는 사각지대. 이 후크가 좌표+이름으로 둘을 잇고 **partner(풍부) 쪽으로 머지("승격")**. self=partner 면 근처 place-only canonical 을, self=place 면 근처 partner 보유 canonical 을 찾아 어느 방향이든 keep=partner 로 `merge(drop, keep)`. sourceId prefix `place:` 로 place-only/partner 판별. (`findTablingCanonicalsNear` 가 source 가 아닌 sourceId 기준으로 후보 조회.)

머지 동작 전반은 [canonical](canonical.md) 참조.

### SSE seq 단일화 (78% 멈춤 fix)

`crawl.service.ts` 의 `emit()` 이 이벤트 `seq` 를 `this.operationLog.allocSeq()` 단일 카운터에서 받는다(operationLog 미주입 테스트만 자체 `nextSeq++` 폴백). `log` 이벤트(`OperationLogService.log`)와 crawl 이벤트(`progress`/`visitor_progress`/`done`)가 같은 `'crawl'` SSE 스트림에 섞여 흐르는데, 둘이 각자 카운터를 쓰면 한쪽 seq 가 앞서는 순간 다른 쪽(특히 done) 이벤트가 클라이언트 `(jobId, seq)` dedup 에서 영영 드롭된다 — 리뷰가 많을 때 진행이 78% 에서 멈추고 완료가 안 잡히던 근본 원인. `allocSeq()` 는 `OperationLogService` 가 `JobRegistry` 의 단일 seq 발급기를 위임한다.

### 다이닝코드 / 테이블링 일괄 저장 잡 모델

`diningcode-bulk-save-registry.ts` / `tabling-bulk-save-registry.ts` 의 in-memory `Map<jobId, InternalJob>`. 동형 구조:
- `state: 'pending' | 'running' | 'done' | 'failed'`
- `items[]` — 각 vRid(string)/idx(number) 의 `state` (`pending`/`running`/`done`/`failed`/`skipped`) + 결과 필드. 테이블링 item 은 `restaurantId`/`fetchedPages`/`newReviewCount` 에 더해 **`autoMatched`/`matchedCanonicalId`** 까지 노출.
- 단일 `AbortController` — 취소 시 진행 중인 한 항목의 fetch 는 끝까지 기다리고(어댑터 abort 미지원) 이후 항목들은 시작 전 `skipped` 로 마무리.
- subscribers `Set` fan-out, 종료 후 10분 TTL GC(`FINISHED_TTL_MS = 10 * 60_000`), event buffer 상한 1000. EventSource 재접속 시 라우트가 스냅샷 GET 먼저 받고 SSE 연결.
- `markFinished` 가 모든 item 이 terminal 일 때만 동작 — 하나라도 `done`/`skipped` 면 잡 state `done`, 모두 `failed` 면 `failed`.

### Per-actor 1잡 인스턴스 (다이닝코드·테이블링 일괄)

라우트가 단순화: actor 당 한 번에 1개 잡만 (`POST` 시 기존 잡이 있어도 새로 만들지만, UI 가 동시 호출 안 함 + 외부 서버 부담 의식). Naver 크롤의 max 5 + FIFO 와는 다른 정책.

## Talks To [coverage: high — 13 sources]

- **Playwright (Naver Place)** — `naver-place.playwright.adapter.ts` 모듈 스코프 `browserPromise` (모바일 UA, iPhone viewport). 메인+방문자 서브페이지 + GraphQL wire 가로채기.
- **Playwright (캐치테이블 검색)** — `catchtable-search.playwright.adapter.ts` 별도 Browser + warm `BrowserContext`/`Page` 1개를 모듈 캐싱 — `https://app.catchtable.co.kr/ct/map/search-map?...` 진입 후 `page.evaluate` 로 `POST /api/v6/search/list` 호출. 첫 호출 ~14s, 이후 ~200-900ms. `body.keywordSearch.keyword` 가 실제 검색어 — `keyword` 단독 필드는 무시됨. `totalShopCount >= 10000` 이면 키워드 매칭 실패 → 추천 fallback → `fallback: true`.
- **Playwright (캐치테이블 상세)** — `catchtable-shop.playwright.adapter.ts` 또 다른 별도 Browser/Context. `/ct/shop/{ref}` 진입 후 `/api/v4/shops/{ref}`, `/api/display/v2/shops/{ref}`, `/disables`, `/bookmark/count`, `/related-keywords/by-shop` 응답 가로채기. 메뉴는 `/menuAllList` 페이지 진입 후 `/api/display/v2/shops/{ref}/tabs/menu` 가로채기. AI 리뷰 종합은 `/api/review/v2/shops/{ref}/review-overview` 를 warm context 안 `page.evaluate(fetch)` 로 직접 호출.
- **다이닝코드** — HTTP 직접. `POST /API/isearch/` (검색, `application/x-www-form-urlencoded`), `POST /API/profile/` (가게 상세 + 리뷰 페이지네이션, 같은 endpoint). 응답 `result_code === '100'` 이 정상. `poi_section.total_cnt` 는 10000 캡 — 실제 매칭은 `params.rcount`.
- **테이블링** — HTTP 직접, 무인증. REST host `mobile-v2-api.tabling.co.kr`: `POST /v1/search/restaurants/map`(검색), `GET /v1/restaurant/:idx`/`/menu`/`/review`(상세·메뉴·리뷰). 웹 host `www.tabling.co.kr`: `GET /place/:objectId`(미입점 HTML JSON-LD), `GET /sitemap-shop.xml`·`/sitemap-place-{1..5}.xml`(발견). 모두 토큰/쿠키 불필요, CORS 열림. `Referer`/`Origin: https://www.tabling.co.kr` + (검색) `app-platform:WEB`/`app-version:4.11.0` 헤더 동봉(정합성용).
- **Naver Review Stats** — `naver-review-stats.http.adapter.ts` 가 `POST https://api.place.naver.com/graphql` `getVisitorReviewStats` 직접 호출. `x-wtm-graphql` 헤더 필수. 검색 카드 보강 — best-effort null.
- **api-contract 스키마** — `packages/api-contract/src/schemas/crawl.ts` 에 zod 정의. 기존 Naver/캐치테이블/다이닝코드 외 **테이블링 추가**: `TablingShopData`/`TablingShopReview`/`TablingShopReviewsSection`/`TablingShopReviewsResponse`, `TablingPlaceData`, `TablingMenu(Category)`/`TablingBusinessDay`/`TablingRatingItem`/`TablingServiceFlags`, `SaveTablingShopResult`/`SaveTablingPlaceResult`, `TablingSearchQuery`/`TablingSearchResult`/`TablingSearchResponse`/`TablingSearchSort`, `TablingDiscoverQuery`/`TablingDiscoverResult`, `TablingRegisteredQuery`/`TablingRegisteredResult`, `TablingBulkSaveJobInput`/`TablingBulkSaveJobSnapshot`/`TablingBulkSaveJobItem`(+item/done 이벤트). `routes.ts` 의 `Crawl` namespace 에 `tablingSearch`/`tablingShop`/`tablingShopReviews`/`tablingShopSave`/`tablingPlaceSave`/`tablingRegistered`/`tablingDiscover`/`tablingBulkSaveJobs`/`tablingBulkSaveJob`/`tablingBulkSaveJobEvents` 추가.
- **RestaurantService** — `upsertRestaurantFromCrawl` (네이버), `upsertRestaurantFromDiningcode`, `upsertRestaurantFromTabling`/`upsertRestaurantFromTablingPlace`, `findByPlaceId`, `getExistingReviewKeys`, `clearReviewsAndSummaries`, `persistReviewBatch`, `findRegisteredDiningcodeByVRids`/`findRegisteredTablingByIdxs`, `getCanonicalIdForRestaurant`, `getCanonicalCoreForAutoMatch`, `findCanonicalAutoMatchCandidates`, `findTablingCanonicalsNear`, `getDiningcodeReviewSummaryMap`/`getTablingReviewSummaryMap`, 정적 `mapDiningcodeReviewToRaw`/`mapTablingReviewToRaw`.
- **SummaryService** — `queueSummariesForReviews(key, ids, jobId?, _, parentRunId?)`. Naver 는 `placeId`, 다이닝코드는 `'dc:<vRid>'`, 테이블링은 `'tb:<idx>'` 키 — 같은 SummaryService 풀 안에서 키 namespace 분리. 요약 종료 시 review-search enrich + 군집화를 자동 트리거(아래 enrich 후크).
- **review-search enrich + review-clustering (간접)** — 백그라운드 크롤이 리뷰를 적재·요약 큐잉하면, 요약 종료 훅([plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts))이 `reviewSearch` enrich → `reviewClustering` 군집화를 자동 호출한다. crawl 모듈은 트리거(요약 큐잉)만 하고, 실제 enrich 와이어링은 summaries 플러그인 — 상세는 [logs](logs.md) / review-search·review-clustering 토픽.
- **ProposalService (CanonicalService)** — `proposals.generateForCanonical(canonicalId)` — 등록 직후 cross-source 후보 적재 후크. null 주입 가능 (테스트용). `canonical.merge(drop, keep)` 가 자동매칭/승격의 머지 실행자.
- **OperationLogService** — `startRun`/`log`/`finishRun` + **`allocSeq()`** 단일 seq 발급기(SSE seq 단일화의 핵심). crawl run·step 로그 + 잡 단위 영속 로그(operation_logs, 레거시 crawl_job_logs 백필).
- **JobRegistry / DiningcodeBulkSaveRegistry / TablingBulkSaveRegistry singleton** — 셋 다 모듈 스코프 인스턴스를 라우트와 서비스가 공유.
- **auto-discover 컨슈머** — [auto-discover](auto-discover.md) 잡이 그룹 5병렬로 `CrawlService.startCrawl` 을 호출하고 같은 jobRegistry 의 SSE 스트림(`progress`/`done`)을 await. `MAX_CONCURRENT_PER_ACTOR = 5` 가 이 그룹 크기와 맞춰져 있어 큐잉 없이 그룹이 동시에 active 로 진입.

## API Surface [coverage: high — 2 sources]

베이스 prefix `/api/v1`. 모든 라우트 `authenticate + requireAdmin` (SSE 는 `?token=<jwt>` 도 수락).

### Naver Place (기존)

| Method | Path | Body / Params | 응답 |
|---|---|---|---|
| POST | `/admin/crawl/naver-place` | `CrawlNaverPlaceInput` (`{url, mode}`) | `StartCrawlResult` (`{ok, jobId, deduped, queued?}`) |
| GET | `/admin/crawl/search` | `?q&bbox?` | `CrawlSearchResult` (`{items, source: 'http' | 'playwright'}`, 현재 `'http'`) |
| GET | `/admin/crawl/jobs` | — | `CrawlJobListResult` |
| GET | `/admin/crawl/jobs/:id/logs` | `CrawlJobLogsQuery` (`?limit&level?&stage?&cursor?`) | `CrawlJobLogsResult` (operation_logs 에서 — feature in crawl/summary) |
| DELETE | `/admin/crawl/jobs/:id` | — | 204 |
| GET | `/admin/crawl/jobs/:id/events` | `?afterSeq?` 또는 `Last-Event-ID` | `text/event-stream` (`progress`/`partial`/`visitor_progress`/`visitor_batch`/`log`/`done`/`error`) — 단일 seq |

### 캐치테이블

| Method | Path | Body / Params | 응답 |
|---|---|---|---|
| GET | `/admin/crawl/catchtable/search` | `CatchtableSearchQuery` | `CatchtableSearchResponse` |
| GET | `/admin/crawl/catchtable/shop/:shopRef` | — | `CatchtableShopData` |
| GET | `/admin/crawl/catchtable/shop/:shopRef/menus` | — | `CatchtableShopMenusResponse` |
| GET | `/admin/crawl/catchtable/shop/:shopRef/review-overview` | — | `CatchtableShopReviewOverviewResponse` |

### 다이닝코드

| Method | Path | Body / Params | 응답 |
|---|---|---|---|
| GET | `/admin/crawl/diningcode/search` | `DiningcodeSearchQuery` | `DiningcodeSearchResponse` (`source: 'http'`) |
| GET | `/admin/crawl/diningcode/shop/:vRid` | — | `DiningcodeShopData` (16섹션 정규화) |
| GET | `/admin/crawl/diningcode/shop/:vRid/reviews` | `?page=N` | `DiningcodeShopReviewsResponse` |
| POST | `/admin/crawl/diningcode/shop/:vRid/save` | — | `SaveDiningcodeShopResult` — 페이지 fetch 끝나야 200 |
| GET | `/admin/crawl/diningcode/registered` | `?ids=v1,v2,...` | `DiningcodeRegisteredResult` |
| POST | `/admin/crawl/diningcode/bulk-save/jobs` | `DiningcodeBulkSaveJobInput` (`{vRids: string[1..50]}`) | `DiningcodeBulkSaveJobSnapshot` |
| GET | `/admin/crawl/diningcode/bulk-save/jobs/:id` | — | `DiningcodeBulkSaveJobSnapshot` |
| DELETE | `/admin/crawl/diningcode/bulk-save/jobs/:id` | — | 204 (abort 신호) |
| GET | `/admin/crawl/diningcode/bulk-save/jobs/:id/events` | `?token=<jwt>` | `text/event-stream` — `snapshot`/`item`/`done`, `: hb` 15s |

### 테이블링

| Method | Path | Body / Params | 응답 |
|---|---|---|---|
| GET | `/admin/crawl/tabling/search` | `TablingSearchQuery` (`q`, `cursor?`, `pageSize?1..100`, `sort?`) | `TablingSearchResponse` (`items`, `total`, `nextCursor`, `source:'http'`, `elapsedMs`) |
| GET | `/admin/crawl/tabling/shop/:idx` | `idx` coerce int>0 | `TablingShopData` (상세+메뉴+리뷰 첫 페이지 합본) |
| GET | `/admin/crawl/tabling/shop/:idx/reviews` | `?cursor=<nextCursor>` | `TablingShopReviewsResponse` (커서 페이지네이션) |
| POST | `/admin/crawl/tabling/shop/:idx/save` | `idx` | `SaveTablingShopResult` (`autoMatched`/`matchedCanonicalId` 포함) — 동기 |
| POST | `/admin/crawl/tabling/place/:objectId/save` | `objectId` (24-hex) | `SaveTablingPlaceResult` (`autoMatched`/`matchedCanonicalId`) |
| GET | `/admin/crawl/tabling/registered` | `?ids=12,34,...` (콤마 분리 숫자 idx) | `TablingRegisteredResult` (`{idx, restaurantId, canonicalId}[]`, 미등록은 결과에 없음) |
| GET | `/admin/crawl/tabling/discover` | `TablingDiscoverQuery` (`tier: shop|place`, `page?1..5`) | `TablingDiscoverResult` (`{tier, ids, total, source:'sitemap', elapsedMs}`) |
| POST | `/admin/crawl/tabling/bulk-save/jobs` | `TablingBulkSaveJobInput` (`{idxs: number[1..50]}`) | `TablingBulkSaveJobSnapshot` (즉시 반환, 백그라운드) |
| GET | `/admin/crawl/tabling/bulk-save/jobs/:id` | — | `TablingBulkSaveJobSnapshot` |
| DELETE | `/admin/crawl/tabling/bulk-save/jobs/:id` | — | 204 (abort 신호) |
| GET | `/admin/crawl/tabling/bulk-save/jobs/:id/events` | `?token=<jwt>` | `text/event-stream` — `snapshot`/`item`/`done`, `: hb` 15s |

### 어댑터 export

- 캐치테이블 — `searchCatchtablePlaces`, `fetchCatchtableShop`, `fetchCatchtableShopMenus`, `fetchCatchtableShopReviewOverview`, `closeCatchtableSearchBrowser`, `closeCatchtableShopBrowser`, `CatchtableSearchError`, `CatchtableShopError`.
- 다이닝코드 — `searchDiningcodePlaces`, `fetchDiningcodeShop`, `fetchDiningcodeShopReviews`, `DiningcodeSearchError`, `DiningcodeShopError`.
- 테이블링 — `fetchTablingSearch`/`TablingSearchError`, `fetchTablingShop`/`fetchTablingShopReviews`/`TablingShopError`, `fetchTablingPlace`/`TablingPlaceError`, `fetchTablingSitemap`/`TablingSitemapError`.
- Naver — `fetchNaverPlaceWithPlaywright`, `searchPlacesViaMapNaver`, `fetchVisitorReviewStats`/`fetchVisitorReviewStatsMany`/`parseVisitorReviewStats`/`buildWtmHeader`.

Fastify `onClose` 훅이 `closeBrowser()` + `closeCatchtableSearchBrowser()` + `closeCatchtableShopBrowser()` 를 `Promise.all` 로 함께 호출 (테이블링·다이닝코드 HTTP 어댑터는 풀세션이 없어 정리 불필요).

## Data [coverage: high — 7 sources]

### 테이블링 가게 데이터 핵심 필드 (`TablingShopData`)

`idx`(=sourceId, 카카오 딥링크 `restaurant_idx` 와 동일), `name`/`excerpt`/`description`, `category`(단일 문자열), `address`/`roadAddress`(address1)/`jibunAddress`(address2)/`addressDetail`/`phone`, `lat`/`lng`(응답 string → number 변환, 머지 좌표키), `rating` + `ratings[]`(맛/분위기/서비스/청결 4축), `reviewTotalCount`/`favoriteCount`, `statusLabel`("영업중"), `images[]`(restaurantImages 대표), `menuCategories[]`(카테고리→menus[]), `businessDays[]`(restaurantTimes, 요일별 open/break time list), `flags`(useWaiting/useRemoteWaiting/useReservation/useTakeOut/useOnSiteOrder), `waitingCount`, `reviewsFirstPage`(TablingShopReviewsSection), `rawSourceUrl`, `source: 'http'`.

### 테이블링 리뷰 (`TablingShopReview`)

`idx`(24-hex ObjectId, 가게 idx 와 달리 숫자 아님), `cursorId`(페이지네이션 토큰 **아님** — `lastIdx` 가 토큰), `nickname`/`reviewDate`/`rating`/`contents`, `imageUrls[]`(string 또는 {imageUrl|url|origin} object 방어 추출), `menuOrders[]`(string 또는 {name|menuName}), `likeCount`, `reply`(object/string → 텍스트만 추출), `isBlinded`, `summaryText`(어댑터는 항상 null, 서비스가 `tb:rv:<idx>` 매칭으로 우리 ReviewSummary.text 주입).

### 테이블링 place / 검색 / 발견

- `TablingPlaceData` — `objectId`(24-hex), `name`, `address`, `lat`/`lng`, `cuisines[]`(servesCuisine), `rating` + `reviewCount`(aggregateRating, API 없어 근사·스테일 가능), `images[]`, `description`, `source: 'jsonld'`. 메뉴·리뷰 없음.
- `TablingSearchResult` — `idx`, `name`, `category`(classification+classification2 " · " 결합), `summaryAddress`(행정동 단축 라벨), `rating`, `reviewCount`, `lat`/`lng`(number, 상세 호출 전 자동매칭 가능), `thumbnailUrl`, `excerpt`, `isNew`, `waitingCount`, `flags`, `recommendedMenus[]`, `distance`("350m" 등, 좌표 중심 없으면 보통 null), `rawSourceUrl`.
- `TablingDiscoverResult` — `{tier, ids[], total, source:'sitemap', elapsedMs}`.

### 테이블링 / 다이닝코드 일괄 저장 잡 모델 (`InternalJob`)

- `id` UUID, `actorId`, `state: pending|running|done|failed`
- `items[]` — vRid(string)/idx(number) 별 `state`(+`pending|running|done|failed|skipped`) + 결과 필드. 테이블링은 `restaurantId`/`fetchedPages`/`newReviewCount`/**`autoMatched`/`matchedCanonicalId`**/`errorCode`/`errorMessage`/`startedAt`/`finishedAt`.
- `events[]`(상한 1000), `subscribers: Set`, `abort: AbortController`, `finishedAtMs`(GC)
- TTL **10분** (`FINISHED_TTL_MS = 10 * 60_000`) — Naver 잡(5분)보다 길게.

`SaveTablingShopResult` — `idx`, `restaurantId`, `fetchedPages`(첫 페이지 포함), `totalReviewsReported`, `newReviewCount`, `queuedForAnalysis`(=newReviewCount), `autoMatched`, `matchedCanonicalId`, `elapsedMs`.

### 테이블링 DB 부수효과

- Restaurant 1건 — `upsertRestaurantFromTabling`(source='tabling', sourceId=idx) / `upsertRestaurantFromTablingPlace`(sourceId=`place:<objectId>` 형태). 신규면 새 canonical, 기존이면 유지.
- VisitorReview N건 — `mapTablingReviewToRaw(rv)` → `externalId: 'tb:rv:<idx>'`, `persistReviewBatch` dedup INSERT.
- Summary 큐 — `queueSummariesForReviews('tb:<idx>', ids)`. 키 prefix `tb:` 로 namespace 분리.
- CanonicalProposal + 자동매칭 + place↔partner 승격 — 위 Architecture 참조. idempotent.

### 다이닝코드 일괄 저장 잡 모델 (`diningcode-bulk-save-registry.ts`)

`SaveDiningcodeShopResult` 필드: `vRid`, `restaurantId`, `fetchedPages`, `totalReviewsReported`, `newReviewCount`, `queuedForAnalysis`, `elapsedMs`. (TTL 10분, 페이지 간 200ms — 테이블링과 동일 정책.) DB 부수효과: Restaurant(source='diningcode'), VisitorReview(`dc:rv:<rvId>`), Summary 큐(`dc:<vRid>`), CanonicalProposal.

### 다이닝코드/테이블링 리뷰 AI 요약 텍스트 join

리뷰 응답에 `summaryText: string | null`. 어댑터는 항상 `null` 로 채우고, 서비스 레이어가 다이닝코드는 `getDiningcodeReviewSummaryMap(vRid, rvIds)`, 테이블링은 `getTablingReviewSummaryMap(idx, idxs)` 로 우리 `ReviewSummary.text` 를 join 해서 덮어쓴다. 외부 응답은 그대로 두고 `summaryText` 만 채우는 패턴 — DB 에 없는 리뷰는 `null`.

### 다이닝코드 가게 데이터 / 캐치테이블 가게 데이터

`DiningcodeShopData` — `vRid`, `name`/`branch`/`fullName`, `area`, `categories[]`/`descTags[]`/`tags[]`/`facilities[]`, `score`(0~100), `address`/`roadAddress`/`phone`/`lat`/`lng`, `thumbnailUrl`, `images[]` + `photos[]`(12장), `status`, `businessHours[]`(7일) + `businessHoursSummary[]`, `menus[]` + `menuTotalCount` + `hasPopularMenu`, `scoreDetail`, `reviewsFirstPage` + `blogsFirstPage`, `wordcloudUrl(Mobile)`, `rawSourceUrl`.

`CatchtableShopData` — `shopRef`/`alias`/`shopName`/`shopNameEn`, `category`, `landName`, `serviceDesc`, `address`/`addressDetail`/`lat`/`lon`, `subways[]`, `phone`, `images[]`, `priceRange`, `review`(averageScore + food/ambience/serviceScore), `schedule`, `disableDays[]`, `awardItems[]`, `relatedKeywords[]`, `bookmarkCount`, contract 플래그, lazy `menus`/`reviewSamples`.

### 상한

- 테이블링 검색 pageSize 1~100(기본 20), `distance:700` 고정, `SEARCH_DISTANCE` 모드 스위치.
- 테이블링 리뷰 페이지 크기 `CRAWL_TABLING_REVIEW_PAGE_SIZE`(기본 20), 일괄 저장 안전 상한 200페이지, 페이지 간 200ms.
- 테이블링 일괄 저장 input idx 1~50개, 잡 TTL 10분.
- 테이블링 fetch timeout `CRAWL_TABLING_TIMEOUT_MS`(기본 8000).
- 테이블링 사이트맵 place page 1~5(`Math.min(Math.max(...,1),5)` clamp).
- review-stats fetch timeout `CRAWL_REVIEW_STATS_HTTP_TIMEOUT_MS`(기본 5000).
- 다이닝코드 일괄 저장 input vRid 1~50개, TTL 10분, 페이지 간 200ms, fetch timeout 8초.
- 캐치테이블 검색 limit 1~30, 첫 호출 timeout 30s, networkidle 12s; 상세 lazy settle 2.5s.

## Key Decisions [coverage: high — 18 sources]

- **테이블링은 무인증 REST — 다이닝코드와 같은 순수 HTTP 어댑터** — `mobile-v2-api.tabling.co.kr` 가 웹·앱 공유 백엔드인데 토큰/쿠키 불필요 + CORS 열림이라 Playwright 불필요(캐치테이블 CF 와 대비). 좌표가 응답에 number/string 으로 들어와 머지에 그대로 쓸 수 있다. 근거 문서 `docs/research/tabling-crawl-feasibility.md`.
- **테이블링 검색 `distance:700` 은 반경이 아니라 모드 스위치** — 좌표 없이 distance 키를 실으면 ES 가 "내주변 추천" 을 끄고 키워드 관련성 정렬로 전환. 없으면 키워드를 거의 무시. 공식 웹 검색창 고정 기본값을 그대로 차용. (조사 초기 GET 만 시도해 404 → "검색 API 없음" 오판했으나 실제는 POST.)
- **테이블링 발견은 사이트맵 백본 + 키워드 검색 보조** — 키워드 검색 JSON API 가 partner(`/restaurant/:idx`) 만 커버하고 미입점 place 는 사이트맵에만 있어, 전수 발견은 `/sitemap-place-{1..5}.xml`(각 ~45k) 이 유일한 백본. 검색은 partner idx 타깃 발견용.
- **테이블링 place↔partner 승격** — 같은 가게의 얕은 place(JSON-LD)와 풍부한 partner(REST) 행이 둘 다 source='tabling' 이라 일반 자동매칭/제안 큐가 양쪽 다 건너뛰는 사각지대. `tryLinkTablingPlacePartner` 가 좌표+이름으로 둘을 잇고 항상 partner 쪽으로 머지. sourceId prefix `place:` 로 역할 판별.
- **테이블링 자동매칭은 우리 DB 만 스코어링(역방향)** — DC 자동매칭(외부 검색 후 저장)과 달리, 테이블링은 이미 저장된 우리 canonical 의 좌표 박스 안 후보만 `scoreMatch` 로 매칭하므로 가볍다 → **동기** 실행해 결과(`autoMatched`/`matchedCanonicalId`)를 응답에 싣는다. 임계 상수는 DC 와 공유(`AUTO_DC_NAME_THRESHOLD`/`_DISTANCE_THRESHOLD_M`/`_TIE_GAP`).
- **SSE seq 단일 카운터 — `operationLog.allocSeq()`** — log 이벤트와 crawl 이벤트가 같은 `'crawl'` SSE 스트림에 섞여 흐르므로, 각자 카운터를 쓰면 클라이언트 `(jobId, seq)` dedup 이 한쪽(특히 done)을 드롭한다 → 리뷰 많을 때 78% 멈춤·완료 누락. 단일 발급기로 단조 증가 보장. 테스트(operationLog 미주입)만 자체 `nextSeq++` 폴백.
- **정확한 방문자 리뷰 수는 별점-only 차감** — 검색 API 의 `visitorReviewCount` 는 별점만 남긴 리뷰까지 포함이라 네이버 페이지 표시와 다름. `getVisitorReviewStats` 의 `ratingReviewsTotal` 을 빼 `displayReviewCount` 산출. 페이지 없는 GraphQL 직접 호출이라 매우 빠르고, 실패는 null(미리보기 보강이라 best-effort).
- **백그라운드 크롤 → 자동 enrich 는 요약 종료 훅 책임** — crawl 모듈은 리뷰 적재 후 `queueSummariesForReviews` 로 트리거만 하고, review-search enrich + review-clustering 군집화는 `plugins/summaries.ts` 의 요약 종료 훅이 자동 호출한다(전역 singleton 공유). 책임 분리 — crawl 은 데이터 인입, enrich/cluster 는 후처리.
- **Naver 어댑터 stealth (`playwright-extra` + `puppeteer-extra-plugin-stealth`)** — 실제 429 차단 사고 후 도입. `chromium.use(StealthPlugin())` 한 줄로 자동화 시그널 위장 → anti-bot 회피. puppeteer-extra plugin 을 playwright-extra 가 동일 인터페이스로 받음 — 검증된 maintained 패턴. `playwright` 단독 import 와 달리 DOM ambient 타입이 안 따라와 `/// <reference lib="dom" />` 필요.
- **더보기 jitter (랜덤 지연)** — `base + random(0..jitter)` 패턴. 5초 고정 cadence 자체가 fingerprint 가 되어 stealth 만으로 부족 — 인간 패턴에 가까운 5~8초. 권장 jitter 2~5초. 0 으로 끄면 고정 cadence(테스트/재현).
- **출처별 비용 모델 다름** — Naver = Playwright 풀세션(Apollo SSR), 캐치테이블 = Playwright 페이지 안 fetch 가로채기(CF), 다이닝코드·테이블링 = HTTP 직접(CORS 열림 + CF 없음). 같은 "크롤" 추상화 위에 어댑터 인터페이스만 통일하고 비용은 어댑터에 가둠.
- **`MAX_CONCURRENT_PER_ACTOR` 3 → 5** — `auto-discover` group-of-5 동시 실행 + 발견 페이지 다중 선택을 정상 패턴으로 받아 큐잉 없이 active 진입.
- **C안 — Naver 종료 후 자동 다이닝코드 매칭+머지** — Naver done 직전 `tryAutoMatchDiningcode` 가 (이름≥0.85 + 거리≤50m + top1-top2≥0.1) 통과 시 `saveDiningcodeShop` + `canonical.merge` 자동. 미달이면 silent skip(제안 큐 fallback). fire-and-forget — Naver `done` 안 막음.
- **다이닝코드는 한 endpoint(`POST /API/profile/`)가 16섹션 모두** — 별도 lazy 호출 X. 페이지네이션도 같은 endpoint `tab=review&page=N`. 어댑터가 review 만 추려 가벼운 wire size.
- **다이닝코드/테이블링 일괄 저장은 직렬 + per-actor 1잡** — 외부 서버 부담 + SSE 이벤트 순서 직관 유지. Naver 의 max 5 + FIFO 와 다른 정책.
- **review externalId/summary 키 namespace** — Naver(reviewId 그대로), 다이닝코드(`dc:rv:<rvId>` / `dc:<vRid>`), 테이블링(`tb:rv:<idx>` / `tb:<idx>`). `(restaurantId, externalId)` unique constraint 가 idempotent dedupe.
- **다이닝코드 좌표 검색은 SOFT limit** — `strictDistance`(기본 true) 후필터링으로 키워드 fallback 광역 결과 제거, 잘려나간 개수는 `filteredOutCount` 노출.
- **캐치테이블 fallback/keywordSearch/warm page** — `totalShopCount >= 10000` 이면 fallback(16849 고정), `keywordSearch.keyword` 필수, warm page 첫 호출 ~14s 이후 ~200-900ms.
- **DC/테이블링 bulk save TTL 10분** — Naver 잡(5분)보다 길게(`FINISHED_TTL_MS = 10 * 60_000`).

## Gotchas [coverage: high — 14 sources]

- **테이블링 리뷰 페이지네이션은 `lastIdx`, `cursorId` 아님** — `fetchTablingShopReviews` 가 직전 페이지 마지막 리뷰의 `idx`(ObjectId)를 `lastIdx` 파라미터로 넘긴다. 리뷰 응답의 `cursorId` 필드는 페이지네이션 토큰이 아니므로 헷갈리면 무한 첫 페이지. 응답이 `REVIEW_PAGE_SIZE` 만큼 차야 nextCursor 반환.
- **테이블링 place JSON-LD 는 이중 인코딩 RSC flight 안** — `<script type="application/ld+json">` 태그가 아니라 `self.__next_f.push([1,"…"])` flight 청크 안에 stringified prop 으로 박혀 있어, flight 디코드 + 한 번 더 JSON.parse 가 필요. 옛 `<script>` 태그 fallback 도 있지만 현재 페이지는 flight 경로. 테이블링이 Next.js 렌더링을 바꾸면 이 추출이 깨질 수 있음.
- **테이블링 검색 distance 키 빠지면 키워드 무시** — 좌표 없이 `distance:700` 없으면 "내주변 추천" 모드로 기본 좌표 부근만 돌려줌(예: "숯돈 목동점" → 양재/청담 가게). 어댑터가 항상 distance 를 실으므로 라우트로 우회하면 안 됨.
- **테이블링 좌표·카운트 string 혼재** — lat/lng 가 string("37.54…"), price/카운트도 string 가능 → `numOrNull`/`intOrNull` 헬퍼가 흡수. 리뷰 idx 는 24-hex ObjectId(숫자 아님), 가게 idx 는 숫자 — 둘을 섞으면 매핑 깨짐.
- **테이블링 일괄 저장 취소는 진행 중 idx 끝까지** — `AbortController` 가 있지만 fetch 들이 signal 을 안 받음. abort 후 진행 중 한 idx 는 끝나고 다음 idx 들은 시작 전 `skipped`. 즉시 stop 보장 X (다이닝코드와 동일).
- **SSE seq 두 카운터 금지** — log 이벤트와 crawl 이벤트가 같은 스트림에 섞일 때 각자 seq 를 쓰면 done 이 드롭된다. 새 이벤트 타입 추가 시 반드시 `operationLog.allocSeq()`(또는 emit 경유) 단일 카운터를 쓸 것. 직접 `nextSeq++` 를 쓰면 78% 멈춤 재발.
- **review-stats `x-wtm-graphql` 헤더 필수** — 없으면 네이버가 차단. `buildWtmHeader` 가 base64 패딩(`=`) 까지 제거해야 통과. 실패는 throw 안 하고 null 이라 호출자가 "통계 없음" 으로 graceful 처리.
- **stealth 는 maintenance 비용 있음** — 네이버 anti-bot 이 바뀌면 stealth 위장이 깨질 수 있음. 차단 재발 시 1) stealth plugin 최신 버전, 2) `dev-open-visitor-page.ts` 로 `DEV_OPEN_STEALTH=0` 비교, 3) UA/viewport/locale 의심. catchtable 은 stealth 안 씀(CF 측 별도).
- **jitter 범위 너무 작으면 의미 없음** — `CRAWL_VISITOR_PAGE_DELAY_JITTER_MS=500` 이면 사실상 고정 cadence. 권장 base 의 50~100%(base=5000 이면 jitter=2000~5000). jitter=0 은 명시적 off.
- **dev 스크립트는 어댑터 stealth 와 동기화 유지 필요** — 어댑터에서 stealth/plugin/UA/viewport 바꾸면 dev 스크립트 3종도 같이 갱신해야 재현성 유지.
- **`MAX_CONCURRENT_PER_ACTOR` 가 3 아닌 5** — 이전 추정이 max 3 가정이면 갱신. Playwright 풀세션이 동시 5개까지.
- **C안 자동 머지는 임계 못 넘으면 silent** — 좌표 없음/DC source 이미 있음/임계 미달이면 그냥 return(실패 시 `console.error` 만). 후보는 ProposalService fallback.
- **다이닝코드 좌표 검색 광역 끼워보냄 / 카운트 string·콤마 / URL protocol 누락 / `bhour` vs `bhour_seo` / 사장 답글 가짜값(`"1970년 1월 1일"`) / `total_cnt` 10000 캡(실측은 `rcount`) / `result_code` `'100'` 체크 필수 / GET 시 size=4 고정(반드시 POST)** — 다이닝코드 어댑터 방어 헬퍼(`parseIntLoose`/`numOrNull`/`httpUrlOrNull`)가 흡수.
- **캐치테이블 CF 봇 보호 / 응답 모양 가게마다 다름(lazy nullable) / 메뉴 endpoint warmcontext fallback** — 직접 fetch 403, Playwright 페이지 안 호출만 정상. menus/reviewSamples nullable — UI 가 null 분기 책임.
- **DC/테이블링 bulk save SSE 인증** — EventSource 가 헤더 못 실어 `?token=<jwt>` 수락. 본인 잡(`actorId === userId`) + `role === 'ADMIN'` 만 통과. registry `get(id, actorId)` 가 actor 미스매치면 null → 404.
- **Naver Search 어댑터 이행** — `naver-search.playwright.adapter.ts` 사라지고 `naver-search.http.adapter.ts` 로 nx-api GraphQL 직접 호출(`source: 'http'`). reviewCount 는 `visitorReviewCount`(visitor) → `blogCafe`(total) → `reviewCount` 폴백 순. `CrawlSearchResult.source` enum 의 `'playwright'` 는 backward-compat.

## Sources [coverage: high — 26 sources]

- [apps/friendly/src/modules/crawl/crawl.route.ts](../../apps/friendly/src/modules/crawl/crawl.route.ts)
- [apps/friendly/src/modules/crawl/crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts)
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts)
- [apps/friendly/src/modules/crawl/job-log.service.ts](../../apps/friendly/src/modules/crawl/job-log.service.ts)
- [apps/friendly/src/modules/crawl/diningcode-bulk-save-registry.ts](../../apps/friendly/src/modules/crawl/diningcode-bulk-save-registry.ts)
- [apps/friendly/src/modules/crawl/tabling-bulk-save-registry.ts](../../apps/friendly/src/modules/crawl/tabling-bulk-save-registry.ts)
- [apps/friendly/src/modules/crawl/url-normalizer.ts](../../apps/friendly/src/modules/crawl/url-normalizer.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-place.playwright.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-search.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-search.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-review-stats.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-review-stats.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/naver-review-stats.http.adapter.test.ts](../../apps/friendly/src/modules/crawl/adapters/naver-review-stats.http.adapter.test.ts)
- [apps/friendly/src/modules/crawl/adapters/catchtable-search.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/catchtable-search.playwright.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/catchtable-shop.playwright.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/catchtable-shop.playwright.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/diningcode-search.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/diningcode-search.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/diningcode-shop.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/diningcode-shop.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/tabling-search.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-search.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/tabling-shop.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-shop.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/tabling-shop.http.adapter.test.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-shop.http.adapter.test.ts)
- [apps/friendly/src/modules/crawl/adapters/tabling-place.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-place.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/tabling-place.http.adapter.test.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-place.http.adapter.test.ts)
- [apps/friendly/src/modules/crawl/adapters/tabling-sitemap.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-sitemap.http.adapter.ts)
- [apps/friendly/src/modules/crawl/adapters/tabling-sitemap.http.adapter.test.ts](../../apps/friendly/src/modules/crawl/adapters/tabling-sitemap.http.adapter.test.ts)
- [apps/friendly/src/modules/crawl/tabling.service.test.ts](../../apps/friendly/src/modules/crawl/tabling.service.test.ts)
- [apps/friendly/src/modules/crawl/crawl.test.ts](../../apps/friendly/src/modules/crawl/crawl.test.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
