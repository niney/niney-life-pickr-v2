---
concept: SSE의 ?token= 쿼리 인증 + 로거 리덕션
last_compiled: 2026-08-30
topics_connected: [friendly, crawl, shared, web, menu-grouping, analytics, auto-discover, schedule, review-search, random-crawl, ai, food, meal]
status: active
---

# SSE의 `?token=` 쿼리 인증 + 로거 리덕션

## Pattern

브라우저 `EventSource` API는 커스텀 헤더를 보낼 수 없다. 그래서 JWT 인증이 걸린 SSE 엔드포인트는 토큰을 **쿼리 스트링**으로 받는다 (`?token=...`). 그러면 그 토큰이 모든 요청 로그에 평문으로 남게 되는데, 이 모노레포는 Pino logger의 `req` serializer에서 `?token=...`을 정규식으로 `[REDACTED]`로 치환해 둔다. 이 한 쌍의 결정 — 보안적 양보(쿼리에 토큰) + 보안적 보강(로거 리덕션) — 이 4개 토픽에 일관되게 박혀 있다.

## Instances

- **2026-05-07** in [[../topics/friendly]] (`app.ts`): Pino `serializers.req`에서 `req.url.replace(/([?&]token=)[^&]+/i, '$1[REDACTED]')`. 이게 없으면 모든 SSE 요청 로그에 JWT가 남는다.
- **2026-05-07** in [[../topics/crawl]] (`crawl.route.ts`): `GET /api/v1/crawl/jobs/:id/events` SSE 엔드포인트가 `Authorization` 헤더 또는 `?token=` 쿼리 둘 다 받는다 — `EventSource` 클라이언트를 위해 후자가 필요.
- **2026-05-07** in [[../topics/shared]] (`useCrawlJobStream` / `crawl.api.ts`): SSE URL을 만들 때 `getToken()`으로 가져온 JWT를 쿼리에 붙인다. `EventSource`로 감싼 후 `seq` 기반 dedupe 리듀서로 진행 이벤트 처리.
- **2026-05-07** in [[../topics/web]] (`AdminCrawlTestPage`): EventSource 한계 때문에 SSE 호출만 `?token=` 패턴 사용. 일반 fetch는 `Authorization: Bearer` 헤더 그대로.
- **2026-05-07** in [[../topics/friendly]] (`restaurant.route.ts` 멀티플렉싱 `summaryEvents`): 같은 패턴이 새 다중 placeId SSE 엔드포인트에도 그대로 — `?placeId=A&placeId=B&...&token=<jwt>` 형태로 토큰 + 다중 구독 placeId가 한 쿼리에 실린다. 클라의 `buildSummaryEventsUrl(placeIds: string[])`이 같은 정규식이 redact 가능한 형태로 URL을 만든다.
- **2026-05-09** in [[../topics/menu-grouping]] (`menu-grouping.route.ts` `Routes.Analytics.groupingJobEvents(jobId)`): batch 메뉴 그룹핑 잡 진행 SSE. 동일 패턴 — `await req.jwtVerify()` 시도 → 실패 시 `query.token` 으로 fallback → `app.jwt.verify(token)` → userId/role 추출 → `role !== 'ADMIN'` 이면 401. shared 의 `buildGroupingJobEventsUrl(jobId)` 가 URL 빌더. Pino redact 정규식이 `?token=...` 그대로 마스킹.
- **2026-05-09** in [[../topics/analytics]] (`analytics.route.ts` `Routes.Analytics.globalMergeJobEvents(jobId)`): 전역 머지 잡 진행 SSE. 같은 헤더→쿼리 fallback + ADMIN 게이트 + redact 패턴. shared 의 `buildGlobalMergeJobEventsUrl(jobId)` 빌더. 새 잡 단위 SSE 가 추가될 때마다 같은 토큰 패턴이 자연스럽게 흡수됨.
- **2026-05-15** in [[../topics/crawl]] (`crawl.route.ts` `Routes.Crawl.diningcodeBulkSaveJobEvents(jobId)`): 다이닝코드 일괄 저장 잡 진행 SSE. 어드민 정식 페이지가 N개 vRid 선택 후 한 번에 저장하는 패턴. 같은 헤더→`?token=` fallback + ADMIN 게이트. shared 의 `buildDiningcodeBulkSaveEventsUrl(jobId)` 빌더 — `useGroupingJob` 의 빌더와 동형. 일곱 번째 SSE 엔드포인트 — 패턴이 어떤 도메인이든 그대로 흡수된다는 것을 다시 확인.
- **2026-05-17** in [[../topics/auto-discover]] (`auto-discover.route.ts` `Routes.AutoDiscover.jobEvents(jobId)`): 자동 발견 잡 진행 SSE. 같은 헤더→`?token=` fallback + ADMIN 게이트 + Pino redact. shared 의 `buildAutoDiscoverEventsUrl(jobId)` 빌더 — bulk-save·grouping 의 빌더와 동형. 8 번째 SSE 엔드포인트. 차이점은 **이벤트 종류가 5개** (snapshot/keyword/candidate/phase/done) 라 기존 SSE 들의 1-2개보다 많지만 인증·redact 패턴은 동일.
- **2026-06**(17차) in [[../topics/schedule]] (`schedule.route.ts` `Routes.Schedule.runEvents`): 주기 스케줄러 진행 SSE — **9 번째 SSE 엔드포인트**. 같은 헤더→`?token=` fallback 패턴: `await req.jwtVerify()` 시도 → 실패 시 `query.token` 으로 `app.jwt.verify(token)` → role 추출 → `role !== 'ADMIN'` 이면 401. shared 의 `buildScheduleRunEventsUrl()` 빌더(`useSchedule.ts`) — jobId 없이 시스템 전역 단일 run 이라 빌더가 인자 0개(기존 빌더들이 `(jobId)` 받던 것과 다른 점). 같은 라운드의 **liveness 보강 흡수**: 15s 주기 `: hb` heartbeat comment + `heartbeat.unref?.()` — 2026-05-17 restaurant heartbeat 가 예고한 "다른 SSE 잡 훅으로 번질 후보" 가 실현됨. 추가로 **즉시 종료 패턴**: 초기 `snapshot` 이벤트 후 `runningRunId()` 가 null 이면(진행 중 run 없음) 더 흘릴 게 없어 `reply.raw.end()` — 단일-잡 게이트라 "지금 inflight 아니면 닫기" 가 자연스러움. Pino redact 정규식이 `?token=...` 그대로 마스킹.

- **2026-06**(18차) in [[../topics/review-search]] (`review-search.route.ts` enrich-events SSE): 리뷰 검색 enrich 진행 SSE — **10 번째 SSE 엔드포인트**. 같은 헤더→`?token=` fallback 인증: `EventSource` 클라가 쿼리에 JWT 를 실어 보내고 서버는 `req.jwtVerify()` 우선 → 실패 시 `query.token` fallback. 차이점은 단일 잡 진행이 아니라 **전체 enrich 멀티플렉스** — 한 SSE 채널이 진행 중인 enrich 들을 묶어 흘린다(2026-05-07 restaurant `summaryEvents` 멀티플렉싱과 같은 갈래). 15s heartbeat 로 liveness 유지. Pino redact 정규식이 `?token=...` 그대로 마스킹.
- **2026-06**(18차) in [[../topics/random-crawl]] (`random-crawl.route.ts` run-events SSE): 랜덤 크롤 run 진행 SSE — **11 번째 SSE 엔드포인트**. `schedule` 의 run-events 와 거의 복붙: `?token=` JWT fallback + 15s heartbeat + **진행 중 run 없으면 즉시 종료**(snapshot 후 inflight 아니면 `reply.raw.end()`). 시스템 전역 단일 run 게이트 모양도 schedule 과 동형. 같은 패턴이 또 한 도메인을 그대로 흡수.
- **2026-06**(18차) in [[../topics/ai]] (`ai` `telemetry/stream` SSE): LLM 텔레메트리 스트림 SSE — **12 번째 SSE 엔드포인트**. `?token=` 쿼리 fallback(jwtVerify 우선) + ADMIN 게이트 + Pino redact 동일. 차이점은 잡 진행이 아니라 **1초 코얼레싱**된 실시간 텔레메트리 push — `analytics`/`auto-discover` SSE 와 동형 구조이되 종료 이벤트 없는 상시 스트림. SSE 가 잡 진행을 넘어 운영 텔레메트리 채널로도 자연스럽게 확장됨.

- **2026-05-17** in [[../topics/friendly]] (`restaurant.route.ts` summary-events heartbeat + idle timeout): 같은 SSE 인프라에 **liveness 보강** 추가 — 서버 측 5 초 주기 heartbeat (named event `heartbeat`) + 클라이언트 측 idle timeout 감지로 서버 다운 시 자동 reconnect 트리거. 토큰 인증·redact 와 별개 layer 지만 같은 multiplexed `summaryEvents` 엔드포인트에 박힘. 향후 다른 SSE 잡 훅 (auto-discover, bulk-save, grouping) 으로 번질 후보.

- **2026-08-22**(food) in [[../topics/food]] / [[../topics/shared]] / [[../topics/web]] / [[../topics/friendly]] (`food.route.ts` `Routes.Food.importRunEvents` = `GET /api/v1/admin/food/import/run-events`): 음식 카탈로그 적재 run 진행 SSE — **13 번째 SSE 엔드포인트**(이 문서 계수 기준; 18차 이후 bus·subway·vote·air·weather·life-map 은 SSE 없음). random-crawl run-events 골격 복제: `: connected` 코멘트 → `snapshot`(`foodImportRegistry.snapshot()`) → 진행 중 run 없으면 `reply.raw.end()` 즉시 종료 → 있으면 `progress`/`done` named event + 15s `: hb` heartbeat(`unref`) + `req.raw.on('close')` cleanup. 차이점은 **인증을 라우트 안에서 손으로 쓰지 않고 `app.resolveSseAdmin(req)`(`plugins/jwt.ts`) 공용 데코레이터를 쓴다** — `req.jwtVerify()` 우선 → 실패 시 `query.token` 을 `app.jwt.verify` 까지는 기존 인라인 패턴과 같지만, 헬퍼는 추가로 `User.tokenVersion`(`tv`)과 role 을 DB 에서 재확인해 강제 로그아웃된 토큰·강등된 계정을 거른다. 이 헬퍼는 2026-07-13 보안 하드닝(`bc2db00`)에서 analytics/crawl 용으로 추출된 것이고, food 가 **처음부터 헬퍼 위에서 태어난 첫 신규 SSE**(`69dc0e2`); menu-grouping·auto-discover·schedule·review-search·random-crawl·ai telemetry·restaurant 7곳은 아직 인라인 jwtVerify→`query.token` 을 유지. 클라: shared `buildFoodImportRunEventsUrl()`(`food.api.ts`, schedule 처럼 인자 0개 — 시스템 전역 단일 run)이 `getToken()` 을 `?token=` 에 싣고, `useFoodImportRunEvents(enabled)`(`useFood.ts`)가 `EventSource` 를 열어 snapshot 이 running 이면 초기 progress 를 합성, `done` 에서 `['food','import','runs'|'config']`/`['food','admin']`/`['food','stats']` 4 키 invalidate, 끊기면 지수 백오프(최대 30s) 재접속. 웹 `AdminFoodPage` 는 `useFoodImportRunEvents(!!inflightRunId)` — 진행 중 run 이 있을 때만 연결. Pino redact 정규식(`app.ts`)이 `?token=` 그대로 마스킹. `food.route.test.ts` 가 토큰 없음 401 / `?token=` 200 `text/event-stream` / run 없으면 snapshot 후 종료를 고정. **[[../topics/meal]] 은 SSE 가 없다** — 인식(`POST /meals/recognize`)·추천은 동기 응답이고 사진은 Bearer fetch 뒤 object URL(웹)/파일 cache(앱)라 `?token=` 양보가 필요한 표면이 없다; 같은 라운드의 두 도메인 중 한쪽만 이 패턴에 들어온 것이 "SSE 는 오래 걸리는 잡에만" 원칙의 반증 없는 확인.

## What This Means

이 패턴이 알려주는 것:

1. **표준 API의 한계를 정직하게 받아들임** — `EventSource` 헤더 지원 안 됨이 결정의 출발점. 우회(`fetch` + ReadableStream으로 SSE 직접 구현)는 비용이 크고, 받아들이면 토큰 노출이 따라붙는다. 양쪽을 조합해 받아들이고 보강하는 쪽을 선택.
2. **로그가 보안 표면이라는 인지** — 토큰이 URL에 들어가는 순간 로그도 보안 자산이 된다. 리덕션을 빼먹으면 운영자/Pino 출력/Datadog 등 모든 곳에 JWT가 남음. 코드 리뷰 시 항상 `?token=` 패턴 등장 → 리덕션 적용 여부 동시 점검.
3. **양보의 범위를 좁힘** — `?token=`은 **SSE에만** 적용. 일반 REST는 `Authorization` 헤더 유지. 양보를 토큰 인증 전반으로 확대하지 않음.
4. **SSE 가 도메인의 일급 통신 수단으로 굳어짐** — 5번째(`groupingJobEvents`)·6번째(`globalMergeJobEvents`) 엔드포인트가 추가되며, "오래 걸리는 잡 = SSE 진행 스트림"이 이 모노레포의 기본 패턴이 됐다. 매번 새 SSE 가 같은 토큰 패턴 + 같은 ADMIN 게이트 + 같은 Pino redact 룰을 자연스럽게 흡수 — 새 룰이나 새 우회를 발명할 필요가 없다는 것이 패턴 정착의 신호.
5. **인증 분기가 헬퍼로 승격되며 검증이 두꺼워졌다** (2026-07 하드닝 → 2026-08 food) — `resolveSseAdmin` 은 헤더→쿼리 fallback 위에 `tokenVersion`·role DB 재확인을 얹는다. 인라인 복사본 7곳은 이 강화가 자동으로 따라가지 않으므로, 새 SSE 는 헬퍼를 쓰고(food 가 첫 사례) 기존 인라인은 이관 후보다 — `?token=` 양보의 위험을 줄이는 두 번째 보강이 리덕션 옆에 생긴 셈.

이 패턴이 깨질 수 있는 위험:
- 새 SSE 엔드포인트 추가 시 리덕션 정규식 패턴이 바뀌면 누락 가능 (현재는 `?token=` / `&token=` 모두 커버하지만 다른 키 이름이면 새로 패턴 추가 필요)
- 토큰이 매우 짧은 만료시간이라면 위험이 줄지만 현재 JWT 만료는 7일 — 로그 수명보다 길 가능성이 높아 리덕션이 필수
- WebSocket으로 마이그레이션하면 `Sec-WebSocket-Protocol` 헤더 트릭 등 다른 우회로 옮겨지면서 또 비슷한 보안 보강이 필요해진다

## Sources

- [[../topics/friendly]]
- [[../topics/crawl]]
- [[../topics/shared]]
- [[../topics/web]]
- [[../topics/menu-grouping]]
- [[../topics/analytics]]
- [[../topics/auto-discover]]
- [[../topics/schedule]]
- [[../topics/review-search]]
- [[../topics/random-crawl]]
- [[../topics/ai]]
- [[../topics/food]]
- [[../topics/meal]]
