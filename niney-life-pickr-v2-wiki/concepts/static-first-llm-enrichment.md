---
concept: 정적 결과 먼저, LLM 은 나중에 — 규칙 결과를 즉시 주고 AI 보강은 비동기로 덧입힌다
last_compiled: 2026-09-07
topics_connected: [food, saju-c, tarot, ai, shared, web]
status: active
---

# 정적 결과 먼저, LLM 은 나중에 — 규칙 결과를 즉시 주고 AI 보강은 비동기로 덧입힌다

## Pattern

이번 라운드의 세 도메인이 같은 응답 모양에 도달했다: **요청은 결정적 계산(규칙·카탈로그·명식)만으로 즉시 응답하고, LLM 결과는 "있으면 더 좋은 것"으로 뒤에 도착한다.** 클라이언트는 빈 화면 대신 정적 본문을 먼저 그리고, 도착한 만큼 갈아 끼운다. 규약:

- **응답에 상태 필드** — food 는 `llmPending`(메뉴별), 사주(C)는 섹션마다 `status: pending|ready|failed` + `jobId`, 타로는 `source: llm|static`. 클라이언트는 이 필드로 "AI 가 읽는 중" 배지·타자 효과·재시도 버튼을 결정한다.
- **도착 경로는 폴링** — SSE 를 쓰는 어드민 잡([stream-driven-cache-merge](stream-driven-cache-merge.md))과 달리 공개 기능은 단순 폴링: food 훅은 3초 간격 ≤10회 재조회, 사주(C)는 `GET …/jobs/:id?after=<version>&wait=20000` **long-poll**(서버가 새 섹션 또는 타임아웃까지 대기, 서버 재시작이면 410 → 정적 유지). 인증·프록시가 단순해지고 EventSource 헤더 제약([sse-token-auth](sse-token-auth.md))을 피한다.
- **LLM 부재는 오류가 아니다** — 키 없음·타임아웃·JSON 실패·한도 초과([anonymous-usage-quota](anonymous-usage-quota.md)) 전부 정적 결과로 수렴. 타로·사주는 정적 풀이 텍스트 표(`*-static.ts`)를 따로 두고, food 는 규칙 등급으로 표시.
- **캐시는 도착 결과 기준** — food 는 어휘 단위 영구 캐시(부정 결과 포함, `version` 게이트로 재판정), 사주(C)는 섹션별 lru-cache(같은 원국은 재호출 없음), 타로는 LRU 2000·24h(키에 프롬프트 버전).

## Instances

- **2026-09-06** in [saju-c](../topics/saju-c.md) / [shared](../topics/shared.md) (`f8e5dd0`): `POST /saju-c/readings` 가 원국 + 정적 섹션 4개 + `jobId` 를 즉시 돌려주고, `SajuJobRegistry` 가 4개 LLM 호출을 병렬로 띄운 뒤 `useSajuJob` 이 long-poll 로 도착 순 병합. 회원 저장은 4개가 모두 끝난 뒤 한 번. 패널은 pending 섹션에 "AI 가 사주를 읽는 중이에요 — 먼저 기본 풀이를 보여 드려요".
- **2026-09-03~05** in [tarot](../topics/tarot.md): 동기 응답이지만 같은 태도 — LLM 실패·한도 초과면 정적 해석 + `source: static` 배지, 요청 실패(`failed`)에만 재시도 버튼. 메뉴 타로는 후보 3개를 시드 결정적으로 먼저 고르고 LLM 은 이유 문장만.
- **2026-09-02** in [food](../topics/food.md) (`d12b47d`, `9d3253a`, `51de12a`): 원형. 규칙 캐스케이드로 등급을 즉시 주고 `llmPending` 메뉴는 백그라운드 체인(LLM 매칭 → 웹 실측 → 세트 분해)이 어휘 단위 캐시에 쓰면 훅 폴링이 갈아 끼운다. 웹·앱 칩이 같은 훅.

## What This Means

LLM 을 "응답 경로의 필수 단계"에서 "결과를 꾸미는 후처리"로 밀어낸 것이다. 그래서 (1) 첫 화면 시간이 LLM 지연(kimi-k3 5~6초)과 무관해지고 (2) 한도·장애가 기능 정지가 아니라 품질 하향이 되며 (3) 테스트가 LLM 없이 결정적으로 돈다. 대가는 두 벌의 콘텐츠(정적 표 + 프롬프트)를 함께 유지해야 한다는 것과, 폴링이 늘어나면 서버 대기 커넥션(long-poll 20초)이 비용이 된다는 것 — 트래픽이 커지면 [stream-driven-cache-merge](stream-driven-cache-merge.md) 의 SSE 로 옮기는 것이 PLAN 의 v2 후보로 남아 있다. 새 공개 LLM 기능은 "정적 결과를 먼저 정의"하는 데서 시작한다.

## Sources

- [../topics/food](../topics/food.md)
- [../topics/saju-c](../topics/saju-c.md)
- [../topics/tarot](../topics/tarot.md)
- [../topics/ai](../topics/ai.md)
- [../topics/shared](../topics/shared.md)
- [../topics/web](../topics/web.md)
