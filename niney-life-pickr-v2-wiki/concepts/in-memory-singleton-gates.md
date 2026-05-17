---
concept: 외부 큐 없는 모듈 싱글턴 동시성 게이트
last_compiled: 2026-05-17
topics_connected: [ai, crawl, friendly, shared, menu-grouping, analytics, canonical, auto-discover]
status: active
---

# 외부 큐 없는 모듈 싱글턴 동시성 게이트

## Pattern

이 모노레포는 동시성 제어가 필요한 모든 곳에서 **모듈 스코프 싱글턴 + 인메모리 FIFO**를 쓴다. Redis도, BullMQ도, 외부 브로커도 없다. CLAUDE.md의 "Redis 사용 금지" 규칙을 자연스럽게 만족시키는 동시에, 같은 모양의 구조가 4가지 다른 도메인에 박혀 있다 — AI 호출 cap, 크롤 잡 큐, 잡 내부 batch persist 직렬화, 클라이언트 SSE connection 통합. 패턴은 항상 같다: 모듈 스코프 변수 하나가 모든 호출자가 공유하는 게이트가 되고, 그 게이트는 **순서 보장 + slot 회계** 두 가지만 책임진다. 영속화는 안 한다 (재시작 시 in-flight는 어차피 못 살림).

## Instances

- **2026-05-07** in [[../topics/ai]] (`adapter-cache.ts`): `maxConcurrent` (기본 15) FIFO 게이트. AI provider 호출이 cap을 넘으면 큐에 대기, 한 콜이 끝나면 다음을 깨운다. ai 라우트 + summary 서비스가 같은 인스턴스를 import해 진짜 cap이 됨 (둘이 따로 만들면 2× cap이 되어버림).
- **2026-05-07** in [[../topics/crawl]] (`job-registry.ts` + `crawl.service.ts`): 두 층의 게이트가 결합. (1) `JobRegistry`가 actor당 active 잡을 3개로 제한하고 `phase: 'queued' | 'active' | 'finished'` 모델로 회계. (2) `CrawlService.pending: PendingStart[]`가 over-cap 요청을 FIFO로 받아두고, `runJob.finally(() => flushQueue(actorId))`가 슬롯이 비는 즉시 다음 잡을 깨움. 외부 큐 없이 "추가 버튼을 빨리 4번 눌러도 4번째가 자동으로 대기→시작"이 성립.
- **2026-05-07** in [[../topics/crawl]] (`crawl.service.ts` `runJob`): 같은 잡 내부에서도 같은 패턴 — `persistTail: Promise<void>` 체인. 어댑터의 `onVisitorBatch` 콜백이 `persistTail = persistTail.then(...)`로 다음 batch persist를 직렬 큐에 추가만 하고 await하지 않아 다음 페이지 클릭이 막히지 않음. 잡 끝에서 `await persistTail`로 모든 batch가 정착했음을 보장.
- **2026-05-07** in [[../topics/friendly]] (`summary-events-bus.ts`): 모듈 싱글턴 fan-out 버스. placeId별 listener Set을 가지고 `progress` / `review` 신호를 fan-out. AI 게이트(adapter-cache)와 함께 summary 서비스의 핵심 동시성 인프라.
- **2026-05-07** in [[../topics/shared]] (`summarySseManager.ts`): 클라이언트 사이드에 같은 패턴 적용. 프로세스 스코프 싱글턴이 EventSource 1개만 유지하면서 N개 컴포넌트의 placeId 구독을 refcount로 회계. microtask coalescing으로 구독 set 변경을 한 번의 reconnect으로 모음. HTTP/1.1 6-per-origin SSE 한계를 우회하는 방식.
- **2026-05-08** in [[../topics/friendly]] (`summary.service.ts`): placeId별 run() Promise 체인 도입 — 크롤러가 페이지마다 띄우는 fire-and-forget run()들이 동시에 진행되며 각자 chunk를 'running'으로 마킹해 DB 상태가 의미를 잃던 문제를 해결. `persistTail`과 정확히 같은 모양 (모듈 스코프 Map<placeId, Promise<void>>가 다음 run을 앞 run의 .finally 뒤로 큐잉). 다른 placeId는 그대로 병렬 — slot 회계 단위가 placeId임을 명시.
- **2026-05-08** in [[../topics/ai]] (`adapters/ollama-cloud.adapter.ts`): "too many concurrent requests" / 429 응답을 어댑터 내부에서 지수 백오프(200·400·800ms+jitter) 최대 3회로 자동 재시도. **슬롯을 잡은 채** 재시도하므로 외부 cap 게이트(`adapter-cache.maxConcurrent`)에서 보면 재시도 중이어도 한 슬롯만 점유 — 회복이 cap 회계를 절대 깨지 않음. "slot 보유 중 재시도"가 외부 게이트와 내부 회복을 분리하는 핵심.
- **2026-05-09** in [[../topics/menu-grouping]] (`grouping-job-registry.ts`): `groupingJobRegistry` 모듈 싱글턴이 batch 메뉴 그룹핑 잡 상태(item 단위 pending/running/done/failed/skipped)와 subscribers Set, per-job AbortController를 함께 관리. TTL 10분 GC. **actorId 격리** — 자기 actor의 잡만 조회/구독 가능. 외부 큐 없이 in-memory만으로 SSE 구독자 fan-out + 잡 단위 cancel + per-place 직렬 보장을 동시에 제공. 회계 단위가 actor라는 점에서 `JobRegistry`(crawl)와 같은 모양.
- **2026-05-09** in [[../topics/analytics]] (`global-merge-job-registry.ts`): `globalMergeJobRegistry` 모듈 싱글턴. 위 grouping과 달리 **동시 1개만** 보장 — `inflightJobId()` 가드로 라우트가 진행 중일 때 새 요청을 받으면 409 + 현재 snapshot을 응답. chunk 단위로 진행 + done event publish. TTL 10분 GC. 단일-잡 모델은 grouping과 다른 점이지만 구조(모듈 스코프 + Map/Set + subscriber fan-out + TTL)는 동일.
- **2026-05-15** in [[../topics/crawl]] (`diningcode-bulk-save-registry.ts`): 다이닝코드 일괄 저장 잡 레지스트리. `groupingJobRegistry` 와 동형 — 모듈 싱글턴 + Map/Set 회계 + per-job AbortController + subscriber fan-out + TTL 10분 GC + actorId 격리. 차이점은 (a) per-actor **단일 잡** 정책 (한 어드민이 동시 일괄 저장 1개 — 다이닝코드 부담 의식) (b) item state 가 `pending|running|done|failed|skipped` 로 menu-grouping과 같은 다섯 단계. 8번째 인스턴스 — 새 도메인이 추가될 때마다 이 패턴이 "디폴트 디자인" 으로 채택되고 있음을 확인.
- **2026-05-17** in [[../topics/auto-discover]] (`auto-discover-registry.ts` + `auto-discover.service.ts`): 9 번째 인스턴스. 모듈 싱글턴 `autoDiscoverRegistry` + per-job AbortController + subscriber fan-out + TTL 10 분 GC — `groupingJobRegistry`/`diningcodeBulkSaveRegistry` 와 동형. 차이점은 **상태가 두 갈래** (keywords Map + candidates Map) 라 `upsertKeyword`/`upsertCandidate` 두 publish 채널을 가짐 + `phase` enum (queued/generating_keywords/searching/crawling/done) 이 잡 state 와 분리됨. per-actor **단일 잡** 정책 (`findInFlightByActor` → 두 번째 POST 는 409) — AI+검색+크롤 동시 부담 의식. **`MAX_CONCURRENT_PER_ACTOR` 3 → 5** (`crawl/job-registry.ts`) 도 같은 라운드 — 자동 발견 그룹 크기 5 와 액터 슬롯을 일치시켜 한 그룹이 통째로 동시 진입 가능하게. 게이트 cap 자체가 컨슈머 디자인(그룹 크기)에 맞춰 조정된 첫 사례.
- **2026-05-17** in [[../topics/friendly]] (`summary.service.ts:cleanupStaleReviewSummaries` + `server.ts` boot hook): 게이트의 **재시작 회복** 패치 — in-memory 게이트가 process exit 으로 사라지면 DB rows 가 'pending'/'running' 으로 남아 다음 큐가 못 잡는다. 부팅 직후 stale 행을 `status='failed' errorCode='server_restart'` 로 마킹 → 기존 재요약 경로가 다시 살려냄. "다중 인스턴스 = 외부 큐 필요" 라는 한계를 미루는 한 가지 패치 — 단일 인스턴스 가정은 유지하되 재시작 후 자동 청소로 운영 부담을 줄임. 같은 모양이 다른 잡 도메인 (menu-grouping, diningcode-bulk-save, auto-discover) 으로 번질 후보.
- **2026-05-09** in [[../topics/crawl]] (`crawl.service.ts` actor rate-limit 제거): 게이트가 **추가**된 게 아니라 **잘못된 게이트가 제거**된 케이스 — 학습 인스턴스. 기존 `RATE_LIMIT_WINDOW_MS=1_000` (이후 50ms 로 시도) + `lastCallByActor: Map` 윈도우 기반 rate-limit 이 어드민 발견 페이지의 다중 시작(N개 체크 → 한 번에 N개 startCrawl) 패턴과 충돌. 응답이 수 ms 안에 떨어지는 환경에서 어떤 윈도우 길이여도 직렬 await 호출조차 둘째부터 차단되어 1개만 진행되던 버그. spam 방어는 이미 두 layer (`findInFlightByPlace` in-flight dedup + `MAX_CONCURRENT_PER_ACTOR=3` + FIFO 큐) 가 있었음 — 윈도우 기반 rate-limit 은 redundant + actively harmful. 모듈 싱글턴 게이트가 충분히 spam 방어하면 보조 윈도우는 제거가 옳다.

## What This Means

이 패턴이 알려주는 것:

1. **외부 큐는 필요해질 때까지 미루는 게 옳다** — 단일 인스턴스에서 in-memory 싱글턴 하나면 충분한 시나리오에 Redis/BullMQ를 깔면, 운영 복잡도(별도 프로세스, 헬스체크, persistence 모드 결정, OOM 보호)가 따라붙는다. 이 코드베이스는 그 지점을 명시적으로 미뤘고, 그 결정이 4개 도메인의 일관성을 만든다. 다중 인스턴스가 필요해지는 시점이 바로 외부 큐로 옮길 시점.
2. **slot 회계와 순서 보장의 분리** — 게이트는 두 가지만 책임진다. JobRegistry는 phase로 slot 회계, CrawlService.pending이 순서 보장. summary bus는 listener Set으로 회계 + 호출 순서로 순서. 한 객체가 둘 다 하면 책임이 섞이고 단위 테스트가 어려워진다.
3. **fire-and-forget + finally 깨우기 = 자동 dequeue** — `runJob.finally(() => flushQueue(actorId))` 한 줄로 잡 종료가 다음 잡 시작을 트리거. 명시적 워커 루프가 없어도 동작. 같은 패턴이 `persistTail`에도 — `then(...)` 체인이 자동으로 다음 batch를 깨운다.
4. **클라이언트 사이드도 같은 패턴이 통한다** — `summarySseManager`는 인프라가 다를 뿐 모양이 똑같음 (refcount + reconnect coalescing). 동시성 자원이 "AI provider slot"이든 "브라우저 connection slot"이든, 같은 in-memory FIFO 싱글턴으로 풀린다.
5. **이번 라운드(2026-05-09)에 패턴이 6개 인스턴스로 굳어짐** — (1) AI 동시성 cap 게이트(`adapter-cache`), (2) 크롤 job-registry + pending FIFO, (3) summary `persistTail` / per-placeId run 체인, (4) summary SSE 매니저(서버 fan-out + 클라 refcount), (5) 메뉴 그룹핑 batch jobs(`groupingJobRegistry`, multi-job + actor 격리), (6) 글로벌 머지 inflight 가드(`globalMergeJobRegistry`, single-job + 409 snapshot). 모두 같은 모양 — 모듈 스코프 싱글턴 + Map/Set 회계 + TTL GC + (해당되면) actorId 격리. Redis/외부 큐 없이 단일 인스턴스 가정 위에서 충분히 동작하지만, **다중 인스턴스 배포로 가는 순간 가장 먼저 깨지는 가지**가 바로 이 패턴이다 — cross-process에서는 cap도 dedupe도 inflight 가드도 의미가 없어지므로.
6. **윈도우 기반 rate-limit 은 게이트와 충돌한다** (2026-05-09 follow-up) — `RATE_LIMIT_WINDOW_MS` 같은 시간 윈도우 검사를 게이트 옆에 같이 두면, 정상 사용 패턴이 "다중 시작" 일 때 둘째부터 차단되는 사고가 일어난다. 응답이 수 ms 안에 떨어지면 직렬 await 도 윈도우 안에 들어가고, 윈도우를 줄여도 (1초 → 50ms) 동일. 게이트가 (a) 같은 키 중복(`findInFlightByPlace`)과 (b) 시스템 전체 폭주(`max_concurrent` 큐) 두 layer 로 spam 방어를 끝내고 있으면, 시간 윈도우는 잘못된 보조 — 정상 사용을 깨뜨리는 데 더 가깝다. **게이트가 충분히 spam 방어하면 윈도우는 빼라**.

이 패턴이 깨질 수 있는 시점:
- **다중 Fastify 인스턴스로 스케일 아웃** — 모듈 싱글턴은 프로세스 안에서만 의미. 여러 인스턴스가 같은 placeId 잡을 돌리면 dedupe도 cap도 cross-process에서 안 통함. 그 시점이 진짜 외부 큐가 필요한 시점.
- **사이드 이펙트가 있는 라이브러리 import** — 모듈 싱글턴은 import 한 번만 되면 인스턴스 1개. 그런데 jest/vitest의 모듈 분리, esm/cjs dual 빌드, 동일 패키지 두 개의 다른 버전 설치(워크스페이스에서) 같은 시나리오에서 두 인스턴스가 생길 수 있음. `pnpm dedupe`로 보호.
- **재시작 영속성이 필요해질 때** — in-memory 게이트는 process exit과 함께 사라짐. 잡 큐를 살리고 싶다면 SQLite outbox 같은 영속 큐로 바꿔야 함. 현재는 의도적으로 안 함 (Playwright 브라우저가 어차피 죽으므로).

## Sources

- [[../topics/ai]]
- [[../topics/crawl]]
- [[../topics/friendly]]
- [[../topics/shared]]
- [[../topics/menu-grouping]]
- [[../topics/analytics]]
- [[../topics/canonical]]
- [[../topics/auto-discover]]
