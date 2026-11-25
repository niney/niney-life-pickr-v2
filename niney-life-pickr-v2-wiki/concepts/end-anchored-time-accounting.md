---
concept: 시간·자리 회계는 "실제로 끝난" 시점에 묶는다 — 헤더 도착·조회 시작·결과 전달은 끝이 아니다
last_compiled: 2026-11-15
topics_connected: [friendly, ai, hiking, transit, bus, subway, weather, air-quality, sea, meal, meal-nutrition, saju-c]
status: active
---

# 시간·자리 회계는 "실제로 끝난" 시점에 묶는다 — 헤더 도착·조회 시작·결과 전달은 끝이 아니다

## Pattern

2026-11-06~07, 성능 감사 2차 리뷰가 남긴 잔여(PLAN-perf-2 "남긴 것")를 정리하면서 서로 다른 다섯 곳에서 **같은 종류의 결함**이 나왔다. 타임아웃·쿨다운·동시 수 상한은 모두 "어떤 일이 끝나는 시점" 을 기준으로 시간을 재거나 자리를 돌려준다. 그런데 코드가 그 시점을 **일이 끝나기 전의 이정표**로 잡고 있었다 — 응답 헤더가 도착한 순간(본문은 아직), 조회를 시작한 순간(실패는 40초 뒤), 결과를 넘긴 순간(워커 메모리는 아직), 바깥 어댑터의 고정 타이머(안쪽 서비스가 계산한 예산은 더 길다). 평소엔 그 틈이 0 에 가까워 아무 일도 없고, **느린 실패**에서만 상한이 무력해진다: 본문이 오다 멈추면 300초를 매달리고, 오래 걸린 실패 뒤엔 쿨다운이 이미 지나 곧바로 다시 부르고, 디코드 중 타임아웃이면 수백 MB 워커 두 개가 겹친다.

처방도 같은 모양이다. ① 타이머는 본문을 다 읽을 때까지 덮는다(다 읽은 뒤 울리는 타이머는 아무 일도 안 하게 `unref`). ② 쿨다운은 실패를 **안 시각**(주입 시계)부터. ③ 게이트 자리는 자원이 **반환된 뒤** 돌려준다. ④ 호출별 예산은 가장 안쪽 타이머까지 내려보낸다(`timeoutMs`). 그리고 다섯 수정 모두 **고치기 전 코드에서 실패하는 테스트**를 같이 넣었다 — 본문이 멈추는 가짜 응답, 40초 매달린 실패, 종료 시점을 쥐는 가짜 워커처럼 "느린 끝" 을 재현하는 장치가 없으면 이 결함은 테스트에 보이지 않는다.

## Instances

- **2026-11-07** in [ai](../topics/ai.md) / [meal-nutrition](../topics/meal-nutrition.md) / [meal](../topics/meal.md) / [saju-c](../topics/saju-c.md) (`ad1feff8`): **바깥 타이머가 안쪽 예산을 덮었다.** Ollama 어댑터가 호출마다 `OLLAMA_CLOUD_TIMEOUT_MS`(60초)를 걸어, 서비스가 추론 단계만큼 늘린 대기 시간이 무시됐다 — kimi-k3.1-pro 최대 추론에서 영양제 조언·식단 추천이 **정확히 60.0초**에 실패(사주도 같은 구조). `LLMCompleteOptions.timeoutMs` 로 호출별 대기를 어댑터까지 내려보낸다([model-family-call-options](model-family-call-options.md)).
- **2026-11-07** in [friendly](../topics/friendly.md) / [meal](../topics/meal.md) (`a94d96b1`): **결과 전달 ≠ 자원 반환.** HEIC 변환 워커가 결과를 넘긴 뒤 `terminate()` 를 기다리지 않아, 호출측이 곧바로 게이트 자리를 돌려주면 다음 사진의 워커가 이전 워커의 libheif wasm 메모리가 반환되기 전에 떴다. 디코드 중 타임아웃이면 수백 MB 가 겹쳐 '동시 1건' 상한이 잠깐 깨졌다 → 워커 종료가 끝난 뒤 결과·오류를 넘긴다. 가짜 워커로 종료 시점을 쥐는 테스트(예전 코드에서 실패)([in-memory-singleton-gates](in-memory-singleton-gates.md)).
- **2026-11-07** in [transit](../topics/transit.md) / [bus](../topics/bus.md) / [subway](../topics/subway.md) / [weather](../topics/weather.md) / [air-quality](../topics/air-quality.md) / [sea](../topics/sea.md) (`9b7beef0`): **조회 시작 ≠ 실패.** 6곳(대기·버스·지하철·날씨·AWS·바다)이 함수 첫머리에 잡은 시각으로 실패 쿨다운(30초 → 5분)을 기록해, 업스트림이 40초 매달리다 실패하면 기록하는 순간 쿨다운이 이미 지나 있었다 — 끝난 직후 바로 다시 호출·쿼터 소비. 실패한 시각(주입 시계)으로 기록, 모듈마다 '40초 매달린 실패' 테스트(예전 코드에서 6건 모두 실패)([quota-proportional-loading](quota-proportional-loading.md)).
- **2026-11-06~07** in [friendly](../topics/friendly.md) / [ai](../topics/ai.md) (`8cadb898`·`784bda21`): **헤더 도착 ≠ 응답 끝.** `lib/fetch-timeout.ts` 와 Ollama 어댑터가 응답 헤더가 오면 타이머를 풀어, 본문이 오다 멈추면 `res.text()`·`json()` 이 undici 기본 본문 타임아웃(300초)까지 매달렸다(산불위험예보 1.7MB 등). 타이머를 그대로 두고(unref) 연결 실패 때만 바로 정리한다. 호출부 13곳(등산 어댑터·지형 고도·국립공원·리뷰 군집·리뷰 질문·텔레그램·여행 영업 상태)과 모든 LLM 호출에 적용. 본문 멈춤 테스트는 고치기 전 코드에서 5초 시간 초과로 실패했다.
- **2026-11-06** in [hiking](../topics/hiking.md) (`bec2e294`): 같은 원칙의 등산판 — 산불위험예보는 매달리면 20초 × 3회로 한 번 받기가 최대 약 63초였고, 그 시간을 요청이 그대로 기다렸다. 요청 경로용 15초·재시도 1회로 줄이고, 3시간이 지나면 마지막 성공분을 바로 내고 뒤에서 갱신한다. 쿨다운은 실패를 안 시각부터(이 커밋이 하루 먼저 바꿔, 다음 날 6곳이 따랐다). 어댑터는 본문 읽기 실패도 재시도하고 끝내 `HikingApiError` 로 내 서비스 쿨다운이 센다.

## What This Means

1. **"끝" 을 정의할 때 느린 실패를 떠올린다.** 평소 경로에서는 헤더·본문, 시작·실패, 결과·종료가 거의 동시라 어느 쪽에 묶어도 같아 보인다. 차이는 업스트림이 매달리거나 디코드가 오래 걸릴 때만 드러나고, 그때가 바로 타임아웃·쿨다운·상한이 필요한 때다.
2. **바깥 계층의 기본값이 안쪽 계층의 계산을 조용히 덮는다.** 서비스가 정성껏 계산한 예산(추론 단계별 대기)도 어댑터의 고정 60초 앞에서는 무의미했다. 예산을 계산하는 층과 타이머를 거는 층이 다르면, 값이 실제 타이머까지 내려가는지를 테스트로 묶는다.
3. **회계의 끝은 자원 기준이지 논리 기준이 아니다.** "결과가 나왔다" 는 논리적 끝이고, "메모리가 풀렸다·연결이 닫혔다" 가 자원의 끝이다. 동시 수 상한이 지키려는 것이 메모리면 메모리가 풀린 뒤에 자리를 돌려준다.
4. **재현 장치를 남긴다.** 다섯 수정 모두 주입 시계·가짜 워커·멈추는 본문으로 "느린 끝" 을 만들어 예전 코드에서 실패하는 테스트를 넣었다. 이 장치가 있어야 같은 결함이 새 어댑터·새 게이트에 다시 들어올 때 잡힌다.
5. **리뷰 잔여는 묶어서 보면 패턴이 된다.** 다섯 건은 성능 감사 2차 리뷰가 "낮음" 으로 따로따로 남긴 것이었다. 한 번에 정리하자 같은 원인이 보였다 — 낮은 우선순위 잔여를 모아 볼 때는 개별 수정보다 공통 원인을 먼저 찾는다.

관련: [quota-proportional-loading](quota-proportional-loading.md) — 쿨다운·시간 예산이 그 5번째 층의 부품이다. [in-memory-singleton-gates](in-memory-singleton-gates.md) — 게이트의 자리 반환 시점. [model-family-call-options](model-family-call-options.md) — 추론 단계별 예산이 어댑터까지 내려가야 하는 이유. [freshness-matched-read-caches](freshness-matched-read-caches.md) — 같은 묶음에서 나온 다른 처방(지난 값으로 답하고 뒤에서 갱신)은 느린 업스트림을 사용자 경로에서 빼는 쪽이다.

## Sources

- [friendly](../topics/friendly.md)
- [ai](../topics/ai.md)
- [hiking](../topics/hiking.md)
- [transit](../topics/transit.md)
- [bus](../topics/bus.md) · [subway](../topics/subway.md) · [weather](../topics/weather.md) · [air-quality](../topics/air-quality.md) · [sea](../topics/sea.md)
- [meal](../topics/meal.md) · [meal-nutrition](../topics/meal-nutrition.md) · [saju-c](../topics/saju-c.md)
- [apps/friendly/src/lib/fetch-timeout.ts](../../apps/friendly/src/lib/fetch-timeout.ts) — 본문까지 덮는 타이머
- [apps/friendly/src/lib/fetch-timeout.test.ts](../../apps/friendly/src/lib/fetch-timeout.test.ts) — 본문 멈춤 재현
- [apps/friendly/src/lib/heic-worker.ts](../../apps/friendly/src/lib/heic-worker.ts) — 종료 뒤 결과 전달
- [apps/friendly/src/lib/heic-worker-terminate.test.ts](../../apps/friendly/src/lib/heic-worker-terminate.test.ts) — 가짜 워커로 종료 시점 고정
- [apps/friendly/src/modules/hiking/forest-fire.service.ts](../../apps/friendly/src/modules/hiking/forest-fire.service.ts) — 산불 예보 요청 경로 예산·마지막 성공분
- [packages/utils/src/aiModel.ts](../../packages/utils/src/aiModel.ts) — `thinkTimeoutMs`
- [quota-proportional-loading](quota-proportional-loading.md) · [in-memory-singleton-gates](in-memory-singleton-gates.md) · [model-family-call-options](model-family-call-options.md) · [freshness-matched-read-caches](freshness-matched-read-caches.md)
