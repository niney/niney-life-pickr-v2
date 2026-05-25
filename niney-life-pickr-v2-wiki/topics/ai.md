---
topic: ai
last_compiled: 2026-05-25
sources_count: 19
status: active
aliases: [llm, ollama, ollama-cloud, provider, purpose, vision, image, chat]
---

# ai

> **2026-05-25 변경 흡수 — provider purpose 분리 (chat/image) + 영수증 추출 vision LLM 컨슈머 신규.** `LlmProviderConfig` 의 unique 키가 `(provider, purpose)` 로 확장되어 같은 `ollama-cloud` 에서도 텍스트 추론 (`chat`) 과 비전 (`image`) 모델을 별도 row 로 운영한다. AI 라우트의 모든 `:id` 엔드포인트가 `:purpose` 파라미터를 추가로 받고, `AiConfigService.getResolved(provider, purpose)` 가 purpose 별로 다른 ResolvedProviderConfig 를 반환한다. `adapterCache` 키에도 purpose 가 포함돼 chat/image 어댑터·FIFO 게이트가 분리된다. env fallback 은 `chat` purpose 에만 적용 — `image` 는 DB row 가 있어야 활성화된다. 신규 컨슈머 [`settlement-extraction`](settlement.md) 모듈이 `getResolved('ollama-cloud', 'image')` 로 vision provider 를 얻어 영수증 → 구조화 항목 추출에 사용. 어드민 UI(`AdminAiKeysPage`)는 (provider × purpose) 조합별로 카드를 그리고 "다른 용도 추가" 버튼으로 신규 조합을 등록할 수 있다. `AdminAiTestPage` 는 현재 chat 만 다룬다.

## Purpose [coverage: high — 5 sources]

`apps/friendly`의 LLM 통합 모듈. Ollama Cloud(`https://ollama.com`)를 기본 백엔드로
두고, 어드민 전용으로 노출되는 텍스트 컴플리션·배치 컴플리션·프로바이더 설정
CRUD·연결 테스트·모델 카탈로그를 제공한다. 모듈 자체는 어떤 도메인 로직과도
결합돼 있지 않으며, 다른 모듈이 LLM이 필요해질 경우 `AdapterCache` 싱글톤을 통해
같은 어댑터 인스턴스(=같은 FIFO 게이트)를 공유한다.

provider 는 두 차원으로 식별된다.

1. **`provider`** — 벤더 식별자 (`'ollama-cloud'`). `LlmProviderId` enum.
2. **`purpose`** — 용도 (`'chat'` | `'image'`). 같은 벤더라도 텍스트와 비전은
   보통 모델이 달라 한 row 에 묶기 어렵다. `LlmProviderPurpose` enum.

DB 의 unique 키는 `(provider, purpose)` 튜플 — 같은 provider 의 다른 purpose 는
독립 row 이며, 어댑터 캐시 / FIFO 게이트도 purpose 별로 분리된다 (한 vision
호출이 chat 슬롯을 잡아먹지 않는다).

현재 외부 사용자는 네 부류.

- 어드민 UI(`apps/web`)의 [`AdminAiKeysPage`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
  / [`AdminAiTestPage`](../../apps/web/src/routes/admin/AdminAiTestPage.tsx).
- [`summary`](friendly.md) 모듈 — 리뷰 단위 구조화 분석 (`ANALYSIS_VERSION`).
  `chat` purpose.
- [`menu-grouping`](menu-grouping.md) 모듈 — 식당당 1회 메뉴 표기 정규화
  (`MENU_GROUPING_VERSION`). `chat` purpose.
- [`analytics`](analytics.md) 모듈 — 식당 가로지르기 글로벌 머지 두-패스
  (`GLOBAL_MERGE_VERSION`). `chat` purpose.
- [`settlement-extraction`](settlement.md) 모듈 — 영수증 이미지 → 메뉴/금액 구조화
  추출 (`EXTRACTION_VERSION`). **`image` purpose — 신규 컨슈머**. ai 토픽 시점에선
  "vision LLM 의 첫 외부 컨슈머" 정도가 핵심 — 도메인 자체는 settlement 토픽 참고.

다섯 도메인 모두 같은 `adapterCache` import + `AiConfigService.getResolved(...)`
경로를 거치므로 동시성 캡 + 429 재시도/백오프가 도메인을 가리지 않고 적용된다.
도메인별로 다른 건 prompt + JSON schema 모양 + 청크 사이즈 + (이젠) purpose.

핵심 설계 목표:

- 벤더 SDK를 서비스 레이어 밖으로 격리(`LLMProvider` 어댑터 인터페이스).
- 운영자가 서버 재시작 없이 API 키·동시성 한도·기본 모델을 바꿀 수 있도록
  DB 우선 + env fallback 2단 구성 (단 env fallback 은 `chat` purpose 한정).
- 단건/배치 호출 모두에서 부분 실패를 허용하고, 도메인 에러를 와이어 친화적인
  `AiErrorCodeType`으로 변환.
- Ollama 고유 옵션(`num_ctx`, `num_predict`, `format`, **`images`**)을 1차 시민으로
  노출 — reasoning/structured-output/vision 워크로드에서 컨텍스트 잘림·파싱 실패를
  줄이기 위한 의도적 누출.
- **vision vs chat 모델 분리** — purpose 컬럼으로 같은 provider 내에서도
  용도별로 다른 모델/키/동시성을 둘 수 있게 한다.

## Architecture [coverage: high — 9 sources]

```
apps/friendly/src/modules/ai/
├── adapters/
│   ├── llm-provider.ts              # LLMProvider 인터페이스 + 4종 도메인 에러
│   │                                # + numCtx/format/images 옵션
│   ├── ollama-cloud.adapter.ts      # /api/chat + /api/tags 어댑터
│   │                                # + FIFO 게이트 + 429 지수 백오프 재시도
│   │                                # + messages[i].images vision payload
│   └── ollama-cloud.adapter.test.ts
├── adapter-cache.ts                 # 모듈 레벨 싱글톤. 캐시 키에 purpose 포함
│                                    #   → chat/image 어댑터가 별도 인스턴스
├── ai.config.service.ts             # LlmProviderConfig CRUD + env fallback (chat 한정)
│                                    #   + 마스킹 + purpose 별 resolve
├── ai.config.service.test.ts
├── ai.service.ts                    # complete / completeBatch / classifyError
│                                    #   (admin 라우트 한정, 항상 chat purpose)
├── ai.service.test.ts
├── ai.route.ts                      # 7개 admin 엔드포인트 (:id/:purpose)
└── ai.test.ts
```

진입점은 [`ai.route.ts`](../../apps/friendly/src/modules/ai/ai.route.ts)에서
export 하는 `aiRoutes` fastify 플러그인. fastify의 `@fastify/autoload`가
`src/modules/<domain>/*.route.ts` 패턴으로 자동 등록한다. 모든 핸들러는
`app.withTypeProvider<ZodTypeProvider>()` 위에서 `fastify-type-provider-zod`로
자동 검증되며, 스키마는
[`packages/api-contract/src/schemas/ai.ts`](../../packages/api-contract/src/schemas/ai.ts)에서
가져온다.

핵심 협조 객체:

- **`AiConfigService`** — `LlmProviderConfig` Prisma 모델을 감싼 CRUD/조회 레이어.
  생성자에 `LlmProviderEnv`를 인자로 받아 테스트가 가짜 env 주입 가능. 백그라운드
  도메인(summary/menu-grouping/analytics/settlement-extraction)은 모두 자체 인스턴스를
  만들어 `getResolved(provider, purpose)`를 호출 — 같은 DB row 를 읽으므로
  운영자가 키를 바꾸면 다음 호출부터 즉시 반영된다. `purpose` 가 두 번째
  인자로 들어왔다 — 호출자는 자기 용도(`'chat'` 또는 `'image'`)를 명시해야 한다.
- **`AdapterCache`** — `(provider, purpose, apiKey, baseUrl, maxConcurrent, timeoutMs)`
  6-tuple 키로 `OllamaCloudAdapter` 인스턴스를 1개만 캐시하는 모듈 레벨 싱글톤
  ([`adapter-cache.ts`](../../apps/friendly/src/modules/ai/adapter-cache.ts)).
  config 또는 purpose 가 바뀌면 키가 달라지므로 새 어댑터가 생성되고, 기존
  어댑터의 FIFO 큐는 in-flight를 끝낸 뒤 GC. **chat 과 image 는 서로 다른
  어댑터** — 한 vision 호출이 chat 슬롯을 점유하지 않는다. 단 현재 구현은
  "마지막 1개" 캐시라 chat ↔ image 를 빠르게 번갈아 호출하면 어댑터가 매번
  교체된다 (gotcha 참고). `summary` / `menu-grouping` / `analytics` /
  `ai.route` / `settlement-extraction` 가 모두 같은 import 를 공유.

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

1. `:id`(`ollama-cloud`) + `:purpose`(`chat` | `image`) 가 `ProviderParams`
   (zod `{ id: LlmProviderId, purpose: LlmProviderPurpose }`) 로 검증된다.
2. `config.getResolved(req.params.id, req.params.purpose)` — purpose 별로
   따로 풀린다. `getResolved('ollama-cloud', 'image')` 는 DB row 가 없거나
   apiKey 가 비면 `null` 반환 (env fallback 없음).
3. `cache.get(resolved)` 가 `(provider, purpose, …)` 키로 어댑터 획득.

요청 흐름(백그라운드 텍스트 도메인 — summary/menu-grouping/analytics 공통):

1. 도메인 서비스가 자체 `AiConfigService`로 `getResolved('ollama-cloud', 'chat')`
   호출 → null 이면 작업을 즉시 실패 처리.
2. `adapterCache.get(resolved)`로 공유 어댑터 핸들 획득.
3. `provider.complete({ prompt, systemPrompt, model, numCtx, format, ... })`
   직접 호출 — `AiService` 의 rate-limit/discriminated union 래핑은 거치지 않음.
   배치 분할·재시도·결과 머지는 도메인 책임.
4. structured output (`format`)으로 받은 텍스트를 도메인 스키마로 parse →
   실패 시 fallback identity (입력 키 = canonical) 또는 stale 표시.

요청 흐름(영수증 추출 — settlement-extraction, image purpose):

1. `SettlementExtractionService.resolveProvider()` 가
   `aiConfig.getResolved('ollama-cloud', 'image')` 호출. DB row 가 없거나
   apiKey/defaultModel 중 하나라도 비면 `no_provider` 에러로 라우트가 400 반환.
2. `adapterCache.get(resolved)` — chat 어댑터와 다른 인스턴스 (캐시 키에 purpose
   포함).
3. 영수증 이미지를 sharp 로 정규화(EXIF 회전, 1600px 다운스케일, JPEG q=80) 후
   base64 인코딩 → `provider.complete({ images: [b64], format: EXTRACTION_JSON_SCHEMA,
   systemPrompt, prompt, numCtx: 8192, maxTokens: 4000, temperature: 0.1, signal })`.
4. 응답 JSON 을 zod 로 검증 + `extractFirstJsonObject` 후처리, items[].amount
   가 0 이면 `unitPrice * quantity` 로 보정, 합계 불일치 경고 부착.

요청 흐름(어댑터 내부):

1. `acquire()` — `inflight < maxConcurrent`이면 즉시 진입, 아니면 FIFO `waiters`에 push.
2. `completeWithRetry()` — `doComplete()` 시도. 응답이 `LLMUpstreamError(429)`
   또는 본문에 `too many concurrent requests` / `rate limit` 이 있으면 200·400·800ms +
   jitter 로 최대 3회 재시도. **슬롯을 잡은 채** 재시도하므로 동시성 한도는
   유지된다.
3. `doComplete()` — `/api/chat` POST. body 에 `messages` (system + user),
   `options.temperature`, `options.num_predict`, `options.num_ctx`, 최상위
   `format` 을 조립. vision 호출이면 user 메시지에 `images: [base64...]` 추가.
4. `release()` — 다음 waiter 깨움.

## Talks To [coverage: high — 10 sources]

**상류(upstream — 모듈을 호출하는 측):**

- 어드민 UI(`apps/web`) — `AdminAiKeysPage` 가 `useProviders` /
  `useUpdateProvider` / `useDeleteProvider` / `useTestProvider` /
  `useProviderModels` 훅으로 fetch. (provider × purpose) 조합당 카드 하나를
  렌더링하고, 등록되지 않은 조합은 "다른 용도 추가" 버튼으로 빈 카드를 만든
  뒤 다음 PUT 에서 키를 채워 활성화한다. `AdminAiTestPage` 는 `useCompleteAi` /
  `useCompleteBatchAi` 로 단건/배치 + 모델 비교 + 샘플 N개 모드 실행 — 현재
  chat purpose 만 다룬다 (`useProviderModels({ id: 'ollama-cloud', purpose: 'chat' })`).
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

**하류(downstream — 모듈이 의존하는 측):**

- `app.prisma` (fastify decorator) — `llm_provider_configs` 테이블 read/write.
  unique 키 `(provider, purpose)`.
- `app.authenticate`, `app.requireAdmin` — `plugins/jwt.ts`가 등록한 onRequest
  훅. AI 라우트 7개 모두에 무조건 적용.
- `env` (`config/env.ts`) — `OLLAMA_CLOUD_API_KEY` / `OLLAMA_CLOUD_BASE_URL`
  / `OLLAMA_CLOUD_TIMEOUT_MS` / `OLLAMA_CLOUD_MAX_CONCURRENT` /
  `OLLAMA_DEFAULT_MODEL`. **`chat` purpose 에만 적용** — `image` 는 env fallback
  없음.
- Ollama Cloud HTTP API — `POST {baseUrl}/api/chat` (단건 컴플리션 + 구조화
  출력 + vision `images`), `GET {baseUrl}/api/tags` (모델 카탈로그). 두 호출 모두
  `Authorization: Bearer {apiKey}` 헤더 필수.
- `@repo/api-contract` — 모든 와이어 타입 (`LlmProviderPurpose` enum 추가).
- `plugins/empty-body-parser.ts` — fastify 기본 JSON 파서를 교체. 빈 바디를
  `{}`로 통과시켜 `POST /providers/:id/:purpose/test` 같은 actionless 호출이
  거부되지 않게 함.

**내부 통신 패턴:**

- `AiService.runOne()`은 `provider.complete(...)`만 await — 어댑터의 FIFO 게이트가
  실제 동시 fetch 수를 `maxConcurrent`로 제한.
- `AiService.completeBatch()`는 `Promise.allSettled`로 펼친다. 어댑터 큐 + zod
  `max(10)` 제약으로 폭발하지 않음.
- `OllamaCloudAdapter.doComplete()`는 caller `AbortSignal`과 자체 timeout을
  단일 `AbortController`로 합성하고, abort가 어느 쪽에서 왔는지 플래그로
  추적해 `LLMCancelledError` vs `LLMTimeoutError`를 구분.
- 429 재시도는 어댑터 내부에서만 보이고 caller에는 성공 또는 최종 실패만
  올라간다. `AiService` / 도메인 서비스 모두 재시도 사실을 모른다.

## Api Surface [coverage: high — 6 sources]

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
| POST   | `/providers/:id/:purpose/test`                  | `TestLlmProviderInput` (선택) | `TestLlmProviderResult`    |

- `:id`는 `LlmProviderId` enum(`'ollama-cloud'`)으로 검증 — 알 수 없는 값은 400.
- `:purpose`는 `LlmProviderPurpose` enum(`'chat'` | `'image'`)으로 검증.
- `/complete` / `/complete-batch` 는 path 파라미터 없이 항상 `chat` purpose 를
  사용 (admin AI 테스트 페이지 전용 — 영수증 추출은 자체 라우트).
- 경로 빌더: `Routes.Ai.provider(id, purpose)` / `Routes.Ai.testProvider(id, purpose)`
  / `Routes.Ai.providerModels(id, purpose)`.

**핵심 export(모듈 외부에서 사용 가능한 이름):**

- [`LLMProvider`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts)
  인터페이스 — `complete(opts)` 필수, `listModels()` 선택. 새 벤더는 이 형태만
  구현하면 슬롯 인.
- `LLMCompleteOptions` — `prompt` / `model` 필수. `systemPrompt`, `temperature`,
  `maxTokens`, **`numCtx`**, **`format` ('json' | JSON Schema 객체)**, **`images`
  (base64 문자열 배열, vision 입력)**, `signal` 선택. `numCtx` / `format` /
  `images` 는 Ollama 가 1차 시민으로 받지만, 다른 어댑터는 자유롭게 무시 가능.
- 도메인 에러 4종(같은 파일):
  - `LLMTimeoutError` — 자체 timeoutMs 만료.
  - `LLMUpstreamError(status, message)` — non-2xx + fetch 자체 실패(`status: 0`).
  - `LLMInvalidResponseError` — 200이지만 `message.content`가 문자열이 아님.
  - `LLMCancelledError` — caller가 `AbortSignal`로 취소.
- [`OllamaCloudAdapter`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts).
- [`adapterCache`](../../apps/friendly/src/modules/ai/adapter-cache.ts) — 모듈
  레벨 싱글톤. `get(resolved)` 가 캐시 hit / miss 결정. 캐시 키에 `purpose`
  포함 — chat / image 어댑터가 별도 인스턴스로 분리된다. summary / menu-grouping /
  analytics / settlement-extraction 모두 이 import 를 공유.
- [`AiConfigService`](../../apps/friendly/src/modules/ai/ai.config.service.ts) +
  `maskApiKey(key)` 헬퍼(`null | '***' | 'sk-***...{last4}'`).
  `getResolved(provider, purpose)` / `update(provider, purpose, input, actorId)` /
  `remove(provider, purpose)` 모두 purpose 가 두 번째 위치 인자.
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
  `numCtx`/`format`/`images` 가 노출되지 않는다 — `LLMCompleteOptions` 의 내부
  필드로, `summary` / `menu-grouping` / `analytics` / `settlement-extraction`
  같은 in-process 호출자만 쓴다.
- `AiCompleteBatchInput.items` 1–10개. 각 item은 선택 `clientId`(1–64자)로
  결과 매핑.
- `LlmProviderConfig` 와이어 타입에 `purpose: 'chat' | 'image'` 필드 추가
  (기존 `provider` 외).
- `UpdateLlmProviderInput`은 모두 optional + write-only `apiKey`. `baseUrl` /
  `defaultModel`은 `null` 명시 시 명시적 clear, undefined는 no-op,
  `maxConcurrent` 1–100.
- `TestLlmProviderInput.model` optional — 없으면 resolved `defaultModel` 사용.

**Web 어드민 UI:**

- [`AdminAiKeysPage.tsx`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx) —
  (provider × purpose) 조합당 카드. 카드 헤더에 purpose 배지 + 설명 + 키 상태
  + 활성/비활성 배지. write-only API 키 입력, baseUrl/defaultModel/maxConcurrent
  편집, 활성화 토글, 모델 datalist 자동완성(`useProviderModels` 가 purpose 별로
  fetch), 연결 테스트(현재 form 의 `defaultModel` 값을 그대로 보냄),
  DB row 삭제. 등록되지 않은 (provider × purpose) 조합은 "다른 용도 추가"
  영역에 버튼으로 노출되며 클릭 시 빈 카드를 만든다 (`{ enabled: true }`만
  PUT — chat 은 env fallback 으로 키가 들어오고, image 는 빈 키로 카드만
  생성돼 다음 저장에서 채워야 한다).
- [`AdminAiTestPage.tsx`](../../apps/web/src/routes/admin/AdminAiTestPage.tsx) —
  4개 모드: 단건 / Batch(서로 다른 prompt N개) / 모델 비교(같은 prompt × 모델
  N개) / 샘플 N개(같은 prompt × 같은 모델 × N회). Temperature 는 opt-in 토글
  — 꺼두면 필드를 보내지 않아 provider 기본값 사용. **현재 chat purpose 전용**
  — `useProviderModels` 에 `purpose: 'chat'` 하드코딩.

## Data [coverage: high — 6 sources]

**테이블: `llm_provider_configs`** (Prisma 모델 `LlmProviderConfig`)

```prisma
model LlmProviderConfig {
  id            String   @id @default(cuid())
  provider      String                  // 'ollama-cloud'
  purpose       String   @default("chat") // 'chat' | 'image'
  apiKey        String                  // 평문 저장
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

SQLite, 외래키 없음 — `updatedById`는 단순 텍스트 참조(soft).

**환경 변수 fallback** ([`env.ts`](../../apps/friendly/src/config/env.ts)):

`purpose='chat'` 에만 적용. `purpose='image'` 는 DB row 가 없으면 `null` 반환.

| 변수                          | 기본값                | 비고                                  |
| ----------------------------- | --------------------- | ------------------------------------- |
| `OLLAMA_CLOUD_API_KEY`        | `''`                  | chat 한정. 빈 값이면 DB 키도 없을 시 `no_api_key`|
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com`  | chat 한정. DB row의 `baseUrl`이 우선  |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`               | chat/image 공통. DB에 컬럼 없음 — env 단독 소스 |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                  | chat 한정. DB row의 `maxConcurrent`이 우선 (image 도 row 의 값 사용)|
| `OLLAMA_DEFAULT_MODEL`        | `''`                  | chat 한정. DB `defaultModel`이 비었을 때만 사용  |

**Resolution 규칙** (`AiConfigService.getResolved(provider, purpose)`):

```
allowEnvFallback := purpose === 'chat'
envApiKey        := allowEnvFallback ? env.apiKey.trim() : ''
apiKey           := row.apiKey?.trim() || envApiKey                 // 둘 다 비면 null 반환
baseUrl          := row.baseUrl ?? env.baseUrl                       // image 는 row.baseUrl ?? env.baseUrl 도 적용
maxConcurrent    := row.maxConcurrent ?? env.maxConcurrent
defaultModel     := row.defaultModel ?? (allowEnvFallback ? env.defaultModel : '')
timeoutMs        := env.timeoutMs                                    // DB 컬럼 없음
```

`row.enabled === false` 또는 effective `apiKey === ''` 이면 `null`을 돌려주고,
호출자는 `no_api_key`(어드민) / `no_provider`(settlement-extraction) 결과를 만든다.

**`list()` 동작:** DB 행을 `(provider, purpose)` 로 정렬해 반환. `chat` purpose
row 가 없는 provider 는 env 기반 가상 row 1개를 합성해 UI 가 항상 chat 카드를
그리도록 한다 (`toView` 의 `allowEnvFallback`). image purpose 는 DB row 가
있을 때만 노출되며, 등록 전엔 어드민이 "다른 용도 추가" 버튼으로 명시적으로
생성해야 한다.

**도메인별 prompt + JSON schema + 청크 사이즈 + purpose:**

| 도메인 | purpose | VERSION 상수 | 청크 | JSON Schema (additionalProperties / shape) | 호출 빈도 |
| ------ | ------- | ------------ | ---- | ------------------------------------------ | --------- |
| summary | chat | `ANALYSIS_VERSION = 4` (traits + menus[].sentiment) | 리뷰 1건/호출 | review analysis schema (rating/menus/traits/...) | 리뷰 단위 |
| menu-grouping | chat | `MENU_GROUPING_VERSION = 1` | 80 | `{ type: 'string' }` (입력 키 → canonical) | 식당당 1회 |
| analytics | chat | `GLOBAL_MERGE_VERSION = 2` | 50 (v2는 출력 토큰 ↑) | `{ type: 'object', properties: { canonical, categoryPath }, required: [...] }` | 글로벌 1회 (pass1 + pass2) |
| settlement-extraction | **image** | `EXTRACTION_VERSION = 1` | 1 (영수증 1장) | `{ items: [{ name, unitPrice, quantity, amount, category, matchedMenuName }], totalAmount }`, `EXTRACTION_JSON_SCHEMA` | 사용자 업로드 단위 |

각 도메인이 자기 VERSION 상수를 record 에 함께 저장 → 프롬프트/스키마 변경 시
상수를 올리면 stored < current 인 record 가 자동으로 stale 판정되어 재계산 큐에
들어간다 (단 settlement-extraction 은 재추출 자동화가 아직 없고 로그 식별자로만
사용). 자세한 라이프사이클은
[`menu-grouping`](menu-grouping.md) / [`analytics`](analytics.md) /
[`settlement`](settlement.md) 토픽 참고.

**큐/캐시:**

- **`adapterCache`** — 모듈 레벨 싱글톤(import 한 모든 곳이 동일 인스턴스).
  `(provider, purpose, apiKey, baseUrl, maxConcurrent, timeoutMs)` 튜플 변경 시
  새 `OllamaCloudAdapter` 생성. 메모리 외 영속화 없음. 현재 구현은 "마지막 1개"
  슬롯이라 chat ↔ image 호출이 번갈아 일어나면 매번 인스턴스가 교체된다 —
  텍스트 도메인이 활발할 때 영수증 추출이 들어오면 FIFO 게이트가 리셋될 수 있다.
- **`OllamaCloudAdapter.waiters`** — 내부 FIFO 배열. `inflight < maxConcurrent`이면
  즉시 진입, 아니면 `Promise<void>` 대기열에 push. `release()`가
  `waiters.shift()`로 다음 대기자 깨움. summary 의 리뷰 fan-out, menu-grouping
  의 식당당 1회 호출, analytics 의 두-패스 청크 호출이 모두 같은 (chat) 큐에
  줄선다. image 는 별도 어댑터 인스턴스라 별도 큐.
- **`AiService.lastCallByActor`** — `Map<userId, lastTimestampMs>`. 1초
  슬라이딩 윈도우 per-actor rate limit. **어드민 라우트(`/complete`,
  `/complete-batch`)에만 적용** — 백그라운드 도메인과 settlement-extraction 은
  `AiService` 를 거치지 않으므로 영향 없음. 영속성 없음 (프로세스 재시작 시
  리셋).

## Key Decisions [coverage: high — 9 sources]

- **벤더 SDK 미사용, 네이티브 fetch + `LLMProvider` 인터페이스.** 어댑터를
  교체하면 OpenAI / Anthropic 등으로 옮길 수 있고, 서비스 레이어는 어떤
  벤더 import도 갖지 않는다. 새 프로바이더는
  [`adapters/llm-provider.ts`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts)
  구현 + `LlmProviderId` enum 확장만 하면 슬롯 인.
- **purpose 컬럼 도입 — vision 모델 분리.** 영수증 추출이 vision LLM (예:
  `llama3.2-vision`) 을 요구하면서 같은 provider 내에서도 텍스트 chat 모델과
  분리할 필요가 생겼다. 한 row 에 두 모델을 묶으면 (a) `defaultModel` 이
  하나라 자동 선택이 어렵고 (b) 동시성 한도를 vision 의 무거운 비용에 맞춰
  내려야 해 chat fan-out 이 같이 죽는다. 해결: `(provider, purpose)` unique 로
  row 를 분리, 각 row 가 독립 모델·키·동시성·base URL 을 갖는다. unique 인덱스
  변경 마이그레이션 + 기본값 `'chat'` 으로 기존 row 무중단 흡수.
- **DB 우선 + env fallback 2단 구성 — env 는 `chat` 한정.** 운영 단계에선
  admin이 UI에서 키 교체 가능, 개발 단계에선 `.env`만 두고 시작 가능.
  단 image 는 env 변수가 없어 (vision 모델 식별자가 chat 과 다르고, 영수증
  추출은 dev 기본 기능이 아니라 명시적 등록 의도) DB row 없으면 `null`
  반환. DB row가 없으면 list 조회 시 chat purpose 에 한해 env 기반 가상 row를
  합성해 UI가 항상 1개 행을 그릴 수 있게 한다 (`AiConfigService.toView`).
- **versioned-llm-prompts 패턴.** 각 도메인은 자기 모듈에 `*_VERSION` 상수 +
  systemPrompt + JSON schema 를 한 파일에 묶는다 — `summary` 의
  `ANALYSIS_VERSION`, `menu-grouping` 의 `MENU_GROUPING_VERSION`,
  `analytics` 의 `GLOBAL_MERGE_VERSION`, **신규 `settlement-extraction` 의
  `EXTRACTION_VERSION = 1`** ([`settlement-extraction.prompts.ts`](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)).
  ai 모듈 자체는 버전을 모르고, record 에 함께 저장하는 책임은 도메인.
- **apiKey는 write-only, 응답엔 항상 마스킹.** `'sk-***...{last4}'` 형태(또는 4
  글자 이하면 `'***'`). 평문 키는 PUT 본문으로만 와이어를 건넌다. DB
  컬럼 자체는 평문 — CLAUDE.md 의 SQLite 단일 인스턴스 전제하에 DB가
  신뢰 경계.
- **In-process concurrency cap (Redis 사용 금지).** CLAUDE.md 의 "단일
  인스턴스 + lru-cache" 원칙을 그대로 따른다. 어댑터 인스턴스 closure 의
  `inflight` 카운터 + FIFO `waiters` 배열만으로 cap 을 구현. 외부 broker 없음.
- **purpose 별 어댑터 분리 (캐시 키에 purpose 포함).** chat 과 image 가 같은
  FIFO 게이트를 공유하면 무거운 vision 호출이 chat fan-out 을 묶어 버린다.
  `AdapterCache.get()` 의 캐시 키에 `resolved.purpose` 를 포함시켜 별도
  인스턴스로 분리. 단점: 현재 구현은 "마지막 1개" 캐시 슬롯이라 chat ↔ image
  alternation 이 잦으면 인스턴스가 매번 교체된다 (gotchas).
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

## Gotchas [coverage: high — 8 sources]

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
- **`image` purpose 에는 env fallback 이 없다.** `OLLAMA_CLOUD_API_KEY` 같은
  env 변수는 `chat` purpose 의 `getResolved` 에서만 적용. image purpose 는
  DB row 가 없거나 키/모델이 비면 `null` 을 반환 — 영수증 추출 라우트는
  `no_provider` 400 으로 떨어진다. dev 환경에서도 어드민이 한 번은 명시적
  등록 필요.
- **`AdapterCache` 는 마지막 1개 슬롯이다.** chat 과 image 가 동시에 자주
  호출되면 캐시 키가 매번 바뀌어 어댑터가 교체된다 — 교체 시점에 in-flight
  호출은 끝까지 살지만 새 호출은 새 인스턴스로 가서 FIFO 게이트가 분리된다
  (chat 8개 + image 1개가 같은 시점에 떠 있을 수 있음). 실질적으로 동시
  호출이 적은 dev 환경에선 무해하지만, 운영에서 vision 부하가 늘면
  `Map<purpose, OllamaCloudAdapter>` 로 확장 필요.
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
  으로 시험하려면 현재는 별도 통로가 없다 (영수증 업로드 흐름으로 시험).
- **DELETE 후에도 chat purpose 의 `list()` 는 env 기반 가상 row를 합성한다.**
  UI 에는 chat 카드 한 줄이 여전히 보이고, `updatedAt` 이 null 인 점으로만
  구분 가능. image purpose 는 DELETE 후 카드가 사라진다.
- **`maxConcurrent` 가 chat/image 별로 따로다.** unique 가 `(provider, purpose)`
  이므로 두 row 가 각자 동시성 한도를 갖는다. chat=15, image=2 같이 vision
  부하를 별도로 조여 둘 수 있다.
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

## Sources [coverage: high — 19 sources]

- [`apps/friendly/src/modules/ai/adapters/llm-provider.ts`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts)
- [`apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts)
- [`apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.test.ts`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.test.ts)
- [`apps/friendly/src/modules/ai/adapter-cache.ts`](../../apps/friendly/src/modules/ai/adapter-cache.ts)
- [`apps/friendly/src/modules/ai/ai.config.service.ts`](../../apps/friendly/src/modules/ai/ai.config.service.ts)
- [`apps/friendly/src/modules/ai/ai.config.service.test.ts`](../../apps/friendly/src/modules/ai/ai.config.service.test.ts)
- [`apps/friendly/src/modules/ai/ai.service.ts`](../../apps/friendly/src/modules/ai/ai.service.ts)
- [`apps/friendly/src/modules/ai/ai.service.test.ts`](../../apps/friendly/src/modules/ai/ai.service.test.ts)
- [`apps/friendly/src/modules/ai/ai.route.ts`](../../apps/friendly/src/modules/ai/ai.route.ts)
- [`apps/friendly/src/modules/ai/ai.test.ts`](../../apps/friendly/src/modules/ai/ai.test.ts)
- [`apps/friendly/src/modules/summary/summary.service.ts`](../../apps/friendly/src/modules/summary/summary.service.ts)
- [`apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts`](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts)
- [`apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts`](../../apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts)
- [`apps/friendly/src/modules/analytics/analytics.service.ts`](../../apps/friendly/src/modules/analytics/analytics.service.ts)
- [`apps/friendly/src/modules/analytics/global-merge.prompts.ts`](../../apps/friendly/src/modules/analytics/global-merge.prompts.ts)
- [`apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts`](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)
- [`apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts`](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts)
- [`apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql`](../../apps/friendly/prisma/migrations/20260523010655_pnpm_filter_friendly_test_src_modules_ai/migration.sql)
- [`packages/api-contract/src/schemas/ai.ts`](../../packages/api-contract/src/schemas/ai.ts)
- [`apps/web/src/routes/admin/AdminAiKeysPage.tsx`](../../apps/web/src/routes/admin/AdminAiKeysPage.tsx)
- [`apps/web/src/routes/admin/AdminAiTestPage.tsx`](../../apps/web/src/routes/admin/AdminAiTestPage.tsx)
