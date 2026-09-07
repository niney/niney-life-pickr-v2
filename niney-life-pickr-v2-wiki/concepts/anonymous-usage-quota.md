---
concept: 공용 익명 사용량 한도 — 게스트 키·IP·전역 일일 한도로 공개 LLM 기능을 연다
last_compiled: 2026-09-07
topics_connected: [usage-quota, tarot, saju-c, saju-g, ai, friendly, shared, web]
status: active
---

# 공용 익명 사용량 한도 — 게스트 키·IP·전역 일일 한도로 공개 LLM 기능을 연다

## Pattern

타로·사주는 "로그인 없이 무료"가 제품 전제인데 뒤에는 Ollama Cloud 호출 비용이 있다. 이 긴장을 한 번에 푸는 모듈이 `apps/friendly/src/modules/usage-quota`(2026-09-03, `cd5a29b`)다. 규칙은 네 겹이다.

1. **정체성** — 회원은 `userId`, 게스트는 클라이언트가 만들어 보관하는 무작위 **게스트 키**(`packages/shared/src/stores/guestKeyStore.ts`, persist `guest-key-v1`, 재생성 API 없음; 헤더 `X-Guest-Key` `/^[A-Za-z0-9_-]{8,64}$/`, 없으면 `ip:<addr>` 대체). 앱은 `setGuestKeyStorage(AsyncStorage)` 와 WebView 임베드 `__LP_EMBED__.guestKey` 주입으로 앱↔WebView 가 같은 기기로 잡힌다([embedded-webview-bridge](embedded-webview-bridge.md)).
2. **네 겹의 한도** — IP 분당 버스트(회원 포함, `@fastify/rate-limit` 의 `max` 를 설정 캐시를 읽는 함수로) / 기능 전역 일일 예산(전원이 소비하되 **게스트는 `guestCutoffPct`(기본 90%) 에서 먼저 잘리고** 나머지는 회원 몫) / IP 일일(게스트만) / 게스트 키 일일(게스트만). 회원은 기기·IP 한도 면제(사용자 결정 2026-09-02), `user` scope 는 통계용. 기능(feature)별로 따로 센다: `tarot-reading` 50/500/20/5000/90, `saju-reading` 30/300/20/3000/90, `saju-g-reading` 20/200/10/1000/90(게스트일·IP일·분당·전역일·게스트 컷%). env 는 없고 코드 기본값 + 어드민 "사용량 한도" 탭(`AdminQuotasPage`, `GET/PUT /admin/quotas`)의 DB 행, 30초 캐시(저장 시 무효화).
3. **소비 시점과 순서** — 캐시 히트(같은 입력의 저장된 풀이·같은 날 일진)는 소비하지 않고(`remainingForGuest` 만 계산), LLM 을 실제로 부르는 요청만 1건. 카운터는 `MealDailyQuotaService` 의 "INSERT … ON CONFLICT … WHERE count < limit" 한 문장 원자 증가를 feature × scope × KST 날짜로 일반화한 것. 소비 순서는 전역→IP→게스트, 뒤 단계가 거부되면 앞 단계를 release(best effort). 사주(C)는 섹션 4개 병렬 호출을 **풀이 1건**으로 센다(호출 수가 아니라 사용자 체감 단위). 04:40 cron 이 30일 지난 카운터를 지운다.
4. **초과는 강등** — 한도를 넘으면 LLM 을 건너뛰고 **정적 풀이**로 응답한다(429 가 아니라 품질 하향; 분당 버스트만 429). 사용량은 응답 `quota` 필드로 클라이언트에 돌려줘 UI 가 남은 횟수를 보여 준다. 옵셔널 인증이라 무효 토큰도 게스트로 처리(`resolveOptionalUser`).

## Instances

- **2026-09-06** in [saju-c](../topics/saju-c.md) (`f8e5dd0`): `SAJU_QUOTA_FEATURE = 'saju-reading'`, 오늘·궁합·택일·음식 단일 호출도 각 1건. 회원 오늘의 운세는 별도로 `dailyLockKey` 로 하루 1회 잠금(한도와 다른 축 — 같은 날 같은 사주는 재호출 자체를 막는다).
- **2026-09-06~07** in [saju-g](../topics/saju-g.md) (`1c60ad8`→`e40b4c0` 키 분리): 같은 플러그인을 사주(G)가 `saju-g-reading`(20/200/10/1000/90)으로 공유. 두 사주 구현이 한도 모듈을 나눠 쓰는 것이 "두 구현 공존" 결정의 실제 접점.
- **2026-09-03~04** in [tarot](../topics/tarot.md) / [usage-quota](../topics/usage-quota.md) (`cd5a29b`, `fae8190`): 원형. `usage-quota` 플러그인 + `UsageQuotaFeature` enum + 어드민 탭 + 기본 한도 상향(50/500/20/5000/90%). 회원 기록 페이지가 같은 커밋에서 생겼다 — "무료로 열되 기록은 로그인 유도".

## What This Means

지금까지 비용 통제는 [in-memory-singleton-gates](in-memory-singleton-gates.md)(동시성)와 [quota-proportional-loading](quota-proportional-loading.md)(외부 공공 API 쿼터)였다. 이 컨셉은 세 번째 축 — **우리가 돈을 내는 LLM 호출을 익명 사용자에게 얼마나 열어 줄지**를 제품 정책(기능별 일일 한도)으로 만든 것이다. 한도 초과가 오류가 아니라 정적 폴백이라는 점이 핵심 태도다: 기능은 항상 동작하고, AI 는 "있으면 더 좋은 것". 새 공개 LLM 기능은 (1) `UsageQuotaFeature` 에 키 추가 (2) 서비스에서 캐시 미스 시 1건 소비 (3) 정적 폴백 준비 — 이 셋을 갖추면 어드민 한도 탭에 자동으로 나타난다.

## Sources

- [../topics/usage-quota](../topics/usage-quota.md)
- [../topics/tarot](../topics/tarot.md)
- [../topics/saju-c](../topics/saju-c.md)
- [../topics/saju-g](../topics/saju-g.md)
- [../topics/ai](../topics/ai.md)
- [../topics/friendly](../topics/friendly.md)
- [../topics/shared](../topics/shared.md)
- [../topics/web](../topics/web.md)
