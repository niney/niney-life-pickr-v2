---
concept: 외부 큐 없는 모듈 싱글턴 동시성 게이트
last_compiled: 2026-05-07
topics_connected: [ai, crawl, friendly, shared]
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

## What This Means

이 패턴이 알려주는 것:

1. **외부 큐는 필요해질 때까지 미루는 게 옳다** — 단일 인스턴스에서 in-memory 싱글턴 하나면 충분한 시나리오에 Redis/BullMQ를 깔면, 운영 복잡도(별도 프로세스, 헬스체크, persistence 모드 결정, OOM 보호)가 따라붙는다. 이 코드베이스는 그 지점을 명시적으로 미뤘고, 그 결정이 4개 도메인의 일관성을 만든다. 다중 인스턴스가 필요해지는 시점이 바로 외부 큐로 옮길 시점.
2. **slot 회계와 순서 보장의 분리** — 게이트는 두 가지만 책임진다. JobRegistry는 phase로 slot 회계, CrawlService.pending이 순서 보장. summary bus는 listener Set으로 회계 + 호출 순서로 순서. 한 객체가 둘 다 하면 책임이 섞이고 단위 테스트가 어려워진다.
3. **fire-and-forget + finally 깨우기 = 자동 dequeue** — `runJob.finally(() => flushQueue(actorId))` 한 줄로 잡 종료가 다음 잡 시작을 트리거. 명시적 워커 루프가 없어도 동작. 같은 패턴이 `persistTail`에도 — `then(...)` 체인이 자동으로 다음 batch를 깨운다.
4. **클라이언트 사이드도 같은 패턴이 통한다** — `summarySseManager`는 인프라가 다를 뿐 모양이 똑같음 (refcount + reconnect coalescing). 동시성 자원이 "AI provider slot"이든 "브라우저 connection slot"이든, 같은 in-memory FIFO 싱글턴으로 풀린다.

이 패턴이 깨질 수 있는 시점:
- **다중 Fastify 인스턴스로 스케일 아웃** — 모듈 싱글턴은 프로세스 안에서만 의미. 여러 인스턴스가 같은 placeId 잡을 돌리면 dedupe도 cap도 cross-process에서 안 통함. 그 시점이 진짜 외부 큐가 필요한 시점.
- **사이드 이펙트가 있는 라이브러리 import** — 모듈 싱글턴은 import 한 번만 되면 인스턴스 1개. 그런데 jest/vitest의 모듈 분리, esm/cjs dual 빌드, 동일 패키지 두 개의 다른 버전 설치(워크스페이스에서) 같은 시나리오에서 두 인스턴스가 생길 수 있음. `pnpm dedupe`로 보호.
- **재시작 영속성이 필요해질 때** — in-memory 게이트는 process exit과 함께 사라짐. 잡 큐를 살리고 싶다면 SQLite outbox 같은 영속 큐로 바꿔야 함. 현재는 의도적으로 안 함 (Playwright 브라우저가 어차피 죽으므로).

## Sources

- [[../topics/ai]]
- [[../topics/crawl]]
- [[../topics/friendly]]
- [[../topics/shared]]
