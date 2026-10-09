---
topic: random-crawl
last_compiled: 2026-10-10
sources_count: 28
status: active
aliases: [맛집 자동 발굴, 자동 발굴, random-crawl, RandomCrawlService, randomCrawlRegistry, RegionStore, regions.json, build-regions, awaiting_selection, crawlChosenCandidate, timeoutAction, sweepExpired, /discover, /발굴, /search, /검색, /stats, random_crawl_configs, random_crawl_runs, RandomCrawlSection, useRandomCrawlRunEvents, system:random-crawl, buildLlmProviderEnv, app.crawl, waitForTerminal, CRAWL_WAIT_TIMEOUT_MS, 크롤 종료 대기 상한, useDebouncedDraft, CRON_PREVIEW_DEBOUNCE_MS, configSynced, cron 미리보기 디바운스, RandomCrawlSectionMemo]
---

# random-crawl — cron 지역 선정 → 네이버 검색 → 텔레그램 후보 선택 → 크롤 등록

**2026-10-05 변경 흡수 — 앱 싱글톤 `app.crawl` 사용·크롤 종료 대기 60분 상한·검색 타임아웃 합성(`ab7dad28`) + 어드민 카드의 cron 미리보기 디바운스·종료 무효화 키 수정(`e50ccfe6`·`c5052742`)**: (1) **자체 조립 제거(A-3)** — [plugins/random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) 가 `AiConfigService`·`ReviewSearchService`·`SummaryService`·`CanonicalService`·`ProposalService`·`CrawlService` 를 직접 만들던 것을 지우고 [plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) 의 `app.crawl` 을 쓴다(의존 `['prisma','logs','crawl']`, `RestaurantService` 만 자체 생성). 예전 배선에선 이 경로(cron·지역 랜덤·텔레그램 선택)로 등록한 가게의 요약이 플러그인 전용 `SummaryService` → 전용 `ReviewSearchService` 로 흘러 **enrich 완료 → 군집화 이벤트 배선(plugins/summaries)에 닿지 않았고**(재시작 전까지 군집 '대기' — [review-clustering](review-clustering.md)), 어드민 "요약 중지"·enrich 중복 가드도 먹지 않았다. 아래 2026-08-22 의 `buildLlmProviderEnv()` 문단은 그래서 역사가 됐다 — 이 플러그인은 더 이상 `AiConfigService` 를 만들지 않는다. (2) **크롤 종료 대기 상한** — `crawlChosenCandidate` 가 자체 `waitForCrawlTerminal`(상한 없음) 대신 `jobRegistry.waitForTerminal(jobId, CRAWL_WAIT_TIMEOUT_MS = 60분)`(대기열 시간 포함). `'timeout'` 이면 `crawl.cancel(jobId, 'system:random-crawl')` 후 회차 `failed`, error "크롤이 60분 안에 끝나지 않아 취소했습니다." — 예전엔 크롤이 끝나지 않으면 회차가 `crawling` 으로 남아 overlap 가드(`hasActiveRun`)가 이후 cron·텔레그램 회차를 전부 "이전 회차 진행 중" skip 했다. 진행 편집 정지(`stopProgress`)는 그대로 `finally`. (3) **검색·리뷰 통계 타임아웃(A-8)** — 이 서비스는 레지스트리 signal 을 `searchPlacesViaMapNaver`·`fetchVisitorReviewStatsMany` 에 넘기는데, 예전 어댑터는 signal 을 받으면 자체 타임아웃을 꺼서 업스트림이 멈추면 undici 기본(~300초)까지 매달렸다(그동안 `randomCrawlRegistry.isActive()` 라 다른 회차 skip). 이제 signal 과 자체 타임아웃(검색 8초)을 합성한다([crawl](crawl.md)). (4) **어드민 카드(`e50ccfe6`)** — [RandomCrawlSection.tsx](../../apps/web/src/routes/admin/RandomCrawlSection.tsx) 의 cron 직접 입력은 `useDebouncedDraft(…, CRON_PREVIEW_DEBOUNCE_MS = 300)` 로 멈춘 뒤에만 미리보기 요청(blur 는 즉시), 프리셋 선택·설정 로드는 즉시 반영. 미리보기는 저장된 설정을 초안에 옮긴 뒤(`configSynced`) 또는 설정 조회 실패 때만 켜 기본 cron 으로 헛요청하지 않고, 입력 중(초안 ≠ 적용값)에는 이전 식의 결과를 지금 식의 것처럼 보여 주지 않는다. **고친 버그**: SSE `done` 뒤 무효화 키가 `['restaurants']`(어디에도 없는 키)라 맛집 목록이 갱신되지 않던 것 → shared [useRandomCrawl.ts](../../packages/shared/src/hooks/useRandomCrawl.ts) 가 `['restaurant','list']`(어드민)·`['restaurant','public','list']`(공개·발견 화면). `c5052742` 는 이 카드를 품은 [AdminAnalyticsPage.tsx](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) 가 `memo(RandomCrawlSection)` 으로 감싸 페이지 입력마다 카드가 다시 그려지지 않게 했다. 테스트: [RandomCrawlSection.test.tsx](../../apps/web/src/routes/admin/RandomCrawlSection.test.tsx) 4건(설정 응답 전 미요청·한 번만·실패 시 기본값·디바운스/프리셋), [useRandomCrawlRunEvents.test.tsx](../../apps/web/src/test/useRandomCrawlRunEvents.test.tsx) 2건. DB 스키마·라우트·계약 변경 없음(전부 어드민).

**2026-08-22 변경 흡수 — 플러그인 env 조립 `buildLlmProviderEnv()`(`cc8399a`)** *(2026-10-05 `ab7dad28` 로 이 조립 자체가 사라짐 — 위 문단)*: [plugins/random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) 가 자체 `LlmProviderEnv` 리터럴 대신 [`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 로 `AiConfigService` 를 만든다. 이 인스턴스는 발굴 파이프라인의 LLM 호출용이 아니라, 플러그인이 자체 조립하는 `ReviewSearchService`/`SummaryService`(선택 크롤 뒤 요약 → 자동 enrich 훅) 에 넘기는 것 — 발굴 자체는 LLM 을 쓰지 않는다. 배경(purpose 5종·조립 단일화)은 [ai](ai.md).

> 맛집 자동 발굴. cron 으로 지역을 (랜덤/고정) 골라 네이버 검색 → 신규 후보 N개를 텔레그램으로 보내고, 사용자가 버튼으로 고른 가게만 크롤(=등록)한다. [schedule](schedule.md) 과 같은 croner 인프로세스 스케줄러를 쓰되 jobType·파이프라인·상태머신이 다르다.

## Purpose [coverage: high — 6 sources]

[crawl](crawl.md) 은 사람이 가게 URL 을 직접 넣어 등록하는 흐름이고, 이 도메인은 그 앞단을 **자동 발굴**로 채운다. 관리자가 cron 식으로 예약한 시각마다 지역을 (랜덤/고정) 골라 네이버 지도 검색을 돌리고, **아직 등록 안 된** 가게 후보 N개를 추려 [telegram](telegram.md) 으로 보낸다. 사용자가 텔레그램 인라인 버튼으로 가게를 고르면 그 가게 1개만 크롤(=Naver Place 등록)한다.

핵심은 **사람이 한 번 끼는 비동기 상태머신**이다. 검색→후보전송까지는 자동이지만, 어느 가게를 등록할지는 텔레그램 응답을 기다린다(`awaiting_selection`). 무응답이 타임아웃까지 이어지면 회차를 그냥 건너뛰거나(`skip`, 기본) 후보 중 하나를 랜덤으로 골라 자동 크롤한다(`random` — timeout action, [`017e9ca`]).

발굴은 cron 외에도 여러 진입점이 있다:

- **cron tick** (`trigger: 'cron'`) — 예약 시각마다 설정 지역으로.
- **어드민 "지금 실행"** (`'manual'`) — 어드민 화면 버튼.
- **텔레그램 `/discover`·`/발굴`** (`'telegram'`) — 사용자가 봇에 직접 트리거([`65cf8b3`]). 설정 지역으로.
- **텔레그램 지역 선택 발굴** (`'telegram'`) — `/stats`(지역 통계) 메시지의 드릴다운 버튼에서 특정 시도/시군구를 골라 발굴([`a743248`]).
- **텔레그램 직접 검색 `/search`·`/검색`** (`'search'`) — 지역 대신 사용자 검색어로 후보를 찾는다(검색어가 영역을 결정 → 좌표 불필요).

기본 권장 주기는 매일 11:00(`DEFAULT_CRON = '0 11 * * *'`, 점심 직전, `Asia/Seoul`)이며 키워드는 `맛집`, 후보 5개, 응답 대기 30분이다.

## Architecture [coverage: high — 8 sources]

[schedule](schedule.md) 과 같은 3객체 구성(service + registry singleton + plugin)이되 상태머신이 한 단계 더 깊다.

- **RandomCrawlService** ([`random-crawl.service.ts`](../../apps/friendly/src/modules/random-crawl/random-crawl.service.ts)) — 발굴 파이프라인 + 텔레그램 콜백/커맨드 상태머신. `getConfig`/`updateConfig`/`applySchedule`/`bootstrap`/`runScheduled`/`listRuns`/`preview` + 지역 조회(`getRegionTree`/`getRegionDongs`) + 텔레그램 핸들러(`handleTelegramCallback`/`handleTelegramMessage`) + `sweepExpired`. cron tick·"지금 실행"·`/discover`·지역 선택·`/search` 가 모두 `runScheduled(trigger, override?)` 한 경로로 수렴한다(차이는 `trigger` 값과 `override.region`/`override.query`).
- **randomCrawlRegistry** ([`random-crawl-registry.ts`](../../apps/friendly/src/modules/random-crawl/random-crawl-registry.ts)) — 모듈 singleton. **동시 1개** `ActiveRun` 슬롯(runId·phase·candidates·`AbortController`·SSE 구독자 Set). live 진행 표시 + SSE fan-out + 보조 in-process overlap 가드(`begin`)만 담당. 진실의 원천은 DB 라, 재시작으로 레지스트리가 비어도 흐름은 DB 로 이어진다.
- **RegionStore** ([`region.ts`](../../apps/friendly/src/modules/random-crawl/region.ts)) — 전국 시/군/구 좌표 + 동 이름 번들([`data/regions.json`](../../apps/friendly/src/modules/random-crawl/data/regions.json))을 감싼 모듈 singleton. `tree()`(시도→시군구, 동 제외) / `dongs(sido, sigungu)` / `resolve(region)`(설정을 위에서 아래로 풀어 좌표 1곳 확정).
- **random-crawl plugin** ([`plugins/random-crawl.ts`](../../apps/friendly/src/plugins/random-crawl.ts)) — `fastify-plugin`, `dependencies: ['prisma', 'logs', 'crawl']`(2026-10-05 전엔 `['prisma','logs']`). `RandomCrawlService` + `TelegramService` + `TelegramConfigService` 를 `app.decorate` 로 전역 singleton 노출. 크롤은 [plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) 의 **`app.crawl` 싱글톤**을 그대로 받는다 — 결과 캐시·actor 대기열이 하나이고, 요약·enrich·군집화가 앱 싱글톤(`app.summaries` → `app.reviewSearch` → enrich 완료 이벤트 → `app.reviewClustering`) 체인을 탄다. *(2026-10-05 전: CrawlService/SummaryService/ReviewSearchService 등을 여기서 자체 조립했고 — autoload 순서 비의존 — 공유되는 건 모듈 singleton `jobRegistry` 의 in-flight/dedup 상태뿐이었다. 그 결과 대기열·요약 중지·enrich 완료 → 군집화가 갈라져 있었다.)*

cron 타이머는 [schedule](schedule.md) 과 **같은** `scheduleRegistry`(모듈 singleton)에 `jobType: 'random-crawl'` 로 등록되어 `normalize-merge` 와 키만 다르게 공존한다. 상태 분리는 schedule 과 동일: **설정·이력·awaiting 상태는 SQLite 에 영속**, **live 진행·cron 타이머는 메모리**. 이는 [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 의 또 하나의 단일-잡 게이트다.

### 실행 흐름 (runScheduled)

1. **sweepExpired** — 만료된 `awaiting_selection` 을 먼저 정리해 막힌 슬롯을 푼다.
2. **overlap 가드** — 레지스트리(`isActive`)와 DB(`hasActiveRun`, `running`/`awaiting_selection`/`crawling`) 둘 다 확인(재시작 안전). 진행 중이면 `skipped` 행만 남기고 반환.
3. **검색 대상 결정** — `override.query` 면 지역선정 생략(검색어가 영역 결정), 아니면 `RegionStore.resolve` 로 지역을 골라 검색어 조립(`동 keyword` 또는 `keyword`).
4. **검색 → dedupe → 기등록 제외 → 후보 N개** — `searchPlacesViaMapNaver` → placeId 중복 제거 → `restaurants.findRegisteredByPlaceIds` 로 이미 등록된 가게 제외 → `candidateCount` 개. 신규 0건이면 `notifyEmpty` 후 `skipped`.
5. **리뷰수 보강(best-effort)** — `fetchVisitorReviewStatsMany` 병렬 호출로 후보의 `reviewCount` 를 네이버 페이지 표시값(별점-only 제외)으로 교체. 실패는 원래 값 유지.
6. **후보 전송 → `awaiting_selection`** — 텔레그램 카드 전송 후 손을 뗀다. `expiresAt`·`candidatesJson`·`telegramChatId`/`telegramMessageId` 를 DB 에 영속(콜백/sweep 이 이 행을 찾는다). **발굴 단계는 여기서 `done` 으로 마감**하고, 이후 크롤은 콜백이 별도 처리한다.

### 선택 → 크롤 (crawlChosenCandidate)

텔레그램 콜백(수동 선택)과 타임아웃 랜덤 자동선택이 공유한다. `awaiting_selection` 일 때만 `updateMany` 로 **atomic claim**(→ `crawling`)해 콜백/sweep 동시 진입을 막는다(이미 처리됐으면 no-op). 이후 `crawl.startCrawl(rawSourceUrl, 'system:random-crawl', 'create')` → `streamCrawlProgress` 로 같은 텔레그램 메시지를 제자리 갱신(throttle) → 종료 대기(2026-10-05 부터 `jobRegistry.waitForTerminal(jobId, CRAWL_WAIT_TIMEOUT_MS = 60분)` — 대기열 시간 포함, `'timeout'` 이면 그 크롤을 `cancel` 하고 `failed`("크롤이 60분 안에 끝나지 않아 취소했습니다."); 예전 자체 `waitForCrawlTerminal` 은 상한이 없었다) → `findByPlaceId` 로 결과 확인 → `done`/`failed` 반영 + 완료 핑(편집은 알림이 안 울려 별도 새 메시지로 notify).

### 부팅·종료

- **부팅** ([`server.ts`](../../apps/friendly/src/server.ts) `app.randomCrawl.bootstrap()`): `running`/`crawling` 고아만 `interrupted`(`error: 'server restart'`)로 닫는다. **`awaiting_selection` 은 의도적으로 살려둔다** — DB 가 진실의 원천이라 재시작 후에도 텔레그램 콜백이 그 행을 찾아 선택을 반영할 수 있다. 이어서 cron 등록 + 텔레그램 콜백/메시지 핸들러 연결 + 폴링 시작 + `sweepExpired` 60초 타이머 가동.
- **종료** (plugin `onClose` → `shutdown`): sweep 타이머 clear + 텔레그램 폴러 정지 + cron 해제 + `abortInflight`.

## Talks To [coverage: high — 7 sources]

- **[telegram](telegram.md)** — 핵심 양방향 인터페이스. `sendCandidates`(인라인 버튼 카드) 로 후보 전송, `onCallback`/`onMessage` 핸들러로 버튼 클릭·텍스트 커맨드 수신, `answerCallback`/`editMessageText`/`editMessageWithButtons`/`notify`/`askReply` 로 갱신. TelegramService 는 random-crawl 을 직접 import 하지 않고(순환 의존 회피) 핸들러만 받으며, 권한(설정된 chat)·staleness(60초)는 그쪽이 걸러서 넘긴다.
- **[crawl](crawl.md)** — 고른 후보 1개를 `app.crawl.startCrawl(...)` 로 등록(2026-10-05 부터 앱 싱글톤). `jobRegistry.subscribe` 로 크롤 진행(`stage`/`visitor_progress`)을 받아 텔레그램에 중계하고, `jobRegistry.waitForTerminal(jobId, 60분)` 으로 종료를 기다린다(초과 시 `cancel`). actor 는 `'system:random-crawl'`(사람 actor 와 구분되는 시스템 dedup 키 — 슬롯 5개도 어드민과 따로). 검색(`searchPlacesViaMapNaver`)·리뷰 통계(`fetchVisitorReviewStatsMany`)에 넘기는 레지스트리 signal 은 2026-10-05 부터 어댑터 자체 타임아웃과 합성된다.
- **summaries (간접)** — 등록된 가게의 요약은 `app.crawl` 이 들고 있는 `app.summaries` 로 큐잉되고, 요약 종료 → `app.reviewSearch` enrich → enrich 완료 이벤트 → `app.reviewClustering` 군집화가 이어진다([review-search](review-search.md)·[review-clustering](review-clustering.md)). 2026-10-05 전엔 이 플러그인 전용 인스턴스라 군집화 체인이 끊겨 있었다.
- **restaurant** — `findRegisteredByPlaceIds`(기등록 제외), `findByPlaceId`(크롤 결과 식당 id), `getRegionStats`(지역 통계 — `/stats` 커맨드). 통계 메시지 빌더·`isStatsCommand` 는 [`region-stats-telegram.ts`](../../apps/friendly/src/modules/restaurant/region-stats-telegram.ts) 를 재사용.
- **[schedule](schedule.md)** — 같은 `scheduleRegistry` 를 `jobType: 'random-crawl'` 로 공유(cron 타이머·`nextRun`). 파이프라인은 완전히 별개.
- **[friendly](friendly.md)** — `app.prisma`, `app.authenticate`/`app.requireAdmin`, `app.jwt`(SSE token), `app.httpErrors`, `app.operationLog`(발굴 run 의 operation log).
- **[shared](shared.md) / [web](web.md)** — `randomCrawl.api.ts` + `useRandomCrawl.ts` 훅으로 어드민 [RandomCrawlSection](../../apps/web/src/routes/admin/RandomCrawlSection.tsx) 이 소비.

## API Surface [coverage: high — 5 sources]

라우트([`random-crawl.route.ts`](../../apps/friendly/src/modules/random-crawl/random-crawl.route.ts)), `Routes.RandomCrawl.*`([routes.ts](../../packages/api-contract/src/routes.ts)). 전부 `/api/v1/admin/random-crawl` prefix, `app.authenticate` + `app.requireAdmin` 보호(SSE 만 예외).

| 메서드 | 경로 (`Routes.RandomCrawl.*`) | 설명 |
|---|---|---|
| `GET` | `config` (`/admin/random-crawl`) | 현재 설정 + 다음 실행 시각. 행 없으면 기본값으로 채워 반환(`telegramConfigured` 포함). |
| `PUT` | `config` | `enabled`/`cron`/지역/`keyword`/후보수/타임아웃/`timeoutAction` 변경. 잘못된 cron 은 `400`. 즉시 cron 재등록. |
| `POST` | `run` (`/admin/random-crawl/run`) | "지금 실행"(`manual`). 진행 중이면 `skipped` run 반환. |
| `GET` | `runs` (`/admin/random-crawl/runs`) | 최근 실행 이력(최대 50) + `inflightRunId`. |
| `POST` | `preview` (`/admin/random-crawl/preview`) | cron 식 검증 + 다음 실행 시각 최대 5개. |
| `GET` | `regions` (`/admin/random-crawl/regions`) | 전체 시도→시군구 트리(동 제외). |
| `GET` | `regionDongs` (`/admin/random-crawl/regions/dongs?sido=&sigungu=`) | 특정 시군구의 동 목록. |
| `GET` | `runEvents` (`/admin/random-crawl/run-events`) | 진행 SSE. |

### SSE (run-events)

EventSource 가 헤더를 못 보내므로 `?token=` 쿼리로 JWT 인증한다([sse-token-auth](../concepts/sse-token-auth.md)). ADMIN 이 아니면 `401`. 연결 시 즉시 `snapshot`(현재 run, 없으면 `null`)을 흘리고, **진행 중 run 이 없으면 바로 종료**한다. 진행 중이면 `progress`(phase·regionLabel·candidates)/`done` 이벤트를 push 하고 15초마다 `: hb` heartbeat. `awaiting_selection` 대기 중에도 진행 중으로 본다(텔레그램 응답 대기 동안 후보를 live 표시).

### 스키마

[api-contract](api-contract.md) [`random-crawl.ts`](../../packages/api-contract/src/schemas/random-crawl.ts):

- `RandomCrawlTrigger(cron|manual|telegram|search)` · `RandomCrawlRunStatus(running|awaiting_selection|crawling|done|skipped|failed|interrupted)` · `RandomCrawlPhase(selecting_region|searching|awaiting_selection|crawling|done)` — phase 는 live 전용(이력 행은 `null`).
- `RandomCrawlRegion` — 시/구/동 3레벨, 각각 고정(value) 또는 랜덤 플래그. 부모-자식 정합성(고정 자식이 랜덤 부모에 안 속함 등)은 서버 `resolve` 가 위에서 아래로 처리하며 어긋나면 랜덤 폴백.
- `RandomCrawlTimeoutAction(skip|random)` · `RandomCrawlConfig`/`RandomCrawlConfigInput`(cron `max(120)`, keyword `1–40`, candidateCount `1–10`, responseTimeoutMin `5–1440`).
- `RandomCrawlCandidate`/`RandomCrawlRun`/`RandomCrawlRunList`(+`inflightRunId`) · `RandomCrawlPreviewInput`/`Result` · `RegionTree`/`RegionDongQuery`/`RegionDongList` · SSE `RandomCrawlProgressEvent`/`RandomCrawlDoneEvent`.
- **cron 검증 로직은 스키마에 없다** — 서버가 croner 로 한다([zod-ssot-buildless](../concepts/zod-ssot-buildless.md), `shared → api-contract` 단방향 의존과 일관).

### FE 소비

- [`randomCrawl.api.ts`](../../packages/shared/src/api/randomCrawl.api.ts) — `getConfig`/`updateConfig`/`runNow`/`listRuns`/`preview`/`getRegions`/`getRegionDongs` + `buildRandomCrawlRunEventsUrl()`(token 을 query 로).
- [`useRandomCrawl.ts`](../../packages/shared/src/hooks/useRandomCrawl.ts) — React Query 훅 + `useRandomCrawlRunEvents(enabled)` SSE 구독(지수 백오프 재연결, `done` 에서 `['random-crawl','runs']`·`['random-crawl','config']` + 맛집 목록 `['restaurant','list']`·`['restaurant','public','list']` 무효화 — 2026-10-05 전엔 맛집 쪽 키가 `['restaurants']` 라 아무것도 무효화하지 못했다). `useRegionTree`/`useRegionDongs` 는 `staleTime: Infinity`(거의 불변).
- [RandomCrawlSection](../../apps/web/src/routes/admin/RandomCrawlSection.tsx) — 어드민 "맛집 자동 발굴" 카드: cron 프리셋 + 커스텀, **3레벨 지역 셀렉트(시/구/동 각각 고정/랜덤 토글)**, 키워드/후보수/응답대기/응답없을때(skip|random), preview, on/off, "지금 실행", live SSE 진행, 이력 테이블. `normalizeRegion` 으로 부모-자식 cascade 를 클라이언트에서도 강제(서버 resolve 와 이중). 2026-10-05 부터 cron 초안(`draftCron` — 화면·저장)과 미리보기 적용값(`previewCron`)을 [useDebouncedDraft.ts](../../apps/web/src/routes/admin/useDebouncedDraft.ts) 로 나눠 직접 입력은 300ms 멈춘 뒤(blur 즉시)·프리셋/설정 로드는 즉시 미리보기에 반영하고, 미리보기는 설정 동기화(`configSynced`) 뒤에만 요청한다. 카드는 [AdminAnalyticsPage.tsx](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx)(메뉴 정규화 화면) 안에 `memo` 로 들어간다.

## Data [coverage: medium — 3 sources]

[Prisma](../../apps/friendly/prisma/schema.prisma), 마이그레이션 [`20260619075115_add_random_crawl`](../../apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql) + [`20260619235551_add_random_crawl_timeout_action`](../../apps/friendly/prisma/migrations/20260619235551_add_random_crawl_timeout_action/migration.sql).

**`random_crawl_configs`** — `jobType` `@unique`(행 식별, `'random-crawl'` 고정), `enabled`, `cronExpr`(default `'0 11 * * *'`), `timezone`, `regionJson`(`RandomCrawlRegion` 직렬화), `keyword`(default `맛집`), `candidateCount`(5), `responseTimeoutMin`(**DB default 180 이지만 실사용 안 됨** — 앱 상수 30 으로 폴백, 컬럼 default 변경이 SQLite 테이블 재생성을 유발해 일부러 180 유지), `timeoutAction`(default `skip`, 2차 마이그레이션에서 추가), `lastRunAt`/`lastStatus`(빠른 표시용 비정규화), `updatedAt`. **`nextRunAt` 미저장** — croner 로 매번 계산.

**`random_crawl_runs`** — `id`(cuid; runScheduled 는 레지스트리 runId 를 그대로 PK 로 씀), `trigger`, `status`, `regionLabel`/`keyword`, `candidatesJson`(`RandomCrawlCandidate[]`), `selectedPlaceId`/`crawledRestaurantId`, **`telegramChatId`/`telegramMessageId`**(콜백이 chatId+messageId 로 이 행을 찾는다 — 메모리만으로는 재시작에 약함), **`expiresAt`**(awaiting 만료 → sweep 이 닫는다), `error`, `startedAt`/`finishedAt`. `@@index([status])`(active/sweep 판별) + `@@index([startedAt])`(이력 정렬).

상수: `RUN_HISTORY_LIMIT = 50`, `SEARCH_PAGE_SIZE = 50`, `SWEEP_INTERVAL_MS = 60_000`, `CRAWL_PROGRESS_THROTTLE_MS = 4000`.

### 지역 데이터 번들

[`data/regions.json`](../../apps/friendly/src/modules/random-crawl/data/regions.json) 은 [`scripts/build-regions.mjs`](../../apps/friendly/scripts/build-regions.mjs) 로 생성한다(두 공개 gist/GeoJSON 을 fetch → 시군구 좌표 + 동 이름 조인 → `{ sido, sigungu, lat, lng, dongs[] }` 배열). 시/구는 **실좌표**로 검색하고, 동은 좌표가 없어 **검색어에 이름을 결합**한다(예: `역삼동 맛집` + 강남구 중심좌표). `region.ts` 가 이 JSON 을 **정적 import**(`with { type: 'json' }`)로 가져온다 — tsup/esbuild 가 번들에 인라인해야 운영(`node dist/server.js`)에서 빈 배열이 안 된다([`947d2d2`] 운영 빈 트리 fix). 세종처럼 좌표 소스에 없는 시도는 fallback 좌표로 보강, 시군구 개명(인천 남구→미추홀구)은 alias 로 매칭.

## Key Decisions [coverage: high — 8 sources]

- **2026-10-05: 크롤은 앱 싱글톤 `app.crawl` 을 쓴다 — 플러그인이 의존 서비스를 자체 조립하지 않는다** (`ab7dad28`) — 예전 자체 조립은 "autoload 순서에 의존하지 않게" 였지만, 그 대가로 요약·enrich·군집화 체인과 actor 대기열이 앱 싱글톤과 갈라졌다(perf-2 A-3). 이제 `dependencies` 에 `'crawl'` 을 선언해 순서는 fastify-plugin 이 보장한다. 이 사례는 [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 에 2026-10-05 로 기록됐다.
- **2026-10-05: 선택 크롤 대기에 60분 상한, 넘으면 크롤을 취소하고 회차를 실패로** — 끝나지 않는 크롤 하나가 회차를 `crawling` 으로 묶으면 overlap 가드가 모든 다음 회차를 막는다. 리뷰 100페이지 크롤(~15분)을 넉넉히 덮는 값(코드 주석). 취소까지 하는 이유는 대기열에 남은 크롤이 나중에 좀비로 시작되지 않게.
- **신규 도메인(2026-06).** `crawl` 의 수동 등록 앞단을 cron 자동 발굴로 채운다([`00e5293`]). 같은 라운드에 텔레그램 역방향 트리거([`65cf8b3`]), timeout action([`017e9ca`]), 지역 데이터 번들 인라인([`947d2d2`]), `/stats` 지역 선택 발굴([`a743248`])이 이어짐.
- **schedule 과 인프라 공유, 모듈 분리.** 같은 croner `scheduleRegistry` 를 `jobType` 만 다르게 쓰되, 파이프라인이 다르고(검색→텔레그램→크롤) 실행이 **텔레그램 응답을 기다리는 비동기 상태머신**이라 별도 모듈/모델/registry 로 둔다.
- **사람이 한 번 끼는 상태머신.** 검색→후보전송은 자동, 등록 가게 선택은 텔레그램 응답 대기(`awaiting_selection`). 발굴 단계와 크롤 단계를 **별개 lifecycle 로 분리** — 발굴은 후보 전송 시점에 `done`, 크롤은 콜백이 독립 진행(자체 oplog run).
- **DB 가 진실의 원천, 레지스트리는 보조.** overlap 가드·선택 매칭·만료를 모두 DB 로 영속해 재시작에 강하게. 레지스트리는 live SSE + 같은 프로세스 경쟁 차단만. 부팅 시 `awaiting_selection` 은 살리고 `running`/`crawling` 만 `interrupted`.
- **다진입점 단일 경로.** cron/manual/telegram/search 가 `runScheduled(trigger, override)` 하나로 수렴 — override 로 지역·검색어만 갈아끼운다.
- **타임아웃 = skip(기본) | random.** 무응답 시 회차를 그냥 닫거나 후보 랜덤 자동 크롤. 단 `/search`(수동 의도)는 random 이어도 자동 크롤하지 않고 만료시킨다.
- **지역 데이터는 번들 인라인.** fs 런타임 읽기가 아니라 정적 import — dist 빈 배열 운영 버그를 막는다([region.ts](../../apps/friendly/src/modules/random-crawl/region.ts) 주석).

## Gotchas [coverage: high — 7 sources]

- **크롤 60분 초과는 "failed" 로 남지만 원인은 대기일 수도 있다** (2026-10-05) — 상한은 대기열 시간을 포함한다. 다만 actor `system:random-crawl` 은 어드민 슬롯과 따로라 보통은 실제 크롤이 멈춘 경우다(네이버 응답 정지 등). 이력의 error 가 "크롤이 60분 안에 끝나지 않아 취소했습니다." 면 [crawl](crawl.md) 작업 로그부터 본다.
- **2026-10-05 이전에 이 경로로 등록한 가게는 군집이 비어 있을 수 있다** — 예전 플러그인 전용 `ReviewSearchService` 는 enrich 완료 → 군집화 배선이 없어, 재시작(기동 리컨실 — `scheduleStartupReconcile`) 전까지 군집이 '대기' 였다. 배포 뒤 기동 리컨실이 백로그를 한 번 훑으므로 보통은 저절로 채워진다([review-clustering](review-clustering.md)).
- **cron 미리보기는 저장된 설정이 와야 뜬다** (2026-10-05 `e50ccfe6`) — 설정 조회가 느리면 미리보기 칸이 "불러오는 중" 으로 남고, 조회가 실패해야 기본값(`0 12 * * *`)으로 보여 준다. 직접 입력 중에는 300ms 멈출 때까지 이전 결과를 숨긴다(다른 식의 결과를 지금 식의 것처럼 보이지 않게).

- **`responseTimeoutMin` DB default(180) ≠ 앱 기본값(30).** `getConfig` 는 행 없을 때 앱 상수 `DEFAULT_TIMEOUT_MIN = 30` 으로 폴백하고 `updateConfig` 는 항상 값을 지정하므로 DB default 180 은 실사용되지 않는다. 컬럼 default 변경이 SQLite 테이블 재생성을 유발해 일부러 180 유지(스키마 주석).
- **`data/regions.json` 은 정적 import 필수.** fs 로 읽으면 tsup 번들이 dist 에 JSON 을 안 넣어 운영에서 빈 배열 → 모든 회차 "지역 데이터 없음" skip. `with { type: 'json' }` import 로 인라인([`947d2d2`] 이전 운영 버그).
- **atomic claim 으로 콜백·sweep 경쟁 차단.** `crawlChosenCandidate` 는 `updateMany({ status: 'awaiting_selection' } → 'crawling')` 의 `count === 0` 으로 이미 처리된 회차를 no-op. 수동 선택과 타임아웃 자동선택이 동시에 같은 후보를 잡지 않게.
- **진행 편집 vs 최종 메시지 경쟁.** `streamCrawlProgress` 는 throttle(4초) + 직전과 동일 텍스트 skip(텔레그램 "not modified" 회피) + `pending` 체인으로 순서 보장. 정지 함수는 in-flight 편집까지 await 해야 늦게 도착한 "수집 중" 편집이 최종 🎉/⚠️ 메시지를 덮는 경쟁(stuck)이 없다.
- **완료 핑은 편집이 아니라 새 메시지.** 텔레그램 편집은 알림을 안 울리므로, 진행 카드는 조용히 최종 상태로 정리하고 완료/실패는 `notify` 로 별도 새 메시지를 보내 핑이 울리게 한다.
- **`/search` 는 좌표 없이 검색.** 검색어가 영역을 결정하므로 어댑터 default center 를 쓴다(`coord: undefined`). 지역 발굴과 달리 검색 헤더 + "이름 누르면 지도 확인" 안내 카드.
- **텔레그램 staleness 60초.** 재시작 후 텔레그램이 재전송하는 옛 메시지가 새 회차를 트리거하지 않게 60초 넘은 텍스트는 무시(콜백은 awaiting 복구용이라 제외).
- **`telegramConfigured=false` 면 enabled 여도 skip.** 봇 미설정이면 후보를 보낼 곳이 없어 회차가 자동 skip. UI 가 경고 배너를 노출.

## Sources [coverage: high — 28 sources]

- [`apps/friendly/src/plugins/crawl.ts`](../../apps/friendly/src/plugins/crawl.ts) — 신규 2026-10-05 `app.crawl` 싱글톤(이 플러그인의 의존)
- [`apps/friendly/src/modules/crawl/job-registry.ts`](../../apps/friendly/src/modules/crawl/job-registry.ts) — 2026-10-05 `waitForTerminal`(종료 대기 상한)·공유 대기열
- [`apps/friendly/src/plugins/summaries.ts`](../../apps/friendly/src/plugins/summaries.ts) — 요약·enrich·군집화 앱 싱글톤(이제 이 경로도 탄다)
- [`apps/web/src/routes/admin/useDebouncedDraft.ts`](../../apps/web/src/routes/admin/useDebouncedDraft.ts) — 신규 2026-10-05 초안/적용값 디바운스 훅(cron 미리보기)
- [`apps/web/src/routes/admin/RandomCrawlSection.test.tsx`](../../apps/web/src/routes/admin/RandomCrawlSection.test.tsx) — 신규 2026-10-05 미리보기 요청 4건
- [`apps/web/src/test/useRandomCrawlRunEvents.test.tsx`](../../apps/web/src/test/useRandomCrawlRunEvents.test.tsx) — 신규 2026-10-05 종료 무효화 범위 2건
- [`apps/web/src/routes/admin/AdminAnalyticsPage.tsx`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) — 카드를 품은 메뉴 정규화 화면(2026-10-05 `c5052742` `memo` 래핑)
- [`apps/friendly/src/modules/ai/llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) — `buildLlmProviderEnv()` 플러그인 env 조립(2026-08-22 — 2026-10-05 부터 이 플러그인은 쓰지 않음)
- [`apps/friendly/src/modules/random-crawl/random-crawl.service.ts`](../../apps/friendly/src/modules/random-crawl/random-crawl.service.ts) — 발굴 파이프라인 + 텔레그램 상태머신(2026-10-05 — `waitForTerminal` 60분·초과 시 취소)
- [`apps/friendly/src/modules/random-crawl/random-crawl-registry.ts`](../../apps/friendly/src/modules/random-crawl/random-crawl-registry.ts) — 동시 1개 ActiveRun + SSE singleton
- [`apps/friendly/src/modules/random-crawl/random-crawl.route.ts`](../../apps/friendly/src/modules/random-crawl/random-crawl.route.ts) — HTTP/SSE 레이어
- [`apps/friendly/src/modules/random-crawl/region.ts`](../../apps/friendly/src/modules/random-crawl/region.ts) — RegionStore + 번들 JSON 인라인
- [`apps/friendly/src/modules/random-crawl/region.test.ts`](../../apps/friendly/src/modules/random-crawl/region.test.ts) — RegionStore resolve/tree/dongs 단위 테스트
- [`apps/friendly/src/modules/random-crawl/discover-command.test.ts`](../../apps/friendly/src/modules/random-crawl/discover-command.test.ts) — `isDiscoverCommand`/`parseSearchCommand` 파서 테스트
- [`apps/friendly/src/modules/random-crawl/data/regions.json`](../../apps/friendly/src/modules/random-crawl/data/regions.json) — 전국 시군구 좌표 + 동 이름 번들
- [`apps/friendly/src/plugins/random-crawl.ts`](../../apps/friendly/src/plugins/random-crawl.ts) — fastify-plugin decorate (2026-08-22 — `buildLlmProviderEnv()`; 2026-10-05 — 자체 조립 제거, 의존 `crawl`, `app.crawl`)
- [`apps/friendly/scripts/build-regions.mjs`](../../apps/friendly/scripts/build-regions.mjs) — regions.json 생성 스크립트
- [`apps/friendly/src/server.ts`](../../apps/friendly/src/server.ts) — bootstrap(고아 정리 + cron + 폴링 + sweep)
- [`packages/api-contract/src/schemas/random-crawl.ts`](../../packages/api-contract/src/schemas/random-crawl.ts) — zod 스키마
- [`packages/api-contract/src/routes.ts`](../../packages/api-contract/src/routes.ts) — `Routes.RandomCrawl`
- [`packages/shared/src/api/randomCrawl.api.ts`](../../packages/shared/src/api/randomCrawl.api.ts) — API 클라이언트 + SSE URL
- [`packages/shared/src/hooks/useRandomCrawl.ts`](../../packages/shared/src/hooks/useRandomCrawl.ts) — React Query + SSE 훅(2026-10-05 — 종료 무효화 키 수정)
- [`apps/web/src/routes/admin/RandomCrawlSection.tsx`](../../apps/web/src/routes/admin/RandomCrawlSection.tsx) — 어드민 자동 발굴 UI(2026-10-05 — cron 미리보기 디바운스·설정 동기화 뒤 요청)
- [`apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql`](../../apps/friendly/prisma/migrations/20260619075115_add_random_crawl/migration.sql) — 테이블 생성
- [`apps/friendly/prisma/migrations/20260619235551_add_random_crawl_timeout_action/migration.sql`](../../apps/friendly/prisma/migrations/20260619235551_add_random_crawl_timeout_action/migration.sql) — timeoutAction 추가
- [`apps/friendly/prisma/schema.prisma`](../../apps/friendly/prisma/schema.prisma) — `RandomCrawlConfig`/`RandomCrawlRun` 모델
- [`apps/friendly/src/modules/telegram/telegram.service.ts`](../../apps/friendly/src/modules/telegram/telegram.service.ts) — 후보 push / 콜백·커맨드 수신 인터페이스
- [`apps/friendly/src/modules/restaurant/region-stats-telegram.ts`](../../apps/friendly/src/modules/restaurant/region-stats-telegram.ts) — `/stats` 통계 + 지역 선택 발굴 진입

관련 컨셉: [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)(2026-10-05 app.crawl 사례) · [sse-token-auth](../concepts/sse-token-auth.md) · [zod-ssot-buildless](../concepts/zod-ssot-buildless.md)
