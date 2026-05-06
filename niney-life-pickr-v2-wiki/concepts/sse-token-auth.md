---
concept: SSE의 ?token= 쿼리 인증 + 로거 리덕션
last_compiled: 2026-05-07
topics_connected: [friendly, crawl, shared, web]
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

## What This Means

이 패턴이 알려주는 것:

1. **표준 API의 한계를 정직하게 받아들임** — `EventSource` 헤더 지원 안 됨이 결정의 출발점. 우회(`fetch` + ReadableStream으로 SSE 직접 구현)는 비용이 크고, 받아들이면 토큰 노출이 따라붙는다. 양쪽을 조합해 받아들이고 보강하는 쪽을 선택.
2. **로그가 보안 표면이라는 인지** — 토큰이 URL에 들어가는 순간 로그도 보안 자산이 된다. 리덕션을 빼먹으면 운영자/Pino 출력/Datadog 등 모든 곳에 JWT가 남음. 코드 리뷰 시 항상 `?token=` 패턴 등장 → 리덕션 적용 여부 동시 점검.
3. **양보의 범위를 좁힘** — `?token=`은 **SSE에만** 적용. 일반 REST는 `Authorization` 헤더 유지. 양보를 토큰 인증 전반으로 확대하지 않음.

이 패턴이 깨질 수 있는 위험:
- 새 SSE 엔드포인트 추가 시 리덕션 정규식 패턴이 바뀌면 누락 가능 (현재는 `?token=` / `&token=` 모두 커버하지만 다른 키 이름이면 새로 패턴 추가 필요)
- 토큰이 매우 짧은 만료시간이라면 위험이 줄지만 현재 JWT 만료는 7일 — 로그 수명보다 길 가능성이 높아 리덕션이 필수
- WebSocket으로 마이그레이션하면 `Sec-WebSocket-Protocol` 헤더 트릭 등 다른 우회로 옮겨지면서 또 비슷한 보안 보강이 필요해진다

## Sources

- [[../topics/friendly]]
- [[../topics/crawl]]
- [[../topics/shared]]
- [[../topics/web]]
