---
topic: ai
last_compiled: 2026-08-30
sources_count: 49
status: active
aliases: [llm, ollama, ollama-cloud, provider, purpose, vision, image, chat, log-analysis, meal-photo, meal-recommend, llm-provider-env, buildLlmProviderEnv, LlmProviderEnv, ALL_PURPOSES, OLLAMA_MEAL_PHOTO_MODEL, OLLAMA_MEAL_RECOMMEND_MODEL, gemma4, multimodal, MULTIMODAL_FAMILY_RE, thinkOptionForModel, probe:meal-vision, 평가셋, providerModelsPreview, models-preview, ai-key-preview, AdminAiKeysPage-preview, useProviderModelsPreview, mobile-ai-keys-card-layout, telemetry, llm-telemetry, telemetryStream, LlmUsagePanel, AdminAiUsagePage, useLlmTelemetry, concurrency-gate, account-gate, AccountGateRegistry, ConcurrencyGate, keySource, defaultModelSource, aiModel, recommendModelForPurpose, isVisionModel, groupModelsByFamily, think]
---

# ai — LLM 통합(Ollama Cloud): 용도별 provider 설정·어댑터·2단 게이트·텔레메트리

> **2026-08-22~23 변경 흡수 — 식단용 purpose 2종(`meal-photo`·`meal-recommend`) + `.env → LlmProviderEnv` 조립 단일화(`buildLlmProviderEnv`) + 멀티모달 계열 vision 판정 확장(`cc8399a`), meal-photo 기본 모델 gemma4:31b 전환과 실측 근거(`36fe7da`), JSON 호출의 사고(think) 끄기 헬퍼 `thinkOptionForModel`(`5cdbc0f`·`15f2a91`).** (1) **용도 5종** — `LlmProviderPurpose` enum 이 `chat`/`image`/`log-analysis` 에 `meal-photo`(비전, 음식 사진 인식)·`meal-recommend`(텍스트, 다음 끼니 추천)를 더해 **5종**. 영수증 `image` 를 공유하지 않는 이유는 모델·purpose 게이트·텔레메트리 라벨을 분리해 독립 튜닝하려는 것([PLAN-meal](../../docs/PLAN-meal.md) 결정 F). 키 상속 규칙은 그대로 — `chat` 이 계정 대표, 나머지 4용도는 자기 row 에 키가 없으면 `inherited`. 모델만 용도별 `.env` 폴백이 두 개 늘었다: `OLLAMA_MEAL_PHOTO_MODEL`(`.env.example` 기본 `gemma4:31b`) / `OLLAMA_MEAL_RECOMMEND_MODEL`(`gpt-oss:120b`). `AiConfigService.ALL_PURPOSES` 가 하드코딩 배열에서 **`LlmProviderPurpose.options` 파생**으로 바뀌어 enum 에 용도를 더하면 `list()` 가상 row 와 어드민 카드가 자동으로 늘어난다(계약 enum 순서 = 카드 순서). (2) **env 조립 단일화** — `LlmProviderEnv` 리터럴이 src 9곳 + 스크립트/리서치 17곳에 복제돼 있어 용도 하나 늘릴 때마다 전부 손봐야 했다. 신규 [`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 하나로 통합 — 소비처는 `ai.route` 와 analytics/auto-discover/menu-grouping/settlement-extraction/meal-recognition/meal-recommendation 라우트, 플러그인 `logs`/`random-crawl`/`schedule`/`summaries`/`food-import`, 스크립트(`run-global-merge`/`probe-merge`/`probe-extraction`/`probe-vision`/`probe-tabling*`/`probe-meal-vision`/`load-food-catalog`) + `research/review-search/probe-*` 10종 (`grep -rn llm-provider-env apps/friendly` 33파일). **테스트는 `.env` 를 읽지 않고 가짜 `LlmProviderEnv` 를 직접 만든다** — 그래서 `defaultModels` 5키 리터럴이 8개 테스트 파일(ai 3종·analytics·tabling.service·menu-grouping·review-clustering·summary)에 남아 있고, purpose 가 늘면 `Record<purpose, string>` 타입이 typecheck 로 누락을 잡아 준다. (3) **vision 판정 확장** — `isVisionModel` 이 이름 휴리스틱(`vision|llava|vl|minicpm-v`)만으로는 `gemma4:31b`·`qwen3.5:397b` 처럼 이름에 vl/vision 이 없는 멀티모달 모델을 놓쳐 image 용도 추천에서 빠졌다. `MULTIMODAL_FAMILY_RE`(gemma3/4 · qwen3.5 · kimi-k2.6/k3 · minimax-m3 · mistral-large-3 · llama4 · mistral-small3 · glm-4.Nv — 2026-08-22 Ollama Cloud 카탈로그 스냅샷)를 family(`:` 앞) 접두로 대소문자 무시 매칭, 접두 뒤에 글자가 이어지면(`gemma4x`) 다른 계열로 취급. `recommendModelForPurpose` 는 `meal-photo` = image 규칙(vision 중 최소), `meal-recommend` = chat 규칙(텍스트 중간 규모). utils 는 api-contract 에 의존할 수 없어(순환 금지) `ModelPurpose` 리터럴 유니온을 다시 적는다. 신규 [`aiModel.test.ts`](../../packages/utils/src/aiModel.test.ts). 어드민 [`AdminAiKeysPage`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) 는 `PURPOSE_ORDER` 5개 + `PURPOSE_META`(Record 라 누락 시 typecheck 실패) — Camera(식단 사진 인식)·UtensilsCrossed(식단 추천) 카드 2장 추가. (4) **meal-photo 기본 gemma4:31b** — `.env.example` 의 기본값을 `qwen3.5:397b` 에서 `gemma4:31b` 로. 근거는 평가셋 **60장(150클래스 균등 표본)** 실측: gemma4:31b **top-1 55% · 후보포함 68% · 평균 2.4s** vs qwen3.5:397b 52% · 63% · 4.9s — 표본오차(±6pp) 안에서 동률이고 2배 빠르다. 이전 8장 측정(qwen 75%)은 표본이 '가~' 클래스에 치우친 편향이었다. 재측정 명령 `pnpm --filter friendly probe:meal-vision -- --limit=60 --label-from-filename --models=qwen3.5:397b,gemma4:31b` (`--limit` 은 앞에서 자르지 않고 목록 전체에 균등 간격 샘플링 — 같은 limit 이면 표본 재현). 평가셋은 `data/open/eval/meal-photos/`(AI Hub 한국 음식 이미지에서 150클래스 × 5장 = 750장, 91MB, 파일명이 정답 라벨), 원본 `kfood.zip` 16GB 는 추출 확인 후 삭제 — 재추출 파이썬 코드는 [docs/data-sources.md](../../docs/data-sources.md). 운영 `llm_provider_configs` 는 비어 있어 **`.env` 가 유일한 설정원**(어드민에서 등록하면 DB 우선). (5) **`thinkOptionForModel(modelId): false | 'low'`** ([`aiModel.ts`](../../packages/utils/src/aiModel.ts)) — 실측(2026-08-22): qwen3.5·gpt-oss 는 `think` 를 안 보내면 출력 토큰을 사고에 다 써 `content` 가 빈 문자열로 온다. gpt-oss 는 끌 수 없어 `'low'`, 그 외는 `false`(gemma4·kimi-k3·deepseek-v4-pro 에 `false` 를 보내도 200 — 모르는 모델에도 안전). JSON 을 받는 호출 전부에 실렸다 — analytics 글로벌 머지 청크(`15f2a91`, 캐시 키는 model+variants 라 기존 청크 캐시 유효), food-classify, meal-recognition(2회: 본 호출 + 복구 호출), meal-recommendation, settlement-extraction(영수증 추출도 같은 손해를 보고 있었다). (6) **일일 quota 는 다른 층** — meal 라우트의 `MEAL_RECOGNIZE_DAILY_LIMIT`(기본 30)/`MEAL_RECOMMEND_DAILY_LIMIT`(20) 는 per-user **SQLite 영속 카운터**(`meal_daily_quotas`, 조건부 upsert 한 문장, 0 = 무제한)로 provider 호출 **전에** 소비된다 — ai 모듈의 purpose·계정 게이트(in-memory, "동시에 몇 개")와 달리 "하루 몇 번"을 사용자별로 세며 재시작에도 유지된다. 한도 초과 요청은 게이트·텔레메트리에 도달하지 않는다. 구현은 [meal](meal.md).

> **2026-07-13 변경 흡수 — 죽어있던 per-actor 레이트리밋 부활(모듈 레벨 Map) + LLM/임베딩 fetch 타임아웃(감사 `bc2db00` 6·9차)**: (1) AiService 의 per-actor 레이트리밋 상태가 **인스턴스 필드**였는데, 라우트가 config 핫리로드를 위해 요청마다 새 인스턴스를 만들어 카운터가 매번 0 에서 시작 — 사실상 죽어 있었다. **모듈 레벨 Map** 으로 이동해 부활. 함정: 모듈 상태는 테스트 간 지속 → 격리용 리셋 헬퍼 + ai.service.test beforeEach 리셋 필수(같은 함정이 재발하기 쉬움). (2) review-search embed(30s)·chat(60s), review-clustering chat(60s)의 무기한 fetch 에 [lib/fetch-timeout.ts](../../apps/friendly/src/lib/fetch-timeout.ts)(AbortController) 적용 — 업스트림 행이 이벤트루프에 좀비 요청으로 쌓이던 것 차단.

> **2026-06-25 변경 흡수 — LLM 계정 단위 동시성 게이트 + 실시간 사용량 텔레메트리 + AI 키 1개 계정 공유(용도별 모델만 분리).** 두 줄기로 크게 바뀌었다. (1) **계정 게이트** — 어댑터 내부에 있던 FIFO 게이트를 [`concurrency-gate.ts`](../../apps/friendly/src/modules/ai/concurrency-gate.ts) 의 독립 `ConcurrencyGate` 로 추출하고, `apiKey|baseUrl` 단위로 게이트를 공유하는 `AccountGateRegistry` 를 새로 뒀다. 이제 호출은 **두 게이트를 직렬 통과** — purpose 게이트(어댑터 소유, `maxConcurrent`) → 계정 게이트(키 단위 공유, cap = 그 키로 해석된 purpose 한도들의 **max**). 같은 키를 쓰는 chat/image/log-analysis 합산 동시성이 계정 cap 을 절대 못 넘는다. 계정 게이트는 레지스트리에 살아 어댑터 캐시가 회전(설정 변경)해도 유지되고, `setLimit` 으로 웹 설정(DB)의 maxConcurrent 와 동기화된다 — env 는 부트스트랩 폴백일 뿐(bf883fc). (2) **계정 1키 공유** — `purpose` enum 에 `'log-analysis'` 가 추가돼 세 용도가 됐고, **키·baseUrl 은 계정 대표(chat)에서 상속**한다. image·log-analysis 는 자기 row 에 키가 없으면 chat(없으면 env) 키를 빌려 쓴다 — 키 하나로 세 용도가 다 돈다. **모델만은 상속하지 않고** 용도별 `.env` 폴백(`OLLAMA_DEFAULT_MODEL`/`OLLAMA_IMAGE_MODEL`/`OLLAMA_LOG_ANALYSIS_MODEL`)을 둔다. 와이어에 `keySource`(own/inherited/env/none) + `defaultModelSource`(own/env/none) 배지 필드 추가. `AdapterCache` 도 "마지막 1개" 슬롯에서 **키별 Map(MAX_ENTRIES=8)** 로 바뀌어 용도들이 공존한다(이전 gotcha 해소). 신규 [`packages/utils/src/aiModel.ts`](../../packages/utils/src/aiModel.ts) 가 모델 식별/추천 헬퍼(`recommendModelForPurpose`/`isVisionModel`/`groupModelsByFamily`)를 제공해 키 입력 후 용도별 모델을 자동 추천한다. **텔레메트리** — 모든 LLM 호출이 AdapterCache → OllamaCloudAdapter 한 경로로 수렴하므로 `onEvent` 훅으로 purpose 라벨을 붙여 [`llm-telemetry.ts`](../../apps/friendly/src/modules/ai/llm-telemetry.ts) 싱글턴(표시 전용 인메모리 집계)에 흘린다. `GET /telemetry`(스냅샷) + `GET /telemetry/stream`(SSE, 1초 코얼레싱) 어드민 라우트. 강제(예산 차단) 없음, 재시작 시 리셋(`startedAt` 노출). 웹: 어드민 전 페이지 플로팅 패널 `LlmUsagePanel` + 상세 `AdminAiUsagePage` + `useLlmTelemetry` 훅. `LLMCompleteOptions` 에 추론 제어 `think` 필드도 추가. 신규 LLM/임베딩 컨슈머로 [`log-analysis`](#talks-to)(`log-analysis` purpose, LLM 게이트 경유)·[`review-search`](review-search.md)(임베딩 — `/api/embed`, **별도 경로**)·[`review-clustering`](review-clustering.md) 이 합류 — 상세는 각 토픽.
>
> **2026-05-28 변경 흡수 — 모델 미리보기 엔드포인트 + 영수증 N차 컨텍스트 + `EXTRACTION_VERSION` 2 로 bump.** 신규 `POST /api/v1/admin/ai/providers/:id/:purpose/models/preview` 가 폼에 입력한 키·base URL 을 **저장 없이** 받아 provider 의 `/models` 만 한 번 부른다 → 어드민이 키 검증과 모델 선택을 한 번에 끝낼 수 있고 잘못된 키로 row 가 먼저 생기는 라이프사이클이 사라진다. AdminAiKeysPage 가 "모델 미리보기" 버튼 + 응답 모델 드롭다운으로 흐름을 다시 짰고, 좁은 화면에서 카드 컬럼이 접히도록 모바일 레이아웃도 손봤다. settlement-extraction (vision LLM) 은 `roundHint = { index, total }` 을 user prompt 에 동적으로 주입 — "N차 회식 중 K차 영수증" 컨텍스트로 multi-receipt split (한 사진을 좌→우로 잘라 N번 추출) 분기에서도 같은 `image` purpose 어댑터를 그대로 쓴다 (이미지 자체는 service 레이어에서 자른다). 프롬프트 envelope 가 의미 있게 바뀌어 `EXTRACTION_VERSION` 이 1 → 2 로 올라갔다 (출력 schema `ReceiptItem[]` 자체는 변경 없음 — [versioned-llm-prompts](../concepts/versioned-llm-prompts.md) 패턴의 6번째 인스턴스). provider/purpose/모델 추가는 없다 — 여전히 `ollama-cloud` 1종, chat + image 2가지.
>
> **2026-05-25 변경 흡수 — provider purpose 분리 (chat/image) + 영수증 추출 vision LLM 컨슈머 신규.** `LlmProviderConfig` 의 unique 키가 `(provider, purpose)` 로 확장되어 같은 `ollama-cloud` 에서도 텍스트 추론 (`chat`) 과 비전 (`image`) 모델을 별도 row 로 운영한다. AI 라우트의 모든 `:id` 엔드포인트가 `:purpose` 파라미터를 추가로 받고, `AiConfigService.getResolved(provider, purpose)` 가 purpose 별로 다른 ResolvedProviderConfig 를 반환한다. `adapterCache` 키에도 purpose 가 포함돼 chat/image 어댑터·FIFO 게이트가 분리된다. env fallback 은 `chat` purpose 에만 적용 — `image` 는 DB row 가 있어야 활성화된다. 신규 컨슈머 [`settlement-extraction`](settlement.md) 모듈이 `getResolved('ollama-cloud', 'image')` 로 vision provider 를 얻어 영수증 → 구조화 항목 추출에 사용. 어드민 UI(`AdminAiKeysPage`)는 (provider × purpose) 조합별로 카드를 그리고 "다른 용도 추가" 버튼으로 신규 조합을 등록할 수 있다. `AdminAiTestPage` 는 현재 chat 만 다룬다.

## Purpose [coverage: high — 7 sources]

`apps/friendly`의 LLM 통합 모듈. Ollama Cloud(`https://ollama.com`)를 기본 백엔드로
두고, 어드민 전용으로 노출되는 텍스트 컴플리션·배치 컴플리션·프로바이더 설정
CRUD·연결 테스트·모델 카탈로그·**실시간 사용량 텔레메트리**를 제공한다. 모듈
자체는 어떤 도메인 로직과도 결합돼 있지 않으며, 다른 모듈이 LLM이 필요해질 경우
`AdapterCache` 싱글톤을 통해 같은 어댑터 인스턴스(=같은 purpose 게이트)를 공유하고,
같은 키를 쓰면 그 위에서 **계정 게이트**까지 공유한다.

provider 는 두 차원으로 식별된다.

1. **`provider`** — 벤더 식별자 (`'ollama-cloud'`). `LlmProviderId` enum.
2. **`purpose`** — 용도 (`'chat'` | `'image'` | `'log-analysis'` | `'meal-photo'` |
   `'meal-recommend'`). 같은 벤더라도 텍스트·비전·로그추론·식단 인식/추천은 보통 모델이
   달라 한 row 에 묶기 어렵다. `LlmProviderPurpose` enum — 2026-06 `log-analysis` 로
   3종, 2026-08-22 식단용 2종이 더해져 **5종**.

DB 의 unique 키는 `(provider, purpose)` 튜플 — 같은 provider 의 다른 purpose 는
독립 row 이며, **모델·기본값**은 purpose 별로 분리된다. 단 **키·baseUrl 은
계정 단위로 공유**한다 (`chat` 이 "계정 대표" — 아래 참고). 어댑터(=purpose 게이트)는
purpose 별로 분리되지만, 같은 키를 쓰는 어댑터들은 그 위에서 **계정 게이트 하나**를
공유해 합산 동시성이 계정 cap 을 넘지 않는다.

**계정 1키 공유 모델** (이번 라운드 핵심 설계 변경):

- `chat` purpose 가 **계정 대표** — 키·baseUrl 은 chat row(없으면 env)에 둔다.
- `image`·`log-analysis`·`meal-photo`·`meal-recommend` 는 자기 row 에 키가 없으면
  **계정(chat) 키를 상속**한다(`getResolved` 내부 `resolveAccountCredentials`). 키
  하나만 있으면 다섯 용도가 다 돈다.
- **모델은 상속하지 않는다** — 용도마다 달라야 하므로 각 row 의 `defaultModel`
  (없으면 용도별 `.env` 폴백)만 본다.
- 와이어 `LlmProviderConfig` 에 출처 배지 필드 — `keySource`(own/inherited/env/none)
  + `defaultModelSource`(own/env/none).

현재 LLM 게이트 경유 컨슈머(모두 `AiConfigService.getResolved('ollama-cloud', <purpose>)`
+ `adapterCache` 경로) + 임베딩 컨슈머 별도.

- 어드민 UI(`apps/web`)의 [`AdminAiKeysPage`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
  / [`AdminAiTestPage`](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
  / [`AdminAiUsagePage`](../../apps/web/src/routes/admin/AdminAiUsagePage.tsx)(텔레메트리).
- [`summary`](friendly.md) 모듈 — 리뷰 단위 구조화 분석 (`ANALYSIS_VERSION`).
  `chat` purpose.
- [`menu-grouping`](menu-grouping.md) 모듈 — 식당당 1회 메뉴 표기 정규화
  (`MENU_GROUPING_VERSION`). `chat` purpose.
- [`analytics`](analytics.md) 모듈 — 식당 가로지르기 글로벌 머지 두-패스
  (`GLOBAL_MERGE_VERSION`). `chat` purpose.
- [`auto-discover`](auto-discover.md)(검색어 생성) / [`review-search`](review-search.md)(리랭크·
  RAG·검증) / [`review-clustering`](review-clustering.md)(군집 라벨) / [`food`](food.md) 의
  `food-classify`(`FOOD_CLASSIFY_VERSION`, 40개 청크) — 모두 `chat` purpose. 상세는 각 토픽.
- [`settlement-extraction`](settlement.md) 모듈 — 영수증 이미지 → 메뉴/금액 구조화
  추출 (`EXTRACTION_VERSION`). **`image` purpose**. 도메인 자체는 settlement 토픽 참고.
- [`log-analysis`](../../apps/friendly/src/modules/logs/log-analysis.service.ts) 모듈
  — 실패 run 1건 LLM 원인 분석. **`log-analysis` purpose**. row
  미설정 시 자동 분석을 조용히 skip (수동 재분석 통로만 남김). 상세는 logs 토픽.
- [`meal-recognition`](meal.md) 모듈 — 식단 사진 → 음식 후보 인식
  (`MEAL_RECOGNITION_VERSION = 2`, 후보 강제). **`meal-photo` purpose — 2026-08-22 신규**.
  모델 없으면 `no_provider`. 라우트의 SQLite 일일 quota 가 LLM 호출 앞단.
- [`meal-recommendation`](meal.md) 모듈 — 다음 끼니 추천
  (`MEAL_RECOMMENDATION_VERSION = 2`). **`meal-recommend` purpose — 신규**. 미설정이면
  LLM 없이 점수 폴백(`status: 'fallback'`).

임베딩 컨슈머(별개 경로 — LLM 게이트/텔레메트리 안 거침):

- [`review-search`](review-search.md) / [`review-clustering`](review-clustering.md)
  — Ollama 의 `/api/embed` 를 **직접 fetch** (전용 `OLLAMA_EMBED_BASE_URL`/
  `OLLAMA_EMBED_MODEL` env 를 `process.env` 에서 직접 읽음, `embed()` 내부 헬퍼;
  기본 `http://localhost:11434` + `bge-m3`). chat/image 어댑터·게이트와 무관하고
  텔레메트리 집계에도 안 잡힌다.
  ai 토픽에선 "임베딩은 별도 경로" 정도만 — 상세는 각 토픽.

LLM 게이트 도메인들은 모두 같은 `adapterCache` import + `AiConfigService.getResolved(...)`
경로를 거치므로 동시성 캡(2단) + 429 재시도/백오프 + 텔레메트리 계측이 도메인을
가리지 않고 적용된다. 도메인별로 다른 건 prompt + JSON schema 모양 + 청크 사이즈 + purpose.

핵심 설계 목표:

- 벤더 SDK를 서비스 레이어 밖으로 격리(`LLMProvider` 어댑터 인터페이스).
- 운영자가 서버 재시작 없이 API 키·동시성 한도·기본 모델을 바꿀 수 있도록
  DB 우선 + env fallback 2단 구성. **키·baseUrl 의 env fallback 은 `chat`
  한정**(계정 대표), **모델 env fallback 은 다섯 용도 모두**(용도별 `OLLAMA_*_MODEL`
  변수, 조립은 `buildLlmProviderEnv()` 한 곳).
- 단건/배치 호출 모두에서 부분 실패를 허용하고, 도메인 에러를 와이어 친화적인
  `AiErrorCodeType`으로 변환.
- Ollama 고유 옵션(`num_ctx`, `num_predict`, `format`, **`images`**, **`think`**)을
  1차 시민으로 노출 — reasoning/structured-output/vision 워크로드에서 컨텍스트
  잘림·파싱 실패·thinking 제어를 위한 의도적 누출.
- **용도별 모델 분리 + 계정 키 공유** — purpose 별 모델/동시성은 따로, 키는
  하나. 한 키로 다섯 용도를 돌리되 무거운 vision 호출이 chat 슬롯을 묶지 않게
  purpose 게이트로 분리하고(식단 사진 `meal-photo` 는 영수증 `image` 와도 분리),
  그 합산은 계정 게이트로 묶는다.
- **계정 단위 동시성 cap** — Ollama Cloud 는 계정(키)당 동시 호출을 제한하므로,
  purpose 게이트 합산이 그 한도를 넘지 않도록 키 단위 게이트를 한 겹 더 둔다.
- **표시 전용 텔레메트리** — 강제(예산 차단)는 하지 않고, 어드민이 "지금 얼마나
  쓰는지"를 실시간으로 본다. 모든 호출이 한 어댑터 경로로 수렴하는 구조를 이용해
  호출부 수정 없이 계측.

## Architecture [coverage: high — 13 sources]

```
apps/friendly/src/modules/ai/
├── adapters/
│   ├── llm-provider.ts              # LLMProvider 인터페이스 + 4종 도메인 에러
│   │                                # + numCtx/format/images/think 옵션
│   ├── ollama-cloud.adapter.ts      # /api/chat + /api/tags 어댑터
│   │                                # + 2단 게이트(purpose→account) 통과
│   │                                # + 429 지수 백오프 재시도(슬롯 보유)
│   │                                # + messages[i].images vision payload
│   │                                # + onEvent 계측 훅(start/end) + callId
│   └── ollama-cloud.adapter.test.ts
├── concurrency-gate.ts              # ConcurrencyGate(signal-aware FIFO) 추출 +
│   │                                #   AccountGateRegistry(키 단위 공유, max cap)
│   │                                #   모듈 싱글턴 accountGateRegistry
├── concurrency-gate.test.ts
├── llm-telemetry.ts                 # LlmTelemetry 싱글턴 — 표시 전용 인메모리 집계
│   │                                #   (recent 50 / 분버킷 60 / byModel 30 상한)
│   │                                #   record(purpose, event) + snapshot + subscribe
├── llm-telemetry.test.ts
├── telemetry.route.ts               # GET /telemetry(스냅샷) + /telemetry/stream(SSE)
├── adapter-cache.ts                 # 모듈 레벨 싱글톤. 키별 Map(MAX_ENTRIES=8) —
│                                    #   purpose 어댑터 공존 + 계정 게이트 주입 + 계측
├── adapter-cache.test.ts
├── ai.config.service.ts             # LlmProviderConfig CRUD + 계정 키 상속 +
│                                    #   용도별 모델 env fallback + 마스킹 + 출처
├── ai.config.service.test.ts
├── llm-provider-env.ts              # buildLlmProviderEnv(): .env → LlmProviderEnv 단일 조립점
│                                    #   (라우트·플러그인·스크립트·research 33파일이 소비)
├── ai.service.ts                    # complete / completeBatch / classifyError
│                                    #   (admin 라우트 한정, 항상 chat purpose)
├── ai.service.test.ts
├── ai.route.ts                      # 8개 admin 엔드포인트 (:id/:purpose)
│                                    #   + providerModelsPreview (저장 없이 키 검증)
└── ai.test.ts
```

모델 식별/추천 헬퍼는 패키지로 분리 —
[`packages/utils/src/aiModel.ts`](../../packages/utils/src/aiModel.ts):
`parseModelFamily` / `groupModelsByFamily`(모델 팝업 그룹핑) / `isVisionModel`
(이름 휴리스틱 `VISION_NAME_RE` + 멀티모달 계열 접두 `MULTIMODAL_FAMILY_RE`, 2026-08-22) /
`recommendModelForPurpose(purpose, models)`(키 입력 후 폼 프리필, 5용도) /
**`thinkOptionForModel(modelId)`**(JSON 호출용 `think` 값 — gpt-oss `'low'`, 그 외 `false`).
순수 함수라 웹·friendly 어디서든 import. 테스트
[`aiModel.test.ts`](../../packages/utils/src/aiModel.test.ts).

진입점은 [`ai.route.ts`](../../apps/friendly/src/modules/ai/ai.route.ts)에서
export 하는 `aiRoutes` fastify 플러그인. fastify의 `@fastify/autoload`가
`src/modules/<domain>/*.route.ts` 패턴으로 자동 등록한다. 모든 핸들러는
`app.withTypeProvider<ZodTypeProvider>()` 위에서 `fastify-type-provider-zod`로
자동 검증되며, 스키마는
[`packages/api-contract/src/schemas/ai.ts`](../../packages/api-contract/src/schemas/ai.ts)에서
가져온다.

핵심 협조 객체:

- **`AiConfigService`** — `LlmProviderConfig` Prisma 모델을 감싼 CRUD/조회 레이어.
  생성자에 `LlmProviderEnv`를 인자로 받아 테스트가 가짜 env 주입 가능. 실코드는
  **항상 `buildLlmProviderEnv()`**([`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts))
  로 조립한다 — 라우트·플러그인·스크립트 어디서도 `env.OLLAMA_*` 를 직접 묶지
  않는다(2026-08-22 `cc8399a`). 백그라운드 도메인(summary/menu-grouping/analytics/
  settlement-extraction/log-analysis/meal-recognition/meal-recommendation/food-classify …)은
  모두 자체 인스턴스를 만들어 `getResolved(provider, purpose)`를 호출 — 같은 DB row 를
  읽으므로 운영자가 키를 바꾸면 다음 호출부터 즉시 반영된다. `purpose` 가 두 번째
  인자(5종). chat 이 아닌 용도가 자기 키 없이 호출되면 `resolveAccountCredentials` 가
  chat row(없으면 env) 키를 한 번 더 읽어 상속시킨다. `LlmProviderEnv.defaultModels` 는
  `Record<purpose, string>` 으로 용도별 모델 폴백을 들고 있다(5키 전부 필수).
- **`AdapterCache`** — `(provider, purpose, apiKey, baseUrl, maxConcurrent, timeoutMs)`
  6-tuple 키로 `OllamaCloudAdapter` 를 캐시하는 모듈 레벨 싱글톤
  ([`adapter-cache.ts`](../../apps/friendly/src/modules/ai/adapter-cache.ts)). **이번
  라운드부터 "마지막 1개"가 아니라 키별 `Map`** (`MAX_ENTRIES = 8`, 삽입 순서
  기준 LRU 축출) — chat/image/log-analysis 어댑터가 동시에 공존한다(이전 "교체"
  gotcha 해소; 상한은 키 회전으로 죽은 엔트리가 무한히 쌓이는 것만 막는 안전벨트).
  `get(resolved)` 가 어댑터를 만들 때 두 가지를 주입한다: (1) `accountGateRegistry`
  에서 받은 **계정 게이트**(키 단위 공유, cap = 그 키 purpose 한도들의 max),
  (2) `onEvent` 계측 훅(purpose 라벨을 붙여 `llmTelemetry.record` 로 흘림). 또
  `llmTelemetry.registerPurposeGate(purpose, () => adapter.gateSnapshot())` 로
  purpose 게이트 스냅샷 함수도 등록한다. `summary` / `menu-grouping` / `analytics` /
  `ai.route` / `settlement-extraction` / `log-analysis` 가 모두 같은 import 를 공유.
- **`AccountGateRegistry`** (`concurrency-gate.ts`) — `apiKey|baseUrl` 키로
  `ConcurrencyGate` 를 1개씩 보관하는 모듈 싱글턴(`accountGateRegistry`). 게이트는
  **어댑터 캐시 회전과 무관하게 살아남아** 설정 변경 중에도 동시성이 일시 초과되지
  않는다. `get(...)` 호출마다 그 키의 purpose 별 해석된 한도를 기록하고 cap 을
  `max(values)` 로 `setLimit` — 어드민이 웹 설정의 maxConcurrent 를 바꾸면 다음
  resolve 시점에 계정 cap 과 패널 분모가 함께 따라간다(env 는 부트스트랩 폴백).
  `MAX_GATES = 8` 안전벨트 + `snapshots()` 텔레메트리 노출(키는 숨김).
- **`LlmTelemetry`** (`llm-telemetry.ts`) — `record(purpose, event)` 로 start/end
  이벤트를 받아 totals / byPurpose / byModel / 분 버킷(1·5·60분 윈도우) / active /
  recent 링버퍼로 집계하는 표시 전용 싱글턴(`llmTelemetry`). 전부 고정 상한이라
  장기 가동 누수 없음. `subscribe(fn)` 로 SSE 가 dirty 플래그를 받고, `snapshot()`
  이 게이트(account + purposes) 스냅샷까지 합쳐 와이어 타입으로 반환.

요청 흐름(어드민 라우트 — chat 전용):

1. fastify가 토큰 검증(`app.authenticate`)·관리자 가드(`app.requireAdmin`)
   실행.
2. `buildService()`가 매 요청마다 `config.getResolved('ollama-cloud', 'chat')`로
   최신 스냅샷을 가져온다 (`/complete`/`/complete-batch` 는 chat 전용 —
   `AiService.complete` 내부도 항상 `'chat'` 으로 호출).
3. resolved가 null이면 throwing stub provider로 `AiService`를 만들어 반환,
   아니면 `AdapterCache.get(resolved)`가 캐시된/새 `OllamaCloudAdapter`를 준다.
4. `AiService.complete()` 또는 `completeBatch()`가 실제 호출을 수행하고
   discriminated union 결과를 반환.

요청 흐름(어드민 라우트 — provider CRUD/test):

1. `:id`(`ollama-cloud`) + `:purpose`(5종 enum) 가
   `ProviderParams` (zod `{ id: LlmProviderId, purpose: LlmProviderPurpose }`) 로 검증.
2. `config.getResolved(req.params.id, req.params.purpose)` — purpose 별로
   따로 풀린다. chat 외 용도는 자기 키가 없으면 계정(chat row, 없으면 env)
   키를 상속하지만, **모델**(자기 row 또는 용도별 `.env`)이 없으면 `null` 반환.
3. `cache.get(resolved)` 가 `(provider, purpose, …)` 키로 어댑터 획득.

요청 흐름(어드민 라우트 — 모델 미리보기, 저장 없음):

1. `POST /providers/:id/:purpose/models/preview` 가 본문으로 `PreviewLlmModelsInput`
   (`apiKey` + 선택 `baseUrl`) 을 받는다. DB 는 아예 안 거친다.
2. 핸들러가 그 자리에서 `new OllamaCloudAdapter({ apiKey, baseUrl: body.baseUrl ?? env.baseUrl, timeoutMs, maxConcurrent })`
   로 일회용 어댑터를 만든다 — **`adapterCache` 는 사용하지 않는다.**
   (미저장 키를 캐시 키로 박으면 다른 요청이 그 키를 우연히 재사용할 수 있어
   의도적으로 피한 것 — gotcha 참고).
3. `adapter.listModels()` 만 한 번 호출 → 응답을 `PreviewLlmModelsResult`
   (`{ ok: true, models }` | `{ ok: false, error, message }`) 로 감싸 반환.
   401/네트워크 실패는 `classifyError` 가 `AiErrorCodeType` 으로 변환.
4. 어드민 UI 가 받은 `models[]` 로 드롭다운을 채우고, 사용자가 모델을 고른 뒤
   별도 PUT `/providers/:id/:purpose` 로 row 를 실제 저장. 이렇게 두 단계로 끊어서
   "저장됐는데 키가 틀려 models 가 빈 배열 → 수동 정리" 사이클을 없앴다.

요청 흐름(백그라운드 텍스트 도메인 — summary/menu-grouping/analytics/log-analysis 공통):

1. 도메인 서비스가 자체 `AiConfigService`로 `getResolved('ollama-cloud', <purpose>)`
   호출 (chat 셋 + `log-analysis`) → null 이면 작업을 즉시 실패/skip.
   log-analysis 는 row 없으면 키 상속(chat/env)으로 동작 가능하지만, 모델이
   `log-analysis` 폴백조차 없으면 `null` 이라 자동 분석을 조용히 skip.
2. `adapterCache.get(resolved)`로 공유 어댑터 핸들 획득 — 키가 같으면 chat 과
   계정 게이트를 공유하므로 백그라운드 부하가 어드민 호출과 합산 cap 을 나눠 쓴다.
3. `provider.complete({ prompt, systemPrompt, model, numCtx, format, think?, ... })`
   직접 호출 — `AiService` 의 rate-limit/discriminated union 래핑은 거치지 않음.
   배치 분할·재시도·결과 머지는 도메인 책임. (호출은 텔레메트리에 자동 계측됨.)
4. structured output (`format`)으로 받은 텍스트를 도메인 스키마로 parse →
   실패 시 fallback identity (입력 키 = canonical) 또는 stale 표시.

요청 흐름(영수증 추출 — settlement-extraction, image purpose):

1. `SettlementExtractionService.resolveProvider()` 가
   `aiConfig.getResolved('ollama-cloud', 'image')` 호출. 키는 계정(chat/env)에서
   상속 가능하지만 **image 모델**(자기 row 또는 `OLLAMA_IMAGE_MODEL`)이 없으면
   resolved 의 `defaultModel === ''` → `no_provider` 에러로 라우트가 400 반환.
2. `adapterCache.get(resolved)` — chat 어댑터와 다른 인스턴스 (캐시 키에 purpose
   포함). 단 같은 계정 키면 chat 과 **계정 게이트**를 공유한다.
3. 영수증 이미지를 sharp 로 정규화(EXIF 회전, 1600px 다운스케일, JPEG q=80) 후
   base64 인코딩 → `provider.complete({ images: [b64], format: EXTRACTION_JSON_SCHEMA,
   systemPrompt, prompt, numCtx: 8192, maxTokens: 4000, temperature: 0.1, signal })`.
   `prompt` 는 `buildExtractionUserPrompt({ restaurantName, menuNames, roundHint })`
   로 매 호출마다 동적 조립 — `roundHint = { index, total }` 이 있고 `total > 1`
   이면 "차수: N차 회식 중 K차 영수증" 한 줄이 상단에 박힌다.
4. 응답 JSON 을 zod 로 검증 + `extractFirstJsonObject` 후처리, items[].amount
   가 0 이면 `unitPrice * quantity` 로 보정, 합계 불일치 경고 부착.

multi-receipt split (한 사진에 N차 영수증이 좌→우로 같이 찍힌 케이스) 도 같은
`image` purpose 어댑터를 그대로 쓴다. service 레이어가 sharp 로 이미지 자체를
N 조각으로 자른 뒤 같은 `imageToken` 으로 N번 `complete` 를 호출하고, 각 호출의
`roundHint` 만 `{ index: k, total: N }` 로 다르게 준다. LLM provider/모델·키·동시성
한도는 한 row 그대로 — purpose 차원에서 더 쪼개지 않는다.

요청 흐름(식단 사진 인식·추천 — `meal-photo` / `meal-recommend`, 2026-08-22~):

1. 라우트가 per-IP 레이트리밋(`mealRecognize`/`mealRecommend` 분당 10) 뒤 **일일 quota**
   를 먼저 소비(`MealDailyQuotaService.consume(userId, KST 날짜, purpose, limit)` —
   SQLite `meal_daily_quotas` 조건부 upsert 한 문장, `limit <= 0` 이면 무제한). 초과면
   429 `daily_limit` 로 끝 — LLM 경로에 진입하지 않는다.
2. `MealRecognitionService.resolveProvider()` 가 `getResolved('ollama-cloud', 'meal-photo')`
   → `defaultModel` 비면 null → `no_provider`. `adapterCache.get(resolved)` — 영수증
   `image` 어댑터와 **별개 인스턴스**(purpose 게이트·텔레메트리 라벨 분리), 같은 계정
   키면 계정 게이트는 공유.
3. `provider.complete({ images, format: MEAL_RECOGNITION_JSON_SCHEMA, numCtx, maxTokens,
   temperature, think: thinkOptionForModel(model), signal })` — 자체
   `VISION_TIMEOUT_MS = 90_000`(어댑터 timeout 과 별개). 파싱 실패 시 같은 모델로
   `format: 'json'` 복구 호출 1회(역시 `think` 적용).
4. 추천은 `getResolved('ollama-cloud', 'meal-recommend')` + `MEAL_RECOMMENDATION_JSON_SCHEMA`
   + 같은 `think` 처리. 미설정이면 LLM 없이 점수 폴백. 프롬프트·후보 검증·캐시는 [meal](meal.md).

요청 흐름(어댑터 내부 — 2단 게이트):

1. `purposeGate.acquire(signal)` — 이 어댑터 소유 게이트(`maxConcurrent`).
   `inflight < limit && waiters 비었음` 이면 즉시 진입, 아니면 FIFO `waiters`에
   push. **signal-aware** — 큐 대기 중 abort 되면 대기열에서 즉시 이탈 +
   `LLMCancelledError` reject (슬롯 잡았다 놓는 낭비 방지).
2. (있으면) `accountGate.acquire(signal)` — 키 단위 공유 게이트. 같은 키의 모든
   purpose 가 이 게이트도 통과해야 하므로 합산 동시성이 계정 cap 을 못 넘는다.
   acquire 순서가 모든 호출자에서 동일(purpose→account)해 교착 없음. 미주입
   시(테스트/ad-hoc 어댑터)는 purpose 게이트만.
3. `completeInstrumented()` — `callId = nextCallId++`, `onEvent({type:'start',
   callId, model, queueWaitMs})` emit (queueWaitMs = 게이트 진입까지 걸린 시간).
4. `completeWithRetry()` — `doComplete()` 시도. 응답이 `LLMUpstreamError(429)`
   또는 본문에 `too many concurrent requests` / `rate limit` 이 있으면 200·400·800ms +
   jitter (cap 2000ms) 로 최대 3회 재시도. **슬롯을 잡은 채** 재시도하므로 동시성
   한도는 유지된다. `stats.retries` 누적.
5. `doComplete()` — `/api/chat` POST. body 에 `messages` (system + user),
   `options.temperature`, `options.num_predict`, `options.num_ctx`, 최상위
   `format` / `think` 를 조립. vision 호출이면 user 메시지에 `images: [base64...]` 추가.
6. `onEvent({type:'end', callId, status, errorName, prompt/completionTokens,
   durationMs, retries})` emit (ok/error/cancelled/timeout 분기). emit 은 항상
   try/catch 로 삼켜 본 호출 흐름을 깨지 않는다.
7. `accountGate.release()` → `purposeGate.release()` (역순, finally) — 다음
   waiter `drain()`.

요청 흐름(텔레메트리 — 표시 전용):

1. **수집** — AdapterCache 가 어댑터를 만들 때 `onEvent = (e) => llmTelemetry.record(purpose, e)`
   를 주입하므로, 모든 LLM 호출의 start/end 가 purpose 라벨과 함께 한 싱글턴에 모인다.
   purpose 게이트 스냅샷 함수도 `registerPurposeGate` 로 등록(어댑터 교체 시 덮어씀).
2. **조회(REST)** — `GET /telemetry` → `llmTelemetry.snapshot()` 한 방. 어드민
   가드.
3. **조회(SSE)** — `GET /telemetry/stream` → 연결 직후 `snapshot` 1회, 이후 이벤트
   dirty 플래그 + 1초 tick 으로 코얼레싱해 전체 스냅샷 push. 활동 중(active/큐 대기)
   이면 이벤트가 없어도 게이트 상태가 변하므로 `hasActivity()` 가 true 인 동안
   tick 마다 push. 15초 heartbeat 코멘트. `req.raw.on('close')` 로 정리.
4. **인증** — SSE 는 EventSource 가 헤더를 못 보내므로 `?token=` 쿼리도 받는다
   (jwtVerify 우선, 실패 시 query token 검증). role !== ADMIN 이면 401. analytics/
   auto-discover SSE 와 동일 패턴 ([sse-token-auth](../concepts/sse-token-auth.md)).

## Talks To [coverage: high — 14 sources]

**상류(upstream — 모듈을 호출하는 측):**

- 어드민 UI(`apps/web`) — `AdminAiKeysPage` 가 `useProviders` /
  `useUpdateProvider` / `useDeleteProvider` / `useTestProvider` /
  `useProviderModels` / `usePreviewModels` 훅으로 fetch. **이번 라운드부터
  "계정 카드 1장 + 용도 카드 N장"** 레이아웃 — 계정 카드(`ACCOUNT_PURPOSE` = chat)가
  키·baseUrl·동시성을 들고, image·log-analysis·meal-photo·meal-recommend 카드는 모델만
  편집하며 키는 계정에서 상속(`KeySourceBadge` 로 own/inherited/env/none 표시). 키 입력 후
  `recommendModelForPurpose(purpose, catalog)`(`@repo/utils`)로 용도에 맞는 모델을
  추천 프리필. 빈 카드 흐름은 "키 + base URL → '모델 미리보기' → `usePreviewModels`
  → 드롭다운 선택 → 저장". `AdminAiTestPage` 는 `useCompleteAi` / `useCompleteBatchAi`
  로 단건/배치 + 모델 비교 + 샘플 N개 모드 — 현재 chat purpose 만.
- **어드민 텔레메트리 UI** — [`LlmUsagePanel`](../../apps/web/src/components/admin/LlmUsagePanel.tsx)
  (어드민 전 페이지 상시 플로팅 패널, 접힘/코너 localStorage 영속) +
  [`AdminAiUsagePage`](../../apps/web/src/routes/admin/AdminAiUsagePage.tsx)(상세 표).
  둘 다 [`useLlmTelemetry`](../../packages/shared/src/hooks/useLlmTelemetry.ts) 로
  같은 SSE 스냅샷(React Query 캐시 공유)을 구독 — 초기 REST 스냅샷 → 이후 SSE 가
  캐시 덮어쓰기, `onerror` 지수 백오프 재연결. 패널의 핵심 게이지는 **계정 게이트
  합산**(`sumGates`) inflight/limit + 큐, purpose 배지, active 호출, 1·5·60분 윈도우.
- [`summary`](friendly.md) 모듈 — `adapterCache.get(resolved)` 로 같은 chat 어댑터를
  가져다 리뷰 단위 구조화 분석 (`ANALYSIS_VERSION = 4`, traits + menus[].sentiment
  필수)을 백그라운드로 실행
  ([`summary.service.ts`](../../apps/friendly/src/modules/summary/summary.service.ts)).
  `extractFirstJsonObject` 헬퍼를 외부 export — `<think>` 블록 제거 + 균형괄호
  JSON 추출 후처리 로직을 다른 도메인이 재사용 가능. settlement-extraction 도 사용.
- [`menu-grouping`](menu-grouping.md) 모듈 — 식당당 1회, distinct 메뉴 변형 리스트를
  80개 청크로 분할해 `provider.complete({ format: MENU_GROUPING_JSON_SCHEMA })`
  호출. JSON schema 는 `additionalProperties: { type: 'string' }`. 빈 응답이면
  identity fallback (입력 키 = canonical). chat purpose.
- [`analytics`](analytics.md) 모듈 — 두-패스 글로벌 머지. pass1 청크별로 50개씩
  `format: GLOBAL_MERGE_JSON_SCHEMA` 호출 후, pass2 에서 청크간 결과를 다시
  머지. JSON schema 의 값은 `{ canonical, categoryPath }` 객체. v2 는 출력
  토큰이 늘어나서 청크 사이즈가 50으로 줄었다. chat purpose.
- [`settlement-extraction`](settlement.md) 모듈 — image purpose. 단건 호출 (영수증
  1장 = LLM 1콜). `EXTRACTION_VERSION`, `EXTRACTION_SYSTEM_PROMPT`,
  `EXTRACTION_JSON_SCHEMA` 는
  [`settlement-extraction.prompts.ts`](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)
  에 묶여 있다. `images: [base64]`, `numCtx: 8192`, `temperature: 0.1`,
  자체 60초 timeout (AbortController) — 어댑터의 chat 타임아웃과 별개.
- [`log-analysis`](../../apps/friendly/src/modules/logs/log-analysis.service.ts) 모듈
  — `log-analysis` purpose. 실패한 백그라운드 run 1건에 대해 LLM 원인 분석을
  돌린다. 자체 `aiConfig`/`adapterCache` 인스턴스(테스트 seam: `cache` 주입). row
  미설정 시 `'log-analysis LLM not configured — auto analysis skipped'` 로그 후
  자동 분석 skip — 어드민이 "AI 키 설정에서 log-analysis 용도를 추가" 해야 켜진다.
  상세 라이프사이클은 logs 토픽.
- [`meal-recognition`](meal.md) / [`meal-recommendation`](meal.md) 모듈 — `meal-photo` /
  `meal-recommend` purpose(2026-08-22 신규). 각자 `resolveProvider()` 가 `getResolved`
  → 모델 비면 null → `no_provider`. 둘 다 `format` JSON schema +
  `think: thinkOptionForModel(model)`, 인식은 자체 90s timeout + `format:'json'` 복구
  호출 1회. 라우트의 SQLite 일일 quota(`MEAL_RECOGNIZE_DAILY_LIMIT` 30 /
  `MEAL_RECOMMEND_DAILY_LIMIT` 20, per-user)가 LLM 호출 앞단 — 초과는 어댑터에 안 닿는다.
- [`food-classify`](food.md) — `chat` purpose, `FOOD_CLASSIFY_CHUNK_SIZE = 40` 청크 +
  `thinkOptionForModel`. 미설정이면 `noProvider: true` 로 조용히 skip.
- **임베딩 컨슈머(별도 경로)** — [`review-search`](review-search.md) /
  [`review-clustering`](review-clustering.md) 은 Ollama `/api/embed` 를 직접 fetch
  (`OLLAMA_EMBED_BASE_URL`/`OLLAMA_EMBED_MODEL` 전용 env 를 `process.env` 에서 직접
  읽음, `review-search.service.ts` 의 `embed()` private 헬퍼). chat/image 어댑터·
  게이트·텔레메트리와 **무관** — ai 모듈의 `LLMProvider`/`adapterCache` 를 쓰지
  않는다. 여기서는 "임베딩은 별도
  경로" 만 기억하고 상세는 각 토픽.

**하류(downstream — 모듈이 의존하는 측):**

- `app.prisma` (fastify decorator) — `llm_provider_configs` 테이블 read/write.
  unique 키 `(provider, purpose)`. log-analysis row 조회 시 chat row 도 한 번 더
  읽어(`resolveAccountCredentials`) 키 상속.
- `app.authenticate`, `app.requireAdmin` — `plugins/jwt.ts`가 등록한 onRequest
  훅. ai.route 의 8개 + telemetry 스냅샷에 적용. `telemetry/stream` 은 EventSource
  헤더 제약으로 핸들러 안에서 `jwtVerify` + `?token=` 직접 검증.
- `env` (`config/env.ts`) — `OLLAMA_CLOUD_API_KEY` / `OLLAMA_CLOUD_BASE_URL`
  / `OLLAMA_CLOUD_TIMEOUT_MS` / `OLLAMA_CLOUD_MAX_CONCURRENT` + **용도별 모델
  변수 5종** `OLLAMA_DEFAULT_MODEL`(chat) / `OLLAMA_IMAGE_MODEL` / `OLLAMA_LOG_ANALYSIS_MODEL`
  / `OLLAMA_MEAL_PHOTO_MODEL` / `OLLAMA_MEAL_RECOMMEND_MODEL`. 키·baseUrl 의 env
  fallback 은 `chat`(계정 대표)에만, **모델 fallback 은 다섯 용도 각자**
  (`LlmProviderEnv.defaultModels[purpose]`). env → `LlmProviderEnv` 변환은
  `buildLlmProviderEnv()` 한 곳([`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts)).
- Ollama Cloud HTTP API — `POST {baseUrl}/api/chat` (단건 컴플리션 + 구조화
  출력 + vision `images` + `think`), `GET {baseUrl}/api/tags` (모델 카탈로그).
  두 호출 모두 `Authorization: Bearer {apiKey}` 헤더 필수. (임베딩 `/api/embed`
  는 review-search 가 별도로 부른다 — 이 모듈 경유 아님.)
- `@repo/api-contract` — 모든 와이어 타입. `LlmProviderPurpose` 5종(`'log-analysis'`
  2026-06, `'meal-photo'`·`'meal-recommend'` 2026-08-22), `LlmKeySource`/`LlmModelSource`
  enum + `keySource`/`defaultModelSource` 필드, 텔레메트리 타입 일습(`LlmTelemetrySnapshot` /
  `LlmTelemetryCall` / `LlmGateSnapshot` / `LlmTelemetryWindow` / `LlmCallStatus`).
- `@repo/utils` — `aiModel.ts` 헬퍼 (모델 식별/추천 + `thinkOptionForModel`). 순수 함수.
  utils 는 api-contract 를 import 못 하므로(순환 금지) purpose 리터럴을 `ModelPurpose`
  유니온으로 재선언 — enum 이 늘면 둘을 같이 고친다.
- `plugins/empty-body-parser.ts` — fastify 기본 JSON 파서를 교체. 빈 바디를
  `{}`로 통과시켜 `POST /providers/:id/:purpose/test` 같은 actionless 호출이
  거부되지 않게 함.

**내부 통신 패턴:**

- `AiService.runOne()`은 `provider.complete(...)`만 await — 어댑터의 2단 게이트가
  실제 동시 fetch 수를 제한 (purpose `maxConcurrent` ∩ 계정 cap).
- `AiService.completeBatch()`는 `Promise.allSettled`로 펼친다. 어댑터 큐 + zod
  `max(10)` 제약으로 폭발하지 않음.
- `OllamaCloudAdapter.doComplete()`는 caller `AbortSignal`과 자체 timeout을
  단일 `AbortController`로 합성하고, abort가 어느 쪽에서 왔는지 플래그로
  추적해 `LLMCancelledError` vs `LLMTimeoutError`를 구분.
- 429 재시도는 어댑터 내부에서만 보이고 caller에는 성공 또는 최종 실패만
  올라간다. `AiService` / 도메인 서비스 모두 재시도 사실을 모른다. 단 재시도
  횟수(`retries`)는 end 이벤트로 텔레메트리에 흘러 패널/페이지에 노출된다.
- 계측 `onEvent` 는 본 호출의 관찰자 — emit 이 던져도 try/catch 로 삼켜 호출
  흐름을 깨지 않는다. 텔레메트리 리스너 콜백도 동일.
- 게이트 acquire 순서는 모든 호출자에서 동일(purpose → account)이라 두 게이트가
  교착하지 않는다. release 는 역순.

## API Surface [coverage: high — 9 sources]

모든 라우트 prefix는 `Routes.Ai`(=`/api/v1/admin/ai/*`)이며, 항상
`onRequest: [authenticate, requireAdmin]` 가드가 걸려 있다. provider 식별은
**`:id` + `:purpose`** 두 path 파라미터.

| 메서드 | 경로                                            | 본문                          | 응답                       |
| ------ | ----------------------------------------------- | ----------------------------- | -------------------------- |
| POST   | `/complete`                                     | `AiCompleteInput`             | `AiCompleteResult`         |
| POST   | `/complete-batch`                               | `AiCompleteBatchInput` (≤10)  | `AiCompleteBatchResult`    |
| GET    | `/providers`                                    | —                             | `LlmProviderListResult`    |
| PUT    | `/providers/:id/:purpose`                       | `UpdateLlmProviderInput`      | `LlmProviderConfig`        |
| DELETE | `/providers/:id/:purpose`                       | —                             | `204 No Content`           |
| GET    | `/providers/:id/:purpose/models`                | —                             | `LlmModelListResult`       |
| POST   | `/providers/:id/:purpose/models/preview`        | `PreviewLlmModelsInput` (apiKey + baseUrl?) | `PreviewLlmModelsResult` (`{ok:true,models}` \| `{ok:false,error,message}`) |
| POST   | `/providers/:id/:purpose/test`                  | `TestLlmProviderInput` (선택) | `TestLlmProviderResult`    |
| GET    | `/telemetry`                                    | —                             | `LlmTelemetrySnapshot`     |
| GET    | `/telemetry/stream`                             | — (`?token=` 쿼리)            | SSE (`event: snapshot` = `LlmTelemetrySnapshot`) |

- `:id`는 `LlmProviderId` enum(`'ollama-cloud'`)으로 검증 — 알 수 없는 값은 400.
- `:purpose`는 `LlmProviderPurpose` enum 5종(`'chat'` | `'image'` | `'log-analysis'` |
  `'meal-photo'` | `'meal-recommend'`)으로 검증.
- `/complete` / `/complete-batch` 는 path 파라미터 없이 항상 `chat` purpose 를
  사용 (admin AI 테스트 페이지 전용 — 영수증 추출은 자체 라우트).
- `/models/preview` 는 저장 없이 폼 키로 직접 provider 의 `/models` 만 부른다.
  `:id`/`:purpose` 자체는 응답 모양에 영향 주지 않지만 URL 일관성을 위해 동일한
  계층에 묶었다. `adapterCache` 도 우회하므로 미저장 키가 캐시에 박힐 위험 없음.
- 경로 빌더: `Routes.Ai.provider(id, purpose)` / `Routes.Ai.testProvider(id, purpose)`
  / `Routes.Ai.providerModels(id, purpose)` / `Routes.Ai.providerModelsPreview(id, purpose)`.
  텔레메트리는 정적 상수 — `Routes.Ai.telemetry` / `Routes.Ai.telemetryStream`.
- `/telemetry` 는 어드민 가드, 표시 전용 스냅샷. `/telemetry/stream` 은 SSE —
  헤더 인증을 못 받으므로 `?token=` 쿼리로 admin 검증, 1초 코얼레싱으로 전체
  스냅샷을 push (diff 프로토콜 없음 — 스냅샷이 수 KB 라 과설계).

**핵심 export(모듈 외부에서 사용 가능한 이름):**

- [`LLMProvider`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts)
  인터페이스 — `complete(opts)` 필수, `listModels()` 선택. 새 벤더는 이 형태만
  구현하면 슬롯 인.
- `LLMCompleteOptions` — `prompt` / `model` 필수. `systemPrompt`, `temperature`,
  `maxTokens`, **`numCtx`**, **`format` ('json' | JSON Schema 객체)**, **`images`
  (base64 문자열 배열, vision 입력)**, **`think` (boolean | 'low'|'medium'|'high',
  추론 제어)**, `signal` 선택. `numCtx` / `format` / `images` / `think` 는 Ollama 가
  1차 시민으로 받지만, 다른 어댑터는 자유롭게 무시 가능. `think` 는 thinking
  미지원 모델에 보내면 Ollama 가 에러를 내므로 모델 판단은 호출자 몫.
- 도메인 에러 4종(같은 파일):
  - `LLMTimeoutError` — 자체 timeoutMs 만료.
  - `LLMUpstreamError(status, message)` — non-2xx + fetch 자체 실패(`status: 0`).
  - `LLMInvalidResponseError` — 200이지만 `message.content`가 문자열이 아님.
  - `LLMCancelledError` — caller가 `AbortSignal`로 취소.
- [`OllamaCloudAdapter`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts).
- [`adapterCache`](../../apps/friendly/src/modules/ai/adapter-cache.ts) — 모듈
  레벨 싱글톤. `get(resolved)` 가 캐시 hit / miss 결정. 키별 `Map`(MAX_ENTRIES=8) —
  purpose 별 어댑터(5종)가 공존. 어댑터 생성 시 계정 게이트 + 계측
  훅을 주입. summary / menu-grouping / analytics / settlement-extraction /
  log-analysis / meal-recognition / meal-recommendation / food-classify 모두 이 import 를
  공유(`deps.cache` 로 테스트 seam). 테스트는 `new AdapterCache(fakeRegistry)`.
- [`ConcurrencyGate` / `AccountGateRegistry` / `accountGateRegistry`](../../apps/friendly/src/modules/ai/concurrency-gate.ts)
  — signal-aware FIFO 게이트 클래스 + 키 단위 공유 레지스트리(모듈 싱글턴).
  `gate.acquire(signal)` / `release()` / `setLimit(n)` / `snapshot()`,
  `registry.get(apiKey, baseUrl, purpose, purposeLimit)` / `snapshots()`.
- [`llmTelemetry` (`LlmTelemetry`)](../../apps/friendly/src/modules/ai/llm-telemetry.ts)
  — 표시 전용 인메모리 집계 싱글턴. `record(purpose, event)` / `snapshot()` /
  `subscribe(fn)` / `registerPurposeGate(purpose, snap)` / `hasActivity()`.
- [`AdapterCallEvent`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts)
  — `start`(callId/model/queueWaitMs) | `end`(status/errorName/tokens/durationMs/retries)
  계측 이벤트 타입. 어댑터 `onEvent` 콜백 시그니처.
- [`aiModel` 헬퍼 (`@repo/utils`)](../../packages/utils/src/aiModel.ts) —
  `parseModelFamily` / `groupModelsByFamily` / `isVisionModel` /
  `recommendModelForPurpose(purpose, models)` / `thinkOptionForModel(modelId)`. 모델
  식별·그룹핑·용도별 추천·JSON 호출용 `think` 값(`false | 'low'`).
- [`AiConfigService`](../../apps/friendly/src/modules/ai/ai.config.service.ts) +
  `maskApiKey(key)` 헬퍼(`null | '***' | 'sk-***...{last4}'`).
  `getResolved(provider, purpose)` / `update(provider, purpose, input, actorId)` /
  `remove(provider, purpose)` 모두 purpose 가 두 번째 위치 인자. `list()` 가
  `ALL_PURPOSES`(= `LlmProviderPurpose.options`, 5종) 카드를 항상 합성(아래 Data 참고).
- [`AiService`](../../apps/friendly/src/modules/ai/ai.service.ts) +
  `classifyError(unknown) → { error: AiErrorCodeType, message: string }` 헬퍼.
  `AiErrorCodeType`은 `rate_limited | upstream_failed | timeout |
  invalid_response | provider_unavailable | provider_disabled | no_api_key`.
- [`extractFirstJsonObject`](../../apps/friendly/src/modules/summary/summary.service.ts)
  — summary 모듈에서 export 한 후처리 헬퍼. `<think|reasoning|analysis>` 블록
  제거 + 균형괄호 첫 JSON 객체 추출. structured output 의 schema 강제로 실패율은
  낮아도 모델이 가끔 prefix/suffix 텍스트를 흘리는 케이스를 흡수.
  settlement-extraction 도 이걸 import 해서 vision 응답을 정제한다.

**입력 스키마 주요 제약 (api-contract):**

- `AiCompleteInput.prompt` 1–8000자, `model` 1–100자, `systemPrompt` ≤2000,
  `temperature` 0–2, `maxTokens` 양의 정수 ≤4096. 와이어 스키마에는
  `numCtx`/`format`/`images`/`think` 가 노출되지 않는다 — `LLMCompleteOptions` 의 내부
  필드로, `summary` / `menu-grouping` / `analytics` / `settlement-extraction` /
  `log-analysis` 같은 in-process 호출자만 쓴다.
- `AiCompleteBatchInput.items` 1–10개. 각 item은 선택 `clientId`(1–64자)로
  결과 매핑.
- `LlmProviderConfig` 와이어 타입 — `purpose: 'chat'|'image'|'log-analysis'|'meal-photo'|'meal-recommend'`,
  `keySource: 'own'|'inherited'|'env'|'none'`, `defaultModelSource: 'own'|'env'|'none'`,
  `defaultModel`(유효 모델, null=둘 다 없음), `apiKeyMasked`/`hasApiKey` 등.
- 텔레메트리 스키마 — `LlmTelemetrySnapshot` = `startedAt` + `totals`(+ok/cancelled/
  retries) + `byPurpose[]` + `byModel[]` + `windows.{m1,m5,h1}`(avg/maxDurationMs) +
  `active[]` + `recent[]`(`LlmTelemetryCall`: queueWaitMs/durationMs/retries 분리) +
  `gates.{account[], purposes[]}`(`LlmGateSnapshot`: limit/inflight/queued/oldestWaitMs).
- `UpdateLlmProviderInput`은 모두 optional + write-only `apiKey`. `baseUrl` /
  `defaultModel`은 `null` 명시 시 명시적 clear, undefined는 no-op,
  `maxConcurrent` 1–100.
- `TestLlmProviderInput.model` optional — 없으면 resolved `defaultModel` 사용.

**Web 어드민 UI:**

- [`AdminAiKeysPage.tsx`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) —
  **계정 카드 1장 + 용도 카드 N장** 레이아웃 (이번 라운드 재구성). 계정 카드
  (`ACCOUNT_PURPOSE` = chat)가 write-only API 키 + baseUrl + maxConcurrent + 연결
  테스트 + DB row 삭제를 담당하고, `keySource` 가 `env`/`own` 인지 배지로 표시.
  image·log-analysis·meal-photo·meal-recommend 용도 카드(`PURPOSE_ORDER` 5개,
  `PURPOSE_META` 가 `Record<purpose, …>` 라 누락은 typecheck 실패; 식단 카드 아이콘
  Camera/UtensilsCrossed)는 **모델만** 편집하고 키는 계정에서
  상속(`KeySourceBadge` own/inherited/env/none). 키 입력 후 `usePreviewModels`
  → 모델 드롭다운, 또는 `recommendModelForPurpose(purpose, catalog)`(`@repo/utils`)로
  용도에 맞는 모델 추천. `defaultModelSource === 'env'` 면 ".env 기본값" 배지.
  모델 datalist 자동완성은 `useProviderModels` 가 purpose 별로 fetch. 좁은 화면
  카드 레이아웃은 여전히 모바일 단말 친화 (alias: `mobile-ai-keys-card-layout`).
- [`LlmUsagePanel.tsx`](../../apps/web/src/components/admin/LlmUsagePanel.tsx) —
  어드민 전 페이지 상시 플로팅 패널. 접힘 칩(계정 inflight/limit + 큐 + tok/1m) ↔
  펼침(계정 게이트 게이지바 + purpose 배지 + active 호출 + 1·5·60분 윈도우 + 누적).
  접힘/코너 localStorage 영속. `useLlmTelemetry(true)` 구독. 상세 페이지 링크.
- [`AdminAiUsagePage.tsx`](../../apps/web/src/routes/admin/AdminAiUsagePage.tsx) —
  같은 SSE 스냅샷을 큰 지면에. 상단 요약 카드(누적 요청/토큰/진행중/429 재시도) +
  롤링 윈도우 표 + 용도별/모델별 분해 표 + 최근 호출 표(큐 대기 vs 모델 소요 분리).
- [`AdminAiTestPage.tsx`](../../apps/web/src/routes/admin/AdminAiTestPage.tsx) —
  4개 모드: 단건 / Batch(서로 다른 prompt N개) / 모델 비교(같은 prompt × 모델
  N개) / 샘플 N개(같은 prompt × 같은 모델 × N회). Temperature 는 opt-in 토글
  — 꺼두면 필드를 보내지 않아 provider 기본값 사용. **현재 chat purpose 전용**
  — `useProviderModels` 에 `purpose: 'chat'` 하드코딩.

## Data [coverage: high — 8 sources]

**테이블: `llm_provider_configs`** (Prisma 모델 `LlmProviderConfig`)

```prisma
model LlmProviderConfig {
  id            String   @id @default(cuid())
  provider      String                  // 'ollama-cloud'
  purpose       String   @default("chat") // 'chat'|'image'|'log-analysis'|'meal-photo'|'meal-recommend' (free TEXT)
  apiKey        String                  // 평문 저장 (계정 대표=chat, 그 외 용도는 상속 가능)
  baseUrl       String?
  defaultModel  String?
  enabled       Boolean  @default(true)
  maxConcurrent Int      @default(15)
  updatedAt     DateTime @updatedAt
  updatedById   String?                 // 마지막으로 수정한 user.id

  @@unique([provider, purpose])
  @@map("llm_provider_configs")
}
```

마이그레이션 히스토리:

- [`20260506191413_add_llm_provider_config`](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)
  — 최초 테이블 추가. `provider` 단독 unique.
- [`20260523010655_pnpm_filter_friendly_test_src_modules_ai`](../../apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql)
  — purpose 컬럼 추가 (`DEFAULT 'chat'`). unique 인덱스를 `provider` 단독에서
  `(provider, purpose)` 튜플로 교체. 기존 row 는 모두 `purpose='chat'` 으로
  마이그레이션 (SQLite 의 RedefineTables 패턴 — new 테이블 생성 → SELECT 복사
  → DROP → RENAME). 마이그레이션 이름이 `pnpm_filter_friendly_test_src_modules_ai`
  인 건 prisma CLI 의 `--name` 인자 자리에 명령어가 잘못 들어간 typo —
  실제 내용은 ai purpose 컬럼 추가.
- **`log-analysis`(2026-06)·`meal-photo`/`meal-recommend`(2026-08-22) purpose 추가에는
  새 마이그레이션이 없다** — `purpose` 가 free TEXT 라 새 값 도입에 스키마 변경이
  불필요. enum 검증은 와이어(zod `LlmProviderPurpose`)에서만 한다.

SQLite, 외래키 없음 — `updatedById`는 단순 텍스트 참조(soft).

**환경 변수 fallback** ([`env.ts`](../../apps/friendly/src/config/env.ts)):

키·baseUrl 의 env fallback 은 `chat`(계정 대표)에만, **모델 fallback 은 다섯 용도
각자**. chat 외 용도는 자기 키가 없으면 계정(chat row, 없으면 env) 키를 상속.

| 변수                          | 기본값(`env.ts` / `.env.example`) | 비고                                  |
| ----------------------------- | --------------------- | ------------------------------------- |
| `OLLAMA_CLOUD_API_KEY`        | `''`                  | 계정 키(chat). 비면 chat row 도 없을 시 `no_api_key`; 다른 용도도 상속 불가|
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com`  | 계정 baseUrl. DB row의 `baseUrl`이 우선  |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`               | 모든 용도 공통. DB에 컬럼 없음 — env 단독 소스 |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                  | row 없을 때 폴백 + 계정 게이트 부트스트랩값. DB row의 `maxConcurrent`이 우선|
| `OLLAMA_DEFAULT_MODEL`        | `''` / `gpt-oss:120b` | **chat** 모델 폴백. DB `defaultModel` 빌 때만 |
| `OLLAMA_IMAGE_MODEL`          | `''` / `qwen3.5:397b-cloud` | **image** 모델 폴백 (영수증 추출 등)         |
| `OLLAMA_LOG_ANALYSIS_MODEL`   | `''` / `deepseek-v4-pro` | **log-analysis** 모델 폴백. 비면 자동 분석 skip |
| `OLLAMA_MEAL_PHOTO_MODEL`     | `''` / `gemma4:31b`   | **meal-photo** 모델 폴백(2026-08-22 신규). 비면 사진 인식 `no_provider`. 기본값 근거는 `.env.example` 주석(평가셋 60장 실측) |
| `OLLAMA_MEAL_RECOMMEND_MODEL` | `''` / `gpt-oss:120b` | **meal-recommend** 모델 폴백(신규). 비면 LLM 추천 skip → 점수 폴백 |

`LlmProviderEnv.defaultModels` 는 `Record<purpose, string>` — 위 5개 모델 변수를
용도 키로 묶는다. 조립은 `buildLlmProviderEnv()`(`llm-provider-env.ts`) 한 곳.

**Resolution 규칙** (`AiConfigService.getResolved(provider, purpose)`):

```
enabled := row?.enabled ?? true                                     // false 면 즉시 null
apiKey  := row.apiKey?.trim() || ''
baseUrl := row.baseUrl ?? null
if purpose === 'chat':                                              // 계정 대표
  apiKey  := apiKey || env.apiKey                                   // env 보충
  baseUrl := baseUrl ?? env.baseUrl
else if apiKey 비었거나 baseUrl null:                               // 계정 상속
  account := resolveAccountCredentials(provider)                    // chat row ?? env
  apiKey  := apiKey || account.apiKey
  baseUrl := baseUrl ?? account.baseUrl
if !apiKey: return null                                             // 키 없음
maxConcurrent := row.maxConcurrent ?? env.maxConcurrent
defaultModel  := row.defaultModel?.trim() || env.defaultModels[purpose]  // 모델은 상속 X, 용도별 폴백
timeoutMs     := env.timeoutMs
baseUrl       := baseUrl ?? env.baseUrl
```

`row.enabled === false` 또는 effective `apiKey === ''` 이면 `null`을 돌려주고,
호출자는 `no_api_key`(어드민) / `no_provider`(settlement-extraction) / skip(log-analysis)
결과를 만든다.

**`list()` 동작:** **다섯 용도 카드를 항상** 합성해 반환
(`ALL_PURPOSES = LlmProviderPurpose.options` — 계약 enum 순서 chat, image, log-analysis,
meal-photo, meal-recommend 가 곧 카드 순서). DB row 없는 용도도 계정 키 상속으로 동작할 수
있어 가상 row 로 노출한다. `toView` 가 각 카드의 `keySource`(own/inherited/env/none) +
`defaultModelSource`(own/env/none) 를 채운다 — chat 은 own/env/none, 그 외 용도는
own/inherited/none. "다른 용도 추가" 빈 카드 흐름은 사라지고, 항상 다섯 카드가 보인다.

**도메인별 prompt + JSON schema + 청크 사이즈 + purpose:**

| 도메인 | purpose | VERSION 상수 | 청크 | JSON Schema (additionalProperties / shape) | 호출 빈도 |
| ------ | ------- | ------------ | ---- | ------------------------------------------ | --------- |
| summary | chat | `ANALYSIS_VERSION = 4` (traits + menus[].sentiment) | 리뷰 1건/호출 | review analysis schema (rating/menus/traits/...) | 리뷰 단위 |
| menu-grouping | chat | `MENU_GROUPING_VERSION = 2` | 80 | `{ type: 'string' }` (입력 키 → canonical) | 식당당 1회 |
| analytics | chat | `GLOBAL_MERGE_VERSION = 3` | 10 (reasoning 완주 우선; v2 때 50) | `{ mappings: [{ variant, canonical, categoryPath }] }` 배열 — **`format` 미사용**(프롬프트만, `think` 끔) | 글로벌 1회 (pass1 + pass2) |
| settlement-extraction | **image** | `EXTRACTION_VERSION = 4` (v2 roundHint 이후 bump — settlement 토픽) | 1 (영수증 1장) | `{ items: [{ name, unitPrice, quantity, amount, category, matchedMenuName }], totalAmount }`, `EXTRACTION_JSON_SCHEMA` | 사용자 업로드 단위 |
| log-analysis | **log-analysis** | (logs 토픽) | 1 (실패 run 1건) | (logs 토픽) | 실패 run 단위 |
| meal-recognition | **meal-photo** | `MEAL_RECOGNITION_VERSION = 2` (후보 강제) | 1 (사진 1~5장/호출) | `MEAL_RECOGNITION_JSON_SCHEMA` (+ 복구 `format:'json'`), `think` 끔 | 사용자 요청 단위 — SQLite 일일 quota 30 |
| meal-recommendation | **meal-recommend** | `MEAL_RECOMMENDATION_VERSION = 2` | 1 | `MEAL_RECOMMENDATION_JSON_SCHEMA`, `think` 끔 | 사용자 요청 단위 — 일일 quota 20 + 같은 날·끼니·프로필 캐시 |
| food-classify | chat | `FOOD_CLASSIFY_VERSION = 1` | 40 | (food 토픽), `think` 끔 | 카탈로그 적재 회차 단위 |

각 도메인이 자기 VERSION 상수를 record 에 함께 저장 → 프롬프트/스키마 변경 시
상수를 올리면 stored < current 인 record 가 자동으로 stale 판정되어 재계산 큐에
들어간다 (단 settlement-extraction 은 재추출 자동화가 아직 없고 로그 식별자로만
사용). 자세한 라이프사이클은
[`menu-grouping`](menu-grouping.md) / [`analytics`](analytics.md) /
[`settlement`](settlement.md) 토픽 참고.

**큐/캐시/게이트:**

- **`adapterCache`** — 모듈 레벨 싱글톤(import 한 모든 곳이 동일 인스턴스).
  `(provider, purpose, apiKey, baseUrl, maxConcurrent, timeoutMs)` 튜플별 `Map`
  (MAX_ENTRIES=8, 삽입순 LRU 축출) — purpose 어댑터가 공존한다. 메모리 외 영속화
  없음. 설정 변경 시 새 어댑터가 생기지만 **계정 게이트는 레지스트리에 살아남아**
  합산 동시성이 일시 초과되지 않는다.
- **purpose 게이트** (`OllamaCloudAdapter.purposeGate`, `ConcurrencyGate`) — 어댑터
  소유, `maxConcurrent` 한도. summary 리뷰 fan-out, menu-grouping/analytics/food-classify
  청크 호출이 같은 (chat) 게이트에 줄선다. image/log-analysis/meal-photo/meal-recommend
  는 별도 어댑터 → 별도 게이트(meal-photo 는 같은 vision 인 image 와도 분리 — 의도된
  독립 튜닝). signal-aware (큐 대기 중 abort 시 즉시 이탈).
- **계정 게이트** (`AccountGateRegistry`, `accountGateRegistry`) — `apiKey|baseUrl`
  키별 `ConcurrencyGate` 하나. cap = 그 키 purpose 한도들의 `max`. purpose 게이트를
  통과한 호출이 한 번 더 통과 — 같은 키의 합산 동시성 상한. 어댑터 캐시와 독립
  수명. `MAX_GATES = 8`.
- **`llmTelemetry`** — 표시 전용 인메모리 집계 싱글턴. recent 링버퍼 50 / 분 버킷
  60 / byModel 30 상한, 전부 고정이라 누수 없음. 재시작 시 리셋(`startedAt`).
  강제(예산 차단) 없음 — 관찰 전용.
- **`AiService.lastCallByActor`** — `Map<userId, lastTimestampMs>`. 1초
  슬라이딩 윈도우 per-actor rate limit. **어드민 라우트(`/complete`,
  `/complete-batch`)에만 적용** — 백그라운드 도메인은 `AiService` 를 거치지
  않으므로 영향 없음. 영속성 없음 (프로세스 재시작 시 리셋).

## Key Decisions [coverage: high — 16 sources]

- **2026-08-23: meal-photo 기본 모델은 gemma4:31b — 정확도가 동률이면 속도.** 평가셋
  60장(150클래스 균등 표본) 실측 gemma4:31b top-1 55%·후보포함 68%·평균 2.4s vs
  qwen3.5:397b 52%·63%·4.9s. ±6pp 표본오차 안에서 동률이고 2배 빠르며 Ollama usage
  등급도 낮다(PLAN-meal: gemma4 Low, qwen3.5 Medium). 이전 8장 측정(qwen 75%)은 '가~'
  클래스에 치우친 편향 표본이라 뒤집었다 — **모델 선택은 균등 표본으로만**
  (`probe:meal-vision --limit` 이 앞에서 자르지 않고 균등 간격 샘플링하는 이유). 근거와
  재측정 명령을 `.env.example` 주석에 남겨 다음 사람이 같은 자리에서 다시 잴 수 있게
  했다. 운영 DB `llm_provider_configs` 가 비어 있어 이 `.env` 값이 유일한 설정원이다.
- **2026-08-22: 식단은 새 purpose 2종 — `image` 를 공유하지 않는다 + env 조립은 한 곳 +
  `ALL_PURPOSES` 는 enum 파생 + JSON 호출은 `think` 를 끈다.** 영수증(image)과 음식
  사진(meal-photo)은 같은 vision 이라도 모델·동시성 한도·텔레메트리 라벨을 따로 튜닝해야
  해서 row 를 분리했다(합치면 무거운 식단 호출이 영수증 슬롯을 묶고 사용량 패널에서
  구분이 안 된다). purpose 추가 비용을 낮추기 위해 (a) `LlmProviderEnv` 리터럴 26곳을
  `buildLlmProviderEnv()` 하나로, (b) `ALL_PURPOSES` 를 `LlmProviderPurpose.options`
  에서 파생, (c) 웹 `PURPOSE_META` 를 `Record<purpose, …>` 로 두어 누락을 typecheck 가
  잡게 했다. 같은 커밋에서 `isVisionModel` 을 멀티모달 계열 접두 목록으로 넓혀 vl/vision
  이 이름에 없는 모델(gemma4·qwen3.5 …)도 image·meal-photo 추천에 오르게 했고, 후속
  (`5cdbc0f`)으로 JSON 을 받는 호출은 `thinkOptionForModel` 로 사고를 끄는 규칙을 세웠다
  — qwen3.5 가 출력 토큰을 사고에 다 써 content 가 비던 실측이 근거. 분석 청크 처리량이
  눈에 띄게 달라졌고(analytics `15f2a91`), 영수증 추출도 같은 손해를 보고 있었다.
- **벤더 SDK 미사용, 네이티브 fetch + `LLMProvider` 인터페이스.** 어댑터를
  교체하면 OpenAI / Anthropic 등으로 옮길 수 있고, 서비스 레이어는 어떤
  벤더 import도 갖지 않는다. 새 프로바이더는
  [`adapters/llm-provider.ts`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts)
  구현 + `LlmProviderId` enum 확장만 하면 슬롯 인.
- **purpose 컬럼 도입 — 용도별 모델 분리.** 영수증 추출(vision)·로그 분석(추론
  특화) 이 chat 과 다른 모델을 요구하면서 같은 provider 내에서도 모델·동시성을
  용도별로 분리할 필요가 생겼다. 한 row 에 묶으면 (a) `defaultModel` 이 하나라
  자동 선택이 어렵고 (b) 동시성 한도를 무거운 vision 비용에 맞춰 내려야 해 chat
  fan-out 이 같이 죽는다. 해결: `(provider, purpose)` unique 로 row 를 분리. enum
  은 `chat`/`image`/`log-analysis` 3종으로 시작해 2026-08-22 식단용 2종이 더해져 5종.
- **키는 계정 단위 공유, 모델만 용도별 (이번 라운드).** 운영자가 용도마다 같은
  Ollama Cloud 키를 세 번 입력하는 건 군더더기다. `chat` 을 "계정 대표"로 정해
  키·baseUrl 은 거기(없으면 env)에만 두고, image·log-analysis 는 자기 row 에 키가
  없으면 `resolveAccountCredentials` 로 계정 키를 상속한다 — 키 하나로 모든 용도
  (현재 5종)가 돈다. **모델만은 상속하지 않는다** (용도마다 모델이 달라야 하므로). 와이어에
  `keySource`/`defaultModelSource` 배지를 실어 UI 가 "이 카드가 own 키인지 상속인지"
  를 명확히 보여준다. 트레이드오프: image/log-analysis row 의 키 삭제는 다음
  resolve 까지 계정 게이트 cap 반영이 늦을 수 있다 (드문 운영 행위라 허용).
- **DB 우선 + env fallback 2단 — 키는 `chat` 한정, 모델은 용도별.** 운영 단계엔
  admin 이 UI 에서 키 교체, 개발 단계엔 `.env` 만 두고 시작. **키·baseUrl 의 env
  폴백은 계정 대표(chat)에만** (다른 용도는 계정 상속으로 충분). **모델
  폴백은 다섯 용도 각자** — `OLLAMA_DEFAULT_MODEL`/`OLLAMA_IMAGE_MODEL`/
  `OLLAMA_LOG_ANALYSIS_MODEL`/`OLLAMA_MEAL_PHOTO_MODEL`/`OLLAMA_MEAL_RECOMMEND_MODEL` 로
  dev 에서도 모든 용도가 기본 모델을 가질 수 있다. `list()` 는 키가 없어도 다섯 용도
  카드를 항상 합성해 UI 가 빈 카드 흐름 없이 곧장 편집하게 한다.
- **저장 전 키 검증은 별도 미리보기 엔드포인트로.** 신규 row 등록 시 어드민이
  키를 한번에 정확히 입력하는 경우는 드물고, 잘못된 키로 PUT 하면 (a)
  `LlmProviderConfig` 에 invalid row 가 남고 (b) 모델 datalist 가 빈 채로
  `defaultModel` 을 freehand 로 추측해야 한다. 해법: `POST .../models/preview` 가
  **DB 를 거치지 않고** 폼의 키 + base URL 로 일회용 어댑터를 만들어
  `listModels()` 만 부른다. ok 응답이면 어드민이 그 모델 목록 (provider 의
  공식 `/models` 응답) 에서 직접 골라 `defaultModel` 에 박을 수 있고, 실패면
  PUT 자체를 안 하므로 orphan/invalid row 가 생기지 않는다. UI 가 미리보기 →
  저장 두 단계로 끊긴 게 의도된 디자인.
- **versioned-llm-prompts 패턴.** 각 도메인은 자기 모듈에 `*_VERSION` 상수 +
  systemPrompt + JSON schema 를 한 파일에 묶는다 — `summary` 의
  `ANALYSIS_VERSION`, `menu-grouping` 의 `MENU_GROUPING_VERSION`,
  `analytics` 의 `GLOBAL_MERGE_VERSION`, `settlement-extraction` 의
  **`EXTRACTION_VERSION = 2`** (v1 → v2: user prompt 에 차수 힌트 `roundHint`
  를 동적 주입할 수 있게 envelope 확장, [`settlement-extraction.prompts.ts`](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)).
  출력 schema `ReceiptItem[]` 자체는 v1 과 동일 — record 호환성을 깨지 않으면서
  prompt 만 바뀐 케이스 (이 패턴의 6번째 인스턴스). ai 모듈 자체는 버전을 모르고,
  record 에 함께 저장하는 책임은 도메인.
- **apiKey는 write-only, 응답엔 항상 마스킹.** `'sk-***...{last4}'` 형태(또는 4
  글자 이하면 `'***'`). 평문 키는 PUT 본문으로만 와이어를 건넌다. DB
  컬럼 자체는 평문 — CLAUDE.md 의 SQLite 단일 인스턴스 전제하에 DB가
  신뢰 경계.
- **In-process concurrency cap (Redis 사용 금지).** CLAUDE.md 의 "단일
  인스턴스 + lru-cache" 원칙을 그대로 따른다. `ConcurrencyGate` closure 의
  `inflight` 카운터 + FIFO `waiters` 배열만으로 cap 을 구현. 외부 broker 없음.
  [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 패턴.
- **2단 게이트 — purpose 게이트 + 계정 게이트.** chat/image/log-analysis 가
  각자 purpose 게이트(`maxConcurrent`)만 가지면, 같은 Ollama 계정 키를 쓰는데도
  합산 동시성이 계정 한도를 넘어 429 가 터진다. 그래서 게이트를 어댑터에서
  `concurrency-gate.ts` 로 추출하고, `apiKey|baseUrl` 단위로 공유하는 계정 게이트를
  한 겹 더 뒀다. 호출은 purpose → account 순으로 직렬 통과(역순 release). 계정 cap
  은 그 키 purpose 한도들의 **max** — sum 으로 하면 purpose 가 늘수록 계정 cap 이
  커져 막으려던 합산 초과가 되살아난다. 계정 게이트는 레지스트리에 살아 어댑터
  캐시가 회전해도 유지되므로 `setLimit` 으로 웹 설정의 maxConcurrent 와 동기화되고,
  설정 변경 중 일시 초과가 없다.
- **AdapterCache 를 "마지막 1개"에서 키별 Map 으로.** 이전 구현은 캐시 슬롯이
  하나라 chat ↔ image 가 번갈아 호출되면 어댑터가 매번 교체돼 purpose 게이트가
  리셋됐다(실효 동시성 초과 위험). purpose 가 셋으로 늘면서 더 잦아질 문제라,
  6-tuple 키별 `Map`(MAX_ENTRIES=8, 삽입순 LRU)으로 바꿔 용도 어댑터를 공존시켰다.
  계정 게이트가 별도 수명을 갖게 된 것과 맞물려, 캐시 회전이 동시성 안전성을
  깨지 않는다.
- **표시 전용 LLM 텔레메트리 (강제 없음).** 모든 LLM 호출이 AdapterCache →
  OllamaCloudAdapter 한 경로로 수렴하는 구조를 이용해, AdapterCache 가 `onEvent`
  로 purpose 라벨을 붙여 `llmTelemetry` 싱글턴에 흘린다 — 호출부 수정 없이 전
  지점이 계측된다. 예산 차단 같은 강제는 일부러 안 했다(어드민이 "지금 얼마나
  쓰는지"를 보는 관찰 도구). 인메모리 고정 상한(recent 50/분버킷 60/byModel 30)이라
  누수 없고, 재시작 시 리셋(`startedAt`). SSE 는 이벤트 dirty 플래그 + 1초 tick
  코얼레싱으로 배치 요약 같은 폭주 구간에서 스트림 홍수를 막고, 활동 중에는
  이벤트가 없어도 게이트 상태 변화를 `hasActivity()` 로 push.
- **SSE 인증은 `?token=` 쿼리 폴백.** EventSource 가 커스텀 헤더를 못 보내므로
  `telemetry/stream` 은 jwtVerify 우선, 실패 시 쿼리 토큰을 검증한다 — analytics/
  auto-discover SSE 와 동일한 [sse-token-auth](../concepts/sse-token-auth.md) 패턴.
  전체 스냅샷을 매번 보내는 건 클라이언트가 패치 머지 없이 마지막 스냅샷만
  렌더하면 되고 크기도 수 KB 라 diff 프로토콜이 과설계이기 때문.
- **Ollama 옵션을 1차 시민으로 누출(`numCtx`, `num_predict`, `format`, `images`).**
  추상에 깔끔히 안 맞아도 실용 우선. Ollama 의 `num_ctx` 기본값 2048 / `num_predict`
  기본값 128 때문에 입력·출력 잘림 사고가 잦았고, vision 입력은 Ollama 의
  `messages[i].images` 라는 고유 모양이라 추상 인터페이스 뒤에 가두는 것보다
  호출자가 명시적으로 끌어 쓰는 게 디버깅이 빠름. 다른 어댑터는 무시 가능.
- **Structured output: JSON Schema 강제 + caller-side identity fallback.**
  `format` 에 zod-derived JSON Schema 객체를 그대로 전달하면 Ollama 가 토큰
  샘플링 단계에서 스키마와 일치하는 토큰만 뽑는다. 후처리 JSON 파서 실패율을
  크게 낮춤. 다만 LLM 이 키를 빠뜨릴 수 있어 모든 caller 가 fallback identity
  패턴 (입력 키 = canonical) 을 갖는다 — menu-grouping 은 빈/불완전 응답이면
  variant → variant 매핑으로 회귀, analytics 도 누락 키에 대해 동일 처리.
  settlement-extraction 은 zod 파싱 실패 시 `llm_failed` 로 사용자에게 재시도
  요청. 파싱 후처리(`<think>` 블록 제거·균형괄호 JSON 추출)는
  `summary.service.extractFirstJsonObject` 를 도메인 간 공유.
- **도메인별 VERSION 상수.** `ANALYSIS_VERSION` (summary) / `MENU_GROUPING_VERSION`
  (menu-grouping) / `GLOBAL_MERGE_VERSION` (analytics) / `EXTRACTION_VERSION`
  (settlement-extraction). 프롬프트·스키마·청크 정책 중 하나라도 의미 있는
  변경이 일어나면 상수를 올린다. record 의 stored version 이 current 보다 낮으면
  stale 표시 → 재계산. 단순 word smithing 변경엔 올리지 않는다.
- **429 / "too many concurrent requests" 자동 백오프.** Ollama Cloud 가 로컬
  게이트 통과 후에도 자체 한도로 거부할 수 있어, 어댑터에서 200·400·800ms +
  jitter 로 최대 3회 재시도. **슬롯을 잡은 채** 재시도해 동시성이
  늘지 않게 한다 — release 했다가 다시 acquire 하면 다른 caller 가 끼어들어
  cap 의 의미가 사라진다.
- **batch는 `Promise.allSettled`.** 한 항목의 실패가 다른 항목을 끌어내리면
  안 된다(특히 어드민이 여러 모델/프롬프트를 한 번에 비교할 때). zod에서
  `min(1).max(10)`으로 폭주 차단.
- **per-actor 1초 rate-limit 은 어드민 한정.** 토큰 단위 정교한 limiter 대신,
  같은 userId의 두 번째 호출을 1초 안이면 `rate_limited`로 즉시 반환.
  cheap·in-memory. 백그라운드 도메인과 settlement-extraction 은 `AiService` 를
  거치지 않으므로 per-actor limit 에 영향받지 않는다.
- **테스트 친화적 의존성 주입.** `AiConfigService(prisma, env)` /
  `AiService(provider, configService)` /
  `SettlementExtractionService(aiConfig, { resolveOverride })` — 어댑터·env·
  vision provider 를 fake 로 갈아 끼워 단위 테스트 가능. 라우트 통합 테스트는
  `Fastify({ logger: false })` 위에 필요한 플러그인만 명시 등록(`autoload` 우회).
- **`empty-body-parser` 플러그인 도입.** fastify 기본 JSON 파서가 빈 body에
  "Body cannot be empty…" 400을 던지는 문제를 우회. `POST
  /providers/:id/:purpose/test` 같은 actionless POST가 페이로드 없이 호출 가능.
- **모델 카탈로그는 best-effort.** `GET /providers/:id/:purpose/models`는
  어댑터가 `listModels`를 구현 안 했거나 호출 실패 시 `{ models: [] }` 반환.
  UI는 `<datalist>`로 자동완성하되 자유 입력도 허용.

## Gotchas [coverage: high — 12 sources]

- **`defaultModels` 는 5키 전부 있어야 한다 — 테스트 픽스처는 `buildLlmProviderEnv()` 를
  안 쓴다.** 실코드는 조립점이 하나라 purpose 추가가 한 파일이지만, 테스트 8개 파일
  (ai 3종·analytics·tabling.service·menu-grouping·review-clustering·summary — summary.test
  만 7군데)은 가짜 `LlmProviderEnv` 리터럴을 직접 적는다.
  `Record<LlmProviderPurposeType, string>` 이라 빠지면 typecheck 가 잡지만, 새 purpose
  커밋은 늘 이 파일들을 함께 건드리게 된다(`cc8399a` 가 그랬다).
- **`MULTIMODAL_FAMILY_RE` 는 2026-08-22 Ollama Cloud 카탈로그 스냅샷.** 이름에 vl/vision
  이 없는 새 멀티모달 계열이 나오면 이 목록(+ `aiModel.test.ts`)을 갱신해야 image·
  meal-photo 추천 후보에 오른다 — 빠져도 수동 입력은 되므로 "추천 없음(null)" 으로만
  조용히 드러난다. 접두 매칭이라 `gemma4x` 같은 이름은 의도적으로 제외되고, 태그
  안의 이름(`gpt-oss:gemma4`)은 보지 않는다.
- **`think` 를 안 보내면 qwen3.5·gpt-oss 는 content 가 빈다.** 출력 토큰을 사고에 다 쓴
  뒤 `content: ""` 로 200 이 온다(실측 `num_predict` 40 기준 thinking 119자 / content
  빈 문자열) — 파서는 "빈 응답" 으로만 본다. JSON 을 받는 새 호출은
  `think: thinkOptionForModel(model)` 을 반드시 실을 것(gpt-oss 는 끌 수 없어 `'low'`).
  아래 "thinking 미지원 모델에 think 를 보내면 에러" 와 함께 — `false` 는 gemma4·
  kimi-k3·deepseek-v4-pro 에서 200 확인됐다(모르는 모델에도 `false` 는 안전).
- **meal 일일 quota 는 ai 게이트와 다른 층 — 게이트 스냅샷·텔레메트리에 안 보인다.**
  `MEAL_RECOGNIZE_DAILY_LIMIT`/`MEAL_RECOMMEND_DAILY_LIMIT` 초과는 라우트에서 429 로 끝나
  어댑터에 도달하지 않으므로 사용량 패널의 429 재시도 카운터와 무관하다. `0` 은
  "무제한"(기능 차단 아님). 카운터는 SQLite `meal_daily_quotas`(userId, date, purpose)
  라 재시작해도 유지 — in-memory 게이트/텔레메트리와 반대 성질. 상세 [meal](meal.md).
- **운영 `llm_provider_configs` 가 비어 있으면 `.env` 가 유일한 설정원이다.** 2026-08-23
  meal-photo 모델 전환도 `.env.example` 기본값 변경으로 했다 — 배포 서버의 실제 `.env`
  를 따로 바꾸고 재시작해야 반영된다(아래 "env 변경은 재시작 필요"). 어드민에서 row 를
  만들면 그 순간부터 DB 가 우선이라 `.env` 를 바꿔도 무시된다(`defaultModelSource` 배지가
  `env` 인지 `own` 인지로 확인).
- **`numCtx` 명시 안 하면 Ollama 기본 2048로 입력 잘림.** 긴 시스템 프롬프트
  + 긴 사용자 입력이 들어가는 분석 작업에서 사일런트로 꼬리가 잘려 나간다.
  `summary` / `menu-grouping` / `analytics` 모두 `numCtx` 를 명시적으로 설정하는
  이유. settlement-extraction 도 `VISION_NUM_CTX = 8192`. 어드민 `/complete`
  엔드포인트는 와이어 스키마에 `numCtx` 가 없어 기본 2048 그대로 — 긴 prompt
  디버깅 시 주의.
- **`maxTokens` 미지정 시 출력 128 토큰에서 잘림.** Ollama 의 `num_predict`
  기본값. 와이어 스키마는 `maxTokens` 양의 정수 ≤4096 으로 받지만
  optional — 사용자가 안 넣으면 짧은 응답이 정상으로 보인다. analytics v2는
  출력 토큰 증가에 맞춰 청크를 80→50으로 줄였다. settlement-extraction 은
  `VISION_MAX_TOKENS = 4000` 고정.
- **chat 외 용도(image/log-analysis/meal-photo/meal-recommend) 키는 계정(chat)에서
  상속한다 — 자기 키 없어도 동작.** 이전엔 image 가 env fallback 이 없어 DB row
  필수였지만, 이제 `getResolved` 가 자기 키가 비면 `resolveAccountCredentials` 로 chat
  row(없으면 env) 키를 빌린다. 즉 **chat(또는 env) 키 하나만 있으면 나머지 네 용도도
  켜진다**. 단 **모델**은 상속하지 않으므로, 카드에 모델(또는 용도별 `OLLAMA_*_MODEL`)이
  없으면 `defaultModel === ''` 이라 라우트가 `no_provider`/skip 으로 떨어진다 — 키는
  있어도 모델이 없어 실패하는 케이스에 주의.
- **계정 게이트 cap 반영이 늦을 수 있다.** `AccountGateRegistry` 는 `get()` 이
  호출될 때만 그 키의 purpose 한도를 기록하고 cap 을 `max` 로 갱신한다. 그래서
  어떤 purpose 의 row 를 삭제하거나 maxConcurrent 를 내려도, **그 purpose 가 다시
  resolve 될 때까지** 계정 cap 은 옛 max 를 유지한다. 드문 운영 행위라 허용 —
  급하면 서버 재시작으로 레지스트리를 비운다.
- **계정 게이트 cap 은 sum 이 아니라 max 다.** chat=15, image=2 면 계정 cap=15
  (17 아님). "각 purpose 한도는 계정 슬롯을 최대 N 개 쓴다"는 의미라, 계정 전체로는
  그중 가장 큰 N 이 한도. 패널의 "동시 요청 (계정)" 분모도 이 max 값.
- **텔레메트리는 인메모리 — 재시작 시 전부 리셋.** 누적/윈도우/recent 모두
  프로세스 부팅 이후 값이고 DB 영속화가 없다. `startedAt` 으로 집계 기준 시점을
  표시한다. 청구/감사 용도로 쓰면 안 된다 (Ollama Cloud 콘솔이 진실원).
- **임베딩은 텔레메트리/게이트에 안 잡힌다.** review-search/review-clustering 의
  `/api/embed` 호출은 ai 모듈의 어댑터를 안 거치므로 사용량 패널·계정 게이트에
  나타나지 않는다. "AI 사용량" 패널 숫자가 실제 Ollama 비용보다 작을 수 있다.
- **마이그레이션 이름이 `pnpm_filter_friendly_test_src_modules_ai` typo.**
  prisma CLI 의 `--name` 자리에 명령어가 잘못 들어간 흔적 — 실제 내용은 ai
  purpose 컬럼 추가이며 rollback 시 이름으로 헷갈리지 말 것.
- **structured output 도 키 누락은 막아주지 않는다.** `additionalProperties`
  스키마는 모양만 강제 — 모델이 입력 변형 중 일부를 출력에서 빼먹어도 schema
  검증은 통과한다. 모든 caller 가 누락된 키에 대해 identity fallback 으로
  복구해야 한다. summary 의 review analysis 도 마찬가지로 빠진 필드는 도메인
  레벨에서 채워야 한다. settlement-extraction 은 빠진 키가 있으면 zod 파싱이
  실패해 `llm_failed` 로 떨어진다 (재시도 UX).
- **Reasoning 모델(`gpt-oss`, `deepseek-r1` 등)은 `<think>…</think>` 블록을
  먼저 뱉는다.** ai 모듈은 그대로 돌려준다. JSON 파싱 책임은 호출자에 있고,
  `summary.service.extractFirstJsonObject` 가 표준 후처리. settlement-extraction
  도 이걸 import 해서 vision 응답을 정제한다.
- **VERSION 상수와 record 의 stored version 동기화 책임은 도메인.** ai 모듈은
  버전을 모른다. record 가 stale 표시는 됐지만 재계산 큐에 안 들어가는 사고는
  도메인 코드 버그. 자세한 워크플로우는
  [`menu-grouping`](menu-grouping.md) / [`analytics`](analytics.md) 참고.
- **429 백오프는 슬롯을 보유한 채 잠든다.** 동시성은 안 늘지만, 재시도 중
  대기 시간이 timeout 안에 포함되는 건 아니다(setTimeout 만 await — fetch 의
  AbortController 와 별개). 재시도 합산이 길어지면 caller `AbortSignal` 로
  중단해야 함.
- **apiKey가 SQLite에 평문 저장된다.** dev/single-tenant 환경 전제. 프로덕션
  배포 시 OS keychain·KMS 위임·디스크 암호화 등 별도 검토 필요. 마스킹은
  와이어 응답에만 적용.
- **env 변경은 dev 서버 재시작 필요.** `tsx --watch`는 `src/`만 감시 — `.env`
  수정은 자동 reload되지 않는다. 반대로 DB row 변경은 `getResolved()`가
  매 요청 새로 읽으므로 즉시 반영.
- **`OLLAMA_CLOUD_TIMEOUT_MS`는 DB로 옮겨져 있지 않다.** Prisma 모델에 컬럼
  없음. 운영 중 timeout 조정은 env + 재시작 또는 마이그레이션 추가 필요.
  settlement-extraction 은 자체 `VISION_TIMEOUT_MS = 60_000` 으로 어댑터
  timeout 과 독립적으로 AbortController 를 건다 — env 값과 일치할 필요 없음.
- **`empty-body-parser`가 빠지면 `POST /providers/:id/:purpose/test`가 빈 body로
  오면 400.**
- **`AdminAiTestPage` 는 chat purpose 만 다룬다.** `useProviderModels({ id:
  'ollama-cloud', purpose: 'chat' })` 하드코딩 — vision 모델을 어드민이 ad-hoc
  으로 시험하려면 웹에는 통로가 없다 (영수증 업로드 흐름, 또는 CLI
  `pnpm --filter friendly probe:meal-vision -- --limit=N --label-from-filename --models=…`
  로 평가셋 기준 비교).
- **DELETE 후에도 `list()` 는 다섯 용도 카드를 항상 합성한다.** 이제 chat 뿐
  아니라 나머지 용도도 DELETE 후 가상 row 로 다시 노출된다(키는 계정 상속,
  `updatedAt === null` 으로만 row 부재 구분). "카드가 사라지는" 동작은 더 이상
  없다 — 빈 카드를 명시 생성하던 "다른 용도 추가" 흐름도 제거됐다.
- **`maxConcurrent` 는 purpose 별 + 계정 cap 의 이중 제약.** purpose row 마다
  자기 한도(chat=15, image=2 등)를 갖고, 그 위에서 같은 키의 계정 게이트가
  cap=max(한도들) 로 한 번 더 묶는다. 실효 동시성은 `min(purpose 한도, 계정 cap)`.
- **`think` 를 thinking 미지원 모델에 보내면 Ollama 가 에러.** `LLMCompleteOptions.think`
  는 gpt-oss 계열('low'|'medium'|'high', 끄기 불가)·일부 thinking 모델(boolean)만
  받는다. 모델을 보고 설정 여부를 정하는 책임은 호출자에게 있다. 또 thinking
  토큰은 `completionTokens`(Ollama eval_count)에 합산되므로 텔레메트리 출력 토큰이
  부풀 수 있다.
- **텔레메트리 SSE 는 구독 컴포넌트 수만큼 커넥션이 생긴다.** `useLlmTelemetry(true)`
  를 패널과 페이지가 둘 다 호출하면 EventSource 가 2개 — React Query 캐시는
  공유하지만 커넥션은 별개. 어드민 1명 기준 허용 범위지만, 다른 화면에서 무심코
  `enabled=true` 로 또 구독하지 않게 주의.
- **caller abort vs timeout 우선순위는 caller 우선.** 둘이 동시에 발화해도
  `opts.signal?.aborted` 체크가 먼저라 `LLMCancelledError`. 메트릭에서
  타임아웃이 과소집계될 수 있다.
- **`fetch` 자체 실패는 `LLMUpstreamError(status: 0)`.** DNS/네트워크
  오류와 5xx가 동일한 에러 클래스로 들어와 status 필드로만 구분 가능.
- **모델 list의 필드 이름이 두 가지.** Ollama Cloud는 `model`, 로컬 Ollama는
  `name`. 어댑터에서 `m.model ?? m.name`로 흡수하지만 둘 다 비면 그 항목만
  필터링되어 사라진다.
- **vision 이미지의 `data:` 접두 제거 책임은 호출자.** `LLMCompleteOptions.images`
  는 순수 base64 만 받는다. settlement-extraction 은 sharp 로 정규화한 Buffer
  를 `.toString('base64')` 로 만들어 직접 넘김 — UI 에서 data URL 을 그대로
  넘기는 일은 없다.
- **`/models/preview` 는 폼 키만 사용 — 저장된 키는 절대 안 쓴다.** 핸들러가
  `req.body.apiKey` 만 어댑터에 넘기고, 같은 (provider, purpose) 의 기존 DB
  row 는 읽지도 않는다. 즉 "기존 키 유지하면서 모델만 다시 미리보기" 는
  지원하지 않는다 — UI 가 항상 키를 다시 입력하게 강제. (저장된 모델 목록을
  보고 싶으면 `GET /models` 를 쓰면 된다.)
- **`/models/preview` 응답을 DB 에 캐시하지 말 것.** 모델 목록과 키는 모두
  in-memory 전용이고, 어떤 row 에도 적재되지 않는다. 어드민 UI 도 React
  state 로만 들고 있다가 저장 시점에 사용자가 고른 모델 한 개만 PUT 본문에
  포함시킨다. provider 가 모델 목록을 바꿔도 (예: 신규 모델 출시) 다음 미리보기
  호출에서 즉시 반영 — stale 캐시 없음.
- **`/models/preview` 는 `adapterCache` 를 우회한다.** 매 호출마다 새 어댑터
  인스턴스를 만든다. 미저장 키가 캐시 키에 박히면 다른 요청이 우연히 그 키를
  재사용할 수 있어 의도적으로 피한 것 — 미리보기는 비용이 작고(`/models` 한
  번) 빈도도 낮으므로 캐시 효용이 미미.

## Sources [coverage: high — 49 sources]

- [`apps/friendly/src/modules/ai/llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) (신규 2026-08-22 — `buildLlmProviderEnv()` `.env → LlmProviderEnv` 단일 조립점)
- [`packages/utils/src/aiModel.test.ts`](../../packages/utils/src/aiModel.test.ts) (신규 — `isVisionModel` 멀티모달 계열·`recommendModelForPurpose` 5용도·`thinkOptionForModel`)
- [`apps/friendly/.env.example`](../../apps/friendly/.env.example) (수정 — 용도별 모델 5종 + meal-photo `gemma4:31b` 실측 근거·재측정 명령 주석)
- [`apps/friendly/src/plugins/logs.ts`](../../apps/friendly/src/plugins/logs.ts) (수정 — `buildLlmProviderEnv()` 소비)
- [`apps/friendly/src/plugins/random-crawl.ts`](../../apps/friendly/src/plugins/random-crawl.ts) (수정 — 동일)
- [`apps/friendly/src/plugins/schedule.ts`](../../apps/friendly/src/plugins/schedule.ts) (수정 — 동일)
- [`apps/friendly/src/plugins/summaries.ts`](../../apps/friendly/src/plugins/summaries.ts) (수정 — 동일)
- [`apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts`](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts) (신규 컨슈머 — `meal-photo` purpose, 90s timeout, 복구 호출)
- [`apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts`](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts) (신규 컨슈머 — `meal-recommend` purpose)
- [`apps/friendly/src/modules/food/food-classify.service.ts`](../../apps/friendly/src/modules/food/food-classify.service.ts) (chat 컨슈머 — 40개 청크, `thinkOptionForModel`)
- [`docs/PLAN-meal.md`](../../docs/PLAN-meal.md) (결정 F — purpose 2종 분리, 모델 실측 기록 2026-08-23)
- [`docs/data-sources.md`](../../docs/data-sources.md) (평가셋 `eval/meal-photos/` 750장·균등 샘플링·kfood.zip 재추출 코드)

- [`apps/friendly/src/modules/ai/adapters/llm-provider.ts`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts) (수정 — `think` 옵션 추가)
- [`apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts) (수정 — 2단 게이트 통과 + `onEvent` 계측 + `AdapterCallEvent` + `think` 조립)
- [`apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.test.ts`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.test.ts) (수정)
- [`apps/friendly/src/modules/ai/concurrency-gate.ts`](../../apps/friendly/src/modules/ai/concurrency-gate.ts) (신규 — `ConcurrencyGate` + `AccountGateRegistry` + `accountGateRegistry`)
- [`apps/friendly/src/modules/ai/concurrency-gate.test.ts`](../../apps/friendly/src/modules/ai/concurrency-gate.test.ts) (신규)
- [`apps/friendly/src/modules/ai/llm-telemetry.ts`](../../apps/friendly/src/modules/ai/llm-telemetry.ts) (신규 — `LlmTelemetry` + `llmTelemetry` 싱글턴)
- [`apps/friendly/src/modules/ai/llm-telemetry.test.ts`](../../apps/friendly/src/modules/ai/llm-telemetry.test.ts) (신규)
- [`apps/friendly/src/modules/ai/telemetry.route.ts`](../../apps/friendly/src/modules/ai/telemetry.route.ts) (신규 — `/telemetry` + `/telemetry/stream` SSE)
- [`apps/friendly/src/modules/ai/adapter-cache.ts`](../../apps/friendly/src/modules/ai/adapter-cache.ts) (수정 — 키별 Map + 계정 게이트 주입 + 계측 훅)
- [`apps/friendly/src/modules/ai/adapter-cache.test.ts`](../../apps/friendly/src/modules/ai/adapter-cache.test.ts) (수정)
- [`apps/friendly/src/modules/ai/ai.config.service.ts`](../../apps/friendly/src/modules/ai/ai.config.service.ts) (수정 — 계정 키 상속 + 용도별 모델 폴백 + `keySource`/`defaultModelSource`; 2026-08-22 `ALL_PURPOSES = LlmProviderPurpose.options`)
- [`apps/friendly/src/modules/ai/ai.config.service.test.ts`](../../apps/friendly/src/modules/ai/ai.config.service.test.ts) (수정)
- [`apps/friendly/src/modules/ai/ai.service.ts`](../../apps/friendly/src/modules/ai/ai.service.ts)
- [`apps/friendly/src/modules/ai/ai.service.test.ts`](../../apps/friendly/src/modules/ai/ai.service.test.ts) (수정)
- [`apps/friendly/src/modules/ai/ai.route.ts`](../../apps/friendly/src/modules/ai/ai.route.ts) (수정 — 용도별 resolve; 2026-08-22 자체 `buildEnvBlock` 제거 → `buildLlmProviderEnv()`)
- [`apps/friendly/src/modules/ai/ai.test.ts`](../../apps/friendly/src/modules/ai/ai.test.ts)
- [`apps/friendly/src/modules/logs/log-analysis.service.ts`](../../apps/friendly/src/modules/logs/log-analysis.service.ts) (신규 컨슈머 — `log-analysis` purpose)
- [`packages/utils/src/aiModel.ts`](../../packages/utils/src/aiModel.ts) (모델 식별/추천 헬퍼; 2026-08-22 `MULTIMODAL_FAMILY_RE`·5용도 추천·`thinkOptionForModel`)
- [`packages/shared/src/hooks/useLlmTelemetry.ts`](../../packages/shared/src/hooks/useLlmTelemetry.ts) (신규 — SSE 구독 훅)
- [`apps/web/src/components/admin/LlmUsagePanel.tsx`](../../apps/web/src/components/admin/LlmUsagePanel.tsx) (신규 — 플로팅 사용량 패널)
- [`apps/web/src/routes/admin/AdminAiUsagePage.tsx`](../../apps/web/src/routes/admin/AdminAiUsagePage.tsx) (신규 — 사용량 상세 페이지)
- [`apps/friendly/src/modules/summary/summary.service.ts`](../../apps/friendly/src/modules/summary/summary.service.ts)
- [`apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts`](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts)
- [`apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts`](../../apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts)
- [`apps/friendly/src/modules/analytics/analytics.service.ts`](../../apps/friendly/src/modules/analytics/analytics.service.ts)
- [`apps/friendly/src/modules/analytics/global-merge.prompts.ts`](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts)
- [`apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts`](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts) (수정 — `EXTRACTION_VERSION` 1 → 2, `buildExtractionUserPrompt({ roundHint })` 추가)
- [`apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts`](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts)
- [`apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql`](../../apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql)
- [`packages/api-contract/src/schemas/ai.ts`](../../packages/api-contract/src/schemas/ai.ts) (수정 — `LlmProviderPurpose` 5종(`meal-photo`·`meal-recommend` 2026-08-22) + `LlmKeySource`/`LlmModelSource` + `keySource`/`defaultModelSource` + 텔레메트리 타입 일습)
- [`packages/api-contract/src/routes.ts`](../../packages/api-contract/src/routes.ts) (수정 — `Routes.Ai.telemetry` / `telemetryStream` 추가)
- [`packages/api-contract/src/index.ts`](../../packages/api-contract/src/index.ts) (barrel — 신규 schema 자동 re-export)
- [`packages/shared/src/api/ai.api.ts`](../../packages/shared/src/api/ai.api.ts) (수정 — `aiApi.telemetry` + `buildAiTelemetryStreamUrl`)
- [`packages/shared/src/hooks/useAi.ts`](../../packages/shared/src/hooks/useAi.ts) (수정 — purpose 별 모델 훅)
- [`apps/friendly/src/config/env.ts`](../../apps/friendly/src/config/env.ts) (수정 — 용도별 모델 변수 5종, 2026-08-22 `OLLAMA_MEAL_PHOTO_MODEL`/`OLLAMA_MEAL_RECOMMEND_MODEL` + `MEAL_*_DAILY_LIMIT`)
- [`apps/web/src/routes/admin/AdminAiKeysPage.tsx`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) (수정 — 계정 카드 + 용도 카드 분리, `KeySourceBadge`, `recommendModelForPurpose`; 2026-08-22 `PURPOSE_ORDER`/`PURPOSE_META` 5용도)
- [`apps/web/src/routes/admin/AdminAiTestPage.tsx`](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
