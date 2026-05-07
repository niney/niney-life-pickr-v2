---
topic: api-contract
last_compiled: 2026-05-07
sources_count: 12
status: active
aliases: [zod, schemas, ssot, contracts, "@repo/api-contract"]
---

# api-contract — Zod 공유 스키마 (SSOT)

`@repo/api-contract` 은 모노레포 전체의 API I/O 단일 진실 공급원(Single Source of Truth)이다.
서버(friendly)와 클라이언트(web/mobile, `@repo/shared` 경유) 양쪽이 동일한 Zod 스키마와
라우트 경로 상수를 공유한다.

## Purpose [coverage: high — 4 sources]

API 의 입력/출력을 한 곳에서 정의하기 위한 Zod 스키마 패키지다. 동일한 스키마가
세 가지 역할을 동시에 수행한다.

- **friendly (Fastify)** — `fastify-type-provider-zod` 가 동일 스키마로 요청/응답을
  런타임 검증하고, 그 메타데이터로 OpenAPI 문서를 자동 생성한다.
- **web / mobile** — `@repo/shared` 의 fetch 함수가 `z.infer<typeof X>` 로 추출한
  타입으로 정적 타입을 부여한다 (런타임 파싱은 옵션).
- **route 경로** — `routes.ts` 의 `Routes.*` 가 서버 라우터 등록과 클라이언트 호출
  양쪽에 같은 문자열을 공급해, 경로 오타로 인한 미스매치를 컴파일 타임에 차단한다.

CLAUDE.md 에 명시된 핵심 규칙 그대로다 — _"FE/BE 모두 사용하는 타입/검증 로직은 반드시
`packages/api-contract/src/schemas/` 에 zod 스키마로 정의한다"_ ([CLAUDE.md](../../CLAUDE.md)).

## Architecture [coverage: high — 5 sources]

### 디렉터리 구조

```
packages/api-contract/
├── package.json          # exports: src/*.ts 직접 노출 (no build)
├── tsconfig.json         # @repo/config/tsconfig/base.json 상속
└── src/
    ├── index.ts          # 모든 스키마 + Routes namespace 재내보내기
    ├── routes.ts         # API_PREFIX + 도메인별 경로 상수
    └── schemas/
        ├── common.ts     # Id, Timestamp, ErrorResponse, Pagination
        ├── auth.ts       # Register/Login/AuthResponse
        ├── user.ts       # Role, User, PublicUser
        ├── picks.ts      # Pick, PickCategory, Create/Update/Result
        ├── admin.ts      # AdminUsersResponse, SetRole
        ├── crawl.ts      # NaverPlace 크롤러 + Job/SSE Event 모델
        ├── restaurant.ts # 맛집 상세/목록 + 리뷰 요약 + summary SSE
        └── ai.ts         # AI 호출 + 배치 + LLM Provider 관리
```

### 빌드 없는 src 직접 노출

[packages/api-contract/package.json](../../packages/api-contract/package.json) 는 `dist/`
가 아니라 `src/` 를 그대로 `exports` 한다.

```json
"main": "./src/index.ts",
"types": "./src/index.ts",
"exports": {
  ".": "./src/index.ts",
  "./schemas/*": "./src/schemas/*.ts",
  "./routes": "./src/routes.ts"
}
```

이 구조 덕분에 tsx (friendly), Vite (web), Metro (mobile) 가 모두 워크스페이스 소스를
바로 트랜스파일한다. Turborepo 의 변경 감지도 빌드 산출물을 거치지 않기 때문에
`pnpm typecheck` 한 번이면 모든 소비자가 즉시 영향을 본다.

### 도메인 분할

[src/index.ts](../../packages/api-contract/src/index.ts) 는 단순한 배럴 — 도메인별
파일을 그대로 `export *` 하고, `routes.ts` 는 `Routes` 네임스페이스로 재노출한다.

```ts
export * from './schemas/common.js';
export * from './schemas/auth.js';
export * from './schemas/user.js';
export * from './schemas/picks.js';
export * from './schemas/admin.js';
export * from './schemas/crawl.js';
export * from './schemas/restaurant.js';
export * from './schemas/ai.js';
export * as Routes from './routes.js';
```

ESM `.js` 확장자는 TypeScript NodeNext 해석을 위한 의도적 표기 (실파일은 `.ts`).

### 도메인 간 의존 방향 (one-way)

`restaurant.ts` 가 `crawl.ts` 의 `NaverPlaceData` / `VisitorReview` 를 import 하고,
역방향은 절대 없다. `visitor_batch` SSE 가 페이로드로 실어 보내는 `PersistedVisitorReview`
도 — 의미상 "맛집 상세에 머지될 행" 이지만 — 의도적으로 `crawl.ts` 에 정의했다.
restaurant → crawl 순환이 발생하지 않도록 한 방향만 허용한다.

## Talks To [coverage: medium — 3 sources]

- **friendly (apps/friendly)** — 각 `*.route.ts` 가 `RegisterInput`, `CrawlEvent`,
  `RestaurantListResult`, `RestaurantSummaryReviewEvent`, `AdminUsersResponse`,
  `AiCompleteInput`, `UpdateLlmProviderInput` 등을 `schema: { body, response }` 로
  등록하면 fastify-type-provider-zod 가 검증 + 핸들러 타입 추론 + OpenAPI 스펙 생성을
  한 번에 처리한다.
- **@repo/shared** — `Routes.Auth.login`, `Routes.Crawl.jobEvents(id)`,
  `Routes.Restaurant.summaryEvents` (constant), `Routes.Ai.complete` 같은 경로 헬퍼/
  상수와 `z.infer<typeof AuthResponse>` 같은 추론 타입을 import 해서 fetch 래퍼와
  React Query 훅을 구성한다.
- **web / mobile** — `@repo/shared` 를 통해 간접 의존. 직접 import 도 가능하지만
  관례상 fetch 헬퍼 경유.

순환 의존 규칙: shared → api-contract 만 허용, 반대 방향은 금지 ([CLAUDE.md](../../CLAUDE.md)).

## API Surface [coverage: high — 10 sources]

### `schemas/common.ts` — [common.ts](../../packages/api-contract/src/schemas/common.ts)

| Export | 용도 |
| --- | --- |
| `IdSchema` / `Id` | 비어있지 않은 문자열 ID |
| `TimestampSchema` | ISO 8601 datetime 문자열 |
| `ErrorResponseSchema` / `ErrorResponse` | Fastify 에러 형식 (`statusCode`, `error`, `message`) |
| `PaginationQuerySchema` / `PaginationQuery` | `page`, `limit` (coerce, 기본 1/20, 최대 100) |
| `PaginatedSchema(item)` | 제네릭 페이지 응답 빌더 (`items`, `total`, `page`, `limit`) |

### `schemas/auth.ts` — [auth.ts](../../packages/api-contract/src/schemas/auth.ts)

| Export | 용도 |
| --- | --- |
| `RegisterInput` | email + 8~100자 password |
| `LoginInput` | email + 비어있지 않은 password |
| `AuthResponse` | `{ token, user }` JWT 응답 |

### `schemas/user.ts` — [user.ts](../../packages/api-contract/src/schemas/user.ts)

| Export | 용도 |
| --- | --- |
| `RoleSchema` / `Role` | `'USER' \| 'ADMIN'` |
| `UserSchema` / `User` | id, email, role, timestamps |
| `PublicUserSchema` / `PublicUser` | id + createdAt 만 노출 |

### `schemas/picks.ts` — [picks.ts](../../packages/api-contract/src/schemas/picks.ts)

| Export | 용도 |
| --- | --- |
| `PickCategorySchema` | `food / activity / movie / travel / other` |
| `PickSchema` / `Pick` | 하나의 선택지 묶음 (title 1~100자, options 2~20개) |
| `CreatePickInput` | `title + options + category` (zod `.pick()`) |
| `UpdatePickInput` | `CreatePickInput.partial()` |
| `PickResultSchema` / `PickResult` | `{ pickId, chosen, pickedAt }` |

### `schemas/admin.ts` — [admin.ts](../../packages/api-contract/src/schemas/admin.ts)

| Export | 용도 |
| --- | --- |
| `AdminUsersResponse` | `{ users: User[] }` |
| `SetRoleParams` | URL param 검증 (`id`) |
| `SetRoleBody` | `{ role: 'USER' \| 'ADMIN' }` |

### `schemas/crawl.ts` — [crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)

| Export | 용도 |
| --- | --- |
| `CrawlMode` | `'create' \| 'recrawl' \| 'update'` |
| `CrawlNaverPlaceInput` | `{ url, mode }` URL 입력 |
| `MenuItem` | 메뉴 한 건 (name, price, recommend, imageUrls) |
| `ReviewThemeKeyword` / `RatingDistributionBucket` / `ReviewStats` | 리뷰 통계 |
| `BlogReview` / `VisitorReview` | 블로그·방문자 리뷰 항목 (`VisitorReview.externalId` 는 `string \| null \| undefined` — 영속화용) |
| `PersistedVisitorReview` | DB 영속화 후의 행 모양 (`VisitorReview.extend({ id, externalId: nullable, fetchedAt })`). `visitor_batch` SSE 페이로드 |
| `NaverPlaceData` | 크롤 결과 본체 (장소 메타 + 메뉴 + 리뷰 통계 + 리뷰 목록) |
| `CrawlErrorCode` | 에러 코드 enum (11종) |
| `CrawlNaverPlaceResult` | `discriminatedUnion('ok')` — 동기 결과 |
| `CrawlStage` | SSE 진행 단계 enum (queued → done) |
| `CrawlEvent` | SSE 이벤트 (`progress / partial / visitor_progress / visitor_batch / done / error`). `visitor_batch` 는 `addedCount` + `persistedReviews` 를 추가로 실어 클라이언트가 detail GET 없이 캐시에 머지 가능 |
| `CrawlJobStatus` / `CrawlJob` | 잡 상태 + 잡 본체 |
| `StartCrawlInput` / `StartCrawlResult` | 잡 시작 입력/결과. 성공 분기에 `deduped: boolean`, optional `queued: boolean` (true = 동시성 캡 도달, FIFO 큐 대기 중. 자리가 나면 자동 시작, 그 동안 SSE 는 `stage='queued'`) |
| `CrawlJobListResult` | `{ jobs: CrawlJob[] }` |

### `schemas/restaurant.ts` — [restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)

| Export | 용도 |
| --- | --- |
| `ReviewSummaryStatus` | `'pending' \| 'running' \| 'done' \| 'failed'` enum — 리뷰 단위 AI 요약 상태 |
| `ReviewSummary` | `{ status, text?, model?, errorCode?, errorMessage?, startedAt?, finishedAt? }` (모두 nullable) |
| `VisitorReviewWithSummary` | `VisitorReview.extend({ id, externalId: nullable, fetchedAt, summary: ReviewSummary.nullable() })` — 상세 페이지가 받는 리뷰 행 |
| `RestaurantDetail` | `GET /admin/restaurants/place/:placeId` 응답. 메타 필드 + `snapshot: NaverPlaceData` (visitorReviews 는 비어 있음 — `reviews` 가 라이브) + `reviews: VisitorReviewWithSummary[]` |
| `RestaurantListItem` | 목록용 압축 행. 메타 + `totalReviews` + `summaryPending/Running/Done/Failed` 카운트 인라인 (페이지 렌더링 시 행당 추가 요청 없이 진행률 배지 표시) |
| `RestaurantListResult` | `{ items: RestaurantListItem[] }` |
| `RestaurantDeleteResult` | `{ ok: true, deletedReviewCount }` |
| `RestaurantSummaryProgress` | `{ totalReviews, pending, running, done, failed, recentDone: [{ reviewId, text, finishedAt? }] }`. `GET /summary-status` 응답이자 SSE snapshot 페이로드의 베이스 |
| `RestaurantSummaryReviewEvent` | `type: 'review'` SSE 페이로드 — 리뷰 1건 요약 종료 (`done/failed`) 시 푸시. `placeId` 태그 포함 — 멀티플렉싱된 SSE 에서 클라이언트가 demux 하기 위함. `reviewId, status, text?, model?, errorCode?, errorMessage?, finishedAt` 운반. 클라이언트는 detail 캐시에 직접 머지 |
| `RestaurantSummarySnapshotEvent` | `RestaurantSummaryProgress.extend({ placeId })` — SSE 첫 연결 시 보내는 스냅샷 |

### `schemas/ai.ts` — [ai.ts](../../packages/api-contract/src/schemas/ai.ts)

| Export | 용도 |
| --- | --- |
| `AiCompleteInput` | `{ prompt(1~8000), model: string(1~100), systemPrompt?(≤2000), temperature?(0~2), maxTokens?(int ≤4096) }` — alias enum 없이 raw model id 직접 |
| `AiErrorCode` | enum: `rate_limited / upstream_failed / timeout / invalid_response / provider_unavailable / provider_disabled / no_api_key` |
| `AiTokenUsage` | `{ promptTokens, completionTokens }` 둘 다 nullable int |
| `AiCompleteResult` | `discriminatedUnion('ok')` — 성공: `{ text, model, durationMs, tokens }`, 실패: `{ error, message }` |
| `AiCompleteBatchItem` | `AiCompleteInput.extend({ clientId?(1~64) })` — 응답 매칭 키 |
| `AiCompleteBatchInput` | `{ items: array(min 1, max 10) }` — 배치당 최대 10건 |
| `AiCompleteBatchResultItem` | item 별 성공/실패 union, `clientId` 보존 |
| `AiCompleteBatchResult` | `{ results: AiCompleteBatchResultItem[] }` |
| `LlmProviderId` | enum (현재 `'ollama-cloud'` 단일) |
| `LlmProviderConfig` | read-only view: `{ provider, hasApiKey, apiKeyMasked, baseUrl, defaultModel, enabled, maxConcurrent, updatedAt }` — apiKey 평문은 노출하지 않음 |
| `LlmProviderListResult` | `{ providers: LlmProviderConfig[] }` |
| `UpdateLlmProviderInput` | write-only PUT body. `apiKey?(min1)` 빈/undefined → 보존, `baseUrl/defaultModel` `nullable.optional` (null = 비우기, undefined = 변경 없음), `enabled?`, `maxConcurrent?(1~100)` |
| `TestLlmProviderInput` | `{ model? }` — 기본 alias 대신 특정 모델 id 검증용 override |
| `TestLlmProviderResult` | `discriminatedUnion('ok')` — 성공: `{ model, durationMs, sample }`, 실패: `{ error, message }` |
| `LlmModelListResult` | `{ models: string[] }` — 빈 배열은 "지원 안 함/실패" 의 정상 응답 (FE 는 free text 입력으로 fallback) |

### `routes.ts` — [routes.ts](../../packages/api-contract/src/routes.ts)

`API_PREFIX = '/api/v1'` 고정. 도메인별 객체:

| Namespace | 키 | 경로 |
| --- | --- | --- |
| `Auth` | register, login, me, logout | `/auth/...` |
| `Users` | list, byId(id) | `/users[/:id]` |
| `Picks` | list, create, byId(id) | `/picks[/:id]` |
| `Admin` | listUsers, setUserRole(id) | `/admin/users[/:id/role]` |
| `Crawl` | naverPlace, jobs, job(id), jobEvents(id) | `/admin/crawl/...` |
| `Restaurant` | list, byPlaceId(placeId), delete(placeId), summaryStatus(placeId), **summaryEvents (constant)** | `/admin/restaurants/...` |
| `Ai` | complete, completeBatch, providers, provider(id), testProvider(id), providerModels(id) | `/admin/ai/...` |
| `Health` | (단일 상수) | `/health` |

`Routes.Restaurant.summaryEvents` 는 함수가 아니라 단일 상수
`/api/v1/admin/restaurants/summary-events` 다. 다중 placeId 는 query string 으로
`?placeId=A&placeId=B&…&token=<jwt>` 형태로 전달 — 한 브라우저 탭에서 여러 맛집의
요약 진행률을 단일 SSE 연결로 멀티플렉싱한다.

## Data [coverage: medium — 7 sources]

스키마 간 의존 관계 (compose 방향):

- **`UserSchema`** ← `auth.AuthResponse.user`, `admin.AdminUsersResponse.users[]`
- **`RoleSchema`** ← `user.UserSchema.role`, `admin.SetRoleBody.role`
- **`PickSchema`** → `CreatePickInput` (`.pick`) → `UpdatePickInput` (`.partial`);
  `PickResultSchema.pickId` 가 `Pick.id` 를 참조 (스키마 자체 FK는 없고 의미상 연결)
- **`NaverPlaceData`** = `MenuItem[]` + `ReviewStats?` + `BlogReview[]` + `VisitorReview[]`
- **`CrawlJob`** = 메타(id, url, placeId, status, stage, timestamps, visitorCount)
  + `result: CrawlNaverPlaceResult | null`
- **`CrawlNaverPlaceResult`** / **`StartCrawlResult`** — 둘 다 `discriminatedUnion('ok')` 로
  성공/실패 분기 (성공 시 데이터, 실패 시 `CrawlErrorCode` + message). `StartCrawlResult` 는
  성공 분기에 `deduped` 필수 + `queued?` optional
- **`CrawlEvent`** — `discriminatedUnion('type')` 로 `progress / partial / visitor_progress
  / visitor_batch / done / error` 6종 SSE 이벤트, 모두 `seq: number` 로 재연결 시 dedupe.
  `visitor_batch.persistedReviews: PersistedVisitorReview[]` 가 detail 캐시 머지의 입력
- **`PersistedVisitorReview`** = `VisitorReview.extend({ id, externalId: nullable, fetchedAt })`
- **`VisitorReviewWithSummary`** = `VisitorReview.extend({ id, externalId: nullable,
  fetchedAt, summary: ReviewSummary.nullable() })` — 상세 응답의 라이브 행
- **`RestaurantDetail`** = 메타 + `snapshot: NaverPlaceData` (visitorReviews 비움) +
  `reviews: VisitorReviewWithSummary[]`
- **`RestaurantSummarySnapshotEvent`** = `RestaurantSummaryProgress.extend({ placeId })` —
  GET `/summary-status` 와 SSE snapshot 이 같은 본체를 공유
- **`AiCompleteBatchItem`** = `AiCompleteInput.extend({ clientId? })` — 입력은 단건 input
  을 그대로 확장하는 형태로 코드 중복 제거
- **`AiCompleteResult`** / **`TestLlmProviderResult`** / **`AiCompleteBatchResultItem`**
  — 모두 `discriminatedUnion('ok')` 패턴, 실패 케이스에서 `AiErrorCode` enum 공유
- **`LlmProviderConfig`** (read view) ↔ **`UpdateLlmProviderInput`** (write body) — 같은
  엔터티의 read/write 분리. read 는 `apiKeyMasked` (안전), write 는 `apiKey` (평문). null
  vs undefined 의미가 다름 — null = 명시적 clear, undefined = 무변경.

Prisma 모델 (`reviews`, `restaurants`, `review_summaries` 등) 매핑은 friendly 토픽
참조 — DB 스키마의 SSOT 는 `apps/friendly/prisma/schema.prisma`.

## Key Decisions [coverage: high — 6 sources]

- **Zod 채택 (vs JSON Schema 직접 작성, vs io-ts)** — 런타임 검증 + 정적 타입 추론을 한
  스키마로 처리하고, fastify-type-provider-zod 와 한 번에 결합돼 OpenAPI 까지 자동 생성된다.
  `z.infer<typeof X>` 로 클라이언트 타입까지 무료.
- **빌드 없는 src 직접 export** — `package.json` `exports` 가 `./src/*.ts` 를 가리킨다.
  tsup/rollup 빌드 단계가 없어 변경 즉시 모든 워크스페이스에 반영되고, Turborepo 캐시 무효화도
  단순해진다. 단점은 ESM `.js` 확장자 표기 강제 (NodeNext 해석 때문) — `index.ts` 의
  `export * from './schemas/common.js'` 가 그 흔적이다.
- **도메인별 파일 분할 + 한 방향 import** — `auth/user/picks/admin/crawl/restaurant/ai/
  common` 으로 쪼갠다. `restaurant.ts` 가 `crawl.ts` 의 `NaverPlaceData`/`VisitorReview`
  를 참조하지만 역방향은 금지. `PersistedVisitorReview` 가 의미상 "맛집 도메인" 이지만
  순환을 피하기 위해 `crawl.ts` 에 정의된 점이 그 산물.
- **`z.discriminatedUnion('type')` for `CrawlEvent`** — 6종 이벤트를 단일 union 으로
  묶고, `type` literal 로 분기. zod 가 분기 자동 추론 → 클라이언트의 switch 문이
  완전히 좁혀진 타입을 본다. SSE 의 `event:` 필드 대신 페이로드 안의 플래그를 쓰는
  이유 — JSON 한 덩어리만 파싱하면 되고 dedup `seq` 도 함께 옮길 수 있어서.
- **`z.literal('review' | 'progress')` for summary SSE** — 멀티플렉싱된
  `summary-events` 는 review-done 푸시와 progress snapshot 두 종류를 한 채널로 흘린다.
  클라이언트 demux 가 명시적으로 `type` 을 보고 분기하도록 literal 로 못박아 두었다.
- **`placeId` 태그 인 SSE 페이로드** — 한 SSE 연결이 여러 placeId 를 multiplex 하는
  설계라, 각 이벤트가 자기 속한 맛집을 스스로 식별해야 한다.
  `RestaurantSummaryReviewEvent.placeId` 와 `RestaurantSummarySnapshotEvent.placeId` 가
  그 키 — HTTP/1.1 의 origin 당 6 SSE 캡을 회피하면서도 클라이언트는 placeId 별로
  캐시 invalidation 을 정확히 트리거한다.
- **`visitor_batch.persistedReviews` 로 detail GET 생략** — 페이지네이션이 한 번 끝날
  때마다 서버는 INSERT 직후의 행(서버 부여 id, fetchedAt 포함) 을 그대로 SSE 로
  내려준다. 클라이언트가 별도 GET 으로 detail 을 다시 받지 않고 React Query 캐시에
  바로 머지. 네트워크 왕복 + 서버 부하 동시 감소.
- **라우트 경로 상수화** — 문자열 리터럴을 코드 곳곳에 흩뿌리는 대신 `Routes.Crawl.job(id)`,
  `Routes.Restaurant.byPlaceId(placeId)`, `Routes.Ai.provider(id)` 형태의 함수/상수를
  강제한다. 경로 변경 시 검색-치환이 아니라 한 파일 수정으로 끝나고, 서버·클라이언트
  미스매치가 컴파일 단계에서 잡힌다.
- **AI 영역 read/write 스키마 분리** — `LlmProviderConfig` (read) 는 `apiKeyMasked` 만,
  `UpdateLlmProviderInput` (write) 는 `apiKey` 평문을 받는다. 평문 키가 응답 schema 에
  존재할 가능성을 타입으로 차단. PUT 본문에서도 `apiKey?` (빈/undefined → 보존),
  `baseUrl/defaultModel` `nullable.optional` (null=clear, undefined=무변경) 으로 의도를
  세 가지 상태로 명확화.
- **CLAUDE.md 규칙** — _"공유 스키마는 `@repo/api-contract` 에 추가"_ 가 명시된 핵심 규칙
  ([CLAUDE.md](../../CLAUDE.md)).

## Gotchas [coverage: medium — 5 sources]

- **변경의 파급력** — 스키마 한 줄 수정이 friendly + web + mobile 모두에 컴파일 타임 영향을
  준다. 장점인 동시에 함정 — 필드 제거나 타입 좁히기는 모든 소비자 코드를 깨뜨린다.
  optional 추가는 안전, required 추가/제거는 위험.
- **`Routes.Restaurant.summaryEvents` 가 함수 → 상수로 바뀐 breaking change** — 이전엔
  `summaryEvents(placeId)` 로 placeId 가 path 의 일부였다. 현재는
  `/api/v1/admin/restaurants/summary-events` 단일 상수이고 placeId 는 query 로
  전달 (`?placeId=A&placeId=B&…&token=<jwt>`). 호출부에서 함수 호출 형태로 그대로
  남아 있으면 타입 에러가 아니라 string 호출 시도로 깨진다 — 업그레이드 시 모든
  소비자 검색 필요.
- **`VisitorReview.externalId` 의 트리플 상태 (`string | null | undefined`)** —
  `nullable().optional()` 로 정의됐다. 영속화 계층의 dedup 키이자 — `PersistedVisitorReview`
  / `VisitorReviewWithSummary` 에서는 `nullable()` (즉 `string | null`) 로 좁혀 항상
  존재함을 강제한다. SSE `visitor_batch.reviews` (raw `VisitorReview[]`) 에는 그대로
  흘러나오지만, FE 는 보통 무시 (UI 가 사용하지 않음).
- **빌드 단계 추가 금지** — `package.json` `exports` 가 `src/` 를 직접 가리키므로 tsup/rollup
  같은 번들러를 끼우면 워크스페이스 전체 import 경로가 깨진다. 만약 외부에 npm publish 가
  필요해지면 `exports` 분기와 함께 빌드 산출물을 따로 마련해야 한다.
- **순환 의존 금지** — `@repo/shared → @repo/api-contract` 는 OK, 반대 방향은 금지
  ([CLAUDE.md](../../CLAUDE.md)). api-contract 는 React/fetch/Fastify 어떤 것도 import 하면
  안 되고 오직 Zod 만 의존한다 ([package.json](../../packages/api-contract/package.json)).
  도메인 파일 사이에서도 `restaurant → crawl` 한 방향만 — `PersistedVisitorReview` 가
  `crawl.ts` 에 위치하는 이유.
- **`.js` 확장자 표기** — 실 파일은 `.ts` 지만 import 는 `.js` 로 써야 한다 (NodeNext
  해석). [src/index.ts](../../packages/api-contract/src/index.ts) 패턴을 따를 것.
- **`z.coerce` 의 함정** — `PaginationQuerySchema` 의 `page/limit` 은 `z.coerce.number()` —
  쿼리스트링이 문자열로 오므로 의도된 변환이지만, 다른 곳에서 정수만 받으려는 경우 `coerce`
  생략 여부를 의식해야 한다.
- **`Routes.Ai.X` namespace re-export 가 vite esbuild prebundle 에서 깨질 수 있음** —
  `index.ts` 가 `export * as Routes from './routes.js'` 형태로 namespace 를 묶어 내보낸다.
  소비자가 `Routes.Ai.complete` 처럼 namespace 로 접근하면 일부 번들러 (특히 Vite
  esbuild prebundle 단계) 에서 트리쉐이킹/네임스페이스 인식이 깨져 `undefined` 가 되는
  케이스가 있다. 회피책으로 friendly 측은 `const AiRoutes = Routes.Ai` 로 한 단계
  우회하고, web 측은 일부 경로를 path 로 하드코드한다 — namespace 접근만 고집하지 말 것.
- **`AiCompleteInput.model` 은 enum 이 아니라 `z.string()`** — 초기 설계는 alias enum
  (`'fast' | 'smart'`) 로 추상화하려 했으나, 프로바이더마다 모델 라인업이 너무 빠르게
  바뀌고 admin 이 직접 모델 id 를 지정하는 케이스 (예: `gpt-oss:20b`) 가 빈번해서 raw
  string 으로 확장됐다. 검증은 `min(1).max(100)` 만 — 알려지지 않은 모델 id 도 그대로
  upstream 에 forward 되며, 프로바이더 단계에서 거부되면 `AiErrorCode.upstream_failed`
  로 매핑된다. 즉 입력 단계의 zod 가 모델 존재 여부까지 보장하지 않는다.
- **`LlmModelListResult.models` 가 빈 배열** — 프로바이더가 모델 목록 API 를 지원하지
  않거나 호출에 실패한 경우의 정상 응답이다. FE 는 이 경우 에러로 surface 하지 말고
  free text 입력으로 fallback 해야 한다 (스키마 주석에 명시됨).

## Sources [coverage: high — 12 sources]

- [packages/api-contract/package.json](../../packages/api-contract/package.json)
- [packages/api-contract/tsconfig.json](../../packages/api-contract/tsconfig.json)
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
- [packages/api-contract/src/schemas/common.ts](../../packages/api-contract/src/schemas/common.ts)
- [packages/api-contract/src/schemas/auth.ts](../../packages/api-contract/src/schemas/auth.ts)
- [packages/api-contract/src/schemas/user.ts](../../packages/api-contract/src/schemas/user.ts)
- [packages/api-contract/src/schemas/picks.ts](../../packages/api-contract/src/schemas/picks.ts)
- [packages/api-contract/src/schemas/admin.ts](../../packages/api-contract/src/schemas/admin.ts)
- [packages/api-contract/src/schemas/crawl.ts](../../packages/api-contract/src/schemas/crawl.ts)
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts)
- [packages/api-contract/src/schemas/ai.ts](../../packages/api-contract/src/schemas/ai.ts)
- [CLAUDE.md](../../CLAUDE.md) — "공유 스키마는 `@repo/api-contract` 에 추가" 규칙
