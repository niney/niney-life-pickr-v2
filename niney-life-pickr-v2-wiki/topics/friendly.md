---
topic: friendly
last_compiled: 2026-05-07
sources_count: 36
status: active
---

# friendly — Fastify 백엔드

## Purpose [coverage: high — 5 sources]

`apps/friendly`는 niney-life-pickr-v2 모노레포의 유일한 백엔드 서비스다. Fastify 5 위에 zod 기반 스키마 검증, JWT 인증, Prisma+SQLite 영속화, OpenAPI/Swagger 문서, Playwright 크롤링 런타임을 얹어 web(`apps/web`)과 mobile(`apps/mobile`)이 동시에 호출하는 단일 API를 제공한다.

도메인 표면은 크게 다음 영역이다.
- **auth** — 회원가입/로그인/내 정보/로그아웃 (`Routes.Auth.*`)
- **picks** — 사용자별 "선택지" CRUD + 랜덤 추첨 (`Routes.Picks.*`)
- **admin** — 사용자 목록·역할 변경 (`Routes.Admin.*`, `requireAdmin`)
- **restaurant** — 크롤링한 맛집 + 방문자 리뷰 영속화 + 요약 진행률 SSE (`Routes.Restaurant.*`)
- **summary** — 리뷰 단위 AI 요약 라이프사이클 (라우트 없음, 내부 모듈)
- **health** — 라이브니스 체크 (`Routes.Health`, `/health`)
- **crawl** — 별도 위키 토픽으로 다룬다 ([crawl 토픽 참조](./crawl.md))
- **ai** — 별도 위키 토픽으로 다룬다 ([ai 토픽 참조](./ai.md))

[apps/friendly/package.json](../../apps/friendly/package.json)의 `name: "friendly"`가 워크스페이스 식별자이며, `pnpm dev:api`/`pnpm --filter friendly <cmd>`로 단독 실행한다.

## Architecture [coverage: high — 9 sources]

엔트리 흐름은 `server.ts → buildApp() → autoload(plugins) → autoload(modules/*.route.ts)`로 단방향이다.

- [src/server.ts](../../apps/friendly/src/server.ts) — `buildApp()`을 호출하고 `env.HOST:env.PORT`로 listen, SIGTERM/SIGINT에서 `app.close()` 후 종료한다. 부팅 실패 시 `process.exit(1)`.
- [src/app.ts](../../apps/friendly/src/app.ts) — Fastify 인스턴스를 만들고 `withTypeProvider<ZodTypeProvider>()`를 적용한 뒤 `validatorCompiler`/`serializerCompiler`를 등록한다. 그다음 `@fastify/autoload`로 두 단계 등록을 한다.
  1. `plugins/` 디렉터리 전체 자동 로드
  2. `modules/` 하위에서 `*.route.(ts|js)`만 골라 자동 로드 (`dirNameRoutePrefix: false` — URL prefix는 `Routes.*` 상수가 결정)
- [src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) — `FastifyInstance`에 `prisma`, `authenticate`, `requireAdmin` 데코레이터, `FastifyRequest.user`에 `{ userId, email, role }` 타입을 선언해 모듈 어디서나 타입세이프하게 사용 가능.

플러그인 레이어 (모두 `fastify-plugin`으로 감싸 데코레이터를 부모 스코프에 노출):
- [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — `env.CORS_ORIGIN`이 `*`이면 `true`, 아니면 콤마 분리. `credentials: true`.
- [plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts) — `contentSecurityPolicy: false` (Swagger UI 호환).
- [plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts) — `reply.unauthorized()`/`reply.forbidden()` 등 HTTP 헬퍼 제공.
- [plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `@fastify/jwt` 등록 + `authenticate`/`requireAdmin` 데코레이터.
- [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) — `PrismaClient` 인스턴스 생성·`$connect()` 후 `app.prisma`로 노출, `onClose`에 `$disconnect`. `name: 'prisma'` 의존 키 부여.
- [plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) — OpenAPI 메타 + `bearerAuth` 시큐리티 스킴, Zod→JSON Schema 변환은 `jsonSchemaTransform`. UI는 `/docs`.
- [plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — `ZodError`/Fastify validation/4xx/5xx를 표준 응답 페이로드로 정규화. dev 모드에서만 5xx 메시지 노출.
- [plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts) — `application/json`의 기본 파서를 교체하여 빈 본문을 `{}`로 해석한다. action 없는 POST(예: `/providers/:id/test`)에서 클라이언트가 placeholder JSON을 안 보내도 되도록 함.

모듈 레이어 — 각 도메인은 `*.route.ts`(HTTP) + `*.service.ts`(비즈니스) + `*.test.ts`(Vitest) 트리오로 구성한다. autoload는 route 파일만 픽업한다. 현재 모듈 디렉터리:
- `auth/`, `picks/`, `admin/`, `health/` — 기존 4종.
- `restaurant/` — 크롤링 결과/리뷰 영속화. 라우트는 admin 권한.
- `summary/` — 리뷰 요약 백그라운드 파이프라인. **route 파일이 없는 모듈**(autoload가 픽업하지 않는다); 외부 진입점은 [summary-events-bus.ts](../../apps/friendly/src/modules/summary/summary-events-bus.ts)의 모듈 싱글턴 `summaryEventsBus`와 `SummaryService` 인스턴스 자체뿐이다. crawl 모듈이 새 리뷰를 persist한 직후 `queueSummariesForReviews()`를 fire-and-forget으로 호출한다.
- `crawl/`, `ai/` — 별도 토픽([crawl](./crawl.md), [ai](./ai.md)).

## Talks To [coverage: high — 9 sources]

- **`@repo/api-contract`** — `Routes.*` URL 상수와 zod 스키마(`RegisterInput`, `LoginInput`, `AuthResponse`, `UserSchema`, `PickSchema`, `PickResultSchema`, `CreatePickInput`, `UpdatePickInput`, `AdminUsersResponse`, `SetRoleParams`, `SetRoleBody`, `Role`, `RestaurantListResult`, `RestaurantDetail`, `RestaurantDeleteResult`, `RestaurantSummaryProgress`, `VisitorReviewType`, `NaverPlaceDataType`)의 단일 출처. `auth.route.ts`, `picks.route.ts`, `admin.route.ts`, `health.route.ts`, `restaurant.route.ts`가 모두 import.
- **`@repo/utils`** — `picks.service.ts`의 랜덤 추첨에서 `pickRandom(options)` 사용.
- **Prisma + SQLite** — [prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)는 `provider = "sqlite"`, `DATABASE_URL`은 기본 `file:./data/dev.db`. CLAUDE.md의 "Docker 추가하지 말 것" 규칙과 짝.
- **bcryptjs** — [src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)의 `hashPassword`/`verifyPassword`가 10 라운드 솔트.
- **Playwright** — `package.json` dependency에 `playwright ^1.59.1`. 본문에서 다루지 않는 crawl 모듈이 사용한다.
- **모듈 간 토폴로지**:
  - `crawl → restaurant` — 크롤이 끝낼 때마다 `RestaurantService.upsertRestaurantFromCrawl(...)`로 마스터 행 upsert, 그리고 `persistReviewBatch(restaurantId, reviews)`로 페이지 단위 idempotent insert. 갱신 모드에서는 `getExistingReviewKeys()`/`clearReviewsAndSummaries()` 사용. 자세한 호출 시점은 [crawl 토픽](./crawl.md)에 있다.
  - `crawl → summary` — `persistReviewBatch`가 돌려준 새 리뷰 id 배열을 `SummaryService.queueSummariesForReviews(placeId, ids)`로 넘긴다. await하지 않는다 — 다음 페이지 크롤과 LLM 호출이 겹쳐서 진행되도록.
  - `summary → ai` — `summary.service.ts`가 [ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)의 공유 FIFO 게이트로 LLM 어댑터를 받아 호출한다(상세는 [ai 토픽 참조](./ai.md)). `AiConfigService.getResolved('ollama-cloud')`로 키/모델/concurrency를 해소.
  - `summary → restaurant.route` — `summaryEventsBus`(모듈 싱글턴)가 두 모듈의 결합점. `SummaryService`가 publish, `restaurant.route`의 SSE 핸들러가 subscribe.
- **Ollama Cloud** — ai 모듈이 `OLLAMA_CLOUD_*` env와 `LlmProviderConfig` DB row를 통해 호출. 자세한 건 [ai 토픽 참조](./ai.md).
- **소비자** — `apps/web`, `apps/mobile`이 `@repo/shared`의 API 클라이언트를 통해 본 서비스의 라우트를 호출한다(CLAUDE.md 핵심 규칙 #2).

## API Surface [coverage: high — 6 sources]

라우트 경로는 모두 `@repo/api-contract`의 `Routes.*` 상수에서 가져오므로 이 파일 하나가 클라이언트와 동기화된다. `dirNameRoutePrefix: false`이기 때문에 디렉터리 이름은 URL에 영향 없음.

### auth — [modules/auth/auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)

| Method | Path (`Routes.*`)         | Auth         | 설명                                        |
| ------ | ------------------------- | ------------ | ------------------------------------------- |
| POST   | `Routes.Auth.register`    | public       | 가입 → `{ token, user }` (201). 항상 USER. |
| POST   | `Routes.Auth.login`       | public       | 로그인 → `{ token, user }`.                 |
| GET    | `Routes.Auth.me`          | bearer       | 현재 사용자 정보 (`UserSchema`).            |
| POST   | `Routes.Auth.logout`      | bearer       | 204. 토큰 무효화는 stateless라 NOP.         |

JWT 발급은 라우트 핸들러 안에서 `app.jwt.sign({ userId, email, role })`로 직접 한다 (서비스 레이어 밖).

### picks — [modules/picks/picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)

`addHook('onRequest', app.authenticate)`로 모듈 전체에 인증을 강제한다.

| Method | Path                          | Auth   | 설명                                  |
| ------ | ----------------------------- | ------ | ------------------------------------- |
| GET    | `Routes.Picks.list`           | bearer | 내 pick 목록 (createdAt desc)         |
| POST   | `Routes.Picks.create`         | bearer | 생성 (201, `CreatePickInput`)         |
| GET    | `/api/v1/picks/:id`           | bearer | 단건 조회                             |
| PATCH  | `/api/v1/picks/:id`           | bearer | 수정 (`UpdatePickInput`)              |
| DELETE | `/api/v1/picks/:id`           | bearer | 삭제 (204)                            |
| POST   | `/api/v1/picks/:id/random`    | bearer | 랜덤 추첨 → `PickResultSchema`        |

`:id` 파라미터는 라우트 안에 인라인 정의된 `IdParams = z.object({ id: z.string() })`로 검증.

### admin — [modules/admin/admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)

각 라우트마다 `onRequest: [app.authenticate, app.requireAdmin]`로 ADMIN 강제.

| Method | Path                                  | Auth          | 설명                              |
| ------ | ------------------------------------- | ------------- | --------------------------------- |
| GET    | `Routes.Admin.listUsers`              | bearer+admin  | `{ users: User[] }`               |
| PATCH  | `Routes.Admin.setUserRole(':id')`     | bearer+admin  | 역할 변경(`SetRoleBody`)          |

### restaurant — [modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)

리스트/디테일/삭제는 라우트별 `onRequest: [authenticate, requireAdmin]`. SSE 라우트만 쿼리스트링 토큰을 직접 검증한다(아래 Key Decisions 참조).

| Method | Path (`Routes.Restaurant.*`)                          | Auth          | 설명                                                                                                                                                                                  |
| ------ | ----------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `Routes.Restaurant.list`                              | bearer+admin  | 크롤된 맛집 목록 + 행마다 요약 카운트(`summaryPending/Running/Done/Failed`, `totalReviews`).                                                                                          |
| GET    | `Routes.Restaurant.byPlaceId(':placeId')`             | bearer+admin  | 디테일. `reviews[]` (요약 포함) + `snapshot` (visitorReviews 외 메뉴/블로그/영업시간/이미지/좌표 등 비관계 필드).                                                                     |
| DELETE | `Routes.Restaurant.delete(':placeId')`                | bearer+admin  | 캐스케이드 삭제 → `{ ok, deletedReviewCount }`. **in-flight 크롤이 같은 placeId를 잡고 있으면 409**(`jobRegistry.findInFlightByPlace`로 검사).                                       |
| GET    | `Routes.Restaurant.summaryStatus(':placeId')`         | bearer+admin  | 요약 진행률 스냅샷(상태별 카운트 + 최근 done 5건).                                                                                                                                    |
| GET    | `Routes.Restaurant.summaryEvents`                     | query token   | **Multiplexed SSE**. `?placeId=A&placeId=B&…&token=<jwt>`. 한 연결로 여러 placeId의 `snapshot` / `review` 이벤트를 받아 클라이언트가 demux. 이벤트 페이로드는 항상 `placeId`를 포함. |

SSE 디테일:
- 연결 직후 모든 `placeId`에 대해 `snapshot` 이벤트를 한 번씩 푸시(없는 placeId는 silently drop, 404 아님).
- placeId별 `pendingProgressPush` 슬롯으로 progress 신호를 coalescing(`setImmediate`로 한 틱에 한 번 DB 조회 + 푸시). `review` 신호는 페이로드가 이미 완전하므로 coalesce 없이 즉시 푸시.
- 15초 keep-alive 코멘트(`hb`), `req.raw.on('close')`에서 `clearInterval` + 모든 `unsubscribers` 호출.

### health — [modules/health/health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

| Method | Path             | 설명                                                                  |
| ------ | ---------------- | --------------------------------------------------------------------- |
| GET    | `Routes.Health`  | `{ status, uptime, timestamp }`                                       |
| GET    | `/health`        | `{ status: 'ok' }` — Swagger에서 `hide: true`. test/probe용.          |

## Data [coverage: high — 8 sources]

[prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma):

- **`User`** (`users`) — `id cuid`, `email @unique`, `passwordHash`, `role Role @default(USER)`, `createdAt`, `updatedAt`. Cascade로 picks 소유.
- **`Pick`** (`picks`) — `id`, `userId @index`, `title`, `options String` (JSON 직렬화), `category String`, 타임스탬프. SQLite에 string array 저장 트릭은 `picks.service.ts`의 `JSON.stringify`/`JSON.parse`로 양방향 변환.
- **`PickResult`** (`pick_results`) — `id`, `pickId @index`, `chosen`, `pickedAt`. `Pick` Cascade.
- **`Role` enum** — `USER | ADMIN`.
- **`LlmProviderConfig`** (`llm_provider_configs`) — `provider @unique`, `apiKey`, `baseUrl?`, `defaultModel?`, `enabled`, `maxConcurrent`, `updatedAt`, `updatedById?`. ai 모듈이 환경변수 fallback보다 우선해서 사용 ([ai 토픽 참조](./ai.md)). 마이그레이션 [20260506191413_add_llm_provider_config](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql).
- **`Restaurant`** (`restaurants`) — `id cuid`, `placeId @unique`(네이버 플레이스 ID), `name`, `category?`, `address?`, `phone?`, `rating Float?`, `reviewCount Int?`, `rawSourceUrl`, `snapshotJson String`(메뉴/블로그/영업시간/이미지/좌표 등 비관계 필드 JSON 통째 보관), `firstCrawledAt @default(now())`, `lastCrawledAt @updatedAt`. `visitorReviews VisitorReview[]` 1:N.
- **`VisitorReview`** (`visitor_reviews`) — `id`, `restaurantId @index`, `externalId?`(네이버 리뷰 id, dedup용), `authorName?`, `rating Int?`, `body`, `visitedAt String?`, `imageUrlsJson String`(JSON 인코딩 string[]), `contentHash String`(`sha1(authorName + body)`, body는 어댑터에서 500자 truncate), `fetchedAt`. **두 unique 인덱스로 dedup**: `@@unique([restaurantId, externalId])` + `@@unique([restaurantId, contentHash])`. 동시 배치 race는 P2002로 잡혀 silent skip. `Restaurant` Cascade, `summary ReviewSummary?` 1:1.
- **`ReviewSummary`** (`review_summaries`) — `id`, `reviewId @unique`(1리뷰=1요약), `status String`(`pending|running|done|failed`), `text?`, `model?`, `errorCode?`, `errorMessage?`, `startedAt?`, `finishedAt?`, `createdAt`, `updatedAt`. `VisitorReview` Cascade.

캐스케이드 체인 — `Restaurant 삭제 → VisitorReview 삭제 → ReviewSummary 삭제`가 SQLite FK로 자동 처리. 그래서 `RestaurantService.clearReviewsAndSummaries(id)`도 `visitorReview.deleteMany`만 호출하면 요약까지 같이 사라진다.

JWT payload (`src/types/fastify.d.ts`의 `FastifyJWT.payload`): `{ userId: string; email: string; role: 'USER' | 'ADMIN' }`. `request.user`도 동일 형태.

환경 변수 — [src/config/env.ts](../../apps/friendly/src/config/env.ts)의 `EnvSchema` (zod):

| 키                            | 기본값                  | 제약                                                                 |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`           | `development` \| `production` \| `test`                              |
| `PORT`                        | `3000`                  | `coerce.number().int().positive()`                                   |
| `HOST`                        | `0.0.0.0`               |                                                                      |
| `DATABASE_URL`                | (필수)                  | non-empty string                                                     |
| `JWT_SECRET`                  | (필수)                  | **min 32 chars**                                                     |
| `JWT_EXPIRES_IN`              | `7d`                    |                                                                      |
| `CORS_ORIGIN`                 | `*`                     | `*` 이면 모두 허용, 아니면 콤마 분리 화이트리스트                    |
| `LOG_LEVEL`                   | `info`                  | pino level enum                                                      |
| `OLLAMA_CLOUD_API_KEY`        | `''`                    | DB의 `LlmProviderConfig.apiKey`가 비어있을 때 fallback ([ai](./ai.md)) |
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com`    | URL                                                                  |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`                 | `coerce.number().int().positive()`                                   |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                    | `coerce.number().int().positive()`                                   |
| `OLLAMA_DEFAULT_MODEL`        | `''`                    | 비어있으면 호출 시 model 명시 필요                                   |

검증 실패 시 `process.exit(1)`. 샘플 값은 [.env.example](../../apps/friendly/.env.example) 참고.

## Key Decisions [coverage: high — 12 sources]

- **Zod = 단일 진실 (SSOT)** — 라우트 스키마(`body`, `params`, `response`)는 모두 `@repo/api-contract`의 zod 스키마. `fastify-type-provider-zod`의 `validatorCompiler`/`serializerCompiler`가 런타임 검증 + TS 타입 추론 + OpenAPI 자동 생성을 한 번에 처리한다 (`app.ts`, `swagger.ts`, CLAUDE.md 규칙 #1).
- **autoload 두 단계** — `plugins/`는 무조건 전부, `modules/`는 `matchFilter: /\.route\.(ts|js)$/`로 route 파일만. service/test 파일은 자동 로드 대상이 아니다. 그래서 `summary` 모듈은 라우트 파일이 없어 autoload 영향권 밖이고, 외부에서는 모듈 싱글턴(`summaryEventsBus`) + 명시적 import로만 접근한다.
- **`fastify-plugin`으로 데코레이터 노출** — 모든 plugins/*.ts가 `fp(...)`로 래핑. 그래야 `app.prisma`/`app.authenticate`/`app.requireAdmin`/`app.jwt`가 모듈 라우트 스코프에서도 보인다.
- **빈 JSON 본문 허용 = `empty-body-parser` 플러그인** — Fastify 기본 JSON 파서는 빈 body를 400으로 거부한다. action 없는 POST(예: ai 모듈의 `/providers/:id/test`)를 placeholder payload 없이 호출하기 위해 [plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts)에서 파서를 교체한다.
- **JWT `?token=` 쿼리 + 로그 redaction** — `EventSource`(SSE 클라이언트)는 커스텀 헤더를 못 보내므로 토큰을 쿼리스트링에 싣는다. 그 토큰이 매 로그 라인에 박히지 않게 [src/app.ts](../../apps/friendly/src/app.ts)의 `serializers.req`가 `([?&]token=)[^&]+ → $1[REDACTED]`로 치환한다. `restaurant.route.ts`의 `summary-events` 핸들러는 먼저 `req.jwtVerify()`(헤더)를 시도하고 실패 시 `app.jwt.verify(rawQuery.token)`로 폴백하며, ADMIN role도 직접 강제한다(라우트 hook은 SSE 응답 형식에 안 맞아서 미사용).
- **인증 적용 패턴 세 가지** — picks는 모듈 전역 `addHook('onRequest', app.authenticate)`, admin/restaurant은 라우트별 `onRequest: [authenticate, requireAdmin]`, summary-events SSE는 핸들러 안에서 직접 토큰 검증. health/auth(register, login)는 미적용.
- **Multiplexed Summary SSE** — 한 admin이 여러 식당을 동시에 모니터링할 때 placeId마다 `EventSource`를 열면 브라우저의 HTTP/1.1 origin당 6 connection 제한에 금방 걸린다. 해결: `?placeId=A&placeId=B&…` 한 번에 보내고 서버가 `summaryEventsBus.subscribe(pid, …)`를 placeId 수만큼 등록해 다중화. 이벤트 페이로드에 `placeId`를 포함해 클라이언트가 demux. 커밋 b6185b5에서 per-placeId 경로를 대체.
- **요약 이벤트 두 종류 (progress / review)** — [summary-events-bus.ts](../../apps/friendly/src/modules/summary/summary-events-bus.ts)의 `SummarySignal` 유니온. `progress`는 카운트만 바뀌었다는 신호(서버에서 coalesce한 뒤 `getSummaryProgress` 스냅샷 푸시), `review`는 특정 행이 done/failed로 끝나며 text/model/error를 함께 싣는다. 후자가 있어 클라이언트가 디테일 GET을 다시 안 쳐도 텍스트를 캐시에 머지할 수 있다.
- **리뷰 dedup = externalId + contentHash 이중 키** — Naver 응답의 review id가 있으면 `(restaurantId, externalId)`, 없거나 익명이면 `(restaurantId, sha1(authorName + body))` 둘 다 unique 인덱스. `persistReviewBatch`는 in-memory pre-filter → row-by-row create(transaction 안)로 진행하고, 동시 배치 race는 P2002 silent skip. SQLite는 `createMany skipDuplicates`를 지원하지 않아 채택한 패턴.
- **1 review = 1 ReviewSummary** — `ReviewSummary.reviewId @unique` + 1:1 relation. 재요약은 같은 row를 `upsert`로 덮어쓴다(`run()` 진입부의 pending 마킹). 재크롤은 `clearReviewsAndSummaries(id)`로 리뷰까지 통째로 날린 뒤 새로 채운다.
- **Summary는 fire-and-forget + 공유 FIFO 게이트** — `queueSummariesForReviews(placeId, ids)`는 즉시 반환하고 내부 `run()`은 `void Promise.catch(() => undefined)`. 어댑터 풀은 [ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)의 동일 인스턴스를 공유해 `LlmProviderConfig.maxConcurrent`로 동시 호출수가 통제된다(채팅/요약/일괄 호출이 같은 게이트 뒤에 줄을 선다). 자세한 게이트 시맨틱은 [ai 토픽](./ai.md).
- **`visitor_batch` SSE에 persistedReviews 포함** — crawl 모듈의 SSE가 페이지 단위로 새로 persist된 리뷰를 즉시 함께 푸시하므로 FE는 디테일 GET을 다시 안 쳐도 화면을 갱신할 수 있다(자세한 SSE 페이로드는 [crawl 토픽](./crawl.md)).
- **No Docker / No Redis** — CLAUDE.md 규칙. SQLite + 단일 인스턴스로 운영. `db:migrate`/`db:studio` 스크립트로 직접 작업.
- **dev = `tsx watch`, prod = `tsup` 번들** — [tsup.config.ts](../../apps/friendly/tsup.config.ts)는 `entry: src/server.ts`, ESM, `target: node22`, sourcemap on, dts off. `start = node --env-file=.env dist/server.js`로 환경변수도 Node 네이티브 로딩.
- **Vitest는 `extensionAlias` + 수동 .env 로드** — [vitest.config.ts](../../apps/friendly/vitest.config.ts)는 두 가지 결정을 한다.
  1. 코드베이스가 `verbatimModuleSyntax`로 ESM-style `.js` 임포트를 쓰므로(`import './foo.js'` 실제 파일은 `foo.ts`) `resolve.extensionAlias: { '.js': ['.ts','.js'] }`로 vitest가 `.ts`를 먼저 시도하게 한다. `server.deps.inline: [/^@repo\//]`도 같이 켜서 워크스페이스 패키지의 `.js` 재export까지 같은 alias로 해소.
  2. tsx watch는 런타임에서 `--env-file`로 .env를 읽지만 vitest는 node를 직접 띄우므로 config 상단에서 `.env`를 수동 파싱해 `process.env`에 채워 넣는다(이미 셸에서 정의된 키는 덮지 않음).
- **TS 프로젝트 설정** — [tsconfig.json](../../apps/friendly/tsconfig.json)은 `@repo/config/tsconfig/node.json` 상속, `~/*` → `./src/*` 별칭. test 파일은 build에서 제외.

## Gotchas [coverage: medium — 6 sources]

- **Windows에서 Prisma DLL lock** — `prisma generate`/`db:migrate`가 `query_engine-windows.dll.node`를 잡고 있는 dev 서버 때문에 실패한다. `pnpm dev:api`로 띄운 watch 프로세스를 먼저 죽이고 마이그레이션 실행.
- **`JWT_SECRET` 32자 미만 → 부팅 실패** — env zod 스키마에서 `process.exit(1)`. `.env.example`의 placeholder도 그대로 두면 32자 만족하지만 운영에서는 반드시 교체.
- **회원가입은 무조건 USER** — `auth.service.register()`에 role 입력이 없다. 첫 ADMIN은 [scripts/promote-admin.ts](../../apps/friendly/scripts/promote-admin.ts)로 만든다 (`pnpm --filter friendly promote-admin <email>`). 존재하지 않는 이메일은 Prisma `P2025`로 잡아서 친절한 에러 출력.
- **`?token=` 로깅 마스킹은 app.ts에만 있다** — 다른 경로(예: 외부 트레이스/메트릭)로 req.url이 흘러나가면 마스킹이 안 먹는다. SSE 인증 추가할 때 주의.
- **`pick.options`는 string 컬럼 + JSON 인코딩** — SQLite에 array 타입이 없어서 `picks.service.ts`가 직렬화한다. raw SQL이나 Prisma Studio에서 직접 편집할 땐 JSON 형식 깨지지 않게.
- **DELETE restaurant ↔ in-flight crawl 충돌 = 409** — `restaurant.route.ts`의 delete 핸들러가 `jobRegistry.findInFlightByPlace(userId, placeId)`로 큐 대기/실행 중 잡까지 확인한다. cascade delete + 동시 INSERT가 FK race를 만드므로, FE는 409를 받으면 잡 종료를 기다렸다가 재시도해야 한다.
- **summary-events `snapshot` 페이로드에 `placeId` 포함** — 이전(per-placeId 경로)에는 progress 객체만 그대로 보냈지만 multiplexed 전환 후 `{ placeId, ...snap }` 형태가 됐다. 구버전 클라이언트가 남아 있으면 demux에 실패하므로 `@repo/shared`의 SSE 클라이언트를 같이 올려야 한다.
- **`placeId` 검증은 `z.string()`만** — restaurant 라우트의 params 스키마는 빈 문자열 외 별도 검증이 없다. 형식 검증(예: 숫자만, 길이 제한)이 필요하면 `@repo/api-contract`에 정규식을 넣어야 한다.
- **summary 모듈은 라우트 미노출** — autoload가 픽업하지 않으므로 `summary` 자체에 HTTP 인터페이스를 추가하려면 새 `*.route.ts`를 만들거나 기존 모듈(restaurant) 라우트에 얹어야 한다.
- **테스트 커버리지** — restaurant/summary 모듈 모두 [restaurant.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.test.ts), [summary.test.ts](../../apps/friendly/src/modules/summary/summary.test.ts)가 추가됐으나, [auth.test.ts](../../apps/friendly/src/modules/auth/auth.test.ts)는 여전히 부팅 스모크에 그친다.
- **autoload는 vite resolve를 우회한다** — `@fastify/autoload`는 디렉터리를 스캔해 동적 `import()`를 직접 호출하므로 vitest의 `extensionAlias`/`deps.inline` 변환이 적용되지 않는다. 결과적으로 `buildApp()`을 통째로 부팅하는 통합 테스트는 ESM/.js resolve에서 깨지기 쉽다. 대안은 ai 모듈처럼 **테스트마다 minimal Fastify 인스턴스를 만들어 필요한 plugin/route만 명시적으로 register하는 패턴** ([ai 토픽 참조](./ai.md)의 `ai.test.ts`).
- **`tsx watch`는 `src/`만 감시한다** — workspace 패키지(`node_modules/@repo/*`)에서 일어난 변경은 자동 reload되지 않는다. `@repo/api-contract`/`@repo/shared` 등을 수정하면 friendly dev 서버를 수동 재시작해야 반영된다.
- **workspace 패키지가 symlink가 아닐 수 있다** — `pnpm-lock.yaml`에 `dependenciesMeta.<pkg>.injected: true`가 박힌 워크스페이스 의존성은 symlink가 아니라 **실제 복사본**으로 박혀서 dev 빌드 산출물 동기화가 어긋날 수 있다. injected 패턴의 영향과 대응은 [ai 토픽 참조](./ai.md).

## Sources [coverage: high — 36 sources]

- [apps/friendly/package.json](../../apps/friendly/package.json)
- [apps/friendly/tsconfig.json](../../apps/friendly/tsconfig.json)
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts)
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)
- [apps/friendly/scripts/promote-admin.ts](../../apps/friendly/scripts/promote-admin.ts)
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts)
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts)
- [apps/friendly/src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)
- [apps/friendly/src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts)
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts)
- [apps/friendly/src/plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts)
- [apps/friendly/src/plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts)
- [apps/friendly/src/plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts)
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts)
- [apps/friendly/src/plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts)
- [apps/friendly/src/plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts)
- [apps/friendly/src/plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts)
- [apps/friendly/src/modules/auth/auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)
- [apps/friendly/src/modules/auth/auth.service.ts](../../apps/friendly/src/modules/auth/auth.service.ts)
- [apps/friendly/src/modules/auth/auth.test.ts](../../apps/friendly/src/modules/auth/auth.test.ts)
- [apps/friendly/src/modules/picks/picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)
- [apps/friendly/src/modules/picks/picks.service.ts](../../apps/friendly/src/modules/picks/picks.service.ts)
- [apps/friendly/src/modules/health/health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)
- [apps/friendly/src/modules/admin/admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)
- [apps/friendly/src/modules/admin/admin.service.ts](../../apps/friendly/src/modules/admin/admin.service.ts)
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)
- [apps/friendly/src/modules/restaurant/restaurant.service.ts](../../apps/friendly/src/modules/restaurant/restaurant.service.ts)
- [apps/friendly/src/modules/restaurant/restaurant.test.ts](../../apps/friendly/src/modules/restaurant/restaurant.test.ts)
- [apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts)
- [apps/friendly/src/modules/summary/summary-events-bus.ts](../../apps/friendly/src/modules/summary/summary-events-bus.ts)
- [apps/friendly/src/modules/summary/summary.test.ts](../../apps/friendly/src/modules/summary/summary.test.ts)
- [apps/friendly/src/modules/ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)
- [pnpm-lock.yaml](../../pnpm-lock.yaml)
