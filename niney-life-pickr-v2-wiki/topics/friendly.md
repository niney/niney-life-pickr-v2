---
topic: friendly
last_compiled: 2026-05-09
status: active
---

# friendly — Fastify 백엔드

## Purpose [coverage: high — 6 sources]

`apps/friendly`는 niney-life-pickr-v2 모노레포의 유일한 백엔드 서비스다. Fastify 5 위에 zod 기반 스키마 검증, JWT 인증, Prisma+SQLite 영속화, OpenAPI/Swagger 문서, Playwright 크롤링 런타임, Naver 이미지 썸네일 프록시(sharp), Ollama Cloud 기반 리뷰 요약 + 구조화 분석 + 메뉴 정규화/통계까지 얹어 web(`apps/web`)과 mobile(`apps/mobile`)이 동시에 호출하는 단일 API를 제공한다.

도메인 표면은 모듈 디렉터리로 나뉜다.

- **auth** — 회원가입/로그인/내 정보/로그아웃 (`Routes.Auth.*`)
- **picks** — 사용자별 "선택지" CRUD + 랜덤 추첨 (`Routes.Picks.*`)
- **admin** — 사용자 목록·역할 변경 (`Routes.Admin.*`, `requireAdmin`)
- **restaurant** — 크롤된 맛집 + 방문자 리뷰 영속화, 요약/분석 진행률 SSE, reanalyze/insights/smart-pick + 메뉴 그룹핑/순위/분석 백필 라우트 (`Routes.Restaurant.*`)
- **summary** — 리뷰 단위 AI 요약+구조화 분석 라이프사이클 (HTTP 라우트 없음, 내부 모듈)
- **menu-grouping** — 식당별 메뉴 표기 변형을 LLM으로 canonical 그룹핑 + 순위. 자세한 건 [menu-grouping 토픽](./menu-grouping.md).
- **analytics** — 글로벌 메뉴 통계 + 전역 LLM 머지 + 카테고리 트리. 자세한 건 [analytics 토픽](./analytics.md).
- **media** — Naver CDN 이미지 썸네일 프록시 + 디스크 캐시 (`Routes.Media.*`)
- **health** — 라이브니스 체크 (`Routes.Health`, `/health`)
- **crawl** — 별도 위키 토픽 ([crawl 토픽 참조](./crawl.md))
- **ai** — 별도 위키 토픽 ([ai 토픽 참조](./ai.md))

CLAUDE.md 규약상 모든 모듈은 `*.route.ts`(HTTP) + `*.service.ts`(비즈니스) + `*.test.ts`(Vitest) 트리오로 구성하고, FE/BE가 공유하는 타입/검증 로직은 모두 `@repo/api-contract`의 zod 스키마로만 정의한다. [apps/friendly/package.json](../../apps/friendly/package.json)의 `name: "friendly"`가 워크스페이스 식별자이며, `pnpm dev:api`/`pnpm --filter friendly <cmd>`로 단독 실행한다.

## Architecture [coverage: high — 9 sources]

엔트리 흐름은 `server.ts → buildApp() → autoload(plugins) → autoload(modules/*.route.ts)`로 단방향이다.

- [src/server.ts](../../apps/friendly/src/server.ts) — `buildApp()` 호출 후 `env.HOST:env.PORT`로 listen, SIGTERM/SIGINT에서 `app.close()`로 graceful shutdown. 부팅 실패 시 `process.exit(1)`.
- [src/app.ts](../../apps/friendly/src/app.ts) — Fastify 인스턴스를 만들고 `withTypeProvider<ZodTypeProvider>()`를 적용한 뒤 `validatorCompiler`/`serializerCompiler`를 등록한다. `serializers.req`에서 `?token=` 쿼리스트링을 `[REDACTED]`로 마스킹(SSE 인증용 JWT가 매 로그 라인에 박히지 않도록). `dev`에서는 `pino-pretty` 트랜스포트. 그다음 `@fastify/autoload`로 두 단계 등록:
  1. `plugins/` 디렉터리 전체 자동 로드
  2. `modules/` 하위에서 `*.route.(ts|js)`만 골라 자동 로드 (`dirNameRoutePrefix: false` — URL prefix는 `Routes.*` 상수가 결정)
- [src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) — `FastifyInstance`에 `prisma`, `authenticate`, `requireAdmin` 데코레이터, `FastifyRequest.user`에 `{ userId, email, role }` 타입을 선언.

플러그인 레이어 (모두 `fastify-plugin`으로 감싸 데코레이터를 부모 스코프에 노출):

- [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — `env.CORS_ORIGIN`이 `*`이면 `true`, 아니면 콤마 분리. `credentials: true`.
- [plugins/helmet.ts](../../apps/friendly/src/plugins/helmet.ts) — `contentSecurityPolicy: false` (Swagger UI 호환).
- [plugins/sensible.ts](../../apps/friendly/src/plugins/sensible.ts) — `reply.unauthorized()`/`reply.forbidden()`/`app.httpErrors.*`.
- [plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `@fastify/jwt` + `authenticate`/`requireAdmin` 데코레이터.
- [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) — `PrismaClient` 인스턴스, `app.prisma` 노출, `onClose`에 `$disconnect`.
- [plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) — OpenAPI 메타 + `bearerAuth` 시큐리티 스킴, Zod→JSON Schema 변환. UI는 `/docs`.
- [plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — `ZodError`/Fastify validation/4xx/5xx 정규화. dev에서만 5xx 메시지 노출.
- [plugins/empty-body-parser.ts](../../apps/friendly/src/plugins/empty-body-parser.ts) — 빈 `application/json` body를 `{}`로 해석(action 없는 POST용).

모듈 레이어 — 현재 디렉터리:

```
modules/
├── admin/
├── ai/
├── analytics/        ← 글로벌 메뉴 통계 + 전역 LLM 머지 (analytics 토픽)
├── auth/
├── crawl/
├── health/
├── media/
├── menu-grouping/    ← 식당별 메뉴 LLM 그룹핑 + 순위 (menu-grouping 토픽)
├── picks/
├── restaurant/
├── summary/
└── user/
```

autoload는 route 파일만 픽업하므로 `summary/`처럼 라우트 파일이 없는 모듈은 외부에서 모듈 싱글턴(`summaryEventsBus`)과 명시적 import로만 접근한다. analytics/menu-grouping 은 자체 `*.route.ts` 가 있어 자동 등록.

## Talks To [coverage: high — 10 sources]

- **`@repo/api-contract`** — `Routes.*` URL 상수와 모든 zod 스키마(인증/픽/식당/요약/분석/미디어/AI/메뉴 그룹핑/애널리틱스)의 단일 출처. 모든 `*.route.ts`가 import.
- **`@repo/utils`** — `picks.service.ts`의 랜덤 추첨에서 `pickRandom(options)`.
- **Prisma + SQLite** — [prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)는 `provider = "sqlite"`, `DATABASE_URL`은 기본 `file:./data/dev.db`. CLAUDE.md "Docker 추가하지 말 것" 규칙과 짝.
- **bcryptjs** — [src/lib/hash.ts](../../apps/friendly/src/lib/hash.ts)의 `hashPassword`/`verifyPassword`가 10 라운드 솔트.
- **sharp ^0.34** — media 모듈의 썸네일 리사이즈/JPEG 인코딩.
- **Playwright** — crawl 모듈이 사용 ([crawl 토픽](./crawl.md)).
- **모듈 간 토폴로지**:
  - `crawl → restaurant` — 크롤이 `RestaurantService.upsertRestaurantFromCrawl(...)`로 마스터 행 upsert, 페이지 단위 `persistReviewBatch(restaurantId, reviews)`로 idempotent insert.
  - `crawl → summary` — `persistReviewBatch`가 돌려준 새 리뷰 id 배열을 `SummaryService.queueSummariesForReviews(placeId, ids)`로 fire-and-forget.
  - `summary → ai` — `summary.service.ts`가 [ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)의 공유 FIFO 게이트로 LLM 어댑터를 받아 호출. `AiConfigService.getResolved('ollama-cloud')`로 키/모델/concurrency를 해소.
  - `summary → restaurant.route` — `summaryEventsBus`(모듈 싱글턴)가 두 모듈의 결합점. publish는 SummaryService, subscribe는 restaurant SSE 핸들러.
  - `summary → menu-grouping/analytics` — `summary.service.ts`가 export 한 `extractFirstJsonObject`/`normalizeTerm` 을 두 모듈이 재사용 (LLM JSON 응답 파싱·이름 정규화).
  - `restaurant.route → summary` — `Routes.Restaurant.reanalyze(:placeId)` 핸들러가 `summaries.backfillForRestaurant(placeId)`로 구버전(`analysisVersion < ANALYSIS_VERSION`)/failed 행을 재큐잉. `Routes.Restaurant.analyticsBackfill` 은 `summaries.backfillAnalyticsFromExisting()` 으로 기존 `menusJson`/`tipsJson`/`keywordsJson` 을 `MenuMention`/`ReviewTag` 로 풀어쓴다 (LLM 재호출 없음).
  - `restaurant.route → menu-grouping` — `Routes.Restaurant.menusGroup`/`menusRanking` 가 `MenuGroupingService` 를 호출 (식당 단위 그룹핑/순위).
- **소비자** — `apps/web`/`apps/mobile`이 `@repo/shared`의 API 클라이언트로 호출(CLAUDE.md 핵심 규칙 #2).

## API Surface [coverage: high — 7 sources]

라우트 경로는 모두 `@repo/api-contract`의 [`Routes.*`](../../packages/api-contract/src/routes.ts)에서 가져오므로 이 파일 하나가 클라이언트와 동기화된다.

### auth — [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)

| Method | Path                   | Auth   | 설명                                 |
| ------ | ---------------------- | ------ | ------------------------------------ |
| POST   | `Routes.Auth.register` | public | 가입 → `{ token, user }` (201, USER) |
| POST   | `Routes.Auth.login`    | public | 로그인 → `{ token, user }`           |
| GET    | `Routes.Auth.me`       | bearer | 현재 사용자 정보                     |
| POST   | `Routes.Auth.logout`   | bearer | 204 (stateless NOP)                  |

### picks — [picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)

`addHook('onRequest', app.authenticate)`로 모듈 전역 인증. CRUD + `POST :id/random` (`PickResultSchema`).

### admin — [admin.route.ts](../../apps/friendly/src/modules/admin/admin.route.ts)

각 라우트마다 `onRequest: [authenticate, requireAdmin]`. `Routes.Admin.listUsers`, `Routes.Admin.setUserRole(:id)`.

### restaurant — [restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts)

리스트/디테일/삭제/요약 관련은 라우트별 admin 강제. SSE만 쿼리스트링 토큰을 직접 검증. **menu-grouping/analytics 신규 라우트 3개**도 모두 `Routes.Restaurant.*` 아래 마운트한다 (각 모듈은 별도 라우트 파일을 두지 않고 restaurant 라우트가 호스팅).

| Method | Path (`Routes.Restaurant.*`)                  | Auth          | 설명                                                                              |
| ------ | --------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| GET    | `list`                                        | bearer+admin  | 맛집 목록 + 행마다 요약 카운트(`pending/Running/Done/Failed`).                   |
| GET    | `byPlaceId(:placeId)`                         | bearer+admin  | 디테일. `reviews[]` (요약/분석 포함, `visitorReviews` 정렬은 `fetchedAt asc`).   |
| DELETE | `delete(:placeId)`                            | bearer+admin  | 캐스케이드 삭제. in-flight 크롤이 같은 placeId면 **409**.                        |
| POST   | `reanalyze(:placeId)`                         | bearer+admin  | 구버전/failed 분석 행을 재큐잉 → `{ ok, queued }`.                                |
| GET    | `insights(:placeId)`                          | bearer+admin  | 식당 단위 인사이트(자주 언급 메뉴/팁/키워드 + 평균 점수). 메뉴는 `MenuMention` + `MenuCanonical` JOIN 기반. |
| POST   | `menusGroup(:placeId)`                        | bearer+admin  | **신규**. 식당 메뉴 LLM canonical 그룹핑 실행 ([menu-grouping](./menu-grouping.md)). |
| GET    | `menusRanking(:placeId)`                      | bearer+admin  | **신규**. 그룹된 메뉴 순위 + 통계 ([menu-grouping](./menu-grouping.md)).          |
| POST   | `analyticsBackfill`                           | bearer+admin  | **신규**. 기존 done summary 의 menusJson/tipsJson/keywordsJson 을 정규화 테이블(`MenuMention`/`ReviewTag`)로 풀어쓰는 1회 백필. LLM 호출 없음. |
| POST   | `smartPick`                                   | bearer+admin  | 분석 점수를 가중치로 한 가중 랜덤 픽 — niney 본 목적의 최소 통합 지점.            |
| GET    | `summaryStatus(:placeId)`                     | bearer+admin  | 요약 진행률 스냅샷.                                                               |
| GET    | `summaryEvents`                               | query token   | **Multiplexed SSE**. `?placeId=A&placeId=B&…&token=<jwt>`. 페이로드에 `placeId`. |

> 글로벌 통계 라우트 (`/admin/analytics/*`) 와 카테고리 트리는 [analytics 토픽](./analytics.md) 참고.

SSE: 연결 직후 모든 placeId에 `snapshot` 푸시. placeId별 `pendingProgressPush` 슬롯으로 progress 신호 coalesce(`setImmediate` 한 틱당 1회 DB 조회). `review` 신호는 페이로드가 완전하므로 즉시 push (분석 필드 포함: `sentiment`/`sentimentScore`/`satisfactionScore`/`menus`/`tips`/`keywords`). 15초 keep-alive `: hb`.

### media — [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — public

| Method | Path                       | Auth   | 설명                                                                                                                              |
| ------ | -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `Routes.Media.thumbnail`   | public | `?url=<naver-cdn-url>&w=300&q=78` → JPEG. ALLOWED_HOSTS 화이트리스트, sharp 리사이즈, `data/thumbs/<sha1>.jpg` 디스크 캐시.        |

응답 헤더: `Cache-Control: public, max-age=2592000, immutable`(30일), `ETag: "<key>"`. `If-None-Match` 매칭이면 304. 업스트림 실패는 502. 호스트 화이트리스트(`ALLOWED_HOSTS`)에 `phinf.pstatic.net`, `pup-review-phinf.pstatic.net`, `review-phinf.pstatic.net`, `ldb-phinf.pstatic.net`, `search.pstatic.net`, `video-phinf.pstatic.net`. 업스트림 fetch는 5초 timeout, 10MB 상한.

### health — [health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

`Routes.Health` (`{ status, uptime, timestamp }`) + `/health` (스모크 프로브, Swagger hide).

## Data [coverage: high — 10 sources]

[prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) 모델 — 코어:

- **`User`** (`users`) — `id cuid`, `email @unique`, `passwordHash`, `role Role @default(USER)`. picks Cascade.
- **`Pick`** (`picks`) — `userId @index`, `title`, `options String`(JSON 직렬화 string[]), `category`. SQLite array 저장 트릭은 `picks.service.ts`의 `JSON.stringify`/`parse`.
- **`PickResult`** (`pick_results`) — `pickId @index`, `chosen`, `pickedAt`. `Pick` Cascade.
- **`Role` enum** — `USER | ADMIN`.
- **`LlmProviderConfig`** (`llm_provider_configs`) — `provider @unique`, `apiKey`, `baseUrl?`, `defaultModel?`, `enabled`, `maxConcurrent`, `updatedAt`, `updatedById?`. ai 모듈이 환경변수보다 우선 사용 ([ai 토픽](./ai.md)).
- **`Restaurant`** (`restaurants`) — `placeId @unique`(네이버 플레이스 ID), `name`, `category?`, `address?`, `phone?`, `rating?`, `reviewCount?`, `rawSourceUrl`, `snapshotJson`(메뉴/블로그/영업시간/이미지/좌표 JSON), `firstCrawledAt`, `lastCrawledAt @updatedAt`. `visitorReviews` + `menuCanonicals` 1:N.
- **`VisitorReview`** (`visitor_reviews`) — `restaurantId @index`, `externalId?`, `authorName?`, `rating?`, `body`, `visitedAt?`, `imageUrlsJson`, `videosJson String @default("[]")`, `contentHash`(`sha1(authorName + body)`, body 500자 truncate), `fetchedAt`. **dedup unique** 두 개: `@@unique([restaurantId, externalId])` + `@@unique([restaurantId, contentHash])`. 동시 배치 race는 P2002 silent skip.
- **`ReviewSummary`** (`review_summaries`) — `reviewId @unique`(1:1), `status`(`pending|running|done|failed`), `text?`, `model?`, `errorCode?`, `errorMessage?`, `startedAt?`, `finishedAt?`. 분석 필드: `sentiment?`(`positive|negative|neutral|mixed`), `sentimentScore? Float`(-1.0~1.0), `satisfactionScore? Int`(1~5), `menusJson?`(`[{name,sentiment,traits}]`), `tipsJson?`(string[]), `keywordsJson?`(string[]), `analysisVersion? Int`(현재 `ANALYSIS_VERSION = 4`). `menuMentions`/`tags` 역참조.

분석 정규화 + 메뉴 그룹핑 테이블 (이번 라운드에서 추가 — 자세한 컬럼/인덱스 설명은 [analytics](./analytics.md), [menu-grouping](./menu-grouping.md) 토픽으로 위임):

- **`MenuMention`** (`menu_mentions`) — `summaryId`/`restaurantId` + `name`/`nameNorm`/`sentiment`/`traitsJson`. summary done 시 menusJson 을 풀어쓴 행 단위 사본. 통계·검색·인사이트 쿼리의 입력.
- **`ReviewTag`** (`review_tags`) — tip + keyword 통합 테이블 (`kind`로 구분). `term`/`termNorm`.
- **`MenuCanonical`** (`menu_canonicals`) — 식당 내 메뉴 표기 변형 → canonical 그룹 매핑. `(restaurantId, nameNorm)` unique. menu-grouping 라우트가 채움.
- **`GlobalMenuCanonical`** (`global_menu_canonicals`) — 식당 가로지르는 전역 canonical. `globalKey @unique`, `categoryPath?` (예: "한식 > 찌개 > 김치찌개"). analytics 머지 라우트가 채움.
- **`GlobalMenuCanonicalLink`** (`global_menu_canonical_links`) — `MenuCanonical` ↔ `GlobalMenuCanonical` 다대일 링크. `menuCanonicalId @unique` + `globalCanonicalId @index`.

캐스케이드 체인 — `Restaurant 삭제 → VisitorReview → ReviewSummary → MenuMention/ReviewTag` 그리고 `Restaurant → MenuCanonical → GlobalMenuCanonicalLink` 모두 SQLite FK로 자동 처리.

마이그레이션 (최근순):
- `20260509_add_global_menu_category_path` — `GlobalMenuCanonical.categoryPath` 추가
- `20260509_add_global_menu_canonicals` — `GlobalMenuCanonical` + `GlobalMenuCanonicalLink`
- `20260509_add_menu_canonicals` — `MenuCanonical` (식당 내 그룹핑)
- `20260509_add_analytics_tables` — `MenuMention` + `ReviewTag`
- [20260508122321_add_visitor_review_videos](../../apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql) — `videosJson` 컬럼
- [20260508095207_add_review_analysis_fields](../../apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql) — sentiment/menus/tips/keywords/analysisVersion
- [20260506205226_add_restaurant_review_summary](../../apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql)
- [20260506191413_add_llm_provider_config](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)

디스크 영속:
- `apps/friendly/data/dev.db` — SQLite DB 파일
- `apps/friendly/data/thumbs/<sha1>.jpg` — media 모듈 썸네일 캐시

JWT payload: `{ userId: string; email: string; role: 'USER' | 'ADMIN' }` (`request.user`도 동일).

환경 변수 — [src/config/env.ts](../../apps/friendly/src/config/env.ts)의 `EnvSchema` (zod):

| 키                            | 기본값               | 비고                                                                |
| ----------------------------- | -------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`        | `development` \| `production` \| `test`                             |
| `PORT`                        | `3000`               |                                                                     |
| `HOST`                        | `0.0.0.0`            |                                                                     |
| `DATABASE_URL`                | (필수)               |                                                                     |
| `JWT_SECRET`                  | (필수)               | **min 32 chars**                                                    |
| `JWT_EXPIRES_IN`              | `7d`                 |                                                                     |
| `CORS_ORIGIN`                 | `*`                  | 콤마 분리 화이트리스트 또는 `*`                                     |
| `LOG_LEVEL`                   | `info`               | pino level                                                          |
| `OLLAMA_CLOUD_API_KEY`        | `''`                 | DB의 `LlmProviderConfig.apiKey`가 비어있을 때 fallback              |
| `OLLAMA_CLOUD_BASE_URL`       | `https://ollama.com` |                                                                     |
| `OLLAMA_CLOUD_TIMEOUT_MS`     | `60000`              |                                                                     |
| `OLLAMA_CLOUD_MAX_CONCURRENT` | `15`                 |                                                                     |
| `OLLAMA_DEFAULT_MODEL`        | `''`                 |                                                                     |

## Key Decisions [coverage: high — 14 sources]

- **Zod = 단일 진실 (SSOT)** — 라우트 스키마(`body`/`params`/`response`)는 모두 `@repo/api-contract`. `fastify-type-provider-zod`의 `validatorCompiler`/`serializerCompiler`가 런타임 검증 + TS 타입 추론 + OpenAPI 자동 생성을 한 번에 처리.
- **autoload 두 단계** — `plugins/`는 무조건 전부, `modules/`는 `matchFilter: /\.route\.(ts|js)$/`로 route 파일만. `summary` 모듈은 라우트 파일이 없어 autoload 영향권 밖이고 외부에서는 모듈 싱글턴(`summaryEventsBus`) + 명시적 import로만 접근.
- **모듈 레이아웃** — CLAUDE.md 규칙대로 모듈마다 `*.route.ts` + `*.service.ts` + `*.test.ts` 트리오. 인증 패턴 세 가지: picks는 모듈 전역 `addHook`, admin/restaurant은 라우트별 `onRequest`, summary-events SSE는 핸들러 안에서 직접 토큰 검증.
- **JWT `?token=` 쿼리 + 로그 redaction** — `EventSource`(SSE)는 커스텀 헤더 불가하므로 토큰을 쿼리스트링에 싣는다. [src/app.ts](../../apps/friendly/src/app.ts)의 `serializers.req`가 `([?&]token=)[^&]+ → $1[REDACTED]`로 마스킹.
- **Multiplexed Summary SSE** — 한 admin이 여러 식당을 동시 모니터링할 때 placeId마다 `EventSource`를 열면 HTTP/1.1 6 connection 제한에 걸린다. `?placeId=A&placeId=B&…` 한 번에 보내고 서버가 placeId 수만큼 subscribe. 이벤트 페이로드에 `placeId`를 포함해 클라이언트가 demux.
- **요약 이벤트 두 종류** — [summary-events-bus.ts](../../apps/friendly/src/modules/summary/summary-events-bus.ts)의 `progress`(카운트만 변경)와 `review`(특정 행 done/failed + 분석 필드 동봉). 후자가 있어 클라이언트가 디테일 GET 재요청 없이 캐시 머지 가능.
- **리뷰 dedup = externalId + contentHash 이중 키** — Naver review id가 있으면 `(restaurantId, externalId)`, 없거나 익명이면 `(restaurantId, sha1(authorName + body))`. SQLite는 `createMany skipDuplicates` 미지원 → in-memory pre-filter + row-by-row create + P2002 silent skip 패턴.
- **1 review = 1 ReviewSummary** — `reviewId @unique` 1:1. 재요약/재분석은 같은 row를 `upsert`로 덮어쓴다. 재크롤은 `clearReviewsAndSummaries`로 통째로 날린 뒤 새로.
- **Summary placeId-level 직렬화** — `runChainByPlace: Map<string, Promise<void>>`로 같은 placeId 의 batch 들을 then-chaining. 다른 placeId 는 여전히 병렬. 페이지마다 `queueSummariesForReviews` 가 떠도 자기 chunk 만 'running' 으로 마킹돼 진행 표시가 일관된다. Fastify `app.log`(pino) 주입으로 `[summary] queue start/chunk start/chunk done/queue finished` 라인이 콘솔에 박힌다.
- **리뷰 단위 자동 재시도 3회** — `attemptOnce` 헬퍼 + `attemptForReview` 재시도 루프. parse_failed/upstream/timeout 모두 대상. 백오프 = `300 * attempt + Math.floor(Math.random() * 200)` ms. 어댑터의 동시성-한도 백오프와 별개.
- **`ANALYSIS_VERSION = 4` (v4)** — v3→v4 변경점: (1) `menus[].sentiment` 를 LLM JSON schema/zod 양쪽에서 **필수 + non-null** 강제 (positive/negative/neutral 셋 중 하나만). 모델이 모호할 때도 'neutral' 로 빠지도록 — 메뉴 단위 통계의 입력 품질 확보. (2) `menus[].traits` (맛/특징 태그, string[]) 추가 — sentiment 와 직교해 "독특한 맛" 처럼 호불호 표현을 보존. 프롬프트도 few-shot 4개로 재구성하고 traits 단서가 없을 때 빈 배열을 명시. v3 잔존 행은 `backfillForRestaurant` 로 재분석되거나 `analyticsBackfill` 로 정규화 테이블에만 풀어쓸 수 있다.
- **Ollama structured output + numCtx=4096** — `provider.complete({ format: ANALYSIS_JSON_SCHEMA })` 로 토큰 샘플링 단계에서 출력 모양을 잡는다. `temperature: 0.2`, `maxTokens: 1500`, `numCtx: 4096` (Ollama 기본 2048 은 시스템 프롬프트 600토큰 + 긴 리뷰가 들어가면 입력에서 잘려 분석이 무의미해진다 — 회귀 핸들). 파서는 `<think>...</think>` reasoning 블록 제거 + 균형 괄호 추적으로 첫 완전 JSON 객체 추출.
- **`extractFirstJsonObject` / `normalizeTerm` 공유 export** — summary.service.ts 가 두 헬퍼를 export 해 menu-grouping/analytics 모듈이 같은 LLM 응답 파싱 + 이름 정규화 (소문자/공백/특수문자 제거) 를 재사용한다. 동의어 사전(예: "세트"="SET")은 별도 작업으로 미룸.
- **`getInsights` MenuCanonical 기반으로 갈아탔다** — 기존엔 done summary의 `menusJson` 을 행마다 파싱해서 메모리에서 그룹핑했다. 이제는 `MenuMention` + `MenuCanonical` JOIN. 매핑이 있으면 `canonicalNorm` 으로 그룹, 없으면 `nameNorm` fallback (가장 빈번한 원문 표기를 displayName 으로). sentiment 분포·평균 점수·tips/keywords 는 여전히 `ReviewSummary` 행에서 직접 집계 — 분석 필드는 1:1 이라 정규화 테이블 없이 충분.
- **분석 정규화 테이블 도입 동기** — `menusJson`/`tipsJson`/`keywordsJson` 파싱은 식당 단위 통계엔 충분하지만, 글로벌 메뉴 순위·키워드 검색·전역 LLM 머지엔 GROUP BY 가능한 행 단위가 필요하다. summary done 시 같은 트랜잭션 안에서 `delete + reinsert` 로 동기화. 기존 데이터는 `Routes.Restaurant.analyticsBackfill` (LLM 미호출, JSON → row 변환만) 로 1회 채운다.
- **Summary는 fire-and-forget + 공유 FIFO 게이트** — `queueSummariesForReviews`는 즉시 반환, 내부 `run()`은 `void Promise.catch(() => undefined)`. 어댑터 풀은 [adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)를 공유해 `LlmProviderConfig.maxConcurrent`로 동시성 제어 ([ai 토픽](./ai.md)).
- **Media는 디스크 캐시 + sharp** — lru-cache가 아닌 `data/thumbs/<sha1>.jpg` 파일 캐시. 이유: (1) 썸네일은 잠재적으로 GB 단위라 메모리에 안 맞음, (2) restart에도 살아남음, (3) 단일 인스턴스라 cache invalidation 문제 없음. ALLOWED_HOSTS로 SSRF 차단, 5초 timeout, 10MB 상한, `If-None-Match`로 304 지원.
- **No Docker / No Redis** — CLAUDE.md 규칙. SQLite + 단일 인스턴스 + `lru-cache` 또는 디스크 캐시.
- **dev = `tsx watch`, prod = `tsup` 번들** — [tsup.config.ts](../../apps/friendly/tsup.config.ts), `target: node22`, ESM, sourcemap on. `start`는 `node --env-file=.env dist/server.js`.
- **Vitest는 `extensionAlias` + 수동 .env 로드** — [vitest.config.ts](../../apps/friendly/vitest.config.ts)는 `verbatimModuleSyntax`로 ESM-style `.js` 임포트를 쓰는 코드베이스를 위해 `resolve.extensionAlias: { '.js': ['.ts','.js'] }`, `server.deps.inline: [/^@repo\//]`. `.env`는 config 상단에서 수동 파싱.

## Gotchas [coverage: medium — 7 sources]

- **Windows에서 Prisma DLL lock (EPERM)** — `prisma generate`/`db:migrate`가 dev 서버의 `query_engine-windows.dll.node` 때문에 실패. dev watch 프로세스를 먼저 죽이고 마이그레이션. 분석 정규화/canonical 테이블 4개 마이그레이션이 연달아 추가된 시기엔 특히 자주 부딪힌다.
- **`extractFirstJsonObject` cross-module 의존성** — summary.service.ts 가 export 한 헬퍼를 menu-grouping/analytics 가 import 한다. summary 의 파서를 손대면 두 모듈도 함께 회귀 테스트해야 한다 (양쪽 다 LLM JSON 응답을 받는 형태가 같음).
- **v3 행 + v4 코드 공존** — `analysisVersion` null/3 인 done 행은 `menus[].sentiment` 가 null 일 수 있다. `getInsights`/`MenuMention` 저장 경로가 모두 null 을 'neutral' 로 폴백. 정확한 통계가 필요하면 `Routes.Restaurant.reanalyze` 로 LLM 재호출하거나 `analyticsBackfill` 로 정규화만 채운다.
- **`JWT_SECRET` 32자 미만 → 부팅 실패** — env zod에서 `process.exit(1)`.
- **회원가입은 무조건 USER** — 첫 ADMIN은 [scripts/promote-admin.ts](../../apps/friendly/scripts/promote-admin.ts)로.
- **`?token=` 마스킹은 app.ts에만 있다** — 외부 트레이스/메트릭 경로로 `req.url`이 흘러나가면 마스킹이 안 먹는다.
- **DELETE restaurant ↔ in-flight crawl = 409** — `jobRegistry.findInFlightByPlace`로 큐 대기/실행 중 잡까지 확인. cascade delete + 동시 INSERT가 FK race를 만든다. 캐스케이드 범위가 이번에 늘었다 (`MenuMention`/`ReviewTag`/`MenuCanonical`/`GlobalMenuCanonicalLink` 까지) — 큰 식당 삭제 시 트랜잭션 시간이 더 늘어날 수 있음.
- **summary 모듈은 라우트 미노출** — autoload 픽업 대상이 아니므로 HTTP 인터페이스를 추가하려면 새 `*.route.ts`나 기존 모듈(restaurant) 라우트에 얹어야 한다. 현재 reanalyze/insights/smart-pick + analyticsBackfill 은 restaurant 라우트가 호스팅한다.
- **`createMany skipDuplicates` SQLite 미지원** — 위 dedup 패턴(in-memory pre-filter + P2002 silent skip)으로 우회.
- **Ollama `num_ctx` 기본 2048 함정** — 시스템 프롬프트(~600토큰) + 긴 리뷰가 입력 단계에서 잘리면 분석 출력이 늘 깨졌다. `numCtx: 4096` + `maxTokens: 1500` 명시로 해결. Ollama에선 `num_ctx = 입력+출력 합`이라 둘 다 명시해야 한다.
- **autoload는 vite resolve를 우회한다** — `@fastify/autoload`는 동적 `import()`를 직접 호출하므로 vitest의 `extensionAlias`/`deps.inline` 변환이 적용되지 않는다. `buildApp()`을 통째로 부팅하는 통합 테스트는 ESM/.js resolve에서 깨지기 쉬움. 대안은 ai 모듈처럼 minimal Fastify 인스턴스를 만들어 필요한 plugin/route만 명시적으로 register ([ai 토픽](./ai.md)).
- **media `data/thumbs/` 디렉터리 누적** — 캐시 만료/제거 로직이 없다. 운영에서 디스크 모니터링 필요. 키는 `sha1(url|w=…|q=…)`이라 같은 원본을 다른 width로 요청하면 별도 파일이 쌓인다.
- **media는 public(인증 없음)** — Naver 리뷰 이미지는 공개 자원이고 `<img>` 로 불러야 해서 의도된 결정. ALLOWED_HOSTS 화이트리스트가 SSRF 가드의 전부.
- **`tsx watch`는 `src/`만 감시한다** — workspace 패키지(`@repo/*`) 변경은 자동 reload되지 않으므로 수동 재시작 필요.

## Sources [coverage: high — 44 sources]

- [apps/friendly/package.json](../../apps/friendly/package.json)
- [apps/friendly/tsconfig.json](../../apps/friendly/tsconfig.json)
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts)
- [apps/friendly/.env.example](../../apps/friendly/.env.example)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql](../../apps/friendly/prisma/migrations/20260508122321_add_visitor_review_videos/migration.sql)
- [apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql](../../apps/friendly/prisma/migrations/20260508095207_add_review_analysis_fields/migration.sql)
- [apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql](../../apps/friendly/prisma/migrations/20260506205226_add_restaurant_review_summary/migration.sql)
- [apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql](../../apps/friendly/prisma/migrations/20260506191413_add_llm_provider_config/migration.sql)
- `apps/friendly/prisma/migrations/*_add_analytics_tables/migration.sql`
- `apps/friendly/prisma/migrations/*_add_menu_canonicals/migration.sql`
- `apps/friendly/prisma/migrations/*_add_global_menu_canonicals/migration.sql`
- `apps/friendly/prisma/migrations/*_add_global_menu_category_path/migration.sql`
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
- [apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts)
- [apps/friendly/src/modules/analytics/](../../apps/friendly/src/modules/analytics/)
- [apps/friendly/src/modules/media/media.route.ts](../../apps/friendly/src/modules/media/media.route.ts)
- [apps/friendly/src/modules/media/media.test.ts](../../apps/friendly/src/modules/media/media.test.ts)
- [apps/friendly/src/modules/ai/adapter-cache.ts](../../apps/friendly/src/modules/ai/adapter-cache.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
