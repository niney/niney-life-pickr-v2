---
concept: 모델 계열별 호출 옵션 — 모델 기벽은 utils 순수 함수로 고정하고, 어드민 설정은 효과가 있는 계열에만 건다
last_compiled: 2026-09-19
topics_connected: [ai, saju-c, utils, web, api-contract, friendly]
status: active
---

# 모델 계열별 호출 옵션 — 모델 기벽은 utils 순수 함수로 고정하고, 어드민 설정은 효과가 있는 계열에만 건다

## Pattern

Ollama Cloud 에 올라온 모델들은 같은 `/api/chat` 이라도 **추론(thinking) 옵션에 다르게 반응**한다(2026-09-12 실측, [utils `aiModel.ts`](../../packages/utils/src/aiModel.ts) 헤더): `qwen3.5:397b` 는 `think` 를 안 보내면 응답 토큰을 사고에 다 써서 `content` 가 빈 문자열로 오고, `gpt-oss` 는 끄기가 안 되며 레벨(`'low'`)만 받고, `gemma4`·`kimi-k3`·`deepseek-v4-pro` 는 `think:false` 를 보내도 무시하거나 레벨을 전부 받는다. 24차에 "보류 컨셉"으로 적어 뒀던 `model-family-call-options` 가 `a823af1` 로 실체를 얻었다.

1. **기벽은 순수 함수 한 곳** — `thinkOptionForModel(modelId)` 가 모델 id 접두로 계열을 판정해 기본 옵션(`false` | `'low'`)을 주고, 어댑터([`llm-provider.ts`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts))는 그 값을 요청 최상위 `think` 로 전달만 한다. 규칙이 코드 주석과 테스트(`aiModelThink.test.ts`)로 고정되어 "왜 이 모델은 빈 응답이 오나"를 다시 조사하지 않는다.
2. **어드민 설정은 효과가 있는 계열에만** — `LlmProviderConfig.thinking`(`off|low|medium|high|max`, 마이그레이션 `20260912120000`)은 **kimi 계열에만** 적용된다(`thinkOptionFor(modelId, setting)`). 다른 모델은 설정을 무시하고 계열 기본 규칙을 따른다 — "켰는데 아무 일도 안 일어나는 설정"을 만들지 않기 위해서다. 웹 어드민(`AdminAiKeysPage`)도 같은 enum(`LlmThinking`, [api-contract `ai.ts`](../../packages/api-contract/src/schemas/ai.ts))으로 5단계를 고르게 하고 기본은 끔.
3. **소비 도메인은 옵션을 모른다** — 사주(C) job 이 LLM 을 부를 때 provider 설정을 통해 think 가 붙을 뿐, 사주 모듈 코드엔 모델 분기가 없다([saju-c](../topics/saju-c.md)). 비용·지연은 어드민 설정으로 조절하고, 품질 비교는 `probe:*` 스크립트로 같은 입력을 여러 모델에 돌려 본다([golden-set-precision-gate](golden-set-precision-gate.md)).

## Instances

- **2026-09-12** in [ai](../topics/ai.md) / [utils](../topics/utils.md) / [api-contract](../topics/api-contract.md) / [web](../topics/web.md) (`a823af1`): thinking 설정 도입 — DB 열 + 계약 enum + 어드민 select + 어댑터 전달 + 순수 함수 2개(`thinkOptionForModel`, `thinkOptionFor`) + 테스트. 실측 표(모델별 think 반응)가 코드 주석으로 남았다.
- **2026-09-12** in [saju-c](../topics/saju-c.md) (`a823af1`·`baecb9b`): 첫 소비자 — 사주(C) 풀이(섹션 4개 병렬 job)와 "사주에 묻기"가 kimi 모델일 때 어드민이 고른 추론 단계로 돈다. 기본 끔이라 운영 비용은 그대로.
- **2026-05~08 (전사)** in [ai](../topics/ai.md): 모델 축 폴백·purpose 별 모델 선택(`chat`/`image`/`tarot`…)은 [db-config-env-fallback](db-config-env-fallback.md)이 다루던 "어느 모델을 쓰나"였고, 이 컨셉은 "고른 모델을 **어떻게 부르나**"(옵션)가 갈라져 나온 것이다. `aiModel.ts` 의 다른 휴리스틱(컨텍스트 크기·vision 여부 추정)도 같은 자리에 산다.

## What This Means

1. **모델 기벽을 어댑터 안에 흩뿌리지 않는다.** 어댑터는 전송, utils 는 판단 — 판단이 순수 함수면 테스트가 곧 실측 기록이 되고, 새 모델이 오면 표에 한 줄 추가로 끝난다.
2. **설정의 범위를 설정 자체에 적어라.** "kimi 전용"을 UI 라벨과 함수 시그니처에 명시했기 때문에, 다른 모델에서 추론이 안 켜지는 게 버그가 아니라 규칙으로 읽힌다. 범용처럼 보이는 스위치가 특정 계열에만 듣는 상황은 LLM 통합에서 반복되므로 이 규칙을 기본값으로 둔다.
3. **다음 옵션 후보**(온도·응답 형식 강제·컨텍스트 창)도 같은 형태 — 계열 판정 함수 + 계열 한정 설정 + 계약 enum — 로 붙이면 된다. 옵션이 늘면 `thinkOptionFor` 처럼 "설정 × 계열 → 실제 요청 값" 함수 하나가 진실이 된다.

## Sources

- [ai](../topics/ai.md)
- [saju-c](../topics/saju-c.md)
- [utils](../topics/utils.md)
- [web](../topics/web.md)
- [api-contract](../topics/api-contract.md)
- [friendly](../topics/friendly.md)
- [db-config-env-fallback](db-config-env-fallback.md)
- [versioned-llm-prompts](versioned-llm-prompts.md)
- [golden-set-precision-gate](golden-set-precision-gate.md)
