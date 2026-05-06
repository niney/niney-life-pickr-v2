---
topic: ai
last_compiled: 2026-05-07
sources_count: 15
status: active
---

# ai

## Purpose [coverage: high — 6 sources]

`apps/friendly`의 LLM 통합 모듈. Ollama Cloud(`https://ollama.com`)를 백엔드로
두고 어드민 전용으로 노출되는 텍스트 컴플리션·배치 컴플리션·프로바이더 설정
CRUD를 제공한다. 모듈 자체는 어떤 도메인 로직과도 결합돼 있지 않으며, 다른
모듈이 LLM이 필요해질 경우 동일한 라우트(또는 향후 `AiService` 직접 주입)를
통해 호출하는 횡단 인프라 역할이다. 현재 의존자는 어드민 UI(`apps/web`의
설정·테스트 화면)와 `Routes.Ai.*`를 사용하는 클라이언트 코드뿐이며, 서버 내부의
다른 fastify 모듈은 아직 이 모듈을 import하지 않는다.

핵심 설계 목표:

- 벤더 SDK를 서비스 레이어 밖으로 격리(`LLMProvider` 어댑터 인터페이스).
- 운영자가 서버 재시작 없이 API 키·동시성 한도를 바꿀 수 있도록 DB 우선 + env
  fallback 구성.
- 단건/배치 호출 모두에서 부분 실패를 허용하고, 도메인 에러를 와이어 친화적인
  `AiErrorCodeType`으로 변환.

## Architecture [coverage: high — 9 sources]

```
apps/friendly/src/modules/ai/
├── adapters/
│   ├── llm-provider.ts              # LLMProvider 인터페이스 + 4종 도메인 에러
│   ├── ollama-cloud.adapter.ts      # /api/chat + /api/tags 어댑터
│   └── ollama-cloud.adapter.test.ts # 10 케이스 (FIFO/abort/timeout/header)
├── ai.config.service.ts             # LlmProviderConfig CRUD + env fallback + 마스킹
├── ai.config.service.test.ts        # 17 케이스
├── ai.service.ts                    # complete / completeBatch / classifyError
├── ai.service.test.ts               # 12 케이스 (rate-limit/allSettled)
├── ai.route.ts                      # 7개 admin 엔드포인트 + AdapterCache
└── ai.test.ts                       # 13 케이스 (가드/CRUD/DELETE idempotent)
```

진입점은 [`ai.route.ts`](../../apps/friendly/src/modules/ai/ai.route.ts)에서
export 하는 `aiRoutes` fastify 플러그인. fastify의 `@fastify/autoload`가
`src/modules/<domain>/*.route.ts` 패턴으로 자동 등록한다(루트 레벨 `friendly`
규약). 모든 핸들러는 `app.withTypeProvider<ZodTypeProvider>()` 위에서
`fastify-type-provider-zod`로 자동 검증되며, 스키마는
[`packages/api-contract/src/schemas/ai.ts`](../../packages/api-contract/src/schemas/ai.ts)에서
가져온다.

라우터 내부에는 두 개의 협조 객체가 있다.

- **`AiConfigService`** — `LlmProviderConfig` Prisma 모델을 감싼 CRUD/조회 레이어.
- **`AdapterCache`** — `(apiKey, baseUrl, maxConcurrent, timeoutMs)` 4-tuple
  키로 `OllamaCloudAdapter` 인스턴스를 1개만 캐시한다. config가 바뀌면 키가
  달라지므로 새 어댑터가 생성되고, 기존 어댑터의 FIFO 큐는 그대로 자기
  in-flight를 끝내고 GC 된다.

요청 흐름:

1. fastify가 토큰 검증(`app.authenticate`)·관리자 가드(`app.requireAdmin`)
   실행.
2. `buildService()`가 매 요청마다 `config.getResolved('ollama-cloud')`로 최신
   스냅샷을 가져온다(캐시 없음 — 설정 변경 즉시 반영).
3. resolved가 null이면 throwing stub provider로 `AiService`를 만들어 반환,
   아니면 `AdapterCache.get(resolved)`가 캐시된/새 `OllamaCloudAdapter`를 준다.
4. `AiService.complete()` 또는 `completeBatch()`가 실제 호출을 수행하고
   discriminated union 결과를 반환.

## Talks To [coverage: high — 8 sources]

**상류(upstream — 모듈을 호출하는 측):**

- 어드민 UI(`apps/web`) — `Routes.Ai.*` 로 fetch.
- 향후 도메인 모듈 — 현재는 직접 호출자 없음.

**하류(downstream — 모듈이 의존하는 측):**

- `app.prisma` (fastify decorator) — `llm_provider_configs` 테이블 read/write.
- `app.authenticate`, `app.requireAdmin` — `plugins/jwt.ts`가 등록한 onRequest
  훅. AI 라우트 7개 모두에 무조건 적용.
- `env` (`config/env.ts`) — `OLLAMA_CLOUD_API_KEY` / `OLLAMA_CLOUD_BASE_URL`
  / `OLLAMA_CLOUD_TIMEOUT_MS` / `OLLAMA_CLOUD_MAX_CONCURRENT` /
  `OLLAMA_DEFAULT_MODEL`.
- Ollama Cloud HTTP API — `POST {baseUrl}/api/chat` (단건 컴플리션),
  `GET {baseUrl}/api/tags` (모델 카탈로그). 두 호출 모두
  `Authorization: Bearer {apiKey}` 헤더 필수.
- `@repo/api-contract` — 모든 와이어 타입(`AiCompleteInput`,
  `AiCompleteBatchInput`, `LlmProviderConfig`, `UpdateLlmProviderInput`,
  `TestLlmProviderInput`, `LlmModelListResult`, `Routes.Ai`).
- `plugins/empty-body-parser.ts` — fastify 기본 JSON 파서를 교체. 빈 바디를
  `{}`로 통과시켜 `POST /providers/:id/test` 같은 actionless 호출이 거부되지
  않게 함.

**내부 통신 패턴:**

- `AiService.runOne()`은 `provider.complete(...)`만 await — 어댑터의 FIFO 게이트가
  실제 동시 fetch 수를 `maxConcurrent`로 제한.
- `AiService.completeBatch()`는 `Promise.allSettled`로 펼친다. 어댑터 큐 + zod
  `max(10)` 제약으로 폭발하지 않음.
- `OllamaCloudAdapter.doComplete()`는 caller `AbortSignal`과 자체 timeout을
  단일 `AbortController`로 합성하고, abort가 어느 쪽에서 왔는지 플래그로
  추적해 `LLMCancelledError` vs `LLMTimeoutError`를 구분.

## Api Surface [coverage: high — 5 sources]

모든 라우트 prefix는 `Routes.Ai`(=`/api/v1/admin/ai/*`)이며, 항상
`onRequest: [authenticate, requireAdmin]` 가드가 걸려 있다.

| 메서드 | 경로                                | 본문                          | 응답                       |
| ------ | ----------------------------------- | ----------------------------- | -------------------------- |
| POST   | `/complete`                         | `AiCompleteInput`             | `AiCompleteResult`         |
| POST   | `/complete-batch`                   | `AiCompleteBatchInput` (≤10)  | `AiCompleteBatchResult`    |
| GET    | `/providers`                        | —                             | `LlmProviderListResult`    |
| PUT    | `/providers/:id`                    | `UpdateLlmProviderInput`      | `LlmProviderConfig`        |
| DELETE | `/providers/:id`                    | —                             | `204 No Content`           |
| GET    | `/providers/:id/models`             | —                             | `LlmModelListResult`       |
| POST   | `/providers/:id/test`               | `TestLlmProviderInput` (선택) | `TestLlmProviderResult`    |

`:id`는 `LlmProviderId` enum(`'ollama-cloud'`)으로 검증 — 알 수 없는 값은 400.

**핵심 export(모듈 외부에서 사용 가능한 이름):**

- [`LLMProvider`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts)
  인터페이스 — `complete(opts)` 필수, `listModels()` 선택. 새 벤더는 이 형태만
  구현하면 슬롯 인.
- 도메인 에러 4종(같은 파일):
  - `LLMTimeoutError` — 자체 timeoutMs 만료.
  - `LLMUpstreamError(status, message)` — non-2xx + fetch 자체 실패(`status: 0`).
  - `LLMInvalidResponseError` — 200이지만 `message.content`가 문자열이 아님.
  - `LLMCancelledError` — caller가 `AbortSignal`로 취소.
- [`OllamaCloudAdapter`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts).
- [`AiConfigService`](../../apps/friendly/src/modules/ai/ai.config.service.ts) +
  `maskApiKey(key)` 헬퍼(`null | '***' | 'sk-***...{last4}'`).
- [`AiService`](../../apps/friendly/src/modules/ai/ai.service.ts) +
  `classifyError(unknown) → { error: AiErrorCodeType, message: string }` 헬퍼.
  `AiErrorCodeType`은 `rate_limited | upstream_failed | timeout |
  invalid_response | provider_unavailable | provider_disabled | no_api_key`.

**입력 스키마 주요 제약 (api-contract):**

- `AiCompleteInput.prompt` 1–8000자, `model` 1–100자, `systemPrompt` ≤2000,
  `temperature` 0–2, `maxTokens` 양의 정수 ≤4096.
- `AiCompleteBatchInput.items` 1–10개. 각 item은 선택 `clientId`(1–64자)로
  결과 매핑.
- `UpdateLlmProviderInput`은 모두 optional + write-only `apiKey`. `baseUrl` /
  `defaultModel`은 `null` 명시 시 명시적 clear, undefined는 no-op,
  `maxConcurrent` 1–100.
- `TestLlmProviderInput.model` optional — 없으면 resolved `defaultModel` 사용.

## Data [coverage: high — 5 sources]

**테이블: `llm_provider_configs`** (Prisma 모델 `LlmProviderConfig`)

```prisma
model LlmProviderConfig {
  id            String   @id @default(cuid())
  provider      String   @unique     // 현재 'ollama-cloud'만
  apiKey        String                // 평문 저장
  baseUrl       String?
  defaultModel  String?
  enabled       Boolean  @default(true)
  maxConcurrent Int      @default(15)
  updatedAt     DateTime @updatedAt
  updatedById   String?               // 마지막으로 수정한 user.id
  @@map("llm_provider_configs")
}
```

마이그레이션:
[`20260506191413_add_llm_provider_config`](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql).
SQLite, `provider`에 unique 인덱스. 외래키 없음 — `updatedById`는 단순 텍스트
참조(soft).

**환경 변수 fallback** ([`env.ts`](../../apps/friendly/src/config/env.ts)):

| 변수                          | 기본값                | 비고                                  |
| ----------------------------- | --------------------- | ------------------------------------- |
| `OLLAMA_CLOUD_API_KEY`        | `''`                  | 빈 값이면 DB 키도 없을 시 `no_api_key`|
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com`  | DB row의 `baseUrl`이 우선             |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`               | DB에 컬럼 없음 — env 단독 소스        |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                  | DB row의 `maxConcurrent`이 우선        |
| `OLLAMA_DEFAULT_MODEL`        | `''`                  | DB `defaultModel`이 비었을 때만 사용  |

**Resolution 규칙** (`AiConfigService.getResolved()`):

```
apiKey       := row.apiKey?.trim() || env.apiKey.trim()         // 둘 다 비면 null 반환
baseUrl      := row.baseUrl ?? env.baseUrl
maxConcurrent:= row.maxConcurrent ?? env.maxConcurrent
defaultModel := row.defaultModel ?? env.defaultModel
timeoutMs    := env.timeoutMs                                    // DB 컬럼 없음
```

`row.enabled === false` 또는 effective `apiKey === ''` 이면 `null`을 돌려주고,
호출자는 `no_api_key` 결과를 만든다.

**큐/캐시:**

- **AdapterCache** — 라우트 모듈 내 단일 인스턴스. `(apiKey, baseUrl,
  maxConcurrent, timeoutMs)` 튜플 변경 시 새 `OllamaCloudAdapter` 생성. 메모리
  외 영속화 없음.
- **OllamaCloudAdapter.waiters** — 내부 FIFO 배열. `inflight < maxConcurrent`이면
  즉시 진입, 아니면 `Promise<void>` 대기열에 push. `release()`가
  `waiters.shift()`로 다음 대기자 깨움.
- **AiService.lastCallByActor** — `Map<userId, lastTimestampMs>`. 1초
  슬라이딩 윈도우 per-actor rate limit. 영속성 없음(프로세스 재시작 시 리셋).

## Key Decisions [coverage: high — 8 sources]

- **벤더 SDK 미사용, 네이티브 fetch + `LLMProvider` 인터페이스.** 어댑터를
  교체하면 OpenAI / Anthropic 등으로 옮길 수 있고, 서비스 레이어는 어떤
  벤더 import도 갖지 않는다. 새 프로바이더는
  [`adapters/llm-provider.ts`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts)
  구현 + `LlmProviderId` enum 확장만 하면 슬롯 인.
- **DB 우선 + env fallback 2단 구성.** 운영 단계에선 admin이 UI에서 키 교체
  가능, 개발 단계에선 `.env`만 두고 시작 가능. DB row가 없으면 list 조회 시
  env 기반 가상 row를 합성해 UI가 항상 1개 행을 그릴 수 있게 한다
  ([`AiConfigService.toView`](../../apps/friendly/src/modules/ai/ai.config.service.ts)).
- **apiKey는 write-only, 응답엔 항상 마스킹.** `'sk-***...{last4}'` 형태(또는 4
  글자 이하면 `'***'`). 평문 키는 PUT 본문으로만 와이어를 건넌다.
- **모델 alias 시스템 제거.** 과거 버전은 `fast`/`smart` 같은 alias를
  서버에서 `gpt-oss:20b` 등으로 매핑했으나, 운영 단순화를 위해 raw model id
  직접 입력으로 통일. zod 스키마(`AiCompleteInput.model`)도 1–100자 자유
  문자열로 두고 검증을 클라이언트에 맡긴다.
  `OLLAMA_DEFAULT_MODEL` env가 글로벌 fallback이며, `defaultModel` row가
  덮어쓴다.
- **provider별 단일 어댑터 인스턴스(`AdapterCache`).** 모든 in-flight 호출이
  같은 FIFO 게이트를 공유해야 동시성이 의미 있게 통제된다. 매 요청 새 어댑터를
  만들면 `maxConcurrent`가 사실상 무의미.
- **batch는 `Promise.allSettled`.** 한 항목의 실패가 다른 항목을 끌어내리면
  안 된다(특히 어드민이 여러 모델/프롬프트를 한 번에 비교할 때). zod에서
  `min(1).max(10)`으로 폭주 차단.
- **per-actor 1초 rate-limit.** 토큰 단위 정교한 limiter 대신, 같은
  userId의 두 번째 호출을 1초 안이면 `rate_limited`로 즉시 반환. cheap·in-memory.
  배치 단위는 batch 단위로 한 번만 카운트(내부 항목엔 적용 안 됨).
- **테스트 친화적 의존성 주입.**
  - `AiConfigService(prisma, env)` — env 블록을 인자로 받아 테스트가
    가짜 env 주입 가능 ([`ai.config.service.test.ts`](../../apps/friendly/src/modules/ai/ai.config.service.test.ts)에서
    `LlmProviderEnv` 스텁 사용).
  - `AiService(provider, configService)` — 어댑터를 fake로 갈아 끼워 단위
    테스트 가능. 라우트 통합 테스트는 `Fastify({ logger: false })` 위에 필요한
    플러그인만 명시 등록(`autoload` 우회).
- **`empty-body-parser` 플러그인 도입.** fastify 기본 JSON 파서가 빈 body에
  "Body cannot be empty…" 400을 던지는 문제를 우회. `POST /providers/:id/test`
  같은 actionless POST가 페이로드 없이 호출 가능
  ([`empty-body-parser.ts`](../../apps/friendly/src/plugins/empty-body-parser.ts)).
- **모델 카탈로그는 best-effort.** `GET /providers/:id/models`는 어댑터가
  `listModels`를 구현 안 했거나 호출 실패 시 `{ models: [] }` 반환.
  UI는 `<datalist>`로 자동완성하되 자유 입력도 허용.

## Gotchas [coverage: high — 7 sources]

- **apiKey가 SQLite에 평문 저장된다.** dev/single-tenant 환경 전제. 프로덕션
  배포 시 OS keychain·KMS 위임·디스크 암호화 등 별도 검토 필요. 현재 마스킹은
  와이어 응답에만 적용되며 DB 자체엔 안 걸려 있다.
- **env 변경은 dev 서버 재시작 필요.** `tsx --watch`는 `src/`만 감시 — `.env`
  수정은 자동 reload되지 않는다. 반대로 DB row 변경은 `getResolved()`가
  매 요청 새로 읽으므로 즉시 반영(캐시 없음).
- **`OLLAMA_CLOUD_TIMEOUT_MS`는 DB로 옮겨져 있지 않다.** Prisma 모델에 컬럼
  없음. 운영 중 timeout 조정은 env + 재시작 또는 마이그레이션 추가 필요.
- **fastify-type-provider-zod의 `body`가 정의되면 빈 body는 자동으로 막히지
  않는다 — `empty-body-parser`가 그 앞단을 처리.** 이 플러그인이 빠지면
  `POST /providers/:id/test`가 `{}` 페이로드 없이 오는 경우 400으로 거부된다.
- **`AdapterCache`는 단일 슬롯이다.** 여러 provider id가 추가되더라도 현재
  구현은 마지막 1개 캐시만 유지. 다중 provider 시 `Map<providerId, …>`로
  확장 필요.
- **caller abort vs timeout 우선순위는 caller 우선.** 둘이 동시에 발화해도
  `opts.signal?.aborted` 체크가 먼저라 `LLMCancelledError`. 메트릭에서
  타임아웃이 과소집계될 수 있다.
- **`fetch` 자체 실패는 `LLMUpstreamError(status: 0)`로 분류.** DNS/네트워크
  오류와 5xx가 동일한 에러 클래스로 들어와 status 필드로만 구분 가능.
  classifyError에서 둘 다 `upstream_failed`로 매핑되므로 클라이언트는
  세부 원인을 보지 못한다.
- **모델 list의 필드 이름이 두 가지.** Ollama Cloud는 `model`, 로컬 Ollama는
  `name`. 어댑터에서 `m.model ?? m.name`로 흡수하지만 둘 다 비면 그 항목만
  필터링되어 사라진다.
- **`AiService` 인스턴스는 매 요청 새로 만들어진다(`buildService()`).** rate-limit
  Map(`lastCallByActor`)도 매 요청 리셋되는 셈 — 실제로는
  `app.prisma.llmProviderConfig`처럼 모듈 closure에 저장되는 게 아니라
  fastify 플러그인 함수 closure에 저장돼 프로세스 라이프타임 동안 유지되지만,
  재배포·인스턴스 스케일아웃 시 윈도우가 리셋된다(단일 인스턴스 전제).
- **DELETE는 idempotent하지만 falls list back to env-backed default.** row를
  지우면 `list()`가 env 기반 가상 row를 합성하므로 UI에는 여전히 한 줄이
  보인다. 사용자에게 "삭제됐는데 왜 보이지?" 인식 차이 가능 — `updatedAt`가
  null인 점으로 구분.

## Sources [coverage: high — 15 sources]

- [`apps/friendly/src/modules/ai/adapters/llm-provider.ts`](../../apps/friendly/src/modules/ai/adapters/llm-provider.ts)
- [`apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.ts)
- [`apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.test.ts`](../../apps/friendly/src/modules/ai/adapters/ollama-cloud.adapter.test.ts)
- [`apps/friendly/src/modules/ai/ai.config.service.ts`](../../apps/friendly/src/modules/ai/ai.config.service.ts)
- [`apps/friendly/src/modules/ai/ai.config.service.test.ts`](../../apps/friendly/src/modules/ai/ai.config.service.test.ts)
- [`apps/friendly/src/modules/ai/ai.service.ts`](../../apps/friendly/src/modules/ai/ai.service.ts)
- [`apps/friendly/src/modules/ai/ai.service.test.ts`](../../apps/friendly/src/modules/ai/ai.service.test.ts)
- [`apps/friendly/src/modules/ai/ai.route.ts`](../../apps/friendly/src/modules/ai/ai.route.ts)
- [`apps/friendly/src/modules/ai/ai.test.ts`](../../apps/friendly/src/modules/ai/ai.test.ts)
- [`packages/api-contract/src/schemas/ai.ts`](../../packages/api-contract/src/schemas/ai.ts)
- [`apps/friendly/prisma/schema.prisma`](../../apps/friendly/prisma/schema.prisma)
- [`apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql`](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)
- [`apps/friendly/src/config/env.ts`](../../apps/friendly/src/config/env.ts)
- [`apps/friendly/.env.example`](../../apps/friendly/.env.example)
- [`apps/friendly/src/plugins/empty-body-parser.ts`](../../apps/friendly/src/plugins/empty-body-parser.ts)
